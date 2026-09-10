import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import AddMoneyModal from '../../components/wallet/AddMoneyModal';
import BottomTabBar, {
  type MainTab,
} from '../../components/navigation/BottomTabBar';
import TopBar from '../../components/navigation/TopBar';
import { useServerWallet } from '../../wallet/useServerWallet';
import { useServerRating } from '../../rating/useServerRating';
import { type OwnResult } from '../../services/gameApi';
import { recoverGame } from '../../services/gameSession';
import GameScreen from '../play/GameScreen';
import JungleSwingScreen from '../play/JungleSwingScreen';
import PlayScreen from '../play/PlayScreen';
import ProfileScreen from '../profile/ProfileScreen';
import ResultsScreen from '../results/ResultsScreen';
import ScoreSummaryScreen from '../results/ScoreSummaryScreen';
import styles, { containerStyle } from './MainScreen.styles';
import LeaguesScreen, { LeagueCelebration } from '../leagues/LeaguesScreen';
import { useLeague } from '../leagues/useLeague';

type PlayRoute = 'catalog' | 'details' | 'game';

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<MainTab>('Play');
  const [playRoute, setPlayRoute] = useState<PlayRoute>('catalog');
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [amountCents, setAmountCents] = useState(1000);
  const [summary, setSummary] = useState<OwnResult | null>(null);
  const [recovering, setRecovering] = useState(true);
  const [recoveryError, setRecoveryError] = useState(false);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const { user } = useAuth();
  const userId = user!.uid;
  const wallet = useServerWallet(userId);
  const refreshWallet = wallet.refresh;
  const playerRating = useServerRating(userId);
  const refreshRating = playerRating.refresh;
  const refreshAccount = useCallback(() => {
    refreshWallet();
    refreshRating();
  }, [refreshWallet, refreshRating]);
  const insets = useSafeAreaInsets();
  const isInGame = playRoute === 'game';
  const league = useLeague(userId, isInGame || recovering);
  const refreshLeague = league.refresh;
  useEffect(() => {
    if (!isInGame && !recovering) refreshLeague();
  }, [activeTab, summary, isInGame, recovering, refreshLeague]);
  const showCatalog = useCallback(() => setPlayRoute('catalog'), []);
  const showDetails = useCallback(() => setPlayRoute('details'), []);
  const showResults = useCallback(() => {
    setSummary(null);
    setPlayRoute('catalog');
    setActiveTab('Results');
  }, []);

  useEffect(() => {
    let active = true;
    setRecovering(true);
    setRecoveryError(false);
    recoverGame(userId)
      .then(result => {
        if (active && result) {
          setSummary(result);
        }
      })
      .catch(() => {
        if (active) {
          setRecoveryError(true);
        }
      })
      .finally(() => {
        if (active) {
          setRecovering(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId, recoveryAttempt]);

  useEffect(() => {
    if (!isInGame) {
      StatusBar.setHidden(false);
      StatusBar.setBarStyle('light-content');
      refreshAccount();
    }
  }, [isInGame, summary, activeTab, refreshAccount]);

  useEffect(() => {
    if (summary) {
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          showResults();
          return true;
        },
      );
      return () => subscription.remove();
    }
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
  }, [activeTab, playRoute, showCatalog, showResults, summary]);

  return (
    <View style={containerStyle(insets)}>
      {!isInGame && !summary && (
        <TopBar
          crownCount={league.data?.crowns ?? null}
          crownGoal={
            league.data ? league.data.tiers[league.data.tier].threshold : null
          }
          balance={wallet.balance}
          hasBalance={wallet.hasBalance}
          isLoading={wallet.isLoading}
          loadError={wallet.loadError}
          onAddMoney={() => setShowAddMoney(true)}
        />
      )}
      {recoveryError && !isInGame && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRecoveryAttempt(value => value + 1)}
          style={styles.recoveryBanner}
        >
          <Text style={styles.recoveryText}>
            Reconnect to save your previous result. Tap to retry before starting
            another match.
          </Text>
        </Pressable>
      )}
      <View style={styles.content}>
        {isInGame ? (
          <GameScreen
            userId={user!.uid}
            amountCents={amountCents}
            onExit={showDetails}
            onFinished={result => {
              setPlayRoute('catalog');
              setSummary(result);
            }}
          />
        ) : summary ? (
          <ScoreSummaryScreen result={summary} onContinue={showResults} />
        ) : activeTab === 'Play' ? (
          playRoute === 'details' ? (
            <JungleSwingScreen
              onBack={showCatalog}
              disabled={
                recovering ||
                recoveryError ||
                wallet.isLoading ||
                wallet.isAdding ||
                wallet.isWithdrawing ||
                !!wallet.loadError
              }
              onPlay={amount => {
                setAmountCents(amount);
                setShowAddMoney(false);
                setPlayRoute('game');
              }}
            />
          ) : (
            <PlayScreen onOpenGame={showDetails} />
          )
        ) : activeTab === 'Results' ? (
          <ResultsScreen
            userId={userId}
            onOpenResult={setSummary}
            onResultsUpdated={refreshAccount}
          />
        ) : activeTab === 'Profile' ? (
          <ProfileScreen
            key={userId}
            wallet={wallet}
            playerRating={playerRating}
          />
        ) : (
          <LeaguesScreen
            data={league.data}
            error={league.error}
            loading={league.loading}
            onRefresh={league.refresh}
          />
        )}
      </View>
      {!isInGame && !summary && (
        <BottomTabBar
          activeTab={activeTab}
          onSelect={tab => {
            setActiveTab(tab);
            setPlayRoute('catalog');
          }}
        />
      )}
      <AddMoneyModal
        visible={showAddMoney && !isInGame && !summary}
        balance={wallet.balance}
        hasBalance={wallet.hasBalance}
        isLoading={wallet.isLoading || wallet.isWithdrawing}
        isAdding={wallet.isAdding}
        loadError={wallet.loadError}
        onClose={() => setShowAddMoney(false)}
        onAddMoney={wallet.addMoney}
        onRetryLoad={wallet.retryLoad}
      />
      <LeagueCelebration
        data={league.data}
        visible={!isInGame && !recovering && !summary && !showAddMoney}
        onDismiss={league.dismiss}
        dismissing={league.dismissing}
        error={league.error}
      />
    </View>
  );
}
