import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export const gameAccent = colors.accent;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0D',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2D2D31',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 36,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#91D44A',
  },
  liveText: {
    color: '#ABABB3',
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  gameContainer: {
    flex: 1,
  },
  forfeitNotice: {
    color: '#ABABB3',
    fontSize: 11,
    textAlign: 'center',
    padding: 8,
  },
  unity: {
    flex: 1,
  },
  resetOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 11, 13, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  resetCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    backgroundColor: '#1B1B1F',
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  resetTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  resetDescription: {
    color: '#ABABB3',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameAccent,
    borderRadius: 24,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});

export const containerStyle = (insets: EdgeInsets) => [
  styles.container,
  {
    paddingBottom: insets.bottom,
  },
];

export const backButtonStyle = (pressed: boolean) => [
  styles.backButton,
  pressed && styles.pressed,
];

export const retryButtonStyle = (pressed: boolean) => [
  styles.retryButton,
  pressed && styles.pressed,
];

export default styles;
