/* eslint-env node */
/**
 * Jest environment for tests that load the REAL Firebase JS SDK
 * (opt in per file with a `@jest-environment` docblock).
 *
 * The React Native preset's environment resolves package "exports" with the
 * conditions ['require', 'react-native'] only. The `firebase/*` entry points
 * nest their CommonJS builds under "node" / "browser", so with those
 * conditions Jest falls through to the ESM "default" build and fails on
 * `import` syntax. Adding "node" selects the CommonJS builds instead.
 */
const ReactNativeEnv = require('@react-native/jest-preset/jest/react-native-env');

module.exports = class FirebaseNodeEnv extends ReactNativeEnv {
  customExportConditions = ['require', 'node', 'react-native'];
};
