import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  recoveryBanner: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  recoveryText: { color: colors.text, fontSize: 13, lineHeight: 20 },
});

export const containerStyle = (insets: EdgeInsets) => [
  styles.container,
  {
    paddingTop: insets.top,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  },
];

export default styles;
