import React from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import {
  getSafeAreaStyle,
  signInSpinnerColor,
  styles,
} from './SignInScreen.styles';

/**
 * Shown whenever there is no signed-in user. The Unity view is only rendered
 * after this screen completes a successful Google sign-in.
 */
function SignInScreen() {
  const { signIn, isSigningIn, error } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, getSafeAreaStyle(insets.top, insets.bottom)]}
    >
      <Image
        source={require('../../assets/brand/app-icon.png')}
        style={styles.brandIcon}
        accessibilityLabel="Skill Gaming app icon"
      />
      <Text style={styles.title}>Skill Gaming</Text>
      <Text style={styles.subtitle}>Sign in to start playing</Text>

      {isSigningIn ? (
        <ActivityIndicator size="large" color={signInSpinnerColor} />
      ) : (
        <GoogleSigninButton
          size={GoogleSigninButton.Size.Wide}
          color={GoogleSigninButton.Color.Dark}
          onPress={signIn}
        />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export default SignInScreen;
