// Per-patch tier list snapshots (tierHistory.json in the data dir) for Home's "Patch movers".
// The store calls `recordTierSnapshot` after every tier list load; Home reads `useTierHistory`.

import { useEffect, useSyncExternalStore } from "react";
import { loadStore, saveStore } from "../bridge";
import { normalizeHistory, recordSnapshot, type TierHistory } from "../engine/movers";
import type { ChampionTierRow } from "../engine/sources/tierlists";

const FILE = "tierHistory.json";

let history: TierHistory | undefined;
let loading: Promise<TierHistory> | undefined;
/** Serialises read-modify-write so two modes loading at once can't drop a snapshot. */
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function load(): Promise<TierHistory> {
  if (history) return Promise.resolve(history);
  loading ??= loadStore<unknown>(FILE)
    .catch(() => null)
    .then((raw) => {
      history ??= normalizeHistory(raw);
      listeners.forEach((l) => l());
      return history;
    });
  return loading;
}

/**
 * Keep a compact snapshot of a mode's tier list for its patch (last 3 patches per mode).
 * Returns once saved; never throws.
 */
export function recordTierSnapshot(mode: string, patch: string | undefined, rows: ChampionTierRow[]): Promise<void> {
  const run = queue.then(async () => {
    const cur = await load();
    const next = recordSnapshot(cur, mode, patch, rows);
    if (next === cur) return;
    history = next;
    listeners.forEach((l) => l());
    await saveStore(FILE, next);
  });
  queue = run.catch(() => undefined);
  return run.catch(() => undefined);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The stored snapshots (undefined until the file has been read). */
export function useTierHistory(): TierHistory | undefined {
  useEffect(() => void load(), []);
  return useSyncExternalStore(subscribe, () => history);
}
