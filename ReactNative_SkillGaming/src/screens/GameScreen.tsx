import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import PersistentUnityView from '../components/PersistentUnityView';
import UserHeader from '../components/UserHeader';

/**
 * Scene object that owns the addressable JungleSwing scene lifecycle.
 */
const UNITY_LOADER_OBJECT = 'GameSceneLoader';
const UNITY_LOAD_METHOD = 'LoadGameScene';
const UNITY_RESET_METHOD = 'ResetLoadingScene';
const SCENE_UNLOADED_MESSAGE = 'gameSceneUnloaded';

/**
 * The loader acknowledges only after Addressables has finished unloading the
 * gameplay scene. Sign-out waits for that acknowledgement before unmounting,
 * which lets PersistentUnityView pause the engine after the scene is gone.
 */
function GameScreen() {
  const unityRef = useRef<PersistentUnityView>(null);
  const sceneUnloadedResolver = useRef<(() => void) | null>(null);

  useEffect(() => {
    unityRef.current?.postMessage(UNITY_LOADER_OBJECT, UNITY_LOAD_METHOD, '');
  }, []);

  const resetGameBeforeSignOut = useCallback(async () => {
    await new Promise<void>(resolve => {
      sceneUnloadedResolver.current = resolve;
      unityRef.current?.postMessage(UNITY_LOADER_OBJECT, UNITY_RESET_METHOD, '');
    });
  }, []);

  return (
    <View style={styles.container}>
      <UserHeader onBeforeSignOut={resetGameBeforeSignOut} />
      <PersistentUnityView
        ref={unityRef}
        style={styles.unity}
        onUnityMessage={result => {
          let message: { type?: string };
          try {
            message = JSON.parse(result.nativeEvent.message) as { type?: string };
          } catch {
            return;
          }

          if (message.type === SCENE_UNLOADED_MESSAGE) {
            sceneUnloadedResolver.current?.();
            sceneUnloadedResolver.current = null;
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101820',
  },
  unity: {
    flex: 1,
  },
});

export default GameScreen;
