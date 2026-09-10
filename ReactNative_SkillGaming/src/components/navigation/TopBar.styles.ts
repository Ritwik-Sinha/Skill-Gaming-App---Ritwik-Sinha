import { StyleSheet, type PressableStateCallbackType } from 'react-native';
import { colors } from '../../theme';

export const crownColor = '#F3B446';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: colors.background,
  },
  brandAndCrowns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  brand: { width: 36, height: 36, borderRadius: 11 },
  crownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 11,
    borderRadius: 22,
    backgroundColor: '#24201B',
    borderWidth: 1,
    borderColor: '#3B3023',
  },
  crownCount: { color: colors.text, fontSize: 16, fontWeight: '800' },
  crownGoal: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: 210,
    minHeight: 44,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A3833',
    backgroundColor: '#17221E',
    paddingLeft: 5,
  },
  money: { width: 32, height: 32, marginRight: 4 },
  balance: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    minWidth: 35,
    textAlign: 'right',
  },
  addButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  addLabel: {
    color: '#28D8A0',
    fontSize: 29,
    lineHeight: 32,
    fontWeight: '600',
  },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
});

export const addButtonStyle = (
  { pressed }: PressableStateCallbackType,
  disabled: boolean,
) => [styles.addButton, pressed && styles.pressed, disabled && styles.disabled];

export default styles;
