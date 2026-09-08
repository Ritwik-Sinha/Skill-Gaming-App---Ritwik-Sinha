import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const MAX_BALANCE_CENTS = 99_999_999;

export function formatMoney(cents: number): string {
  const dollars = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${dollars}.${String(cents % 100).padStart(2, '0')}`;
}

const MAX_BALANCE_MESSAGE = `Your demo balance can be at most ${formatMoney(
  MAX_BALANCE_CENTS,
)}.`;
const LOAD_ERROR = 'Couldn’t load your balance. Please try again.';

export function parseAmountToCents(amount: string): number {
  const value = amount.trim();
  // A comma can be a decimal separator on localized number keyboards.
  // Thousands separators and mixed separators are intentionally rejected.
  if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(value)) {
    throw new Error('Enter a valid amount with up to two decimal places.');
  }

  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_BALANCE_CENTS) {
    throw new Error(MAX_BALANCE_MESSAGE);
  }
  if (cents <= 0) {
    throw new Error('Enter an amount greater than $0.00.');
  }
  return cents;
}

export function demoWalletStorageKey(userId: string): string {
  return `@skillgaming/demo_wallet/${encodeURIComponent(userId)}`;
}

interface WalletState {
  userId: string;
  balanceCents: number;
  isLoading: boolean;
  isAdding: boolean;
  loadError: string | null;
}

interface WalletSession extends WalletState {
  active: boolean;
  loadPromise?: Promise<void>;
}

// A returning account waits for its previous write even if the screen unmounted.
// No demo balances or account data are retained in this map after a write ends.
const pendingWrites = new Map<string, Promise<void>>();

function initialState(userId: string): WalletState {
  return {
    userId,
    balanceCents: 0,
    isLoading: true,
    isAdding: false,
    loadError: null,
  };
}

export function useDemoWallet(userId: string) {
  const [state, setState] = useState<WalletState>(() => initialState(userId));
  const sessionRef = useRef<WalletSession | null>(null);

  const publish = useCallback((session: WalletSession) => {
    if (session.active && sessionRef.current === session) {
      setState({
        userId: session.userId,
        balanceCents: session.balanceCents,
        isLoading: session.isLoading,
        isAdding: session.isAdding,
        loadError: session.loadError,
      });
    }
  }, []);

  const load = useCallback(
    (session: WalletSession): Promise<void> => {
      if (session.loadPromise) {
        return session.loadPromise;
      }
      session.isLoading = true;
      session.loadError = null;
      publish(session);

      const promise = Promise.resolve().then(async () => {
        try {
          if (!session.userId) {
            throw new Error('Missing account');
          }
          const key = demoWalletStorageKey(session.userId);
          const pendingWrite = pendingWrites.get(key);
          if (pendingWrite) {
            await pendingWrite.catch(() => undefined);
          }
          const stored = await AsyncStorage.getItem(key);
          const balance = stored === null ? 0 : Number(stored);
          if (
            (stored !== null && !/^\d+$/.test(stored)) ||
            !Number.isSafeInteger(balance) ||
            balance < 0 ||
            balance > MAX_BALANCE_CENTS
          ) {
            throw new Error('Invalid saved balance');
          }
          session.balanceCents = balance;
        } catch {
          session.loadError = LOAD_ERROR;
        } finally {
          session.isLoading = false;
          session.loadPromise = undefined;
          publish(session);
        }
      });
      session.loadPromise = promise;
      return promise;
    },
    [publish],
  );

  useEffect(() => {
    const session: WalletSession = { ...initialState(userId), active: true };
    sessionRef.current = session;
    load(session);
    return () => {
      session.active = false;
    };
  }, [load, userId]);

  const retryLoad = useCallback(async () => {
    const session = sessionRef.current;
    if (session?.active && session.userId === userId && !session.isAdding) {
      await load(session);
    }
  }, [load, userId]);

  const addMoney = useCallback(
    async (amount: string): Promise<void> => {
      const session = sessionRef.current;
      if (!session?.active || session.userId !== userId || session.isLoading) {
        throw new Error('Please wait for your balance to load.');
      }
      if (session.loadError) {
        throw new Error('Reload your balance before adding money.');
      }

      const key = demoWalletStorageKey(userId);
      if (session.isAdding || pendingWrites.has(key)) {
        throw new Error('Money is already being added. Please wait.');
      }
      const nextBalance = session.balanceCents + parseAmountToCents(amount);
      if (nextBalance > MAX_BALANCE_CENTS) {
        throw new Error(MAX_BALANCE_MESSAGE);
      }

      session.isAdding = true;
      publish(session);
      let write: Promise<void> | undefined;
      try {
        write = AsyncStorage.setItem(key, String(nextBalance));
        pendingWrites.set(key, write);
        await write;
        // Update only after persistence succeeds, so a failed add is retryable.
        session.balanceCents = nextBalance;
      } catch {
        throw new Error('Couldn’t add money. Please try again.');
      } finally {
        if (pendingWrites.get(key) === write) {
          pendingWrites.delete(key);
        }
        session.isAdding = false;
        publish(session);
      }
    },
    [publish, userId],
  );

  // Do not display the previous account’s balance during the effect transition.
  const visibleState = state.userId === userId ? state : initialState(userId);
  return {
    balanceCents: visibleState.balanceCents,
    isLoading: visibleState.isLoading,
    isAdding: visibleState.isAdding,
    loadError: visibleState.loadError,
    addMoney,
    retryLoad,
  };
}
