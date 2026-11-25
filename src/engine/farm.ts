// Farming numbers from your own scoreboard (creep score + game time): CS per minute live on the
// HUD and per game / per champion in History. Pure and passive — no prompts, nothing hidden.

import type { GameModeKind } from "./mode";
import type { MatchRecord } from "./types";

/** CS/min only means something once minions have been on the map a while. */
export const FARM_MIN_TIME = 120;

/**
 * A good CS/min for your role on Summoner's Rift (lanes ~7, jungle ~6). Supports and modes where
 * farming isn't the point (ARAM, Mayhem, Arena) get no target, so the number is shown plain.
 */
export function csTarget(
  mode: GameModeKind,
  position?: string,
): number | undefined {
  if (mode !== "sr") return undefined;
  const p = (position ?? "").toUpperCase();
  if (p === "UTILITY") return undefined;
  if (p === "JUNGLE") return 6;
  return 7;
}

export type FarmTone = "good" | "ok" | "low";

/** good: at / above target · ok: within 1.5 of it · low: further behind. */
export function farmTone(
  perMin: number,
  target: number | undefined,
): FarmTone | undefined {
  if (target === undefined) return undefined;
  if (perMin >= target) return "good";
  return perMin >= target - 1.5 ? "ok" : "low";
}

export interface FarmPace {
  cs: number;
  /** CS per minute of game time, 1 decimal. */
  perMin: number;
  target?: number;
  tone?: FarmTone;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Live farming line, or undefined (no creep score reported, too early, Arena). */
export function farmPace(o: {
  cs?: number;
  gameTime?: number;
  mode: GameModeKind;
  position?: string;
}): FarmPace | undefined {
  if (o.mode === "arena" || typeof o.cs !== "number" || !Number.isFinite(o.cs))
    return undefined;
  const t = o.gameTime ?? 0;
  if (t < FARM_MIN_TIME) return undefined;
  const perMin = round1(o.cs / (t / 60));
  const target = csTarget(o.mode, o.position);
  return {
    cs: o.cs,
    perMin,
    ...(target !== undefined ? { target, tone: farmTone(perMin, target) } : {}),
  };
}

/** A recorded game's final CS (from its timeline), when it has one. */
export function gameCs(m: MatchRecord): number | undefined {
  const s = m.timeline?.samples;
  return s?.length ? s[s.length - 1]!.cs : undefined;
}

/** CS per minute for a recorded game (last timeline sample: its CS over its game time), when known. */
export function gameCsPerMin(m: MatchRecord): number | undefined {
  const last = m.timeline?.samples.at(-1);
  if (!last || last.t < FARM_MIN_TIME) return undefined;
  return round1(last.cs / (last.t / 60));
}

/** CS at 10:00 for a recorded game (the last sample at or before 10:00, if it's within 30 s of it). */
export function csAt10(m: MatchRecord): number | undefined {
  const s = m.timeline?.samples;
  if (!s?.length) return undefined;
  let best: { t: number; cs: number } | undefined;
  for (const x of s) if (x.t <= 600) best = x;
  return best && best.t >= 570 ? best.cs : undefined;
}

/** Average CS/min over the games that have it (undefined when none do). */
export function avgCsPerMin(
  games: MatchRecord[],
): { perMin: number; games: number } | undefined {
  let sum = 0;
  let n = 0;
  for (const m of games) {
    const v = gameCsPerMin(m);
    if (v === undefined) continue;
    sum += v;
    n++;
  }
  return n ? { perMin: round1(sum / n), games: n } : undefined;
}
