import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  parseCustomBetAmount,
  QUICK_BET_AMOUNTS_CENTS,
} from '../../config/betConfig';
import { colors } from '../../theme';
import { formatServerMoney } from '../../wallet/serverMoney';
import AppIcon from '../common/AppIcon';
import styles, { contentStyle } from './BetSelectionModal.styles';

interface BetSelectionModalProps {
  visible: boolean;
  disabled?: boolean;
  onClose: () => void;
  onPlay: (amountCents: number) => void;
}

export default function BetSelectionModal({
  visible,
  disabled = false,
  onClose,
  onPlay,
}: BetSelectionModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedAmountCents, setSelectedAmountCents] = useState<number | null>(
    1000,
  );
  const [customAmount, setCustomAmount] = useState('');
  const amountCents = selectedAmountCents ?? parseCustomBetAmount(customAmount);
  const playDisabled = disabled || amountCents === null;
  const customInvalid =
    selectedAmountCents === null &&
    customAmount.length > 0 &&
    amountCents === null;
  const formattedAmount =
    amountCents === null ? null : formatServerMoney(amountCents / 100);

  function handleClose() {
    Keyboard.dismiss();
    onClose();
  }

  function handlePlay() {
    if (!visible || disabled || amountCents === null) return;
    Keyboard.dismiss();
    onPlay(amountCents);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        // Android's native Modal owns keyboard resizing; avoid adjusting twice.
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessible={false}
          importantForAccessibility="no"
          testID="bet-selection-backdrop"
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          testID="bet-selection-sheet"
        >
          <ScrollView
            contentContainerStyle={contentStyle(insets.bottom)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.handle} />
            <View style={styles.headingRow}>
              <Text style={styles.gameLabel}>JUNGLE SWING</Text>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close bet selection"
              >
                <Text style={styles.closeLabel}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              Select a bet to play
            </Text>
            <Text style={styles.betRange}>
              $1–$20 per bet · Whole dollars · Demo credits
            </Text>
            <View style={styles.entryOptions}>
              {QUICK_BET_AMOUNTS_CENTS.map(amount => (
                <Pressable
                  key={amount}
                  onPress={() => {
                    setSelectedAmountCents(amount);
                    setCustomAmount('');
                    Keyboard.dismiss();
                  }}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityLabel={`Entry $${amount / 100}`}
                  accessibilityState={{
                    checked: amount === selectedAmountCents,
                    disabled,
                  }}
                  style={({ pressed }) => [
                    styles.entryOption,
                    amount === selectedAmountCents && styles.entrySelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.entryText}>${amount / 100}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.customLabel}>Or enter your own bet</Text>
            <View
              style={[
                styles.customInputRow,
                selectedAmountCents === null && styles.entrySelected,
                customInvalid && styles.customInputError,
              ]}
            >
              <Text style={styles.currency}>$</Text>
              <TextInput
                style={styles.customInput}
                value={customAmount}
                onFocus={() => setSelectedAmountCents(null)}
                onChangeText={value => {
                  setSelectedAmountCents(null);
                  setCustomAmount(value);
                }}
                placeholder="1–20"
                placeholderTextColor={colors.muted}
                selectionColor={colors.green}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                editable={!disabled}
                accessibilityLabel="Custom bet amount"
                accessibilityHint="Enter a whole-dollar amount between 1 and 20, without decimals. This clears the quick selection."
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            {customInvalid && (
              <Text
                style={styles.customError}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                Enter a whole-dollar amount from $1–$20, without decimals.
              </Text>
            )}
            <Text style={styles.entryRules}>
              One attempt per entry. Back is disabled during play. Backgrounding
              or closing the app forfeits the game. A win awards 90% of the
              combined pool. Equal scores refund both entries.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play Jungle Swing"
              accessibilityHint={
                formattedAmount === null
                  ? 'Select a quick bet or enter a whole-dollar amount between $1 and $20 to play.'
                  : `Uses ${formattedAmount} in demo credits for one attempt. Back is disabled during play. Backgrounding or closing the app forfeits the game.`
              }
              accessibilityState={{ disabled: playDisabled }}
              disabled={playDisabled}
              onPress={handlePlay}
              style={({ pressed }) => [
                styles.playButton,
                pressed && styles.pressed,
                playDisabled && styles.disabled,
              ]}
            >
              <AppIcon name="play" size={19} />
              <Text style={styles.playLabel}>
                {formattedAmount === null
                  ? 'Select a bet to play'
                  : `Play for ${formattedAmount}`}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
