import React, { useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';

interface UserHeaderProps {
  /**
   * Runs (and is awaited) before the session is signed out. GameScreen uses
   * it to send the Unity game back to its title screen while the engine is
   * still active, so the parked engine is clean for the next session.
   */
  onBeforeSignOut?: () => void | Promise<void>;
}

/**
 * Compact bar above the Unity view showing the signed-in user's photo and
 * name, with a sign-out action. Falls back to the user's initials when
 * Google returns no profile photo.
 */
function UserHeader({ onBeforeSignOut }: UserHeaderProps) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const handleSignOut = useCallback(async () => {
    await onBeforeSignOut?.();
    await signOut();
  }, [onBeforeSignOut, signOut]);

  if (!user) {
    return null;
  }

  const displayName = user.name ?? user.email;
  const initials = (user.name ?? user.email)
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      {user.photo ? (
        <Image source={{ uri: user.photo }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {displayName}
      </Text>
      <Pressable onPress={handleSignOut} hitSlop={8}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101820',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginHorizontal: 12,
  },
  signOut: {
    color: '#9aa5b1',
    fontSize: 13,
  },
});

export default UserHeader;
