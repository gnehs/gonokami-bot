import { useEffect, useSyncExternalStore } from "react";
import { call } from "./api.ts";

// Photos are per person, not per chat, so one cache serves every group for the session.
const cache = new Map<number, string | null>();
const requested = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;
const BATCH = 30;

function publish() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function fetchMissing(chatId: number, userIds: number[]) {
  const missing = userIds.filter((id) => !requested.has(id));
  missing.forEach((id) => requested.add(id));
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    call("avatars", { chatId, userIds: batch }).then(
      (avatars) => {
        // Anyone not returned is not a voter here; they keep their initial.
        batch.forEach((id) => cache.set(id, null));
        avatars.forEach(({ userId, photo }) => cache.set(userId, photo));
        publish();
      },
      () => batch.forEach((id) => requested.delete(id))
    );
  }
}

/** Looks up voters' photos, fetching any not yet asked for; undefined while loading. */
export function useAvatars(chatId: number, userIds: number[]): (userId: number) => string | null | undefined {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version
  );
  const key = userIds.join(",");
  useEffect(() => {
    if (key) fetchMissing(chatId, key.split(",").map(Number));
  }, [chatId, key]);
  return (userId) => cache.get(userId);
}
