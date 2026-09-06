import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GOOGLE_AUTH_CONFIG } from '../config/authConfig';

/**
 * The signed-in user's profile, persisted in AsyncStorage so the name and
 * photo are available for display anywhere in the app (and across restarts).
 */
export interface AuthUser {
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

function toAuthUser(data: {
  user: {
    id: string;
    name: string | null;
    email: string;
    photo: string | null;
    givenName: string | null;
    familyName: string | null;
  };
  idToken: string | null;
}): AuthUser {
  return {
    id: data.user.id,
    name: data.user.name,
    email: data.user.email,
    photo: data.user.photo,
    givenName: data.user.givenName,
    familyName: data.user.familyName,
    idToken: data.idToken,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_AUTH_CONFIG.webClientId,
      iosClientId: GOOGLE_AUTH_CONFIG.iosClientId,
      offlineAccess: GOOGLE_AUTH_CONFIG.offlineAccess,
      profileImageSize: GOOGLE_AUTH_CONFIG.profileImageSize,
    });

    const restoreSession = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setUser(JSON.parse(stored));
        }
        // Refresh the profile/token in the background when Google still has
        // a valid session; keeps the stored copy up to date.
        const response = await GoogleSignin.signInSilently();
        if (response.type === 'success') {
          const refreshed = toAuthUser(response.data);
          setUser(refreshed);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
        }
      } catch {
        // Silent sign-in is best-effort; fall back to whatever was stored.
      } finally {
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        const signedIn = toAuthUser(response.data);
        setUser(signedIn);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(signedIn));
      }
      // response.type === 'cancelled' → user dismissed the dialog; no error.
    } catch (e) {
      if (isErrorWithCode(e)) {
        switch (e.code) {
          case statusCodes.IN_PROGRESS:
            setError('A sign-in is already in progress.');
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            setError('Google Play Services is not available on this device.');
            break;
          default:
            setError(`Sign-in failed (${e.code}). Please try again.`);
        }
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await GoogleSignin.signOut();
    } catch {
      // Even if Google sign-out fails, clear the local session.
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isRestoring, isSigningIn, error, signIn, signOut }),
    [user, isRestoring, isSigningIn, error, signIn, signOut]
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
