import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import UnityView from '@azesmway/react-native-unity';
import UserHeader from '../components/UserHeader';

interface IMessage {
  gameObject: string;
  methodName: string;
  message: string;
}

/**
 * Only rendered for authenticated users — the UnityView never mounts
 * without a signed-in session (enforced in App.tsx).
 */
function GameScreen() {
  const unityRef = useRef<UnityView>(null);

  useEffect(() => {
    if (unityRef?.current) {
      const message: IMessage = {
        gameObject: 'gameObject',
        methodName: 'methodName',
        message: 'message',
      };
      unityRef.current.postMessage(
        message.gameObject,
        message.methodName,
        message.message
      );
    }
  }, []);

  return (
    <View style={styles.container}>
      <UserHeader />
      <UnityView
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
