import { PressableStateCallbackType, StyleSheet } from 'react-native';
import { colors } from '../../theme';

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
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
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 34,
    marginBottom: 16,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  count: { color: colors.inactive, fontSize: 10, letterSpacing: 1.5 },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#353B2A',
  },
  cardPressed: { opacity: 0.85 },
  artwork: {
    aspectRatio: 1.14,
    overflow: 'hidden',
    backgroundColor: '#244A25',
  },
  badge: {
    position: 'absolute',
    top: 18,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#102C20DD',
    borderWidth: 1,
    borderColor: '#BAEB7940',
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  badgeText: {
    color: '#E4F6D3',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  cardDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  cardCopy: { flex: 1 },
  gameTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  gameDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  openButton: {
    backgroundColor: colors.accent,
    borderRadius: 23,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function getCardStyle({ pressed }: PressableStateCallbackType) {
  return [styles.card, pressed && styles.cardPressed];
}
