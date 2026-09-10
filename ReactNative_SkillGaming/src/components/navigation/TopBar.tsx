import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { formatServerMoney as formatMoney } from '../../wallet/serverMoney';
import AppIcon from '../common/AppIcon';
import styles, { addButtonStyle, crownColor } from './TopBar.styles';

interface TopBarProps {
  balance: number;
  crownCount?: number;
  crownGoal?: number;
  onAddMoney: () => void;
  isLoading?: boolean;
  loadError?: string | null;
  hasBalance?: boolean;
}

export default function TopBar({
  balance,
  crownCount = 0,
  crownGoal = 10,
  onAddMoney,
  isLoading = false,
  loadError = null,
  hasBalance = !isLoading && !loadError,
}: TopBarProps) {
  let balanceLabel = `Balance ${formatMoney(balance)}`;
  let balanceText = formatMoney(balance);
  if (isLoading && !hasBalance) {
    balanceLabel = 'Loading balance';
    balanceText = '…';
  } else if (!hasBalance) {
    balanceLabel = 'Balance unavailable';
    balanceText = '—';
  }

  return (
    <View style={styles.container} testID="top-bar">
      <View style={styles.brandAndCrowns}>
        <Image
          source={require('../../assets/brand/app-icon.png')}
          style={styles.brand}
          accessibilityLabel="Skill Gaming"
        />
        <View
          style={styles.crownBadge}
          accessible
          accessibilityLabel={`${crownCount} of ${crownGoal} crowns`}
        >
          <AppIcon name="crown" size={23} color={crownColor} />
          <Text style={styles.crownCount}>
            {crownCount}
            <Text style={styles.crownGoal}>/{crownGoal}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.wallet}>
        <Image
          source={require('../../assets/brand/money.png')}
          style={styles.money}
          resizeMode="contain"
          accessible={false}
          importantForAccessibility="no"
        />
        <Text
          style={styles.balance}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
          accessibilityLabel={balanceLabel}
          accessibilityLiveRegion="polite"
        >
          {balanceText}
        </Text>
        <Pressable
          onPress={onAddMoney}
          style={state => addButtonStyle(state, isLoading)}
          accessibilityRole="button"
          accessibilityLabel="Add money"
          accessibilityHint="Opens the add money popup."
          accessibilityState={{ disabled: isLoading }}
          disabled={isLoading}
        >
          <Text style={styles.addLabel}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
