import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from '../components/AppIcon';
import PersistentUnityView from '../components/PersistentUnityView';
import styles, {
  backButtonStyle,
  containerStyle,
  gameAccent,
  retryButtonStyle,
} from './GameScreen.styles';

/**
 * Scene object that owns the addressable JungleSwing scene lifecycle.
 */
const UNITY_LOADER_OBJECT = 'GameSceneLoader';
const UNITY_LOAD_METHOD = 'LoadGameScene';
const UNITY_RESET_METHOD = 'ResetLoadingScene';
const SCENE_UNLOADED_MESSAGE = 'gameSceneUnloaded';
const RESET_TIMEOUT_MS = 15000;

interface GameScreenProps {
  onExit: () => void;
}

/**
 * The loader acknowledges only after Addressables has finished unloading the
 * gameplay scene. Navigation waits for that acknowledgement before unmounting,
 * which lets PersistentUnityView pause the engine after the scene is gone.
 */
function GameScreen({ onExit }: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const unityRef = useRef<PersistentUnityView>(null);
  const exitRequested = useRef(false);
  const exitCompleted = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'waiting' | 'failed'>(
    'idle',
  );

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current !== null) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  useEffect(() => {
    unityRef.current?.postMessage(UNITY_LOADER_OBJECT, UNITY_LOAD_METHOD, '');

    return () => {
      clearResetTimer();
    };
  }, [clearResetTimer]);

  const sendResetRequest = useCallback(() => {
    clearResetTimer();
    setResetStatus('waiting');
    resetTimer.current = setTimeout(() => {
      resetTimer.current = null;
      // An elapsed timer does not prove the scene is unloaded. Keep the Unity
      // view alive, and allow a retry without launching another scene.
      setResetStatus('failed');
    }, RESET_TIMEOUT_MS);

    try {
      if (!unityRef.current) {
        throw new Error('Unity view is not ready');
      }
      unityRef.current.postMessage(UNITY_LOADER_OBJECT, UNITY_RESET_METHOD, '');
    } catch {
      clearResetTimer();
      setResetStatus('failed');
    }
  }, [clearResetTimer]);

  const requestExit = useCallback(() => {
    if (exitRequested.current) {
      return;
    }

    exitRequested.current = true;
    sendResetRequest();
  }, [sendResetRequest]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        requestExit();
        return true;
      },
    );

    return () => subscription.remove();
  }, [requestExit]);

  const isLeaving = resetStatus !== 'idle';

  return (
    <View style={containerStyle(insets)}>
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Jungle Swing"
          accessibilityState={{ disabled: isLeaving }}
          disabled={isLeaving}
          onPress={requestExit}
          hitSlop={8}
          style={({ pressed }) => backButtonStyle(pressed)}
        >
          <AppIcon name="arrow-left" size={22} color={gameAccent} />
          <Text style={styles.backText}>Jungle Swing</Text>
        </Pressable>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>IN GAME</Text>
        </View>
      </View>
      <View style={styles.gameContainer}>
        <PersistentUnityView
          ref={unityRef}
          style={styles.unity}
          onUnityMessage={result => {
            let message: { type?: string } | null;
            try {
              message = JSON.parse(result.nativeEvent.message) as {
                type?: string;
              } | null;
            } catch {
              return;
            }

            if (
              message?.type !== SCENE_UNLOADED_MESSAGE ||
              !exitRequested.current ||
              exitCompleted.current
            ) {
              return;
            }

            clearResetTimer();
            // Consume the acknowledgement once, even if Unity repeats it.
            exitCompleted.current = true;
            onExit();
          }}
        />
        {isLeaving && (
          <View
            style={styles.resetOverlay}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
          >
            <View style={styles.resetCard}>
              {resetStatus === 'waiting' ? (
                <>
                  <ActivityIndicator size="large" color={gameAccent} />
                  <Text style={styles.resetTitle}>Closing Jungle Swing…</Text>
                  <Text style={styles.resetDescription}>
                    Getting everything ready for your next game.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.resetTitle}>Taking a little longer</Text>
                  <Text style={styles.resetDescription}>
                    The game hasn’t finished closing yet. Try again to return
                    safely.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={sendResetRequest}
                    style={({ pressed }) => retryButtonStyle(pressed)}
                  >
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

export default GameScreen;
