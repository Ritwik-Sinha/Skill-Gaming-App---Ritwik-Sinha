/**
 * Signing out from the header must run (and await) the onBeforeSignOut hook
 * before the session is cleared: GameScreen uses it to reset the Unity game
 * while the engine is still active.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import UserHeader from '../src/components/UserHeader';

// The factory is self-contained: jest.mock is hoisted above the imports, and
// the factory runs while UserHeader is being imported, before any top-level
// const in this file exists.
jest.mock('../src/auth/AuthContext', () => {
  const order: string[] = [];
  const signOut = jest.fn(async () => {
    order.push('signOut');
  });
  return {
    __order: order,
    __signOut: signOut,
    useAuth: () => ({
      user: { uid: 'u1', id: 'g1', name: 'Test User', email: 't@example.com' },
      signOut,
    }),
  };
});

const { __order: order, __signOut: signOut } = jest.requireMock(
  '../src/auth/AuthContext'
) as { __order: string[]; __signOut: jest.Mock };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function pressSignOut(renderer: ReactTestRenderer.ReactTestRenderer) {
  const pressable = renderer.root.findAll(
    node => typeof node.props.onPress === 'function'
  )[0];
  return pressable.props.onPress();
}

describe('UserHeader sign-out', () => {
  beforeEach(() => {
    order.length = 0;
    signOut.mockClear();
  });

  it('awaits onBeforeSignOut, then signs out', async () => {
    const onBeforeSignOut = jest.fn(
      () =>
        new Promise<void>(resolve =>
          setTimeout(() => {
            order.push('reset');
            resolve();
          }, 5)
        )
    );
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <UserHeader onBeforeSignOut={onBeforeSignOut} />
      );
    });
    await ReactTestRenderer.act(async () => {
      await pressSignOut(renderer);
    });
    expect(onBeforeSignOut).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['reset', 'signOut']);
  });

  it('signs out normally without a hook', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<UserHeader />);
    });
    await ReactTestRenderer.act(async () => {
      await pressSignOut(renderer);
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
