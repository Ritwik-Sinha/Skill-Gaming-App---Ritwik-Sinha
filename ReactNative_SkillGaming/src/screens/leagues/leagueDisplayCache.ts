import AsyncStorage from '@react-native-async-storage/async-storage';
import { type LeagueData, type LeaguePlayer } from '../../services/leagueApi';

interface SavedLeague {
  version: 1;
  userId: string;
  savedAt: number;
  data: LeagueData;
}

export const leagueDisplayStorageKey = (userId: string) =>
  `@skillgaming/leagues/display/v1/${encodeURIComponent(userId)}`;

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
function player(value: LeaguePlayer) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.photoUrl === null || typeof value.photoUrl === 'string') &&
    count(value.rank) &&
    count(value.crowns) &&
    count(value.prizeCents) &&
    typeof value.isMe === 'boolean'
  );
}
function valid(data: LeagueData) {
  return (
    data &&
    typeof data.periodId === 'string' &&
    date(data.endsAt) &&
    date(data.serverTime) &&
    count(data.tier) &&
    data.tier < 8 &&
    count(data.crowns) &&
    count(data.remainderCents) &&
    Array.isArray(data.tiers) &&
    data.tiers.length === 8 &&
    data.tiers.every(
      (tier, index) =>
        tier &&
        tier.tier === index &&
        typeof tier.name === 'string' &&
        count(tier.poolCents) &&
        (tier.threshold === null || count(tier.threshold)) &&
        count(tier.winners),
    ) &&
    Array.isArray(data.top) &&
    data.top.length <= 20 &&
    data.top.every(player) &&
    player(data.me) &&
    Array.isArray(data.prizes) &&
    data.prizes.every(count) &&
    count(data.eligibleWinners) &&
    Array.isArray(data.payouts) &&
    data.payouts.every(
      payout =>
        payout &&
        typeof payout.id === 'string' &&
        count(payout.tier) &&
        count(payout.rank) &&
        count(payout.amountCents) &&
        date(payout.endsAt) &&
        (payout.paidAt === null || date(payout.paidAt)),
    )
  );
}

// Display previews only. Announcements and all rewards remain server-driven.
export function createLeagueDisplayCache() {
  const snapshots = new Map<string, SavedLeague>();
  const reads = new Map<string, Promise<LeagueData | undefined>>();
  const writes = new Map<string, Promise<void>>();
  let generation = 0;

  function peek(userId: string): LeagueData | undefined {
    const saved = snapshots.get(userId);
    if (!saved) return undefined;
    return {
      ...saved.data,
      // Preserve elapsed time instead of restarting an old countdown on launch.
      serverTime: new Date(
        Date.parse(saved.data.serverTime) +
          Math.max(0, Date.now() - saved.savedAt),
      ).toISOString(),
      events: [],
    };
  }

  function hydrate(userId: string): Promise<LeagueData | undefined> {
    if (!userId || snapshots.has(userId)) return Promise.resolve(peek(userId));
    const active = reads.get(userId);
    if (active) return active;
    const startedGeneration = generation;
    const promise = Promise.resolve()
      .then(async () => {
        try {
          const raw = await AsyncStorage.getItem(
            leagueDisplayStorageKey(userId),
          );
          if (startedGeneration !== generation) return undefined;
          const saved = raw === null ? null : (JSON.parse(raw) as SavedLeague);
          if (
            !snapshots.has(userId) &&
            saved?.version === 1 &&
            saved.userId === userId &&
            count(saved.savedAt) &&
            valid(saved.data)
          ) {
            snapshots.set(userId, saved);
          }
        } catch {
          // Cache failures must not block normal league fetching.
        }
        return startedGeneration === generation ? peek(userId) : undefined;
      })
      .finally(() => {
        if (reads.get(userId) === promise) reads.delete(userId);
      });
    reads.set(userId, promise);
    return promise;
  }

  function save(userId: string, data: LeagueData) {
    if (!userId || !valid(data)) return;
    const saved: SavedLeague = {
      version: 1,
      userId,
      savedAt: Date.now(),
      data: { ...data, events: [] },
    };
    // A late disk read cannot overwrite a newer server response.
    snapshots.set(userId, saved);
    const promise = (writes.get(userId) ?? Promise.resolve())
      .then(() =>
        AsyncStorage.setItem(
          leagueDisplayStorageKey(userId),
          JSON.stringify(saved),
        ),
      )
      .catch(() => {
        /* Best-effort display cache. */
      })
      .finally(() => {
        if (writes.get(userId) === promise) writes.delete(userId);
      });
    writes.set(userId, promise);
  }

  function clearMemory() {
    generation++;
    snapshots.clear();
    reads.clear();
  }
  return { peek, hydrate, save, clearMemory };
}
export const leagueDisplayCache = createLeagueDisplayCache();
