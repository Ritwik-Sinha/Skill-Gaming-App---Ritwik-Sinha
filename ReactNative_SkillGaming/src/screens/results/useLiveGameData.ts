import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export const RESULTS_POLL_INTERVAL_MS = 15000;

/** One request at a time; backgrounded and unmounted screens do not poll. */
export default function useLiveGameData<T>(fetchData: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => requestRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let active =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    let timer: ReturnType<typeof setTimeout> | undefined;

    setData(null);
    setError(false);
    setLoading(true);

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
      setLoading(true);
      try {
        const response = await fetchData();
        if (!disposed) {
          setData(response);
          setError(false);
        }
      } catch {
        if (!disposed) {
          setError(true);
        }
      } finally {
        pending = false;
        if (!disposed) {
          setLoading(false);
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
    const subscription = AppState.addEventListener('change', state => {
      active = state === 'active';
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
  }, [fetchData]);

  return { data, loading, error, refresh };
}
