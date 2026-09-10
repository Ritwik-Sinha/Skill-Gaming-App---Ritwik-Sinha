import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AccountDisplayCache<T> {
  peek: (userId: string) => T | null;
  hydrate: (userId: string) => Promise<T | null>;
  save: (userId: string, value: T) => void;
  clearMemory: () => void;
}

/** Display snapshots only: reading this cache never replaces a server request. */
export function createAccountDisplayCache<T>(
  storageKey: (userId: string) => string,
  restore: (value: unknown) => T | null,
): AccountDisplayCache<T> {
  const values = new Map<string, T>();
  const writes = new Map<string, Promise<void>>();
  return {
    peek: userId => values.get(userId) ?? null,
    async hydrate(userId) {
      if (!userId) return null;
      if (values.has(userId)) return values.get(userId)!;
      try {
        const saved = await AsyncStorage.getItem(storageKey(userId));
        // A server response may have arrived while storage was being read.
        if (values.has(userId)) return values.get(userId)!;
        const parsed = restore(saved === null ? null : JSON.parse(saved));
        if (parsed !== null) {
          values.set(userId, parsed);
          return parsed;
        }
      } catch {
        // Missing/corrupt storage must not affect network refreshes.
      }
      return null;
    },
    save(userId, value) {
      if (!userId) return;
      values.set(userId, value);
      // Keep the latest server snapshot last on disk even if writes are slow.
      const write = (writes.get(userId) ?? Promise.resolve())
        .then(() =>
          AsyncStorage.setItem(storageKey(userId), JSON.stringify(value)),
        )
        .catch(() => {})
        .finally(() => {
          if (writes.get(userId) === write) writes.delete(userId);
        });
      writes.set(userId, write);
    },
    clearMemory() {
      values.clear();
    },
  };
}
