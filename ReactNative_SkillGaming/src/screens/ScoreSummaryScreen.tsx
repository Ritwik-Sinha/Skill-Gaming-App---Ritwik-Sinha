import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AppIcon from '../components/AppIcon';
import JungleArtwork from '../components/JungleArtwork';
import {
  getMyLeaderboard,
  getMyResults,
  type OwnResult,
} from '../services/gameApi';
import {
  formatMoney,
  formatScore,
  resultGreen,
  resultPresentation,
} from './resultPresentation';
import styles from './ScoreSummaryScreen.styles';
import useLiveGameData from './useLiveGameData';
import MatchScoreComparison from './MatchScoreComparison';

interface ScoreSummaryScreenProps {
  result: OwnResult;
  onContinue: () => void;
}

export default function ScoreSummaryScreen({
  result: initialResult,
  onContinue,
}: ScoreSummaryScreenProps) {
  const loadResult = useCallback(async () => {
    const results = await getMyResults();
    return (
      results.find(entry => entry.betId === initialResult.betId) ??
      initialResult
    );
  }, [initialResult]);
  const loadLeaderboard = useCallback(
    () => getMyLeaderboard(initialResult.gameId, initialResult.betId),
    [initialResult.gameId, initialResult.betId],
  );
  const {
    data: leaderboard,
    loading,
    error,
    refresh,
  } = useLiveGameData(loadLeaderboard);
  // Settlement can arrive while standings are unavailable, and vice versa.
  const {
    data: latestResult,
    error: resultError,
    loading: resultLoading,
    refresh: refreshResult,
  } = useLiveGameData(loadResult);
  const result = latestResult ?? initialResult;
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  const presentation = resultPresentation(result);
  const forfeited = result.playStatus === 'forfeited';
  const hasRank =
    !forfeited && leaderboard?.rank !== null && leaderboard?.rank !== undefined;
  const personalBest =
    !forfeited &&
    result.score !== null &&
    leaderboard?.isPersonalBest &&
    leaderboard.bestScore === result.score;

  return (
    <View style={styles.screen}>
      <View style={styles.ambientTop} pointerEvents="none" />
      <View style={styles.ambientBottom} pointerEvents="none" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>
          {forfeited ? 'RUN CLOSED' : 'YOUR RUN, RECORDED'}
        </Text>
        <View style={[styles.hero, stacked && styles.heroStacked]}>
          <View style={styles.artwork}>
            <JungleArtwork decorative />
          </View>
          <View style={[styles.heroCopy, stacked && styles.heroCopyStacked]}>
            <Text style={styles.gameName} accessibilityRole="header">
              Jungle Swing
            </Text>
            <Text style={styles.scoreCaption}>
              {forfeited ? 'LAST RECORDED SCORE' : 'YOUR SCORE'}
            </Text>
            <Text
              style={[styles.score, result.score === null && styles.noScore]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {formatScore(result.score)}
            </Text>
            {personalBest && (
              <View style={styles.bestBadge}>
                <Text style={styles.bestBadgeText}>PERSONAL BEST</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.resultBanner}>
          <Text style={[styles.outcome, { color: presentation.color }]}>
            {presentation.title}
          </Text>
          <Text style={styles.outcomeDescription}>
            {presentation.description}
          </Text>
          {result.outcome === 'won' && (
            <Text style={styles.outcomeDescription}>
              {formatMoney(result.netAmountCents)}{' '}
              {result.isLegacy ? 'recorded award' : 'net payout'} ·{' '}
              {formatMoney(result.matchFeeCents)} match fee (
              {result.matchFeePercent}%)
            </Text>
          )}
          {forfeited && result.score !== null && (
            <Text style={styles.outcomeDescription}>
              This score is kept as a record. Forfeited runs don’t enter the
              leaderboard.
            </Text>
          )}
        </View>

        <MatchScoreComparison result={result} />
        {resultError && (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>
              Your match result couldn’t refresh. Showing the last update.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry match result"
              disabled={resultLoading}
              onPress={refreshResult}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            This run’s standing
          </Text>
          <Text style={styles.privateLabel}>ONLY YOU</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Your score compared with players’ best completed scores
        </Text>
        <View style={styles.standingCard}>
          <View style={styles.standingRow}>
            <View style={styles.avatar}>
              <AppIcon name="profile" size={29} color="#89AF9B" />
            </View>
            <View style={styles.player}>
              <Text style={styles.playerName}>You</Text>
              <Text style={styles.playerDescription}>Your score rank</Text>
            </View>
            <Text
              style={styles.rank}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              accessibilityLabel={
                hasRank ? `Your rank ${leaderboard!.rank}` : 'No rank available'
              }
            >
              {hasRank ? `#${leaderboard!.rank}` : '—'}
            </Text>
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>
                {forfeited ? 'LAST RECORDED SCORE' : 'THIS RUN'}
              </Text>
              <Text
                style={styles.metricValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatScore(result.score)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>PERSONAL BEST</Text>
              <Text
                style={styles.metricValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {leaderboard?.bestScore === undefined ||
                leaderboard.bestScore === null
                  ? '—'
                  : formatScore(leaderboard.bestScore)}
              </Text>
            </View>
          </View>
        </View>

        {loading && !leaderboard && (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={resultGreen} />
            <Text style={styles.loadingText}>
              Finding your current standing…
            </Text>
          </View>
        )}
        {error && (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>
              {leaderboard
                ? 'Your standing couldn’t refresh. Showing the last update.'
                : 'Your run is saved, but your standing couldn’t load.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry leaderboard"
              disabled={loading}
              onPress={refresh}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {leaderboard && (
          <>
            <Text style={styles.standingMessage}>
              {hasRank
                ? leaderboard.totalPlayers === 1
                  ? 'You’re the first player on this leaderboard.'
                  : `Your score is ahead of ${leaderboard.playersBelow.toLocaleString()} ${
                      leaderboard.playersBelow === 1 ? 'player' : 'players'
                    }.`
                : 'Complete a run to earn your place on the leaderboard.'}
            </Text>
            <Text style={styles.standingFootnote}>
              {hasRank
                ? `Based on ${leaderboard.totalPlayers.toLocaleString()} ${
                    leaderboard.totalPlayers === 1 ? 'player’s' : 'players’'
                  } best completed ${
                    leaderboard.totalPlayers === 1 ? 'score' : 'scores'
                  }. `
                : ''}
              Only your own leaderboard entry is shown.
            </Text>
          </>
        )}

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to results"
            onPress={onContinue}
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.continueText}>Continue to results</Text>
            <AppIcon name="arrow-right" size={19} />
          </Pressable>
          <Text style={styles.savedText}>
            Entry #{result.betId} · One entry, one run.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
