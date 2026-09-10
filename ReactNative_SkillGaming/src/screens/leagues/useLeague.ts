import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { leagueDisplayCache } from './leagueDisplayCache';
import {
  acknowledgeLeagueEvent,
  getMyLeague,
  type LeagueData,
} from '../../services/leagueApi';

export function useLeague(userId: string, paused: boolean) {
  const [data, setData] = useState<LeagueData | null>(
    () => leagueDisplayCache.peek(userId) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    generation.current++;
    busy.current = false;
    dismissed.current.clear();
    setData(leagueDisplayCache.peek(userId) ?? null);
    setError(null);
    setDismissing(false);
    const currentGeneration = generation.current;
    leagueDisplayCache.hydrate(userId).then(cached => {
      if (cached && currentGeneration === generation.current) {
        setData(current => current ?? cached);
      }
    });
    return () => {
      generation.current = currentGeneration + 1;
    };
  }, [userId]);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    const requestGeneration = generation.current;
    busy.current = true;
    setLoading(true);
    try {
      const next = await getMyLeague(userId);
      if (requestGeneration === generation.current) {
        leagueDisplayCache.save(userId, next);
        setData({
          ...next,
          events: next.events.filter(event => !dismissed.current.has(event.id)),
        });
        setError(null);
      }
    } catch (e) {
      if (requestGeneration === generation.current)
        setError(e instanceof Error ? e.message : 'Could not load leagues.');
    } finally {
      if (requestGeneration === generation.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [userId]);
  useEffect(() => {
    if (paused) return;
    if (AppState.currentState === 'active' || AppState.currentState == null)
      refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, 15000);
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [paused, refresh]);
  const dismiss = useCallback(async () => {
    const event = data?.events[0];
    if (!event || dismissing) return;
    const requestGeneration = generation.current;
    setDismissing(true);
    try {
      await acknowledgeLeagueEvent(userId, event.id);
      if (requestGeneration === generation.current) {
        dismissed.current.add(event.id);
        setData(current =>
          current
            ? {
                ...current,
                events: current.events.filter(e => e.id !== event.id),
              }
            : null,
        );
        setError(null);
      }
    } catch {
      if (requestGeneration === generation.current)
        setError('Could not save dismissal. Tap to retry.');
    } finally {
      if (requestGeneration === generation.current) setDismissing(false);
    }
  }, [data, dismissing, userId]);
  return { data, error, loading, refresh, dismiss, dismissing };
}
