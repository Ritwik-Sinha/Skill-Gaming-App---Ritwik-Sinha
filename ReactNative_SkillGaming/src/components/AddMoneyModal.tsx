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
import { formatMoney } from '../wallet/useDemoWallet';
import styles, {
  addButtonStyle,
  closeButtonStyle,
  contentStyle,
  indicatorColor,
  inputPlaceholderColor,
  inputSelectionColor,
  retryButtonStyle,
} from './AddMoneyModal.styles';

interface AddMoneyModalProps {
  visible: boolean;
  balanceCents: number;
  isLoading: boolean;
  isAdding: boolean;
  loadError: string | null;
  onClose: () => void;
  onAddMoney: (amount: string) => Promise<void>;
  onRetryLoad: () => Promise<void>;
}

export default function AddMoneyModal({
  visible,
  balanceCents,
  isLoading,
  isAdding,
  loadError,
  onClose,
  onAddMoney,
  onRetryLoad,
}: AddMoneyModalProps) {
  const insets = useSafeAreaInsets();
  const pending = useRef(false);
  const mounted = useRef(true);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = isAdding || submitting;
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
    if (!pending.current && !isAdding) {
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
      await onAddMoney(amount);
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
            : 'Couldn’t add money. Please try again.',
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          disabled={busy}
          accessible={false}
          importantForAccessibility="no"
          testID="add-money-backdrop"
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          testID="add-money-modal"
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
                source={require('../assets/brand/money.png')}
                style={styles.money}
                resizeMode="contain"
                accessible={false}
                importantForAccessibility="no"
              />
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => closeButtonStyle(pressed, busy)}
                accessibilityRole="button"
                accessibilityLabel="Close add money"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
              >
                <Text style={styles.closeLabel}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.title} accessibilityRole="header">
              Add money
            </Text>
            <Text style={styles.subtitle}>Add to your demo balance.</Text>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Current balance</Text>
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
                  {loadError ? '—' : formatMoney(balanceCents)}
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
                onSubmitEditing={handleSubmit}
                editable={!busy && !isLoading && !loadError}
                accessibilityLabel="Amount to add"
                accessibilityHint="Enter the amount in dollars."
                maxLength={12}
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
              style={({ pressed }) => addButtonStyle(pressed, disabled)}
              accessibilityRole="button"
              accessibilityLabel="Add money"
              accessibilityState={{ disabled, busy }}
              disabled={disabled}
              testID="confirm-add-money"
            >
              {busy && <ActivityIndicator color={indicatorColor} />}
              <Text style={styles.addLabel}>
                {busy ? 'Adding…' : 'Add money'}
              </Text>
            </Pressable>
            <Text style={styles.paymentNote}>No payment is taken.</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
