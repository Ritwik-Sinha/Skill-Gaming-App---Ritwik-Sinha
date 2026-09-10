import { httpsCallable } from 'firebase/functions';
import { firebaseAuth, firebaseFunctions } from './firebase';

export interface ServerRating {
  rating: number;
}

function requireAccount(userId: string) {
  if (!userId || firebaseAuth.currentUser?.uid !== userId) {
    throw new Error('Your account changed. Please sign in again.');
  }
}

export async function getMyRating(userId: string): Promise<ServerRating> {
  requireAccount(userId);
  const call = httpsCallable<Record<string, never>, ServerRating>(
    firebaseFunctions,
    'getMyRating',
  );
  const { data } = await call({});
  requireAccount(userId);
  if (!data || !Number.isSafeInteger(data.rating)) {
    throw new Error('The server returned an invalid rating. Please try again.');
  }
  return data;
}
