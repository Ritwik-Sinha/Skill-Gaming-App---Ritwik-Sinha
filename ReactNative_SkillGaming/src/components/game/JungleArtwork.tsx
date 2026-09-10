import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { styles } from './JungleArtwork.styles';

export type JungleArtworkVariant =
  | 'hero'
  | 'swing'
  | 'bounce'
  | 'snake'
  | 'distance';

type Props = {
  variant?: JungleArtworkVariant;
  style?: StyleProp<ImageStyle>;
  decorative?: boolean;
  accessibilityLabel?: string;
};

const images: Record<JungleArtworkVariant, ImageSourcePropType> = {
  hero: require('../../assets/jungle-swing/hero.png'),
  swing: require('../../assets/jungle-swing/how-to-swing.png'),
  bounce: require('../../assets/jungle-swing/how-to-bounce.png'),
  snake: require('../../assets/jungle-swing/how-to-snake.png'),
  distance: require('../../assets/jungle-swing/how-to-distance.png'),
};

const labels: Record<JungleArtworkVariant, string> = {
  hero: 'A turquoise chameleon swings above a river in the jungle.',
  swing: 'A chameleon latches onto a hanging swing with its tongue.',
  bounce: 'A chameleon bounces from a floating log above the water.',
  snake: 'A purple snake chases the chameleon through the jungle.',
  distance:
    'The chameleon travels forward between swings to cover more distance.',
};

/** Complete illustrations loaded directly from saved, bundled PNG files. */
export default function JungleArtwork({
  variant = 'hero',
  style,
  decorative = false,
  accessibilityLabel,
}: Props) {
  return (
    <Image
      source={images[variant]}
      resizeMode="cover"
      accessible={!decorative}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? labels[variant]}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
      style={[styles.image, style]}
    />
  );
}
