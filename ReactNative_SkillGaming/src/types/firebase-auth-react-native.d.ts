/**
 * Type augmentation for the Firebase JS SDK under React Native.
 *
 * At runtime Metro resolves `firebase/auth` to @firebase/auth's React Native
 * build (via the "react-native" package-exports condition), which exports
 * `getReactNativePersistence`. TypeScript, however, resolves the package's
 * `types` entry first and lands on the web typings, where that function does
 * not exist. This mirrors the declaration in
 * node_modules/@firebase/auth/dist/rn/index.rn.d.ts so the import type-checks.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  export interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  /**
   * Returns a persistence object that wraps AsyncStorage, for use with
   * `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`.
   */
  export function getReactNativePersistence(
    storage: ReactNativeAsyncStorage
  ): Persistence;
}
