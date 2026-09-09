import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import AddMoneyModal from '../components/AddMoneyModal';
import BottomTabBar, { type MainTab } from '../components/BottomTabBar';
import TopBar from '../components/TopBar';
import { useDemoWallet } from '../wallet/useDemoWallet';
import GameScreen from './GameScreen';
import JungleSwingScreen from './JungleSwingScreen';
import PlayScreen from './PlayScreen';
import ProfileScreen from './ProfileScreen';
import styles, { containerStyle } from './MainScreen.styles';

type PlayRoute = 'catalog' | 'details' | 'game';

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<MainTab>('Play');
  const [playRoute, setPlayRoute] = useState<PlayRoute>('catalog');
  const [showAddMoney, setShowAddMoney] = useState(false);
  const { user } = useAuth();
  const wallet = useDemoWallet(user!.uid);
  const insets = useSafeAreaInsets();
  const isInGame = activeTab === 'Play' && playRoute === 'game';
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

  return (
    <View style={containerStyle(insets)}>
      {!isInGame && (
        <TopBar
          balance={wallet.balance}
          isLoading={wallet.isLoading}
          loadError={wallet.loadError}
          onAddMoney={() => setShowAddMoney(true)}
        />
      )}
      <View style={styles.content}>
        {isInGame ? (
          <GameScreen onExit={showDetails} paused={showAddMoney} />
        ) : activeTab === 'Play' ? (
          playRoute === 'details' ? (
            <JungleSwingScreen
              onBack={showCatalog}
              onPlay={() => setPlayRoute('game')}
            />
          ) : (
            <PlayScreen onOpenGame={showDetails} />
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
      {!isInGame && (
        <BottomTabBar
          activeTab={activeTab}
          onSelect={tab => {
            setActiveTab(tab);
            setPlayRoute('catalog');
          }}
        />
      )}
      <AddMoneyModal
        visible={showAddMoney}
        balance={wallet.balance}
        isLoading={wallet.isLoading}
        isAdding={wallet.isAdding}
        loadError={wallet.loadError}
        onClose={() => setShowAddMoney(false)}
        onAddMoney={wallet.addMoney}
        onRetryLoad={wallet.retryLoad}
      />
    </View>
  );
}
