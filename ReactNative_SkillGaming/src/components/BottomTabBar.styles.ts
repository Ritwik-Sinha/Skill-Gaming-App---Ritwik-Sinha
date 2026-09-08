import {
  StyleSheet,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: '#242426',
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 70,
    gap: 5,
    paddingTop: 12,
    paddingBottom: 5,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    width: 26,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: 'transparent',
  },
  selected: { backgroundColor: colors.accent },
  label: { fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: colors.text },
  inactiveLabel: { color: colors.inactive },
  pressed: { opacity: 0.7 },
});

export function getContainerStyle(bottomInset: number): StyleProp<ViewStyle> {
  return [styles.container, { paddingBottom: Math.max(bottomInset, 10) }];
}

export function getTabStyle({ pressed }: PressableStateCallbackType) {
  return [styles.tab, pressed && styles.pressed];
}

export function getIndicatorStyle(selected: boolean): StyleProp<ViewStyle> {
  return [styles.indicator, selected && styles.selected];
}

export function getLabelStyle(selected: boolean): StyleProp<TextStyle> {
  return [styles.label, selected ? styles.selectedLabel : styles.inactiveLabel];
}

export function getIconColor(selected: boolean) {
  return selected ? colors.text : colors.inactive;
}
