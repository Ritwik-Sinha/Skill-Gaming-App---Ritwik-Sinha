import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Wallet amounts are whole dollars, kept within the safe integer range.
export const MAX_BALANCE = 999_999;
const LEGACY_MAX_BALANCE_CENTS = 99_999_999;

export function formatMoney(amount: number): string {
  return `$${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

const MAX_BALANCE_MESSAGE = `Your demo balance can be at most ${formatMoney(
  MAX_BALANCE,
)}.`;
const LOAD_ERROR = 'Couldn’t load your balance. Please try again.';

export function parseAmount(amount: string): number {
  const value = amount.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error('Enter a whole-dollar amount without decimals.');
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_BALANCE) {
    throw new Error(MAX_BALANCE_MESSAGE);
  }
  if (parsed <= 0) {
    throw new Error('Enter an amount greater than $0.');
  }
  return parsed;
}

export function demoWalletStorageKey(userId: string): string {
  return `@skillgaming/demo_wallet/v2/${encodeURIComponent(userId)}`;
}

interface WalletState {
  userId: string;
  balance: number;
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
// Share reads and migrations across remounts so a late migration cannot
// overwrite money added after returning to the same account.
const pendingLoads = new Map<string, Promise<number>>();

function parseSavedBalance(stored: string, maximum: number): number {
  const balance = Number(stored);
  if (
    stored.length === 0 ||
    /\D/.test(stored) ||
    !Number.isSafeInteger(balance) ||
    balance < 0 ||
    balance > maximum
  ) {
    throw new Error('Invalid saved balance');
  }
  return balance;
}

function loadBalance(userId: string): Promise<number> {
  const key = demoWalletStorageKey(userId);
  const pendingLoad = pendingLoads.get(key);
  if (pendingLoad) {
    return pendingLoad;
  }

  const promise = Promise.resolve()
    .then(async () => {
      const pendingWrite = pendingWrites.get(key);
      if (pendingWrite) {
        await pendingWrite.catch(() => undefined);
      }
      const stored = await AsyncStorage.getItem(key);
      if (stored !== null) {
        return parseSavedBalance(stored, MAX_BALANCE);
      }

      const legacy = await AsyncStorage.getItem(
        `@skillgaming/demo_wallet/${encodeURIComponent(userId)}`,
      );
      if (legacy === null) {
        return 0;
      }

      const cents = parseSavedBalance(legacy, LEGACY_MAX_BALANCE_CENTS);
      const remainder = cents % 100;
      // Round old cents to the nearest dollar using integer arithmetic.
      const balance = Math.min(
        MAX_BALANCE,
        (cents - remainder) / 100 + (remainder >= 50 ? 1 : 0),
      );
      // Keep the legacy value for recovery; v2 takes precedence on future loads.
      await AsyncStorage.setItem(key, String(balance));
      return balance;
    })
    .finally(() => {
      pendingLoads.delete(key);
    });
  pendingLoads.set(key, promise);
  return promise;
}

function initialState(userId: string): WalletState {
  return {
    userId,
    balance: 0,
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
        balance: session.balance,
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
          session.balance = await loadBalance(session.userId);
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
      const nextBalance = session.balance + parseAmount(amount);
      if (!Number.isSafeInteger(nextBalance) || nextBalance > MAX_BALANCE) {
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
        session.balance = nextBalance;
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
    balance: visibleState.balance,
    isLoading: visibleState.isLoading,
    isAdding: visibleState.isAdding,
    loadError: visibleState.loadError,
    addMoney,
    retryLoad,
  };
}
