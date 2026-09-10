import AsyncStorage from '@react-native-async-storage/async-storage';

interface SavedBalance {
  version: 1;
  userId: string;
  balanceCents: number;
}

export function walletDisplayStorageKey(userId: string) {
  return `@skillgaming/server_wallet/display/v1/${encodeURIComponent(userId)}`;
}

// This is only a preview of the last confirmed server balance. Wallet loads,
// pending transaction journals and all spending decisions still use the server.
export function createWalletDisplayCache() {
  const balances = new Map<string, number>();
  const reads = new Map<string, Promise<number | undefined>>();
  const writes = new Map<string, Promise<void>>();
  let generation = 0;

  function peek(userId: string) {
    return userId ? balances.get(userId) : undefined;
  }

  function hydrate(userId: string): Promise<number | undefined> {
    if (!userId || balances.has(userId)) return Promise.resolve(peek(userId));
    const active = reads.get(userId);
    if (active) return active;
    const startedGeneration = generation;
    const promise = Promise.resolve()
      .then(async () => {
        try {
          const raw = await AsyncStorage.getItem(
            walletDisplayStorageKey(userId),
          );
          if (startedGeneration !== generation) return undefined;
          const saved = raw === null ? null : (JSON.parse(raw) as SavedBalance);
          if (
            !balances.has(userId) &&
            saved?.version === 1 &&
            saved.userId === userId &&
            Number.isSafeInteger(saved.balanceCents) &&
            saved.balanceCents >= 0
          ) {
            balances.set(userId, saved.balanceCents);
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

  function save(userId: string, balanceCents: number) {
    if (!userId || !Number.isSafeInteger(balanceCents) || balanceCents < 0)
      return;
    // Updating memory first also makes a newer response win over a slow read.
    balances.set(userId, balanceCents);
    const saved: SavedBalance = { version: 1, userId, balanceCents };
    const promise = (writes.get(userId) ?? Promise.resolve())
      .then(() =>
        AsyncStorage.setItem(
          walletDisplayStorageKey(userId),
          JSON.stringify(saved),
        ),
      )
      .catch(() => {
        // Unlike the transaction journal, this display cache is best effort.
      })
      .finally(() => {
        if (writes.get(userId) === promise) writes.delete(userId);
      });
    writes.set(userId, promise);
  }

  function clearMemory() {
    generation += 1;
    balances.clear();
    reads.clear();
  }

  return { peek, hydrate, save, clearMemory };
}

export const walletDisplayCache = createWalletDisplayCache();

export function resetWalletDisplayCache() {
  walletDisplayCache.clearMemory();
}
