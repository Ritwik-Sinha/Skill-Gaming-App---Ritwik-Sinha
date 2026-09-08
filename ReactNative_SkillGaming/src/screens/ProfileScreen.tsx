import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import styles, {
  contentStyle,
  signOutButtonStyle,
  signOutIndicatorColor,
} from './ProfileScreen.styles';

const fallbackPhoto = require('../assets/icons/profile.png');

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const signingOut = useRef(false);
  const mounted = useRef(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    if (signingOut.current) {
      return;
    }

    signingOut.current = true;
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
    } catch {
      if (mounted.current) {
        setError('Couldn’t sign out. Please try again.');
      }
    } finally {
      signingOut.current = false;
      if (mounted.current) {
        setIsSigningOut(false);
      }
    }
  }, [signOut]);

  if (!user) {
    return null;
  }

  const fullName =
    user.name?.trim() ||
    [user.givenName, user.familyName].filter(Boolean).join(' ').trim() ||
    'Name unavailable';
  const photo = user.photo?.trim();
  const showPhoto = Boolean(photo && failedPhoto !== photo);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={contentStyle(insets.top)}
      showsVerticalScrollIndicator={false}
      testID="profile-screen"
    >
      <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      <Text style={styles.title} accessibilityRole="header">
        Profile
      </Text>
      <Text style={styles.subtitle}>Your place in the game.</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatarFrame}>
          <Image
            source={showPhoto ? { uri: photo } : fallbackPhoto}
            style={showPhoto ? styles.avatar : styles.fallbackAvatar}
            resizeMode={showPhoto ? 'cover' : 'contain'}
            accessibilityLabel="Profile image"
            onError={
              showPhoto ? () => setFailedPhoto(photo ?? null) : undefined
            }
          />
        </View>
        <Text style={styles.fullName} selectable>
          {fullName}
        </Text>
        <Text style={styles.email} selectable>
          {user.email}
        </Text>
      </View>

      <Pressable
        onPress={handleSignOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityState={{ disabled: isSigningOut, busy: isSigningOut }}
        disabled={isSigningOut}
        style={({ pressed }) => signOutButtonStyle(pressed, isSigningOut)}
      >
        {isSigningOut && <ActivityIndicator color={signOutIndicatorColor} />}
        <Text style={styles.signOutLabel}>
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </Text>
      </Pressable>
      {error && (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}
    </ScrollView>
  );
}
