import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebase';

/**
 * The player's row in public.users, as returned by the `onUserLogin` callable
 * (Database_SkillGaming/Scripts/FirebaseFunctions/Auth.js).
 */
export interface BackendUser {
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  authProvider: string;
  loginCount: number;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  /** true only on the call that created the row. */
  isNewUser: boolean;
}

interface OnUserLoginRequest {
  /** Optional hints; the server prefers the verified token's own claims. */
  displayName?: string | null;
  photoUrl?: string | null;
}

interface OnUserLoginResponse {
  user: BackendUser;
}

const onUserLogin = httpsCallable<OnUserLoginRequest, OnUserLoginResponse>(
  firebaseFunctions,
  'onUserLogin'
);

/**
 * Tell the backend that the current Firebase user just signed in. Upserts
 * public.users and returns the row.
 *
 * Requires a signed-in `firebaseAuth.currentUser`: the SDK attaches the ID
 * token itself, and the server rejects the call as `unauthenticated` without it.
 */
export async function syncUserAfterLogin(
  hints: OnUserLoginRequest = {}
): Promise<BackendUser> {
  const { data } = await onUserLogin(hints);
  return data.user;
}
