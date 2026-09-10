import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDemoMoney,
  getMyWallet,
  type AddDemoMoneyRequest,
  type ServerWallet,
} from '../services/walletApi';
import { formatServerMoney, parseServerAmount } from './serverMoney';

export { formatServerMoney } from './serverMoney';

const LOAD_ERROR = 'Couldn’t load your balance. Please try again.';
const ADD_ERROR =
  'Couldn’t confirm your top-up. Try again to safely check the same request.';

export function pendingTopUpStorageKey(userId: string) {
  return `@skillgaming/server_wallet/pending_top_up/${encodeURIComponent(
    userId,
  )}`;
}

// Only active operations are shared across remounts; balances are never persisted locally.
const pendingAdds = new Map<string, Promise<ServerWallet>>();
const pendingLoads = new Map<string, Promise<ServerWallet>>();

async function readPending(
  userId: string,
): Promise<AddDemoMoneyRequest | null> {
  const saved = await AsyncStorage.getItem(pendingTopUpStorageKey(userId));
  if (saved === null) return null;
  const request = JSON.parse(saved) as AddDemoMoneyRequest;
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !request.requestId ||
    !Number.isSafeInteger(request.amountCents) ||
    request.amountCents <= 0 ||
    request.amountCents % 100 !== 0 ||
    request.amountCents > 99_999_900
  ) {
    throw new Error('Couldn’t read your pending top-up. Please try again.');
  }
  return request;
}

function definitelyRejected(cause: unknown) {
  const code = (cause as { code?: string })?.code;
  return [
    'functions/invalid-argument',
    'functions/failed-precondition',
    'functions/permission-denied',
    'functions/resource-exhausted',
  ].includes(code ?? '');
}

function submitTopUp(
  userId: string,
  amountCents?: number,
): Promise<ServerWallet> {
  const active = pendingAdds.get(userId);
  if (active) return active;
  const promise = Promise.resolve()
    .then(async () => {
      let request = await readPending(userId);
      if (
        request &&
        amountCents !== undefined &&
        request.amountCents !== amountCents
      ) {
        throw new Error(
          `Your previous ${formatServerMoney(
            request.amountCents / 100,
          )} top-up is pending. Retry that amount first.`,
        );
      }
      if (!request) {
        if (amountCents === undefined) return getMyWallet(userId);
        request = {
          requestId: `topup-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2)}-${Math.random().toString(36).slice(2)}`,
          amountCents,
        };
        // Persist the id before the callable: a process death must not create a second credit.
        await AsyncStorage.setItem(
          pendingTopUpStorageKey(userId),
          JSON.stringify(request),
        );
      }
      let wallet: ServerWallet;
      try {
        wallet = await addDemoMoney(request, userId);
      } catch (cause) {
        if (definitelyRejected(cause)) {
          await AsyncStorage.removeItem(pendingTopUpStorageKey(userId));
          throw cause;
        }
        throw new Error(ADD_ERROR);
      }
      // If cleanup fails, keep the request and replay its id safely on the next retry.
      await AsyncStorage.removeItem(pendingTopUpStorageKey(userId));
      return wallet;
    })
    .finally(() => {
      if (pendingAdds.get(userId) === promise) pendingAdds.delete(userId);
    });
  pendingAdds.set(userId, promise);
  return promise;
}

function loadWallet(userId: string): Promise<ServerWallet> {
  const active = pendingLoads.get(userId);
  if (active) return active;
  const promise = Promise.resolve()
    .then(async () => {
      const pending = pendingAdds.get(userId);
      if (pending) await pending.catch(() => undefined);
      if (await readPending(userId)) await submitTopUp(userId);
      return getMyWallet(userId);
    })
    .finally(() => {
      if (pendingLoads.get(userId) === promise) pendingLoads.delete(userId);
    });
  pendingLoads.set(userId, promise);
  return promise;
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

function initialState(userId: string): WalletState {
  return {
    userId,
    balance: 0,
    isLoading: true,
    isAdding: false,
    loadError: null,
  };
}

export function useServerWallet(userId: string) {
  const [state, setState] = useState(() => initialState(userId));
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
      if (session.loadPromise) return session.loadPromise;
      session.isLoading = true;
      session.loadError = null;
      publish(session);
      const promise = Promise.resolve().then(async () => {
        try {
          if (!session.userId) throw new Error('Missing account');
          session.balance =
            (await loadWallet(session.userId)).balanceCents / 100;
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

  const refresh = useCallback(async () => {
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
      if (session.loadError)
        throw new Error('Reload your balance before adding money.');
      if (
        session.isAdding ||
        pendingAdds.has(userId) ||
        pendingLoads.has(userId)
      ) {
        throw new Error('Money is already being added. Please wait.');
      }
      const amountCents = parseServerAmount(amount);
      // The server checks the resulting balance atomically, including pending/retried credits.
      session.isAdding = true;
      publish(session);
      try {
        session.balance =
          (await submitTopUp(userId, amountCents)).balanceCents / 100;
      } finally {
        session.isAdding = false;
        publish(session);
      }
    },
    [publish, userId],
  );

  const visibleState = state.userId === userId ? state : initialState(userId);
  return {
    balance: visibleState.balance,
    isLoading: visibleState.isLoading,
    isAdding: visibleState.isAdding,
    loadError: visibleState.loadError,
    addMoney,
    retryLoad: refresh,
    refresh,
  };
}
