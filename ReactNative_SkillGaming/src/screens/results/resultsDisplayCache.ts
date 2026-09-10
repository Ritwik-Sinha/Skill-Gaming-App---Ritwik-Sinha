import { createAccountDisplayCache } from '../../services/displayCache';
import type { OwnResult } from '../../services/gameApi';

export const resultsDisplayStorageKey = (userId: string) =>
  `@skillgaming/results_display/v1/${encodeURIComponent(userId)}`;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isNullableCount = (value: unknown) => value === null || isCount(value);
const isNullableString = (value: unknown) =>
  value === null || typeof value === 'string';

function isResult(value: unknown): value is OwnResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.betId === 'string' &&
    typeof result.gameId === 'string' &&
    typeof result.createdAt === 'string' &&
    isNullableString(result.matchId) &&
    isNullableString(result.settledAt) &&
    isNullableCount(result.score) &&
    isNullableCount(result.opponentScore) &&
    ['playing', 'completed', 'forfeited'].includes(String(result.playStatus)) &&
    [null, 'completed', 'forfeited'].includes(
      result.opponentPlayStatus as string | null,
    ) &&
    ['unmatched', 'matched', 'settled', 'cancelled'].includes(
      String(result.matchStatus),
    ) &&
    [
      'playing',
      'waiting_for_match',
      'waiting_for_opponent',
      'won',
      'lost',
      'tie',
      'refunded',
      'forfeited',
      'cancelled',
    ].includes(String(result.outcome)) &&
    [
      'amountCents',
      'totalPoolCents',
      'totalMatchFeeCents',
      'grossAmountCents',
      'matchFeeCents',
      'netAmountCents',
      'matchFeePercent',
    ].every(key => isCount(result[key])) &&
    (result.walletCreditCents === undefined ||
      isCount(result.walletCreditCents)) &&
    (result.isLegacy === undefined || typeof result.isLegacy === 'boolean')
  );
}

function isEmptyTimestamp(value: unknown) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function restoreResults(value: unknown): OwnResult[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const restored = value.map(row => {
    if (!row || typeof row !== 'object') return row;
    // Older callable responses encoded pg Date objects as {}. The timestamp
    // cannot be recovered, but the saved match and money data are still valid.
    return {
      ...row,
      createdAt: isEmptyTimestamp(row.createdAt) ? '' : row.createdAt,
      settledAt: isEmptyTimestamp(row.settledAt) ? null : row.settledAt,
    };
  });
  return restored.every(isResult) ? restored : null;
}

export const resultsDisplayCache = createAccountDisplayCache<OwnResult[]>(
  resultsDisplayStorageKey,
  restoreResults,
);
