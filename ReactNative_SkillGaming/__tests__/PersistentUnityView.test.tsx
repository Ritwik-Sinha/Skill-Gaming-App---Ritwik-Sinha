/**
 * PersistentUnityView must never unload the Unity engine on unmount: with the
 * Unity 6 export a second UnityPlayer in the same Android process crashes
 * ("Graphics device is null"). It pauses instead, and resumes on mount.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import PersistentUnityView from '../src/components/PersistentUnityView';

// Stand-in for the library's UnityView that records the bridge commands it
// would dispatch. Its componentWillUnmount unloads, exactly like the real one,
// so the test proves the subclass bypasses it.
jest.mock('@azesmway/react-native-unity', () => {
  const ReactLib = require('react');
  const calls: string[] = [];
  class UnityView extends ReactLib.Component {
    static calls = calls;
    ref = ReactLib.createRef();
    postMessage = () => {};
    unloadUnity = () => {
      calls.push('unload');
    };
    pauseUnity(pause: boolean) {
      calls.push(`pause:${pause}`);
    }
    resumeUnity() {
      calls.push('resume');
    }
    windowFocusChanged(hasFocus = true) {
      calls.push(`focus:${hasFocus}`);
    }
    componentWillUnmount() {
      this.unloadUnity();
    }
    render() {
      return null;
    }
  }
  return { __esModule: true, default: UnityView };
});

const { default: MockUnityView } = jest.requireMock(
  '@azesmway/react-native-unity'
) as { default: { calls: string[] } };

describe('PersistentUnityView', () => {
  beforeEach(() => {
    MockUnityView.calls.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resumes on mount, again after the bridge re-pause window, and never unloads on unmount', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<PersistentUnityView />);
    });
    expect(MockUnityView.calls).toEqual(['resume']);

    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(MockUnityView.calls).toEqual(['resume', 'resume']);

    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    expect(MockUnityView.calls).toEqual([
      'resume',
      'resume',
      'focus:false',
      'pause:true',
    ]);
    expect(MockUnityView.calls).not.toContain('unload');
  });

  it('cancels the delayed resume if unmounted before it fires', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<PersistentUnityView />);
    });
    ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    ReactTestRenderer.act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(MockUnityView.calls).toEqual(['resume', 'focus:false', 'pause:true']);
  });
});
