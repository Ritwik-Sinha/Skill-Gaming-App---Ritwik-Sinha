/**
 * Skill Gaming app entry point.
 *
 * The game lobby is auth-gated. Unity is mounted only when a signed-in player
 * starts Jungle Swing from its game guide.
 *
 * @format
 */

import React from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import SignInScreen from './src/screens/SignInScreen';
import MainScreen from './src/screens/MainScreen';
import { loadingIndicatorColor, styles } from './App.styles';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { user, isRestoring } = useAuth();

  if (isRestoring) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={loadingIndicatorColor} />
      </View>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  return <MainScreen key={user.uid} />;
}

export default App;
