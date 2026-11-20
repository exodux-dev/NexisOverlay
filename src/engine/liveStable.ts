// Structural sharing for Live Client snapshots.
//
// The game is polled every 1.5 s and each poll parses into a brand-new GameSnapshot, even though
// usually only the clock and your gold moved. Reusing the previous objects for every part that
// didn't change lets `useMemo` / `React.memo` consumers skip work by identity (e.g. the build plan
// only recomputes when your items or gold change, the team power only when the scoreboard does),
// and an unchanged poll returns the previous snapshot itself (no re-render at all).

import type { GameSnapshot, PlayerState } from "./types";

/** Deep equality for plain JSON-like data (objects / arrays / primitives); identical refs short-circuit. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  // Class instances (Map, Set, Date…) are only equal by identity.
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

function samePlayer(prev: PlayerState | undefined, next: PlayerState): PlayerState {
  if (!prev || prev === next) return next;
  // `champion` is a reference into the static data: compare it by identity (it's large).
  if (prev.champion !== next.champion) return next;
  const { champion: _a, ...p } = prev;
  const { champion: _b, ...n } = next;
  return sameValue(p, n) ? prev : next;
}

function sameList(prev: PlayerState[], next: PlayerState[]): PlayerState[] {
  const out = next.map((p, i) => samePlayer(prev[i], p));
  return out.length === prev.length && out.every((p, i) => p === prev[i]) ? prev : out;
}

/**
 * `next` with every part equal to `prev` replaced by `prev`'s object (players, player lists, the
 * skills record…). Returns `prev` itself when nothing changed at all.
 */
export function stabilizeSnapshot(prev: GameSnapshot | null | undefined, next: GameSnapshot): GameSnapshot {
  if (!prev || prev === next || prev.source !== next.source) return next;
  const me = samePlayer(prev.me, next.me);
  const allies = sameList(prev.allies, next.allies);
  const enemies = sameList(prev.enemies, next.enemies);
  const out: GameSnapshot = { ...next, me, allies, enemies };
  if (next.skills && prev.skills && sameValue(prev.skills, next.skills)) out.skills = prev.skills;
  if (next.ended && prev.ended && sameValue(prev.ended, next.ended)) out.ended = prev.ended;
  const keys = new Set([...Object.keys(prev), ...Object.keys(out)]) as Set<keyof GameSnapshot>;
  for (const k of keys) if (prev[k] !== out[k] && !(Number.isNaN(prev[k]) && Number.isNaN(out[k]))) return out;
  return prev;
}
