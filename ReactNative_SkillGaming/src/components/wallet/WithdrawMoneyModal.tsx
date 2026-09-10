import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { formatServerMoney as formatMoney } from '../../wallet/serverMoney';
import styles, {
  submitButtonStyle,
  closeButtonStyle,
  contentStyle,
  indicatorColor,
  inputPlaceholderColor,
  inputSelectionColor,
  retryButtonStyle,
} from './MoneyModal.styles';

interface WithdrawMoneyModalProps {
  visible: boolean;
  balance: number;
  isLoading: boolean;
  isWithdrawing: boolean;
  isAdding?: boolean;
  loadError: string | null;
  onClose: () => void;
  onWithdrawMoney: (amount: string) => Promise<void>;
  onRetryLoad: () => Promise<void>;
}

export default function WithdrawMoneyModal({
  visible,
  balance,
  isLoading,
  isWithdrawing,
  isAdding = false,
  loadError,
  onClose,
  onWithdrawMoney,
  onRetryLoad,
}: WithdrawMoneyModalProps) {
  const insets = useSafeAreaInsets();
  const pending = useRef(false);
  const mounted = useRef(true);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = isWithdrawing || isAdding || submitting;
  const disabled = busy || isLoading || Boolean(loadError) || !amount.trim();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setAmount('');
      setError(null);
    }
  }, [visible]);

  function handleClose() {
    if (!pending.current && !busy) {
      Keyboard.dismiss();
      onClose();
    }
  }

  async function handleSubmit() {
    if (pending.current || disabled) {
      return;
    }

    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await onWithdrawMoney(amount);
      if (mounted.current) {
        Keyboard.dismiss();
        setAmount('');
        onClose();
      }
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Couldn’t withdraw money. Please try again.',
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setSubmitting(false);
      }
    }
  }

  async function handleRetryLoad() {
    setError(null);
    try {
      await onRetryLoad();
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Couldn’t load your balance. Please try again.',
        );
      }
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        // Android's native Modal already resizes for the keyboard. Applying a
        // second height adjustment here makes the sheet repeatedly relayout.
        enabled={Platform.OS === 'ios'}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          disabled={busy}
          accessible={false}
          importantForAccessibility="no"
          testID="withdraw-money-backdrop"
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          testID="withdraw-money-modal"
        >
          <ScrollView
            contentContainerStyle={contentStyle(insets.bottom)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.handle} />
            <View style={styles.headingRow}>
              <Image
                source={require('../../assets/brand/money.png')}
                style={styles.money}
                resizeMode="contain"
                accessible={false}
                importantForAccessibility="no"
              />
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => closeButtonStyle(pressed, busy)}
                accessibilityRole="button"
                accessibilityLabel="Close withdraw money"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
              >
                <Text style={styles.closeLabel}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.title} accessibilityRole="header">
              Withdraw money
            </Text>
            <Text style={styles.subtitle}>
              Withdraw from your demo balance, including cents.
            </Text>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Available balance</Text>
              {isLoading ? (
                <ActivityIndicator
                  color={inputSelectionColor}
                  accessibilityLabel="Loading balance"
                />
              ) : (
                <Text
                  style={styles.balanceValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {loadError ? '—' : formatMoney(balance)}
                </Text>
              )}
            </View>

            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>$</Text>
              <TextInput
                value={amount}
                onChangeText={value => {
                  setAmount(value);
                  setError(null);
                }}
                placeholder="0.00"
                placeholderTextColor={inputPlaceholderColor}
                selectionColor={inputSelectionColor}
                style={styles.input}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                editable={!busy && !isLoading && !loadError}
                accessibilityLabel="Amount to withdraw"
                accessibilityHint="Enter a dollar amount with up to two decimal places."
                maxLength={18}
                autoCorrect={false}
                autoCapitalize="none"
                selectTextOnFocus
              />
            </View>

            {(error || loadError) && (
              <Text
                style={styles.error}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {error || loadError}
              </Text>
            )}
            {loadError && !isLoading && (
              <Pressable
                onPress={handleRetryLoad}
                accessibilityRole="button"
                accessibilityLabel="Retry loading balance"
                style={({ pressed }) => retryButtonStyle(pressed)}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleSubmit}
              style={({ pressed }) => submitButtonStyle(pressed, disabled)}
              accessibilityRole="button"
              accessibilityLabel="Withdraw money"
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              testID="confirm-withdraw-money"
            >
              {busy && <ActivityIndicator color={indicatorColor} />}
              <Text style={styles.submitLabel}>
                {busy ? 'Withdrawing…' : 'Withdraw money'}
              </Text>
            </Pressable>
            <Text style={styles.paymentNote}>
              Demo credits only. No money is sent to a bank or payment account.
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
