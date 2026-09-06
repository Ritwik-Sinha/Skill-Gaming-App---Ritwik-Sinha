import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';

/**
 * Compact bar above the Unity view showing the signed-in user's photo and
 * name, with a sign-out action. Falls back to the user's initials when
 * Google returns no profile photo.
 */
function UserHeader() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

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
      <Pressable onPress={signOut} hitSlop={8}>
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
