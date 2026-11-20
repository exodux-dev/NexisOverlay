// Pure helpers behind the Home tab: recent champions, recent form, top picks.

import type { MatchRecord } from "./types";
import { compareTierRows, rowsForPosition, type ChampionTierRow } from "./sources/tierlists";

export interface RecentChampion {
  id: string;
  /** epoch ms of the most recent game / pick */
  at: number;
  source: "game" | "pick" | "detected";
}

/**
 * Champions you played or looked at recently, newest first and de-duplicated: games from your
 * history, champions you picked by hand to explore, and the last auto-detected champion.
 * `history` is oldest → newest (as stored); `picks` can be in any order.
 */
export function recentChampions(
  history: MatchRecord[],
  picks: Array<{ id: string; at: number }> = [],
  opts: { lastChampion?: string; limit?: number; known?: (id: string) => boolean } = {},
): RecentChampion[] {
  const best = new Map<string, RecentChampion>();
  const add = (id: string, at: number, source: RecentChampion["source"]) => {
    if (!id || (opts.known && !opts.known(id))) return;
    const t = Number.isFinite(at) ? at : 0;
    const cur = best.get(id);
    if (!cur || t > cur.at) best.set(id, { id, at: t, source });
  };
  for (const m of history) add(m.champion, Date.parse(m.date), "game");
  for (const p of picks) add(p.id, p.at, "pick");
  // The last detected champion has no timestamp: keep it, but behind anything dated.
  if (opts.lastChampion && !best.has(opts.lastChampion)) add(opts.lastChampion, -1, "detected");
  return [...best.values()].sort((a, b) => b.at - a.at).slice(0, opts.limit ?? 10);
}

export interface FormSummary {
  /** Results of the last `n` games, oldest → newest (so the strip reads left → right). */
  results: Array<{ id: string; win: boolean; champion: string; date: string; kda: string }>;
  games: number;
  wins: number;
  losses: number;
  /** 0..1, undefined without games */
  winRate?: number;
  /** (kills + assists) / max(1, deaths) over those games */
  kda?: number;
  avg: { kills: number; deaths: number; assists: number };
  /** Champion played most in those games (ties → most recent). */
  mostPlayed?: { champion: string; games: number; wins: number };
  streak?: { win: boolean; count: number };
}

/** Summary of your last `n` games (history is oldest → newest). */
export function formSummary(history: MatchRecord[], n = 10): FormSummary {
  const recent = [...history].sort((a, b) => a.date.localeCompare(b.date)).slice(-n);
  const games = recent.length;
  const wins = recent.filter((m) => m.result === "Win").length;
  let k = 0;
  let d = 0;
  let a = 0;
  const per = new Map<string, { champion: string; games: number; wins: number; last: number }>();
  recent.forEach((m, i) => {
    k += m.kills;
    d += m.deaths;
    a += m.assists;
    const s = per.get(m.champion) ?? { champion: m.champion, games: 0, wins: 0, last: 0 };
    s.games++;
    if (m.result === "Win") s.wins++;
    s.last = i;
    per.set(m.champion, s);
  });
  const top = [...per.values()].sort((x, y) => y.games - x.games || y.last - x.last)[0];
  let streak: FormSummary["streak"];
  if (games) {
    const win = recent[games - 1].result === "Win";
    let count = 0;
    for (let i = games - 1; i >= 0 && (recent[i].result === "Win") === win; i--) count++;
    streak = { win, count };
  }
  return {
    results: recent.map((m) => ({
      id: m.id,
      win: m.result === "Win",
      champion: m.champion,
      date: m.date,
      kda: `${m.kills}/${m.deaths}/${m.assists}`,
    })),
    games,
    wins,
    losses: games - wins,
    winRate: games ? wins / games : undefined,
    kda: games ? (k + a) / Math.max(1, d) : undefined,
    avg: games ? { kills: k / games, deaths: d / games, assists: a / games } : { kills: 0, deaths: 0, assists: 0 },
    mostPlayed: top ? { champion: top.champion, games: top.games, wins: top.wins } : undefined,
    streak,
  };
}

/**
 * Best champions in a tier list: S tier first (falls back to the next tier down when S is short),
 * best-first, one row per champion. On Summoner's Rift, `position` narrows to that role.
 */
export function topPicks(rows: ChampionTierRow[] | undefined, n = 5, position?: string): ChampionTierRow[] {
  if (!rows?.length) return [];
  const seen = new Set<string>();
  const out: ChampionTierRow[] = [];
  for (const r of [...rowsForPosition(rows, position)].sort(compareTierRows)) {
    if (seen.has(r.championKey)) continue;
    seen.add(r.championKey);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}
