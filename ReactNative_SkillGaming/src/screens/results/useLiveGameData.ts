import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AccountDisplayCache } from '../../services/displayCache';

export const RESULTS_POLL_INTERVAL_MS = 15000;

interface LiveDataState<T> {
  fetchData: () => Promise<T>;
  cache?: AccountDisplayCache<T>;
  userId: string;
  data: T | null;
  loading: boolean;
  error: boolean;
  fetchCount: number;
}

/** One request at a time; backgrounded and unmounted screens do not poll. */
export default function useLiveGameData<T>(
  fetchData: () => Promise<T>,
  cache?: AccountDisplayCache<T>,
  userId = '',
) {
  const initialState = (): LiveDataState<T> => ({
    fetchData,
    cache,
    userId,
    data: cache?.peek(userId) ?? null,
    loading: true,
    error: false,
    fetchCount: 0,
  });
  const [state, setState] = useState<LiveDataState<T>>(initialState);
  const requestRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => requestRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let receivedResponse = false;
    let active =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    let timer: ReturnType<typeof setTimeout> | undefined;

    setState({
      fetchData,
      cache,
      userId,
      data: cache?.peek(userId) ?? null,
      loading: true,
      error: false,
      fetchCount: 0,
    });
    // Storage hydration and the existing server request start independently.
    // Hydration cannot replace a newer response (including an empty history).
    cache?.hydrate(userId).then(saved => {
      if (!disposed && !receivedResponse && saved !== null) {
        setState(current => ({ ...current, data: saved }));
      }
    });

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const request = async () => {
      if (disposed || pending || !active) {
        return;
      }
      clearTimer();
      pending = true;
      setState(current => ({ ...current, loading: true }));
      try {
        const response = await fetchData();
        if (!disposed) {
          receivedResponse = true;
          cache?.save(userId, response);
          setState(current => ({
            ...current,
            data: response,
            error: false,
            fetchCount: current.fetchCount + 1,
          }));
        }
      } catch {
        if (!disposed) {
          setState(current => ({ ...current, error: true }));
        }
      } finally {
        pending = false;
        if (!disposed) {
          setState(current => ({ ...current, loading: false }));
          if (active) {
            timer = setTimeout(() => {
              request();
            }, RESULTS_POLL_INTERVAL_MS);
          }
        }
      }
    };

    requestRef.current = () => {
      request();
    };
    const subscription = AppState.addEventListener('change', appState => {
      active = appState === 'active';
      clearTimer();
      if (active) {
        request();
      }
    });
    request();

    return () => {
      disposed = true;
      clearTimer();
      subscription.remove();
      requestRef.current = () => {};
    };
  }, [fetchData, cache, userId]);

  // Never expose the previous account's rows during an effect transition.
  const visible =
    state.fetchData === fetchData &&
    state.cache === cache &&
    state.userId === userId
      ? state
      : initialState();
  return {
    data: visible.data,
    loading: visible.loading,
    error: visible.error,
    fetchCount: visible.fetchCount,
    refresh,
  };
}
