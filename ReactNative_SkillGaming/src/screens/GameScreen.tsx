import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from '../components/AppIcon';
import PersistentUnityView from '../components/PersistentUnityView';
import {
  checkpointGame,
  GAME_ID,
  type Bet,
  type FinishRequest,
  type OwnResult,
} from '../services/gameApi';
import { saveGameFinish, startGame } from '../services/gameSession';
import styles, {
  backButtonStyle,
  containerStyle,
  gameAccent,
  retryButtonStyle,
} from './GameScreen.styles';

interface GameScreenProps {
  userId: string;
  amountCents: number;
  onExit: () => void;
  onFinished: (result: OwnResult) => void;
}
type Phase =
  | 'starting'
  | 'playing'
  | 'finishing'
  | 'failed_start'
  | 'failed_finish'
  | 'failed_reset';

export default function GameScreen({
  userId,
  amountCents,
  onExit,
  onFinished,
}: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const unityRef = useRef<PersistentUnityView>(null);
  const betRef = useRef<Bet | null>(null);
  const [bet, setBet] = useState<Bet | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const interrupted = useRef(false);
  const lastScore = useRef<number | undefined>(undefined);
  const finishRequest = useRef<FinishRequest | null>(null);
  const savedResult = useRef<OwnResult | null>(null);
  const unloaded = useRef(false);
  const delivered = useRef(false);
  const loaded = useRef(false);
  const loadAcknowledged = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishInFlight = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);
  const deliver = useCallback(() => {
    if (
      alive.current &&
      savedResult.current &&
      unloaded.current &&
      !delivered.current
    ) {
      delivered.current = true;
      onFinishedRef.current(savedResult.current);
    }
  }, []);
  const resetScene = useCallback(() => {
    clearResetTimer();
    if (!loaded.current) {
      unloaded.current = true;
      deliver();
      return;
    }
    setPhase('finishing');
    try {
      unityRef.current?.setGamePaused(false);
      unityRef.current?.postMessage(
        'GameSceneLoader',
        'ResetLoadingScene',
        betRef.current!.id,
      );
      resetTimer.current = setTimeout(() => {
        if (alive.current && !unloaded.current) {
          setError('The game is still closing. Retry closing to continue.');
          setPhase('failed_reset');
        }
      }, 15000);
    } catch {
      setError('The game could not close. Retry closing to continue.');
      setPhase('failed_reset');
    }
  }, [clearResetTimer, deliver]);
  const submitFinish = useCallback(async () => {
    if (!finishRequest.current || finishInFlight.current) {
      return;
    }
    finishInFlight.current = true;
    try {
      savedResult.current = await saveGameFinish(userId, finishRequest.current);
      if (alive.current) {
        setError(null);
        deliver();
      }
    } catch {
      if (alive.current) {
        setError(
          'Your run has ended. Reconnect and retry saving this result. This match cannot be replayed.',
        );
        setPhase('failed_finish');
      }
    } finally {
      finishInFlight.current = false;
    }
  }, [deliver, userId]);
  const finish = useCallback(
    (reason: FinishRequest['reason']) => {
      interrupted.current = true;
      if (!betRef.current || finishRequest.current) {
        return;
      }
      finishRequest.current = {
        betId: betRef.current.id,
        reason,
        ...(lastScore.current === undefined
          ? {}
          : { score: lastScore.current }),
      };
      setPhase('finishing');
      resetScene();
      submitFinish();
    },
    [resetScene, submitFinish],
  );

  useEffect(() => {
    alive.current = true;
    startGame(userId, amountCents)
      .then(async response => {
        if ('recovered' in response) {
          if (alive.current) {
            onFinishedRef.current(response.recovered);
          }
          return;
        }
        betRef.current = response.bet;
        if (!alive.current) {
          await saveGameFinish(userId, {
            betId: response.bet.id,
            reason: 'forfeited',
          }).catch(() => undefined);
          return;
        }
        if (interrupted.current) {
          finish('forfeited');
          return;
        }
        setBet(response.bet);
        setPhase('playing');
      })
      .catch(() => {
        if (alive.current) {
          setError(
            'Could not start this match. Check your balance and connection. Any reserved attempt will be recovered before the next start.',
          );
          setPhase('failed_start');
        }
      });
    return () => {
      alive.current = false;
      clearResetTimer();
      if (betRef.current && !finishRequest.current) {
        saveGameFinish(userId, {
          betId: betRef.current.id,
          reason: 'forfeited',
          ...(lastScore.current === undefined
            ? {}
            : { score: lastScore.current }),
        }).catch(() => undefined);
      }
    };
    // A mounted GameScreen represents one immutable attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bet || loaded.current || finishRequest.current) {
      return;
    }
    loaded.current = true;
    let attempts = 0;
    const requestLoad = () => {
      if (finishRequest.current || loadAcknowledged.current) {
        return;
      }
      if (++attempts > 60) {
        finish('forfeited');
        return;
      }
      // The native bridge drops messages before Unity finishes its cold boot.
      // Loading the same authorized session is idempotent in SceneLoader.
      try {
        unityRef.current?.postMessage(
          'GameSceneLoader',
          'LoadGameScene',
          bet.id,
        );
      } catch {
        finish('forfeited');
      }
    };
    requestLoad();
    const timer = setInterval(requestLoad, 1000);
    return () => clearInterval(timer);
  }, [bet, finish]);

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'failed_start') {
        onExit();
      } else {
        finish('forfeited');
      }
      return true;
    });
    const app = AppState.addEventListener('change', state => {
      if (state === 'background') {
        finish('forfeited');
      }
    });
    return () => {
      back.remove();
      app.remove();
    };
  }, [finish, onExit, phase]);

  useEffect(() => {
    if (phase !== 'playing' || !bet) {
      return;
    }
    let pending = false;
    const timer = setInterval(async () => {
      if (
        pending ||
        finishRequest.current ||
        AppState.currentState === 'background'
      ) {
        return;
      }
      pending = true;
      try {
        const response = await checkpointGame(
          bet.id,
          lastScore.current,
          userId,
        );
        if (
          alive.current &&
          !finishRequest.current &&
          response.bet.playStatus !== 'playing'
        ) {
          // The server timeout wins even if the native game was still visible.
          finish('forfeited');
        }
      } catch {
        /* The server's lease expires if connectivity is not restored. */
      } finally {
        pending = false;
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [bet, finish, phase, userId]);

  const retry = () => {
    setError(null);
    if (phase === 'failed_start') {
      onExit();
      return;
    }
    setPhase('finishing');
    if (!unloaded.current) {
      resetScene();
    }
    if (!savedResult.current) {
      submitFinish();
    } else {
      deliver();
    }
  };

  return (
    <View style={containerStyle(insets)}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave and forfeit game"
          disabled={phase !== 'playing' && phase !== 'starting'}
          onPress={() => finish('forfeited')}
          style={({ pressed }) => backButtonStyle(pressed)}
        >
          <AppIcon name="arrow-left" size={22} color={gameAccent} />
          <Text style={styles.backText}>Leave game</Text>
        </Pressable>
        <Text style={styles.liveText}>ONE ATTEMPT</Text>
      </View>
      <Text style={styles.forfeitNotice}>
        Leaving or closing the app forfeits this match.
      </Text>
      <View style={styles.gameContainer}>
        {bet && (
          <PersistentUnityView
            ref={unityRef}
            style={styles.unity}
            onUnityMessage={event => {
              let message: {
                type?: string;
                sessionId?: string;
                game?: string;
                score?: number;
              } | null;
              try {
                message = JSON.parse(event.nativeEvent.message);
              } catch {
                return;
              }
              if (!message || message.sessionId !== bet.id) {
                return;
              }
              if (message.type === 'gameSceneLoaded') {
                loadAcknowledged.current = true;
                return;
              }
              if (message.type === 'gameSceneLoadFailed') {
                finish('forfeited');
                return;
              }
              if (
                message.type === 'gameSceneUnloadFailed' &&
                finishRequest.current
              ) {
                clearResetTimer();
                setError(
                  'The game is still closing. Retry closing to continue.',
                );
                setPhase('failed_reset');
                return;
              }
              if (
                message.type === 'gameSceneUnloaded' &&
                finishRequest.current
              ) {
                clearResetTimer();
                unloaded.current = true;
                deliver();
                return;
              }
              if (finishRequest.current || message.game !== GAME_ID) {
                return;
              }
              if (
                (message.type === 'scoreUpdate' ||
                  message.type === 'gameOver') &&
                typeof message.score === 'number' &&
                Number.isSafeInteger(message.score) &&
                message.score >= 0 &&
                message.score <= 1000000000
              ) {
                lastScore.current = Math.max(
                  lastScore.current ?? 0,
                  message.score,
                );
                if (message.type === 'gameOver') {
                  finish('completed');
                }
              }
            }}
          />
        )}
        {phase !== 'playing' && (
          <View
            style={styles.resetOverlay}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
          >
            <View style={styles.resetCard}>
              {error ? (
                <>
                  <Text style={styles.resetTitle}>
                    {phase === 'failed_start'
                      ? 'Match unavailable'
                      : 'Your run has ended'}
                  </Text>
                  <Text style={styles.resetDescription}>{error}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      phase === 'failed_start'
                        ? 'Return to game details'
                        : 'Retry saving result'
                    }
                    onPress={retry}
                    style={({ pressed }) => retryButtonStyle(pressed)}
                  >
                    <Text style={styles.retryText}>
                      {phase === 'failed_start' ? 'Back to game' : 'Try again'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <ActivityIndicator size="large" color={gameAccent} />
                  <Text style={styles.resetTitle}>
                    {phase === 'starting'
                      ? 'Reserving your match…'
                      : 'Saving your result…'}
                  </Text>
                  <Text style={styles.resetDescription}>
                    {phase === 'starting'
                      ? 'One entry. One attempt. Get ready.'
                      : 'This attempt is over. Your score and match status will appear in Results.'}
                  </Text>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
