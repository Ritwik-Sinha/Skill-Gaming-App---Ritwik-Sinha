import { PressableStateCallbackType, StyleSheet } from 'react-native';
import { colors } from '../theme';

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navigationTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  hero: {
    aspectRatio: 1.75,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#244A25',
  },
  description: { paddingTop: 24, paddingBottom: 27 },
  title: {
    color: colors.text,
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '800',
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23, marginTop: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  tag: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: { color: '#C8C8CC', fontSize: 11, fontWeight: '500' },
  instructions: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 25,
  },
  instructionsHeading: { gap: 7, marginBottom: 24 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  stepCount: {
    color: colors.inactive,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 22,
    marginBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#232326',
  },
  stackedStep: { flexDirection: 'column', alignItems: 'stretch' },
  lastStep: { borderBottomWidth: 0, paddingBottom: 8, marginBottom: 0 },
  stepImage: {
    width: 112,
    height: 126,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#445239',
    backgroundColor: '#244A25',
  },
  largeStepImage: { width: 172, height: 158 },
  stackedStepImage: { width: '100%', height: 190 },
  stepCopy: { flex: 1, gap: 6 },
  stepNumber: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  stepDescription: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  playFooter: {
    backgroundColor: colors.background,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 14,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  playButton: {
    minHeight: 56,
    backgroundColor: colors.accent,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 10,
  },
  playLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    flexShrink: 1,
  },
  pressed: { opacity: 0.75 },
});

export function getScreenStyle(topInset: number) {
  return [styles.screen, { paddingTop: topInset }];
}

export function getBackButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.backButton, pressed && styles.pressed];
}

export function getPlayButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.playButton, pressed && styles.pressed];
}

export function getStepStyle(stacked: boolean, last: boolean) {
  return [
    styles.step,
    stacked && styles.stackedStep,
    last && styles.lastStep,
  ];
}

export function getStepImageStyle(width: number, stacked: boolean) {
  return [
    styles.stepImage,
    width >= 600 && styles.largeStepImage,
    stacked && styles.stackedStepImage,
  ];
}
