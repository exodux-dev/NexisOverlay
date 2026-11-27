// Compact live stats (the Minimal HUD): you vs the average of the other players, from the
// scoreboard only (what Tab shows) — CS/min, gold/min (from item value), kill participation,
// KDA and level.

import { inventoryValue } from "./intel";
import type { GameSnapshot, PlayerState, StaticData } from "./types";

export interface StatRow {
  key: "csm" | "gpm" | "kp" | "kda" | "lvl";
  label: string;
  mine: number;
  avg: number;
  /** Formatted values. */
  mineText: string;
  avgText: string;
  /** Ahead (green), behind (red) or about even (neutral). */
  tone: "up" | "down" | "even";
}

/** CS/min means something only after minions have been out a while. */
const MIN_TIME = 120;

const kda = (p: PlayerState) => (p.kills + p.assists) / Math.max(1, p.deaths);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function tone(mine: number, other: number, evenWithin: number): StatRow["tone"] {
  if (Math.abs(mine - other) <= evenWithin) return "even";
  return mine > other ? "up" : "down";
}

/** Your row-by-row stats against the other players' average; [] before there's anything to show. */
export function liveStats(game: GameSnapshot | null | undefined, data?: StaticData | null): StatRow[] {
  if (!game || game.source !== "live" || game.loading) return [];
  const me = game.me;
  const others = [...game.allies, ...game.enemies];
  if (!others.length) return [];
  const rows: StatRow[] = [];
  const t = game.gameTime ?? 0;

  if (t >= MIN_TIME && typeof me.creepScore === "number") {
    const per = (p: PlayerState) => (p.creepScore ?? 0) / (t / 60);
    const withCs = others.filter((p) => typeof p.creepScore === "number");
    if (withCs.length) {
      const m = per(me), a = avg(withCs.map(per));
      rows.push({ key: "csm", label: "CSM", mine: m, avg: a, mineText: m.toFixed(1), avgText: a.toFixed(1), tone: tone(m, a, 0.3) });
    }
  }

  // GPM, estimated the way the scoreboard allows: the gold value of each player's items per
  // minute (Riot's live data has no "gold earned"). Same basis for everyone, so it compares fairly.
  if (data && t >= MIN_TIME) {
    const per = (p: PlayerState) => inventoryValue(p, data) / (t / 60);
    const m = per(me), a = avg(others.map(per));
    if (m + a > 0) rows.push({ key: "gpm", label: "GPM", mine: m, avg: a, mineText: String(Math.round(m)), avgText: String(Math.round(a)), tone: tone(m, a, 15) });
  }

  const teamKills = (team: PlayerState[]) => team.reduce((s, p) => s + p.kills, 0);
  const myTeam = [me, ...game.allies];
  const tk = teamKills(myTeam);
  if (tk > 0) {
    const kp = (p: PlayerState, kills: number) => (kills > 0 ? (p.kills + p.assists) / kills : 0);
    const ek = teamKills(game.enemies);
    const m = kp(me, tk);
    const a = avg([...game.allies.map((p) => kp(p, tk)), ...game.enemies.map((p) => kp(p, ek))]);
    rows.push({ key: "kp", label: "KP", mine: m, avg: a, mineText: `${Math.round(m * 100)}%`, avgText: `${Math.round(a * 100)}%`, tone: tone(m, a, 0.05) });
  }

  {
    const m = kda(me), a = avg(others.map(kda));
    rows.push({ key: "kda", label: "KDA", mine: m, avg: a, mineText: m.toFixed(1), avgText: a.toFixed(1), tone: tone(m, a, 0.2) });
  }

  {
    const m = me.level, a = avg(others.map((p) => p.level));
    rows.push({ key: "lvl", label: "LVL", mine: m, avg: a, mineText: String(m), avgText: String(Math.round(a)), tone: tone(m, a, 0.5) });
  }

  return rows;
}
