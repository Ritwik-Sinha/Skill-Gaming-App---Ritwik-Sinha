import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomTabBar, { type MainTab } from '../components/BottomTabBar';
import GameScreen from './GameScreen';
import JungleSwingScreen from './JungleSwingScreen';
import PlayScreen from './PlayScreen';
import ProfileScreen from './ProfileScreen';
import styles, { catalogStyle, containerStyle } from './MainScreen.styles';

type PlayRoute = 'catalog' | 'details' | 'game';

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<MainTab>('Play');
  const [playRoute, setPlayRoute] = useState<PlayRoute>('catalog');
  const insets = useSafeAreaInsets();
  const showCatalog = useCallback(() => setPlayRoute('catalog'), []);
  const showDetails = useCallback(() => setPlayRoute('details'), []);

  useEffect(() => {
    if (playRoute !== 'game') {
      // Unity changes the window's fullscreen state outside React Native.
      StatusBar.setHidden(false);
      StatusBar.setBarStyle('light-content');
    }
  }, [playRoute]);

  useEffect(() => {
    if (activeTab !== 'Play' || playRoute !== 'details') {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        showCatalog();
        return true;
      },
    );
    return () => subscription.remove();
  }, [activeTab, playRoute, showCatalog]);

  if (activeTab === 'Play' && playRoute === 'game') {
    return <GameScreen onExit={showDetails} />;
  }

  return (
    <View style={containerStyle(insets)}>
      <View style={styles.content}>
        {activeTab === 'Play' ? (
          playRoute === 'details' ? (
            <JungleSwingScreen
              onBack={showCatalog}
              onPlay={() => setPlayRoute('game')}
            />
          ) : (
            <View style={catalogStyle(insets.top)}>
              <PlayScreen onOpenGame={showDetails} />
            </View>
          )
        ) : activeTab === 'Profile' ? (
          <ProfileScreen />
        ) : (
          <View
            style={styles.content}
            testID={`empty-${activeTab.toLowerCase()}-screen`}
          />
        )}
      </View>
      <BottomTabBar
        activeTab={activeTab}
        onSelect={tab => {
          setActiveTab(tab);
          setPlayRoute('catalog');
        }}
      />
    </View>
  );
}
