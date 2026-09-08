import { StyleSheet } from 'react-native';
import { colors } from './src/theme';

export const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});

export const loadingIndicatorColor = colors.accent;
