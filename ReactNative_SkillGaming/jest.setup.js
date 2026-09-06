/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    default: {
      getItem: jest.fn(key => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key, value) => {
        store[key] = value;
        return Promise.resolve();
      }),
      removeItem: jest.fn(key => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
    },
  };
});

jest.mock('@react-native-google-signin/google-signin', () => {
  const React = require('react');

  const GoogleSigninButton = props =>
    React.createElement('GoogleSigninButton', props, props.children);
  GoogleSigninButton.Size = { Icon: 0, Standard: 1, Wide: 2 };
  GoogleSigninButton.Color = { Dark: 'dark', Light: 'light' };

  return {
    GoogleSignin: {
      configure: jest.fn(),
      hasPlayServices: jest.fn().mockResolvedValue(true),
      signIn: jest.fn().mockResolvedValue({ type: 'cancelled', data: null }),
      signInSilently: jest
        .fn()
        .mockResolvedValue({ type: 'noSavedCredentialFound', data: null }),
      signOut: jest.fn().mockResolvedValue(null),
    },
    GoogleSigninButton,
    statusCodes: {
      SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
      IN_PROGRESS: 'IN_PROGRESS',
      PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    },
    isSuccessResponse: response => response?.type === 'success',
    isNoSavedCredentialFoundResponse: response =>
      response?.type === 'noSavedCredentialFound',
    isErrorWithCode: error => !!error && error.code !== undefined,
  };
});
