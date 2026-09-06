import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { FIREBASE_CONFIG, getFunctionsBaseUrl } from '../config/firebaseConfig';

/**
 * The single Firebase app instance for the whole RN app.
 *
 * Auth has to be created with `initializeAuth` + AsyncStorage persistence:
 * plain `getAuth()` keeps the session in memory only and drops it on every
 * relaunch. Doing this at module level guarantees it runs once, before any
 * callable is invoked, which is what lets `httpsCallable` attach the
 * signed-in user's ID token automatically.
 */
export const firebaseApp: FirebaseApp =
  getApps()[0] ?? initializeApp(FIREBASE_CONFIG);

function createAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fast Refresh re-evaluated this module: Auth already exists for this app.
    return getAuth(app);
  }
}

export const firebaseAuth: Auth = createAuth(firebaseApp);

/**
 * Always an absolute URL (production or emulator), never a bare region — see
 * getFunctionsBaseUrl() for why. This also replaces connectFunctionsEmulator():
 * the emulator URL already carries the project id and region path.
 */
export const firebaseFunctions = getFunctions(
  firebaseApp,
  getFunctionsBaseUrl()
);
