import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import AppIcon from '../../components/common/AppIcon';
import JungleArtwork from '../../components/game/JungleArtwork';
import { getMyResults, type OwnResult } from '../../services/gameApi';
import {
  formatMoney,
  isPendingResult,
  matchLabel,
  resultGreen,
  resultPresentation,
} from './resultPresentation';
import styles from './ResultsScreen.styles';
import useLiveGameData from './useLiveGameData';
import MatchScoreComparison from './MatchScoreComparison';
import { resultsDisplayCache } from './resultsDisplayCache';

interface ResultsScreenProps {
  userId: string;
  onOpenResult: (result: OwnResult) => void;
  highlightBetId?: string;
  onResultsUpdated?: () => void;
}

function ResultCard({
  result,
  highlighted,
  onOpen,
}: {
  result: OwnResult;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const presentation = resultPresentation(result);
  const pending = isPendingResult(result);
  const date = new Date(result.createdAt);
  const createdAt = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

  return (
    <View
      style={[styles.card, highlighted && styles.highlightedCard]}
      testID={`result-${result.betId}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.thumbnail}>
          <JungleArtwork decorative />
        </View>
        <View style={styles.gameCopy}>
          <Text style={styles.gameName}>Jungle Swing</Text>
          <Text style={styles.date}>
            {createdAt} · Entry #{result.betId}
          </Text>
        </View>
        <Text style={styles.entryBadge}>{formatMoney(result.amountCents)}</Text>
      </View>
      <View style={styles.status}>
        <View
          style={[styles.statusDot, { backgroundColor: presentation.color }]}
        />
        <Text
          style={[styles.statusTitle, { color: presentation.color }]}
          accessibilityRole="header"
        >
          {presentation.title}
        </Text>
      </View>
      <Text style={styles.matchLabel}>{matchLabel(result)}</Text>
      <Text style={styles.description}>{presentation.description}</Text>
      <MatchScoreComparison result={result} />
      <View style={styles.amounts}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Your entry</Text>
          <Text style={styles.amountValue}>
            {formatMoney(result.amountCents)}
          </Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Match prize pool</Text>
          <Text style={styles.amountValue}>
            {pending && result.totalPoolCents === 0
              ? 'Awaiting match'
              : formatMoney(result.totalPoolCents)}
          </Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>
            Match fee · {result.matchFeePercent}%
          </Text>
          <Text style={styles.amountValue}>
            {pending ? 'At settlement' : formatMoney(result.totalMatchFeeCents)}
          </Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={[styles.amountLabel, styles.payoutLabel]}>
            {result.isLegacy
              ? 'Recorded award'
              : result.outcome === 'refunded'
              ? 'Your refund'
              : 'Your net payout'}
          </Text>
          <Text style={styles.payoutValue}>
            {pending ? 'Pending' : formatMoney(result.netAmountCents)}
          </Text>
        </View>
        {!pending && result.netAmountCents > 0 && result.matchFeeCents > 0 && (
          <Text style={styles.feeNote}>
            {formatMoney(result.grossAmountCents)} awarded −{' '}
            {formatMoney(result.matchFeeCents)} fee ={' '}
            {formatMoney(result.netAmountCents)}{' '}
            {result.isLegacy ? 'recorded award' : 'net payout'}
          </Text>
        )}
      </View>
      {result.playStatus !== 'playing' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View your standing for entry ${result.betId}`}
          onPress={onOpen}
          style={({ pressed }) => [
            styles.detailButton,
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name="trophy" size={16} color="#BEF9DF" />
          <Text style={styles.detailLabel}>Match scores & standing</Text>
          <AppIcon name="arrow-right" size={16} color="#BEF9DF" />
        </Pressable>
      )}
    </View>
  );
}

export default function ResultsScreen({
  userId,
  onOpenResult,
  highlightBetId,
  onResultsUpdated,
}: ResultsScreenProps) {
  const loadResults = useCallback(() => getMyResults(userId), [userId]);
  const { data, loading, error, refresh, fetchCount } = useLiveGameData(
    loadResults,
    resultsDisplayCache,
    userId,
  );
  useEffect(() => {
    if (fetchCount > 0) onResultsUpdated?.();
  }, [fetchCount, onResultsUpdated]);
  const [filter, setFilter] = useState<'All' | 'Waiting' | 'Finished'>('All');
  const results = (data ?? []).filter(
    result =>
      filter === 'All' ||
      (filter === 'Waiting'
        ? isPendingResult(result)
        : !isPendingResult(result)),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading && data !== null}
          onRefresh={refresh}
          tintColor={resultGreen}
          colors={[resultGreen]}
        />
      }
    >
      <Text style={styles.eyebrow}>YOUR MATCHES</Text>
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          Results
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh results"
          accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading}
          onPress={refresh}
          style={({ pressed }) => [
            styles.refresh,
            pressed && styles.pressed,
            loading && styles.disabled,
          ]}
        >
          <Text style={styles.refreshGlyph}>↻</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>
        Every run, from your first score to the final result.
      </Text>
      <View style={styles.filters} accessibilityRole="tablist">
        {(['All', 'Waiting', 'Finished'] as const).map(item => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityLabel={`${item} results`}
            accessibilityState={{ selected: filter === item }}
            onPress={() => setFilter(item)}
            style={({ pressed }) => [
              styles.filter,
              filter === item && styles.selectedFilter,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.selectedFilterText,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>
            {data
              ? 'Results couldn’t refresh. Showing the last update.'
              : 'Couldn’t load your results. Check your connection and try again.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry results"
            disabled={loading}
            onPress={refresh}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}
      {loading && data === null ? (
        <View style={styles.stateCard} accessibilityLiveRegion="polite">
          <ActivityIndicator color={resultGreen} size="large" />
          <Text style={styles.stateDescription}>Loading your results…</Text>
        </View>
      ) : data !== null && results.length === 0 ? (
        <View style={styles.stateCard}>
          <AppIcon name="trophy" size={38} color={resultGreen} />
          <Text style={styles.stateTitle}>
            {filter === 'All'
              ? 'Your story starts with a run'
              : filter === 'Waiting'
              ? 'All caught up'
              : 'No finished matches yet'}
          </Text>
          <Text style={styles.stateDescription}>
            {filter === 'All'
              ? 'Play Jungle Swing and your score, match status and earnings will appear here.'
              : filter === 'Waiting'
              ? 'There are no entries waiting for a match or a final score.'
              : 'Settled matches will appear here with the fee and your net payout.'}
          </Text>
        </View>
      ) : (
        <View style={styles.cards}>
          {results.map(result => (
            <ResultCard
              key={result.betId}
              result={result}
              highlighted={result.betId === highlightBetId}
              onOpen={() => onOpenResult(result)}
            />
          ))}
        </View>
      )}
      {data !== null && data.length > 0 && (
        <Text style={styles.footer}>
          Results update automatically. Each entry allows one run.
        </Text>
      )}
    </ScrollView>
  );
}
