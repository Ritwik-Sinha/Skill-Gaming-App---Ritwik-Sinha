/**
 * @jest-environment <rootDir>/jest/firebaseNodeEnv.js
 *
 * Regression test for the callable URL under React Native.
 *
 * The Firebase Functions SDK does `new URL(regionOrCustomDomain)` and relies on
 * it throwing for a bare region. React Native's URL polyfill never throws and
 * returns origin "", so a bare region collapsed the callable URL to
 * "/onUserLogin" (surfaced in the app as `functions/internal [0]`).
 * getFunctionsBaseUrl() therefore always hands the SDK an absolute URL.
 *
 * The real SDK and the real RN polyfill are used here; the global mocks from
 * jest.setup.js are bypassed with jest.requireActual, and the custom
 * environment above makes Jest pick the SDK's CommonJS builds.
 */
import {
  FUNCTIONS_EMULATOR,
  FUNCTIONS_REGION,
  FIREBASE_CONFIG,
  getFunctionsBaseUrl,
} from '../src/config/firebaseConfig';

type FirebaseAppModule = {
  initializeApp: (options: object, name: string) => object;
};
type FunctionsModule = {
  getFunctions: (app: object, regionOrDomain: string) => unknown;
};
type FunctionsInternal = { _url: (name: string) => string };

const { initializeApp } = jest.requireActual<FirebaseAppModule>('firebase/app');
const { getFunctions } = jest.requireActual<FunctionsModule>('firebase/functions');
const { URL: ReactNativeURL } = jest.requireActual<{ URL: unknown }>(
  'react-native/Libraries/Blob/URL'
);

const PROJECT_ID = FIREBASE_CONFIG.projectId;

function callableUrl(regionOrDomain: string, appName: string): string {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'test', appId: 'test' },
    appName
  );
  const functions = getFunctions(app, regionOrDomain) as FunctionsInternal;
  return functions._url('onUserLogin');
}

describe('callable URL under the React Native URL polyfill', () => {
  const realURL = globalThis.URL;

  beforeAll(() => {
    (globalThis as { URL: unknown }).URL = ReactNativeURL;
  });

  afterAll(() => {
    (globalThis as { URL: unknown }).URL = realURL;
  });

  it('reproduces the bug: a bare region collapses to "/onUserLogin"', () => {
    expect(callableUrl(FUNCTIONS_REGION, 'bare-region')).toBe('/onUserLogin');
  });

  it('an absolute production base URL yields the deployed endpoint', () => {
    expect(
      callableUrl(
        `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net`,
        'production'
      )
    ).toBe(
      `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/onUserLogin`
    );
  });

  it('an absolute emulator base URL keeps project id and region in the path', () => {
    expect(
      callableUrl(`http://10.0.2.2:5001/${PROJECT_ID}/${FUNCTIONS_REGION}`, 'emulator')
    ).toBe(`http://10.0.2.2:5001/${PROJECT_ID}/${FUNCTIONS_REGION}/onUserLogin`);
  });
});

describe('getFunctionsBaseUrl()', () => {
  afterEach(() => {
    FUNCTIONS_EMULATOR.enabled = false;
  });

  it('targets the deployed region in production', () => {
    expect(getFunctionsBaseUrl()).toBe(
      `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net`
    );
  });

  it('targets the local emulator, including project id and region, when enabled', () => {
    FUNCTIONS_EMULATOR.enabled = true;
    expect(getFunctionsBaseUrl()).toBe(
      `http://${FUNCTIONS_EMULATOR.host}:${FUNCTIONS_EMULATOR.port}/${PROJECT_ID}/${FUNCTIONS_REGION}`
    );
  });
});
