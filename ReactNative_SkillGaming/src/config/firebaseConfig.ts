import { Platform } from 'react-native';

/**
 * Firebase Web-app config for the JS SDK (`firebase` npm package).
 *
 * These values are NOT secrets: they only identify the project, and every
 * client ships them. Access is controlled by Firebase Auth and by the
 * `context.auth` check inside each callable — never by hiding this file.
 *
 * Source: Firebase Console → Project settings → Your apps →
 *         "Skill Gaming RN (JS SDK)"   (or run:
 *         firebase apps:sdkconfig WEB 1:525394427013:web:f9396a088c462a3b83fdec)
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCm9QORIc74nQUDGI5jjEsMCL1ulWDAVzk',
  authDomain: 'skillgaming-b93ea.firebaseapp.com',
  projectId: 'skillgaming-b93ea',
  storageBucket: 'skillgaming-b93ea.firebasestorage.app',
  messagingSenderId: '525394427013',
  appId: '1:525394427013:web:f9396a088c462a3b83fdec',
};

/**
 * Must match `functions.region(...)` in
 * Database_SkillGaming/Scripts/FirebaseFunctions/*.js, otherwise every callable
 * fails with `functions/not-found`.
 */
export const FUNCTIONS_REGION = 'asia-south1';

/**
 * Point callables at a local `firebase emulators:start --only functions`
 * instead of production. The Android emulator reaches your machine at
 * 10.0.2.2, the iOS simulator at localhost; a physical device needs your
 * machine's LAN IP.
 */
export const FUNCTIONS_EMULATOR = {
  enabled: false,
  host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost',
  port: 5001,
};

/**
 * Absolute base URL that callables are posted to. It is passed to
 * `getFunctions()` as a full URL rather than a bare region on purpose.
 *
 * The SDK does `new URL(regionOrCustomDomain)` and relies on it THROWING for
 * a plain region string. React Native's built-in URL polyfill never throws:
 * `new URL('asia-south1').origin` is `""`, so the SDK believed a custom domain
 * of "" was configured and built the callable URL as "/onUserLogin". The
 * request never left the device and surfaced as `functions/internal [0]`.
 * An absolute URL parses identically under the polyfill and a spec URL.
 */
export function getFunctionsBaseUrl(): string {
  const { projectId } = FIREBASE_CONFIG;
  if (FUNCTIONS_EMULATOR.enabled) {
    const { host, port } = FUNCTIONS_EMULATOR;
    return `http://${host}:${port}/${projectId}/${FUNCTIONS_REGION}`;
  }
  return `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
}
