import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import WithdrawMoneyModal from '../../components/wallet/WithdrawMoneyModal';
import { formatServerMoney } from '../../wallet/serverMoney';
import type { useServerWallet } from '../../wallet/useServerWallet';
import styles, {
  signOutButtonStyle,
  signOutIndicatorColor,
  withdrawButtonStyle,
} from './ProfileScreen.styles';

const fallbackPhoto = require('../../assets/icons/profile.png');

interface ProfileScreenProps {
  wallet: Pick<
    ReturnType<typeof useServerWallet>,
    | 'balance'
    | 'isLoading'
    | 'isAdding'
    | 'isWithdrawing'
    | 'loadError'
    | 'withdrawMoney'
    | 'retryLoad'
  >;
}

export default function ProfileScreen({ wallet }: ProfileScreenProps) {
  const { user, signOut } = useAuth();
  const signingOut = useRef(false);
  const mounted = useRef(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawalNotice, setWithdrawalNotice] = useState<string | null>(null);
  const walletBusy = wallet.isAdding || wallet.isWithdrawing;

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

  async function handleWithdraw(amount: string) {
    setWithdrawalNotice(null);
    await wallet.withdrawMoney(amount);
    if (mounted.current) {
      setWithdrawalNotice(
        `${formatServerMoney(
          Number(amount),
        )} withdrawn from your demo balance.`,
      );
    }
  }

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
      contentContainerStyle={styles.content}
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

      <View style={styles.walletCard}>
        <Text style={styles.walletTitle} accessibilityRole="header">
          Withdraw money
        </Text>
        <Text style={styles.walletDescription}>
          Withdraw demo credits, including dollars and cents.
        </Text>
        <Text style={styles.balanceLabel}>Available demo balance</Text>
        {wallet.isLoading ? (
          <ActivityIndicator
            color={signOutIndicatorColor}
            style={styles.balanceLoading}
            accessibilityLabel="Loading withdrawal balance"
          />
        ) : (
          <Text
            style={styles.balanceValue}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {wallet.loadError ? '—' : formatServerMoney(wallet.balance)}
          </Text>
        )}
        <Pressable
          onPress={() => setShowWithdraw(true)}
          accessibilityRole="button"
          accessibilityLabel="Open withdraw money"
          accessibilityState={{ disabled: walletBusy || isSigningOut }}
          disabled={walletBusy || isSigningOut}
          style={({ pressed }) =>
            withdrawButtonStyle(pressed, walletBusy || isSigningOut)
          }
        >
          <Text style={styles.withdrawLabel}>Withdraw money</Text>
        </Pressable>
        {withdrawalNotice && (
          <Text
            style={styles.withdrawalNotice}
            accessibilityLiveRegion="polite"
          >
            {withdrawalNotice}
          </Text>
        )}
        <Text style={styles.demoNote}>
          Demo credits only. No money is sent to a bank or payment account.
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
      <WithdrawMoneyModal
        visible={showWithdraw}
        balance={wallet.balance}
        isLoading={wallet.isLoading}
        isAdding={wallet.isAdding}
        isWithdrawing={wallet.isWithdrawing}
        loadError={wallet.loadError}
        onClose={() => setShowWithdraw(false)}
        onWithdrawMoney={handleWithdraw}
        onRetryLoad={wallet.retryLoad}
      />
    </ScrollView>
  );
}
