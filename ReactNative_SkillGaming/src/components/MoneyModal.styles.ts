import { StyleSheet } from 'react-native';
import { colors } from '../theme';

export const inputPlaceholderColor = '#65676C';
export const inputSelectionColor = '#28D8A0';
export const indicatorColor = colors.text;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheet: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '94%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#353539',
    overflow: 'hidden',
  },
  content: { paddingHorizontal: 24, paddingTop: 12 },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#48484C',
    marginBottom: 16,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  money: { width: 54, height: 54 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#303033',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: { color: colors.text, fontSize: 29, lineHeight: 32 },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 7 },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#152B23',
    borderWidth: 1,
    borderColor: '#264337',
  },
  balanceLabel: { color: '#B6C9C1', fontSize: 13, flexShrink: 1 },
  balanceValue: {
    color: '#28D8A0',
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 26,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 68,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: '#48484D',
    paddingHorizontal: 18,
    gap: 10,
  },
  currency: { color: colors.muted, fontSize: 26, fontWeight: '600' },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 0,
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: '#FFAD8B',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  submitButton: {
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 22,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  submitLabel: { color: colors.text, fontSize: 17, fontWeight: '800' },
  paymentNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 14,
  },
  retryButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingRight: 12,
  },
  retryLabel: { color: '#28D8A0', fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});

export const contentStyle = (bottomInset: number) => [
  styles.content,
  { paddingBottom: Math.max(bottomInset, 18) + 12 },
];

export const submitButtonStyle = (pressed: boolean, disabled: boolean) => [
  styles.submitButton,
  pressed && styles.pressed,
  disabled && styles.disabled,
];

export const closeButtonStyle = (pressed: boolean, disabled: boolean) => [
  styles.closeButton,
  pressed && styles.pressed,
  disabled && styles.disabled,
];

export const retryButtonStyle = (pressed: boolean) => [
  styles.retryButton,
  pressed && styles.pressed,
];

export default styles;
