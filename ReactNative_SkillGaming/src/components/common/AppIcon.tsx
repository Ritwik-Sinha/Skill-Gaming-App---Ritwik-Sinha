import React from 'react';
import { Image } from 'react-native';
import { defaultIconColor, getIconStyle } from './AppIcon.styles';

const iconSources = {
  trophy: require('../../assets/icons/trophy.png'),
  crown: require('../../assets/icons/crown.png'),
  gamepad: require('../../assets/icons/gamepad.png'),
  profile: require('../../assets/icons/profile.png'),
  'arrow-left': require('../../assets/icons/arrow-left.png'),
  'arrow-right': require('../../assets/icons/arrow-right.png'),
  play: require('../../assets/icons/play.png'),
} as const;

export type AppIconName = keyof typeof iconSources;

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
}

/** Local, tintable icons. Interactive parents supply the accessible label. */
function AppIcon({ name, size = 24, color = defaultIconColor }: AppIconProps) {
  return (
    <Image
      source={iconSources[name]}
      accessible={false}
      importantForAccessibility="no"
      resizeMode="contain"
      style={getIconStyle(size, color)}
    />
  );
}

export default AppIcon;
