import { StyleSheet } from 'react-native';
import { colors } from '../theme';

export const signOutIndicatorColor = colors.text;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 32,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.5,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  profileCard: {
    alignItems: 'center',
    marginTop: 30,
    paddingHorizontal: 22,
    paddingVertical: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  avatarFrame: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 56,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 22,
  },
  avatar: { width: 112, height: 112 },
  fallbackAvatar: { width: 64, height: 64, tintColor: colors.muted },
  fullName: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  email: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 9,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  walletCard: {
    marginTop: 24,
    padding: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  walletTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  walletDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  balanceLabel: { color: colors.muted, fontSize: 12, marginTop: 22 },
  balanceValue: {
    color: '#28D8A0',
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: 6,
  },
  balanceLoading: { alignSelf: 'flex-start', marginTop: 12, marginBottom: 10 },
  withdrawButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 20,
    borderRadius: 26,
    backgroundColor: '#28D8A0',
  },
  withdrawLabel: { color: '#072319', fontSize: 16, fontWeight: '800' },
  withdrawalNotice: {
    color: '#28D8A0',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
  },
  demoNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  signOutButton: {
    minHeight: 56,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    borderRadius: 28,
    backgroundColor: colors.accent,
  },
  signOutLabel: { color: colors.text, fontSize: 17, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  error: {
    color: '#FFAD8B',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 14,
  },
});

export const signOutButtonStyle = (pressed: boolean, disabled: boolean) => [
  styles.signOutButton,
  pressed && styles.pressed,
  disabled && styles.disabled,
];

export const withdrawButtonStyle = (pressed: boolean, disabled: boolean) => [
  styles.withdrawButton,
  pressed && styles.pressed,
  disabled && styles.disabled,
];

export default styles;
