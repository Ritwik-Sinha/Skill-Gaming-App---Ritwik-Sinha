import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getMyRating, type ServerRating } from '../services/ratingApi';
import { ratingDisplayCache } from './ratingDisplayCache';

const LOAD_ERROR = 'Couldn’t refresh your rating. Please try again.';
const pendingLoads = new Map<string, Promise<ServerRating>>();

function loadRating(userId: string): Promise<ServerRating> {
  const active = pendingLoads.get(userId);
  if (active) return active;
  const promise = Promise.resolve()
    .then(() => getMyRating(userId))
    .finally(() => {
      if (pendingLoads.get(userId) === promise) pendingLoads.delete(userId);
    });
  pendingLoads.set(userId, promise);
  return promise;
}

interface RatingState {
  userId: string;
  rating: number | undefined;
  isLoading: boolean;
  loadError: string | null;
}

interface RatingSession extends RatingState {
  active: boolean;
  loadPromise?: Promise<void>;
}

function initialState(userId: string): RatingState {
  return {
    userId,
    rating: ratingDisplayCache.peek(userId),
    isLoading: true,
    loadError: null,
  };
}

export function useServerRating(userId: string) {
  const [state, setState] = useState(() => initialState(userId));
  const sessionRef = useRef<RatingSession | null>(null);
  const publish = useCallback((session: RatingSession) => {
    if (session.active && sessionRef.current === session) {
      setState({
        userId: session.userId,
        rating: session.rating,
        isLoading: session.isLoading,
        loadError: session.loadError,
      });
    }
  }, []);

  const load = useCallback(
    (session: RatingSession): Promise<void> => {
      if (session.loadPromise) return session.loadPromise;
      session.isLoading = true;
      session.loadError = null;
      publish(session);
      const promise = Promise.resolve().then(async () => {
        try {
          if (!session.userId) throw new Error('Missing account');
          const response = await loadRating(session.userId);
          session.rating = response.rating;
          ratingDisplayCache.save(session.userId, response.rating);
        } catch {
          session.loadError = LOAD_ERROR;
        } finally {
          session.isLoading = false;
          session.loadPromise = undefined;
          publish(session);
        }
      });
      session.loadPromise = promise;
      return promise;
    },
    [publish],
  );

  useEffect(() => {
    const session: RatingSession = { ...initialState(userId), active: true };
    sessionRef.current = session;
    ratingDisplayCache.hydrate(userId).then(rating => {
      if (session.rating === undefined && rating !== undefined) {
        session.rating = rating;
        publish(session);
      }
    });
    load(session);
    return () => {
      session.active = false;
    };
  }, [load, publish, userId]);

  const refresh = useCallback(async () => {
    const session = sessionRef.current;
    if (session?.active && session.userId === userId) await load(session);
  }, [load, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', appState => {
      if (appState === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const visibleState = state.userId === userId ? state : initialState(userId);
  return {
    rating: visibleState.rating,
    isLoading: visibleState.isLoading,
    loadError: visibleState.loadError,
    refresh,
    retryLoad: refresh,
  };
}
