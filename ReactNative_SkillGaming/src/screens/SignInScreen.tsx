import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';

/**
 * Shown whenever there is no signed-in user. The Unity view is only rendered
 * after this screen completes a successful Google sign-in.
 */
function SignInScreen() {
  const { signIn, isSigningIn, error } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Text style={styles.title}>Skill Gaming</Text>
      <Text style={styles.subtitle}>Sign in to start playing</Text>

      {isSigningIn ? (
        <ActivityIndicator size="large" color="#4285F4" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101820',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9aa5b1',
    marginBottom: 32,
  },
  error: {
    marginTop: 24,
    color: '#ff6b6b',
    textAlign: 'center',
  },
});

export default SignInScreen;
