import { httpsCallable } from 'firebase/functions';
import { firebaseAuth, firebaseFunctions } from './firebase';

export interface ServerWallet {
  balanceCents: number;
  currency: 'USD';
  mode: 'demo';
}

export interface AddDemoMoneyRequest {
  amountCents: number;
  requestId: string;
}

function requireAccount(userId: string) {
  if (!userId || firebaseAuth.currentUser?.uid !== userId) {
    throw new Error('Your account changed. Please sign in again.');
  }
}

function checkedWallet(wallet: ServerWallet): ServerWallet {
  if (
    !wallet ||
    !Number.isSafeInteger(wallet.balanceCents) ||
    wallet.balanceCents < 0 ||
    wallet.currency !== 'USD' ||
    wallet.mode !== 'demo'
  ) {
    throw new Error('The server returned an invalid wallet. Please try again.');
  }
  return wallet;
}

export async function getMyWallet(userId: string): Promise<ServerWallet> {
  requireAccount(userId);
  const call = httpsCallable<Record<string, never>, ServerWallet>(
    firebaseFunctions,
    'getMyWallet',
  );
  return checkedWallet((await call({})).data);
}

export async function addDemoMoney(
  request: AddDemoMoneyRequest,
  userId: string,
): Promise<ServerWallet> {
  requireAccount(userId);
  const call = httpsCallable<AddDemoMoneyRequest, ServerWallet>(
    firebaseFunctions,
    'addDemoMoney',
  );
  return checkedWallet((await call(request)).data);
}
