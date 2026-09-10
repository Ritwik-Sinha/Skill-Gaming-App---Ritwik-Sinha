import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OwnResult } from '../services/gameApi';
import { colors } from '../theme';
import {
  formatScore,
  isPendingResult,
  resultGreen,
} from './resultPresentation';

export default function MatchScoreComparison({
  result,
}: {
  result: OwnResult;
}) {
  const ownForfeited = result.playStatus === 'forfeited';
  const hasOpponent =
    result.matchStatus === 'settled' &&
    (result.opponentPlayStatus === 'completed' ||
      result.opponentPlayStatus === 'forfeited');
  const opponentForfeited =
    hasOpponent && result.opponentPlayStatus === 'forfeited';
  const opponentValue = hasOpponent
    ? formatScore(result.opponentScore ?? null)
    : isPendingResult(result)
    ? 'Available after settlement'
    : 'Not available';

  return (
    <View style={styles.section} testID="match-score-comparison">
      <Text style={styles.heading} accessibilityRole="header">
        Match scores
      </Text>
      <View style={styles.scores}>
        <View style={[styles.row, styles.ownRow]}>
          <View style={styles.player}>
            <Text style={styles.label}>
              {ownForfeited ? 'Last recorded score' : 'Your score'}
            </Text>
            {ownForfeited && <Text style={styles.forfeited}>Forfeited</Text>}
          </View>
          <Text
            style={[styles.value, styles.ownValue]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatScore(result.score)}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={styles.player}>
            <Text style={styles.label}>
              {opponentForfeited
                ? 'Opponent’s last recorded score'
                : 'Opponent score'}
            </Text>
            {opponentForfeited && (
              <Text style={styles.forfeited}>Forfeited</Text>
            )}
          </View>
          <Text
            style={[styles.value, !hasOpponent && styles.pendingValue]}
            numberOfLines={hasOpponent ? 1 : undefined}
            adjustsFontSizeToFit={hasOpponent}
            minimumFontScale={0.6}
          >
            {opponentValue}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginVertical: 20 },
  heading: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  scores: {
    borderWidth: 1,
    borderColor: '#2B3831',
    borderRadius: 16,
    backgroundColor: '#101913',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  ownRow: {
    backgroundColor: '#13281F',
    borderBottomWidth: 1,
    borderBottomColor: '#2B3831',
  },
  player: { flex: 1 },
  label: { color: '#DDE8E0', fontSize: 13, lineHeight: 19 },
  forfeited: { color: '#FFAB8E', fontSize: 11, lineHeight: 16, marginTop: 4 },
  value: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    maxWidth: '50%',
    textAlign: 'right',
  },
  ownValue: { color: resultGreen },
  pendingValue: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
  },
});
