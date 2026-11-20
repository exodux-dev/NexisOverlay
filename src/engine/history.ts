import { normalizeTimeline } from "./timeline";
import type { ChampionStats, MatchRecord, WinStat } from "./types";

export interface ChampionSummary extends WinStat {
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  lastPlayed: string;
}

export function summarizeHistory(history: MatchRecord[]): ChampionSummary[] {
  const by = new Map<string, ChampionSummary>();
  for (const m of history) {
    const s = by.get(m.champion) ?? { champion: m.champion, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, lastPlayed: m.date };
    s.games++;
    if (m.result === "Win") s.wins++;
    s.kills += m.kills;
    s.deaths += m.deaths;
    s.assists += m.assists;
    if (m.date > s.lastPlayed) s.lastPlayed = m.date;
    by.set(m.champion, s);
  }
  return [...by.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

/** Win stats per augment across your history (optionally for a single champion). */
export function augmentStats(history: MatchRecord[], champion?: string): Record<string, WinStat> {
  const out: Record<string, WinStat> = {};
  for (const m of history) {
    if (champion && m.champion !== champion) continue;
    for (const a of m.augments) {
      const s = (out[a] ??= { games: 0, wins: 0 });
      s.games++;
      if (m.result === "Win") s.wins++;
    }
  }
  return out;
}

/** Turn personal history into a ChampionStats-like object (used when no global dataset). */
export function personalChampionStats(history: MatchRecord[], champion: string): ChampionStats | undefined {
  const games = history.filter((m) => m.champion === champion);
  if (!games.length) return undefined;
  const items: Record<string, WinStat> = {};
  for (const m of games)
    for (const id of m.items) {
      const s = (items[String(id)] ??= { games: 0, wins: 0 });
      s.games++;
      if (m.result === "Win") s.wins++;
    }
  return {
    games: games.length,
    wins: games.filter((m) => m.result === "Win").length,
    items,
    augments: augmentStats(history, champion),
  };
}

/** Current win/loss streak, counted back from the most recent game (history is oldest → newest). */
export function currentStreak(history: MatchRecord[]): { result: MatchRecord["result"]; count: number } | undefined {
  const last = history[history.length - 1];
  if (!last) return undefined;
  let count = 0;
  for (let i = history.length - 1; i >= 0 && history[i].result === last.result; i--) count++;
  return { result: last.result, count };
}

/** Rolling win rate over a trailing window (0..1), one value per game (oldest → newest). */
export function rollingWinRate(history: MatchRecord[], window = 10): number[] {
  const out: number[] = [];
  let wins = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].result === "Win") wins++;
    if (i >= window && history[i - window].result === "Win") wins--;
    out.push(wins / Math.min(i + 1, window));
  }
  return out;
}

/** Win stats per item id across your history (optionally for a single champion). */
export function itemStats(history: MatchRecord[], champion?: string): Record<string, WinStat> {
  const out: Record<string, WinStat> = {};
  for (const m of history) {
    if (champion && m.champion !== champion) continue;
    for (const id of new Set(m.items)) {
      const s = (out[String(id)] ??= { games: 0, wins: 0 });
      s.games++;
      if (m.result === "Win") s.wins++;
    }
  }
  return out;
}

export interface HistoryImport {
  records: MatchRecord[];
  /** Entries that weren't recognisable match records. */
  invalid: number;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/**
 * Validate + normalise an imported history file. Accepts a bare array (our export format)
 * or `{ history: [...] }` / `{ records: [...] }`. Throws if the file isn't a history at all.
 */
/** Matches kept in history.json. */
export const HISTORY_MAX = 500;
/** Only the most recent matches keep their game timeline (a few KB each) in history.json. */
export const HISTORY_TIMELINES = 100;

/** What gets saved: the last `HISTORY_MAX` matches, timelines only on the last `HISTORY_TIMELINES`. */
export function trimHistory(history: MatchRecord[]): MatchRecord[] {
  const kept = history.slice(-HISTORY_MAX);
  const cut = kept.length - HISTORY_TIMELINES;
  return kept.map((m, i) => {
    if (i >= cut || !m.timeline) return m;
    const { timeline: _drop, ...rest } = m;
    return rest;
  });
}

/** A stored record with its timeline validated (dropped when malformed), so views can trust it. */
export function withValidTimeline(m: MatchRecord): MatchRecord {
  if (!m || typeof m !== "object" || m.timeline === undefined) return m;
  const timeline = normalizeTimeline(m.timeline);
  if (timeline) return { ...m, timeline };
  const { timeline: _drop, ...rest } = m;
  return rest;
}

export function parseHistoryImport(raw: unknown): HistoryImport {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { history?: unknown }).history)
      ? (raw as { history: unknown[] }).history
      : raw && typeof raw === "object" && Array.isArray((raw as { records?: unknown }).records)
        ? (raw as { records: unknown[] }).records
        : undefined;
  if (!list) throw new Error("This file isn't a Nexis match history export.");
  const records: MatchRecord[] = [];
  let invalid = 0;
  for (const r of list) {
    if (!r || typeof r !== "object") {
      invalid++;
      continue;
    }
    const o = r as Record<string, unknown>;
    const champion = typeof o.champion === "string" ? o.champion.trim() : "";
    const result = o.result === "Win" || o.result === "Lose" ? o.result : undefined;
    const date = typeof o.date === "string" && !Number.isNaN(Date.parse(o.date)) ? new Date(o.date).toISOString() : undefined;
    const kills = num(o.kills);
    const deaths = num(o.deaths);
    const assists = num(o.assists);
    if (!champion || !result || !date || kills === undefined || deaths === undefined || assists === undefined) {
      invalid++;
      continue;
    }
    const timeline = normalizeTimeline(o.timeline);
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
    records.push({
      id: typeof o.id === "string" && o.id ? o.id : `${Date.parse(date)}-${champion}`,
      date,
      champion,
      result,
      kills: Math.round(kills),
      deaths: Math.round(deaths),
      assists: Math.round(assists),
      durationSec: Math.round(num(o.durationSec) ?? 0),
      items: Array.isArray(o.items) ? o.items.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0) : [],
      augments: strings(o.augments),
      enemies: strings(o.enemies),
      gameMode: typeof o.gameMode === "string" ? o.gameMode : "",
      ...(timeline ? { timeline } : {}),
    });
  }
  return { records, invalid };
}
