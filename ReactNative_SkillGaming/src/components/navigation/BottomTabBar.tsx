import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppIcon from '../common/AppIcon';
import {
  getContainerStyle,
  getIconColor,
  getIndicatorStyle,
  getLabelStyle,
  getTabStyle,
} from './BottomTabBar.styles';

const tabs = [
  { name: 'Results', icon: 'trophy' },
  { name: 'Leagues', icon: 'crown' },
  { name: 'Play', icon: 'gamepad' },
  { name: 'Profile', icon: 'profile' },
] as const;

export type MainTab = (typeof tabs)[number]['name'];

interface BottomTabBarProps {
  activeTab: MainTab;
  onSelect: (tab: MainTab) => void;
}

export default function BottomTabBar({
  activeTab,
  onSelect,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={getContainerStyle(insets.bottom)} accessibilityRole="tablist">
      {tabs.map(tab => {
        const selected = activeTab === tab.name;

        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityLabel={tab.name}
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab.name)}
            style={getTabStyle}
          >
            <View style={getIndicatorStyle(selected)} />
            <AppIcon name={tab.icon} size={27} color={getIconColor(selected)} />
            <Text style={getLabelStyle(selected)}>{tab.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
