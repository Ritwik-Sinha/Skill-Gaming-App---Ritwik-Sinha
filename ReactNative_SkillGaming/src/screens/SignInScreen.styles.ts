import { StyleSheet, type ViewStyle } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101820',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9aa5b1',
    marginBottom: 32,
  },
  error: {
    marginTop: 24,
    color: '#ff6b6b',
    textAlign: 'center',
  },
});

export const signInSpinnerColor = '#4285F4';

export function getSafeAreaStyle(top: number, bottom: number): ViewStyle {
  return { paddingTop: top, paddingBottom: bottom };
}
