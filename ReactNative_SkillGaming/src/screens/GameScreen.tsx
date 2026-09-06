import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import PersistentUnityView from '../components/PersistentUnityView';
import UserHeader from '../components/UserHeader';

/**
 * Scene object that hosts JungleSwing.GameManager
 * (Unity_SkillGaming/Assets/Project/Prefabs/GameRoot.prefab) and the public
 * method on it that abandons any run in progress and shows the title screen.
 */
const UNITY_GAME_OBJECT = 'GameRoot';
const UNITY_RESET_METHOD = 'ResetToTitle';

/**
 * UnitySendMessage is processed on Unity's next frame. Signing out unmounts
 * this screen, and PersistentUnityView pauses the engine on unmount, so the
 * sign-out waits this long after posting the reset to let a couple of frames
 * run first. (Were the pause to win the race anyway, the message stays queued
 * and is applied on resume, so the outcome is the same either way.)
 */
const RESET_GRACE_MS = 150;

/**
 * Only rendered for authenticated users — the Unity view never mounts
 * without a signed-in session (enforced in App.tsx).
 *
 * Signing out unmounts this screen and signing in mounts it again. The Unity
 * engine must NOT be torn down in between (see PersistentUnityView), so the
 * same player is re-attached here. The game is reset to its title screen as
 * part of signing out, so a new session never inherits the previous run.
 */
function GameScreen() {
  const unityRef = useRef<PersistentUnityView>(null);

  const resetGameBeforeSignOut = useCallback(async () => {
    unityRef.current?.postMessage(UNITY_GAME_OBJECT, UNITY_RESET_METHOD, '');
    await new Promise<void>(resolve => setTimeout(resolve, RESET_GRACE_MS));
  }, []);

  return (
    <View style={styles.container}>
      <UserHeader onBeforeSignOut={resetGameBeforeSignOut} />
      <PersistentUnityView
        ref={unityRef}
        style={styles.unity}
        onUnityMessage={result => {
          console.log('onUnityMessage', result.nativeEvent.message);
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
