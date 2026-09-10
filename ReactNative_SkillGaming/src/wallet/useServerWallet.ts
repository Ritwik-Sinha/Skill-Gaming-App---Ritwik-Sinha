import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDemoMoney,
  getMyWallet,
  withdrawMoney as withdrawWalletMoney,
  type AddDemoMoneyRequest,
  type WithdrawMoneyRequest,
  type ServerWallet,
} from '../services/walletApi';
import {
  formatServerMoney,
  parseServerAmount,
  parseWithdrawalAmount,
} from './serverMoney';

export { formatServerMoney } from './serverMoney';

const LOAD_ERROR = 'Couldn’t load your balance. Please try again.';
type WalletOperation = 'topUp' | 'withdrawal';
type WalletRequest = AddDemoMoneyRequest | WithdrawMoneyRequest;

export function pendingTopUpStorageKey(userId: string) {
  return `@skillgaming/server_wallet/pending_top_up/${encodeURIComponent(
    userId,
  )}`;
}

export function pendingWithdrawalStorageKey(userId: string) {
  return `@skillgaming/server_wallet/pending_withdrawal/${encodeURIComponent(
    userId,
  )}`;
}

const operations = {
  topUp: {
    label: 'top-up',
    idPrefix: 'topup',
    storageKey: pendingTopUpStorageKey,
    call: addDemoMoney,
  },
  withdrawal: {
    label: 'withdrawal',
    idPrefix: 'withdrawal',
    storageKey: pendingWithdrawalStorageKey,
    call: withdrawWalletMoney,
  },
};

// Share in-flight work across remounts, with one mutation per account.
// Balances are always fetched from the server and are never stored locally.
const pendingChanges = new Map<
  string,
  { kind: WalletOperation; promise: Promise<ServerWallet> }
>();
const pendingLoads = new Map<string, Promise<ServerWallet>>();

async function readPending(
  userId: string,
  kind: WalletOperation,
): Promise<WalletRequest | null> {
  const operation = operations[kind];
  const saved = await AsyncStorage.getItem(operation.storageKey(userId));
  if (saved === null) return null;
  const request = JSON.parse(saved) as WalletRequest;
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !request.requestId ||
    !Number.isSafeInteger(request.amountCents) ||
    request.amountCents <= 0 ||
    (kind === 'topUp' &&
      (request.amountCents % 100 !== 0 || request.amountCents > 99_999_900))
  ) {
    throw new Error(
      `Couldn’t read your pending ${operation.label}. Please try again.`,
    );
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
    'functions/already-exists',
  ].includes(code ?? '');
}

function submitChange(
  userId: string,
  kind: WalletOperation,
  amountCents?: number,
): Promise<ServerWallet> {
  const active = pendingChanges.get(userId);
  if (active) {
    return active.kind === kind
      ? active.promise
      : Promise.reject(
          new Error(
            'A wallet transaction is already in progress. Please wait.',
          ),
        );
  }
  const operation = operations[kind];
  const promise = Promise.resolve()
    .then(async () => {
      // An unconfirmed debit or credit must be resolved before starting another kind.
      const otherKind = kind === 'topUp' ? 'withdrawal' : 'topUp';
      const otherPending = await readPending(userId, otherKind);
      if (otherPending && amountCents !== undefined) {
        throw new Error(
          `Your previous ${formatServerMoney(otherPending.amountCents / 100)} ${
            operations[otherKind].label
          } is pending. Refresh your balance to check it first.`,
        );
      }
      let request = await readPending(userId, kind);
      if (
        request &&
        amountCents !== undefined &&
        request.amountCents !== amountCents
      ) {
        throw new Error(
          `Your previous ${formatServerMoney(request.amountCents / 100)} ${
            operation.label
          } is pending. Retry that amount first.`,
        );
      }
      if (!request) {
        if (amountCents === undefined) return getMyWallet(userId);
        request = {
          requestId: `${operation.idPrefix}-${Date.now().toString(
            36,
          )}-${Math.random().toString(36).slice(2)}-${Math.random()
            .toString(36)
            .slice(2)}`,
          amountCents,
        };
        // Persist before the callable: losing the response must never duplicate money movement.
        await AsyncStorage.setItem(
          operation.storageKey(userId),
          JSON.stringify(request),
        );
      }
      let wallet: ServerWallet;
      try {
        wallet = await operation.call(request, userId);
      } catch (cause) {
        if (definitelyRejected(cause)) {
          await AsyncStorage.removeItem(operation.storageKey(userId));
          throw cause;
        }
        throw new Error(
          `Couldn’t confirm your ${operation.label}. Try again to safely check the same request.`,
        );
      }
      // Failed cleanup keeps the same id available for a safe retry.
      await AsyncStorage.removeItem(operation.storageKey(userId));
      return wallet;
    })
    .finally(() => {
      if (pendingChanges.get(userId)?.promise === promise)
        pendingChanges.delete(userId);
    });
  pendingChanges.set(userId, { kind, promise });
  return promise;
}

function loadWallet(userId: string): Promise<ServerWallet> {
  const active = pendingLoads.get(userId);
  if (active) return active;
  const promise = Promise.resolve()
    .then(async () => {
      const pending = pendingChanges.get(userId);
      if (pending) await pending.promise.catch(() => undefined);
      for (const kind of ['topUp', 'withdrawal'] as const) {
        if (await readPending(userId, kind)) {
          try {
            await submitChange(userId, kind);
          } catch (cause) {
            // A confirmed rejection removed the journal; the real balance can now load.
            if (!definitelyRejected(cause)) throw cause;
          }
        }
      }
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
  isWithdrawing: boolean;
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
    isWithdrawing: false,
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
        isWithdrawing: session.isWithdrawing,
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
    if (
      session?.active &&
      session.userId === userId &&
      !session.isAdding &&
      !session.isWithdrawing
    ) {
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
        session.isWithdrawing ||
        pendingChanges.has(userId) ||
        pendingLoads.has(userId)
      ) {
        throw new Error(
          'A wallet transaction is already in progress. Please wait.',
        );
      }
      const amountCents = parseServerAmount(amount);
      // The server checks the resulting balance atomically, including pending/retried credits.
      session.isAdding = true;
      publish(session);
      try {
        session.balance =
          (await submitChange(userId, 'topUp', amountCents)).balanceCents / 100;
      } finally {
        session.isAdding = false;
        publish(session);
      }
    },
    [publish, userId],
  );

  const withdrawMoney = useCallback(
    async (amount: string): Promise<void> => {
      const session = sessionRef.current;
      if (!session?.active || session.userId !== userId || session.isLoading) {
        throw new Error('Please wait for your balance to load.');
      }
      if (session.loadError)
        throw new Error('Reload your balance before withdrawing money.');
      if (
        session.isAdding ||
        session.isWithdrawing ||
        pendingChanges.has(userId) ||
        pendingLoads.has(userId)
      ) {
        throw new Error(
          'A wallet transaction is already in progress. Please wait.',
        );
      }
      const amountCents = parseWithdrawalAmount(amount);
      // Only the server checks available funds, including retries of an already applied debit.
      session.isWithdrawing = true;
      publish(session);
      try {
        session.balance =
          (await submitChange(userId, 'withdrawal', amountCents)).balanceCents /
          100;
      } finally {
        session.isWithdrawing = false;
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
    isWithdrawing: visibleState.isWithdrawing,
    loadError: visibleState.loadError,
    addMoney,
    withdrawMoney,
    retryLoad: refresh,
    refresh,
  };
}
