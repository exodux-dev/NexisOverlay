// Champion tier lists per game mode, parsed from public stats sites (no fetching here).
//
//   ARAM: Mayhem     → https://hexmayhem.com/champions
//       Next.js RSC payload: `"initialRows":[{id, alias, title, tier:"S".."D", rank, wr, pr, n, ...}]`
//       (wr / pr in percent, n = games, id = numeric champion key, alias = Data Dragon id).
//   ARAM             → https://op.gg/lol/modes/aram
//       RSC payload: `"champions":[{key, name, id, win_rate, pick_rate, tier: 1..5, rank}]`
//       (rates are fractions, key = lowercase Data Dragon id, id = numeric champion key).
//   Arena            → https://op.gg/lol/modes/arena   (same RSC shape as ARAM; "win" = top-4 finish)
//   Summoner's Rift  → https://op.gg/lol/champions            (every role in one page, ~260 rows)
//                      https://op.gg/lol/champions?position=top|jungle|mid|adc|support (one role)
//       RSC payload: `"data":[{key, name, positionName, positionWinRate, positionPickRate,
//       positionBanRate, positionTier: 0..5, positionRank}]` (rates in percent, tier 0 = "OP").
//
// Verified Nov 2026 (op.gg patch 16.23, emerald+ global; hexmayhem patch 16.22). Every parser is
// defensive: if a site changes its layout the result is simply an empty list.

import type { StaticData } from "../types";
import { norm } from "../text";
import { HEXMAYHEM, decodeRsc } from "./hexmayhem";
import { OPGG_SITE, opggPosition, type OpggPosition } from "./opgg";

export type TierMode = "mayhem" | "aram" | "sr" | "arena";
export type Tier = "S" | "A" | "B" | "C" | "D";
export const TIERS: Tier[] = ["S", "A", "B", "C", "D"];
export type TierPosition = OpggPosition;
export const TIER_POSITIONS: TierPosition[] = ["top", "jungle", "mid", "adc", "support"];
export const POSITION_LABEL: Record<TierPosition, string> = { top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" };

export interface ChampionTierRow {
  /** Data Dragon champion id (e.g. "MonkeyKing"); the site's own key if it can't be resolved. */
  championKey: string;
  tier: Tier;
  /** 0..1 */
  winRate: number;
  /** 0..1 */
  pickRate?: number;
  /** 0..1 */
  banRate?: number;
  games?: number;
  /** Summoner's Rift role this row is for. */
  position?: TierPosition;
  /** The site's own rank (1 = best) within the list / role. */
  rank?: number;
}

/** Tier list page for a mode. On Summoner's Rift, no position = all roles in one page. */
export function tierListUrl(mode: TierMode, position?: string): string {
  if (mode === "mayhem") return `${HEXMAYHEM}/champions`;
  if (mode === "aram") return `${OPGG_SITE}/lol/modes/aram`;
  if (mode === "arena") return `${OPGG_SITE}/lol/modes/arena`;
  const pos = opggPosition(position);
  return `${OPGG_SITE}/lol/champions${pos ? `?position=${pos}` : ""}`;
}

/** OP.GG tier number (0 = "OP", 1 .. 5) → letter. */
export function opggTier(t: unknown): Tier | undefined {
  if (typeof t === "string" && /^op$/i.test(t)) return "S";
  const n = typeof t === "number" ? t : typeof t === "string" ? Number(t) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return n <= 1 ? "S" : n === 2 ? "A" : n === 3 ? "B" : n === 4 ? "C" : "D";
}

/** Letter tiers from other sites ("S+", "A-", "OP", "F") → our five tiers. */
export function letterTier(t: unknown): Tier | undefined {
  if (typeof t === "number") return opggTier(t);
  if (typeof t !== "string") return undefined;
  const s = t.trim().toUpperCase();
  if (s === "OP" || s.startsWith("S")) return "S";
  if (/^[ABCD]/.test(s)) return s[0] as Tier;
  if (/^[EF]/.test(s)) return "D";
  if (/^\d$/.test(s)) return opggTier(Number(s));
  return undefined;
}

const lookupCache = new WeakMap<StaticData, Map<string, string>>();

/**
 * Resolve a site's champion key to the Data Dragon id: numeric key (266 / "266"), Data Dragon id
 * in any case ("monkeyking", "MonkeyKing") or display name ("Kog'Maw", "Wukong").
 */
export function resolveChampionId(key: string | number | undefined, data: StaticData): string | undefined {
  if (key === undefined || key === null || key === "") return undefined;
  if (typeof key === "number" || /^\d+$/.test(key)) return data.championsByKey.get(Number(key))?.id;
  if (data.championsById.has(key)) return key;
  let map = lookupCache.get(data);
  if (!map) {
    map = new Map();
    for (const c of data.champions) {
      map.set(norm(c.id), c.id);
      if (!map.has(norm(c.name))) map.set(norm(c.name), c.id);
    }
    lookupCache.set(data, map);
  }
  return map.get(norm(key)) ?? data.championsByName.get(norm(key))?.id;
}

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
/** Percent (51.7) → fraction, rounded to kill float noise. */
const frac = (x: unknown): number | undefined => {
  const n = num(x);
  return n === undefined ? undefined : Math.round(n * 100) / 1e4;
};
const round4 = (x: unknown): number | undefined => {
  const n = num(x);
  return n === undefined ? undefined : Math.round(n * 1e4) / 1e4;
};

/** Every JSON array that follows `"<key>":` in the text (several components may embed one). */
function arraysAt(text: string, key: string): unknown[][] {
  const out: unknown[][] = [];
  const marker = `"${key}":[`;
  for (let i = text.indexOf(marker); i >= 0; i = text.indexOf(marker, i + marker.length)) {
    const arr = parseArrayAt(text, i + marker.length - 1);
    if (arr) out.push(arr);
  }
  return out;
}

function parseArrayAt(text: string, start: number): unknown[] | undefined {
  let depth = 0;
  let inStr = false;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (c === "\\") k++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      if (--depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, k + 1)) as unknown;
          return Array.isArray(v) ? v : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => !!x && typeof x === "object" && !Array.isArray(x);

/** The array (among candidates) with the most rows passing `ok`. */
function best(arrays: unknown[][], ok: (r: Raw) => boolean): Raw[] {
  let top: Raw[] = [];
  for (const a of arrays) {
    const rows = a.filter((r): r is Raw => isObj(r) && ok(r));
    if (rows.length > top.length) top = rows;
  }
  return top;
}

function parseHexMayhem(rsc: string, data: StaticData): ChampionTierRow[] {
  const rows = best(arraysAt(rsc, "initialRows"), (r) => num(r.wr) !== undefined && r.tier !== undefined && (r.alias !== undefined || r.id !== undefined));
  const out: ChampionTierRow[] = [];
  for (const r of rows) {
    const tier = letterTier(r.tier);
    const winRate = frac(r.wr);
    const fallback = typeof r.alias === "string" ? r.alias : typeof r.title === "string" ? r.title : undefined;
    const championKey =
      resolveChampionId(num(r.id), data) ?? resolveChampionId(fallback, data) ?? resolveChampionId(r.title as string, data) ?? fallback;
    if (!tier || winRate === undefined || !championKey) continue;
    out.push({
      championKey,
      tier,
      winRate,
      ...(frac(r.pr) !== undefined ? { pickRate: frac(r.pr) } : {}),
      ...(num(r.n) !== undefined ? { games: num(r.n) } : {}),
      ...(num(r.rank) !== undefined ? { rank: num(r.rank) } : {}),
    });
  }
  return out;
}

function parseOpggAram(rsc: string, data: StaticData): ChampionTierRow[] {
  const rows = best(arraysAt(rsc, "champions"), (r) => num(r.win_rate) !== undefined && r.tier !== undefined && typeof r.key === "string");
  const out: ChampionTierRow[] = [];
  for (const r of rows) {
    const tier = opggTier(r.tier);
    const championKey = resolveChampionId(num(r.id), data) ?? resolveChampionId(r.key as string, data) ?? resolveChampionId(r.name as string, data) ?? (r.key as string);
    const winRate = round4(r.win_rate);
    if (!tier || winRate === undefined) continue;
    out.push({
      championKey,
      tier,
      winRate,
      ...(round4(r.pick_rate) !== undefined ? { pickRate: round4(r.pick_rate) } : {}),
      ...(round4(r.ban_rate) !== undefined ? { banRate: round4(r.ban_rate) } : {}),
      ...(num(r.play) !== undefined ? { games: num(r.play) } : {}),
      ...(num(r.rank) !== undefined ? { rank: num(r.rank) } : {}),
    });
  }
  return out;
}

function parseOpggRanked(rsc: string, data: StaticData): ChampionTierRow[] {
  const rows = best(arraysAt(rsc, "data"), (r) => num(r.positionWinRate) !== undefined && typeof r.positionName === "string" && typeof r.key === "string");
  const out: ChampionTierRow[] = [];
  for (const r of rows) {
    const td = isObj(r.positionTierData) ? r.positionTierData : {};
    const tier = opggTier(r.positionTier ?? td.tier);
    const championKey = resolveChampionId(r.key as string, data) ?? resolveChampionId(r.name as string, data) ?? (r.key as string);
    const winRate = frac(r.positionWinRate);
    if (!tier || winRate === undefined) continue;
    const rank = num(r.positionRank) ?? num(td.rank);
    out.push({
      championKey,
      tier,
      winRate,
      position: opggPosition(r.positionName as string),
      ...(frac(r.positionPickRate) !== undefined ? { pickRate: frac(r.positionPickRate) } : {}),
      ...(frac(r.positionBanRate) !== undefined ? { banRate: frac(r.positionBanRate) } : {}),
      ...(num(r.play) !== undefined ? { games: num(r.play) } : {}),
      ...(rank !== undefined ? { rank } : {}),
    });
  }
  return out;
}

/** Parse a mode's tier list page (see `tierListUrl`). Returns [] when the page has no tier data. */
export function parseTierList(mode: TierMode, html: string, data: StaticData): ChampionTierRow[] {
  try {
    const rsc = decodeRsc(html);
    if (!rsc) return [];
    const rows = mode === "mayhem" ? parseHexMayhem(rsc, data) : mode === "aram" || mode === "arena" ? parseOpggAram(rsc, data) : parseOpggRanked(rsc, data);
    // One row per champion (per role on SR).
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = `${r.championKey}|${r.position ?? ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    return [];
  }
}

/** Patch the page's numbers are for ("16.23"), when it says. */
export function tierListPatch(html: string): string | undefined {
  const rsc = decodeRsc(html);
  return /"patch":"(\d+\.\d+)/.exec(rsc)?.[1] ?? /Patch[^0-9]{0,40}(\d+\.\d+)/.exec(rsc)?.[1];
}

export const TIER_RANK: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 };

/** Best-first ordering: tier, then the site's rank, then win rate. */
export function compareTierRows(a: ChampionTierRow, b: ChampionTierRow): number {
  return TIER_RANK[a.tier] - TIER_RANK[b.tier] || (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.winRate - a.winRate;
}

/** Rows for one Summoner's Rift role (or all rows when no role / not SR). */
export function rowsForPosition(rows: ChampionTierRow[], position?: string): ChampionTierRow[] {
  const pos = opggPosition(position);
  if (!pos || !rows.some((r) => r.position)) return rows;
  return rows.filter((r) => r.position === pos);
}

/** The row for a champion (in a role, if given; else that champion's most-played role). */
export function findTierRow(rows: ChampionTierRow[] | undefined, championId: string | undefined, position?: string): ChampionTierRow | undefined {
  if (!rows || !championId) return undefined;
  const mine = rows.filter((r) => r.championKey === championId);
  const pos = opggPosition(position);
  if (pos) {
    const exact = mine.find((r) => r.position === pos);
    if (exact) return exact;
  }
  return [...mine].sort((a, b) => (b.pickRate ?? 0) - (a.pickRate ?? 0))[0];
}
