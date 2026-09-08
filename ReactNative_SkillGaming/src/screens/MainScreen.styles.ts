import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
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
