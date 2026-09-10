import type { ImageStyle } from 'react-native';
import { colors } from '../../theme';

export const defaultIconColor = colors.text;

export function getIconStyle(size: number, color: string): ImageStyle {
  return { width: size, height: size, tintColor: color };
}
