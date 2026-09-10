import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { GOOGLE_AUTH_CONFIG } from '../config/authConfig';
import { firebaseAuth } from '../services/firebase';
import { syncUserAfterLogin, type BackendUser } from '../services/userApi';
import { resultsDisplayCache } from '../screens/results/resultsDisplayCache';
import { walletDisplayCache } from '../wallet/walletDisplayCache';
import { leagueDisplayCache } from '../screens/leagues/leagueDisplayCache';
import { ratingDisplayCache } from '../rating/ratingDisplayCache';

/**
 * The signed-in user's profile, persisted in AsyncStorage so the name and
 * photo are available for display anywhere in the app (and across restarts).
 *
 * Sign-in flow: Google Sign-In (native dialog) → Firebase Auth
 * (`signInWithCredential`, which is what makes the account appear under
 * Firebase Console → Authentication → Users) → `onUserLogin` Cloud Function
 * (upserts public.users and returns `profile`).
 */
export interface AuthUser {
  /** Firebase Auth UID — the key the backend uses (public.users.firebase_uid). */
  uid: string;
  /** Google account id. Prefer `uid` for anything that talks to the backend. */
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
  givenName: string | null;
  familyName: string | null;
  idToken: string | null;
}

const STORAGE_KEY = '@skillgaming/auth_user';

interface AuthContextValue {
  /** null while signed out. */
  user: AuthUser | null;
  /**
   * The player's row in the backend, from the `onUserLogin` callable.
   * null until the first sync completes (on a restored session it loads in
   * the background, so it can briefly be null while `user` is set).
   */
  profile: BackendUser | null;
  /** true while the persisted session is being restored on app launch. */
  isRestoring: boolean;
  /** true while an interactive sign-in is in flight. */
  isSigningIn: boolean;
  /** Human-readable message from the last failed sign-in attempt. */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface GoogleSignInData {
  user: {
    id: string;
    name: string | null;
    email: string;
    photo: string | null;
    givenName: string | null;
    familyName: string | null;
  };
  idToken: string | null;
}

function toAuthUser(data: GoogleSignInData, uid: string): AuthUser {
  return {
    uid,
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    photo: data.user.photo,
    givenName: data.user.givenName,
    familyName: data.user.familyName,
    idToken: data.idToken,
  };
}

/** Fallback when Firebase restored a session but nothing is cached locally. */
function fromFirebaseUser(fbUser: FirebaseUser): AuthUser {
  return {
    uid: fbUser.uid,
    id: fbUser.providerData[0]?.uid ?? fbUser.uid,
    name: fbUser.displayName,
    email: fbUser.email ?? '',
    photo: fbUser.photoURL,
    givenName: null,
    familyName: null,
    idToken: null,
  };
}

async function readCachedUser(): Promise<AuthUser | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as Partial<AuthUser>;
    // Entries written before Firebase Auth was added have no uid; ignore them.
    return typeof parsed.uid === 'string' ? (parsed as AuthUser) : null;
  } catch {
    return null;
  }
}

async function cacheUser(user: AuthUser | null): Promise<void> {
  try {
    if (user) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Caching is a display convenience; never fail auth over it.
  }
}

async function restoreDisplayCaches(userId: string): Promise<void> {
  // Populate memory while the auth gate is already restoring the account, so
  // the first Results/wallet/rating/leagues render can use its saved snapshot.
  // These are local reads only; each screen keeps its normal server refresh.
  await Promise.all([
    resultsDisplayCache.hydrate(userId),
    walletDisplayCache.hydrate(userId),
    leagueDisplayCache.hydrate(userId),
    ratingDisplayCache.hydrate(userId),
  ]);
}

function describeSignInError(e: unknown): string {
  if (isErrorWithCode(e)) {
    const code = String(e.code);
    switch (code) {
      case statusCodes.IN_PROGRESS:
        return 'A sign-in is already in progress.';
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'Google Play Services is not available on this device.';
      default:
        if (code.startsWith('auth/')) {
          // Thrown by Firebase, e.g. auth/invalid-credential when the Google
          // provider is disabled or the web client ID does not match.
          return `Firebase rejected the sign-in (${code}). Check that Google is enabled under Authentication → Sign-in method.`;
        }
        return `Sign-in failed (${code}). Please try again.`;
    }
  }
  return 'Sign-in failed. Please try again.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<BackendUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set while signIn() owns the Firebase session, so the onAuthStateChanged
  // listener below leaves that flow alone instead of handling it twice.
  const interactiveSignIn = useRef(false);
  // UID that signIn() has already synced with the backend in this JS session.
  // Firebase delivers auth events asynchronously, so this covers a listener
  // callback that lands after signIn() has finished.
  const syncedUid = useRef<string | null>(null);
  const sessionVersion = useRef(0);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_AUTH_CONFIG.webClientId,
      iosClientId: GOOGLE_AUTH_CONFIG.iosClientId,
      offlineAccess: GOOGLE_AUTH_CONFIG.offlineAccess,
      profileImageSize: GOOGLE_AUTH_CONFIG.profileImageSize,
    });

    // Firebase restores its own session from AsyncStorage and reports it here:
    // once on launch (user or null) and after every sign-in / sign-out.
    const unsubscribe = onAuthStateChanged(firebaseAuth, async fbUser => {
      const version = ++sessionVersion.current;
      if (!fbUser) {
        syncedUid.current = null;
        setUser(null);
        setProfile(null);
        setIsRestoring(false);
        return;
      }
      if (interactiveSignIn.current || syncedUid.current === fbUser.uid) {
        return; // signIn() populates state itself once the backend confirms.
      }

      // Restore this account's local display data before revealing its screens,
      // then refresh the Google profile and backend row in the background.
      setIsRestoring(true);
      const [cached] = await Promise.all([
        readCachedUser(),
        restoreDisplayCaches(fbUser.uid),
      ]);
      if (version !== sessionVersion.current) return;
      const restored =
        cached && cached.uid === fbUser.uid ? cached : fromFirebaseUser(fbUser);
      setUser(restored);
      setIsRestoring(false);

      GoogleSignin.signInSilently()
        .then(async response => {
          if (response.type === 'success') {
            if (version !== sessionVersion.current) return;
            const refreshed = toAuthUser(response.data, fbUser.uid);
            setUser(refreshed);
            await cacheUser(refreshed);
          }
        })
        .catch(() => {
          // Best-effort only; the Firebase session is what keeps us signed in.
        });

      syncUserAfterLogin()
        .then(nextProfile => {
          if (version === sessionVersion.current) setProfile(nextProfile);
        })
        .catch(e => {
          console.warn('[auth] onUserLogin failed while restoring session:', e);
        });
    });

    return () => {
      sessionVersion.current += 1;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setIsSigningIn(true);
    interactiveSignIn.current = true;
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) {
        return; // 'cancelled' → user dismissed the dialog; no error.
      }

      const { idToken } = response.data;
      if (!idToken) {
        setError(
          'Google returned no ID token. Check webClientId in src/config/authConfig.ts.',
        );
        return;
      }

      // 1. Exchange the Google token for a Firebase session. This is the step
      //    that creates/updates the account in Firebase Authentication.
      const credential = GoogleAuthProvider.credential(idToken);
      const { user: fbUser } = await signInWithCredential(
        firebaseAuth,
        credential,
      );

      // 2. Register the login with the backend. If that fails we roll the
      //    sign-in back, so a signed-in user always has a users row.
      let backendUser: BackendUser;
      try {
        backendUser = await syncUserAfterLogin({
          displayName: response.data.user.name,
          photoUrl: response.data.user.photo,
        });
      } catch (e) {
        console.warn('[auth] onUserLogin failed:', e);
        await firebaseSignOut(firebaseAuth).catch(() => {});
        await GoogleSignin.signOut().catch(() => {});
        const code = (e as { code?: unknown })?.code;
        setError(
          `Signed in with Google, but the game server request failed (${
            typeof code === 'string' ? code : 'unknown error'
          }). Please try again.`,
        );
        return;
      }

      const signedIn = toAuthUser(response.data, fbUser.uid);
      await Promise.all([
        cacheUser(signedIn),
        restoreDisplayCaches(fbUser.uid),
      ]);
      syncedUid.current = fbUser.uid;
      setProfile(backendUser);
      setUser(signedIn);
    } catch (e) {
      setError(describeSignInError(e));
    } finally {
      interactiveSignIn.current = false;
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    sessionVersion.current += 1;
    // Each step is best-effort: whatever happens, the local session is cleared.
    await GoogleSignin.signOut().catch(() => {});
    await firebaseSignOut(firebaseAuth).catch(() => {});
    await cacheUser(null);
    syncedUid.current = null;
    setProfile(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, profile, isRestoring, isSigningIn, error, signIn, signOut }),
    [user, profile, isRestoring, isSigningIn, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
