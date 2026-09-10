import AsyncStorage from '@react-native-async-storage/async-storage';

interface SavedRating {
  version: 1;
  userId: string;
  rating: number;
}

export function ratingDisplayStorageKey(userId: string) {
  return `@skillgaming/player_rating/display/v1/${encodeURIComponent(userId)}`;
}

// Like the wallet display cache, this previews the last confirmed server value.
// Match outcomes and rating changes are always calculated by the server.
export function createRatingDisplayCache() {
  const ratings = new Map<string, number>();
  const reads = new Map<string, Promise<number | undefined>>();
  const writes = new Map<string, Promise<void>>();
  let generation = 0;

  function peek(userId: string) {
    return userId ? ratings.get(userId) : undefined;
  }

  function hydrate(userId: string): Promise<number | undefined> {
    if (!userId || ratings.has(userId)) return Promise.resolve(peek(userId));
    const active = reads.get(userId);
    if (active) return active;
    const startedGeneration = generation;
    const promise = Promise.resolve()
      .then(async () => {
        try {
          const raw = await AsyncStorage.getItem(
            ratingDisplayStorageKey(userId),
          );
          if (startedGeneration !== generation) return undefined;
          const saved = raw === null ? null : (JSON.parse(raw) as SavedRating);
          if (
            !ratings.has(userId) &&
            saved?.version === 1 &&
            saved.userId === userId &&
            Number.isSafeInteger(saved.rating)
          ) {
            ratings.set(userId, saved.rating);
          }
        } catch {
          // A missing or unreadable preview must never block a server request.
        }
        return startedGeneration === generation ? peek(userId) : undefined;
      })
      .finally(() => {
        if (reads.get(userId) === promise) reads.delete(userId);
      });
    reads.set(userId, promise);
    return promise;
  }

  function save(userId: string, rating: number) {
    if (!userId || !Number.isSafeInteger(rating)) return;
    // A newer server response wins over a slow device read, including zero.
    ratings.set(userId, rating);
    const saved: SavedRating = { version: 1, userId, rating };
    const promise = (writes.get(userId) ?? Promise.resolve())
      .then(() =>
        AsyncStorage.setItem(
          ratingDisplayStorageKey(userId),
          JSON.stringify(saved),
        ),
      )
      .catch(() => {
        // Device caching is best effort and must not hide a server rating.
      })
      .finally(() => {
        if (writes.get(userId) === promise) writes.delete(userId);
      });
    writes.set(userId, promise);
  }

  function clearMemory() {
    generation += 1;
    ratings.clear();
    reads.clear();
  }

  return { peek, hydrate, save, clearMemory };
}

export const ratingDisplayCache = createRatingDisplayCache();
