// Arena (2v2v2v2, Live Client / LCU gameMode "CHERRY") — OP.GG champion pages + the
// CommunityDragon augment catalogue. No fetching here except through the injected `fetchText` /
// `fetchJson` of `arenaStatsProvider`.
//
// URL scheme (verified Nov 2026, OP.GG patch 16.23):
//   https://op.gg/lol/modes/arena/<slug>/augments   per-champion augments (top 15 per rarity)
//   https://op.gg/lol/modes/arena/<slug>/build      header stats, augments summary, skill order,
//                                                    prism items, boots, core builds
//   https://op.gg/lol/modes/arena/<slug>/items      prism items, core builds, boots, final items
//   https://op.gg/lol/modes/arena                   champion tier list (see tierlists.ts)
//   <slug> = lowercase Data Dragon id, as on ARAM / SR (see opggSlug).
//
// Data shapes:
//   - Augments live in the RSC payload as `"data":{"1":[…],"4":[…],"8":[…]}` keyed by rarity
//     (1 silver, 4 gold, 8 prismatic), rows like
//     {"id":22,"name":"Deft","rareity":1,"image_url":"…","pick_rate":18,"win_rate":56.13,"play":"579","desc":"…"}
//     (rates in percent; "rareity" is OP.GG's spelling; `play` is a string). The Mayhem-style
//     shape {"id":1048,"tier":0,"performance":88.06,"popular":2.88,"name":"…","rarity":8} is
//     accepted too, in case OP.GG switches Arena to it.
//   - Item tables are server-rendered HTML. Each section ("Prism items", "Core builds", "Boots",
//     "Starter items", "Final items") has rows "<items…> <avg place> <1st %|-> <pick %> <n> Games <win %>".
//     The build page's first "Core builds" table actually lists boots (single-item rows).
//   - Header: "Avg. place 3.39 1st place 19.21% Ban rate 2.65% Win rate 52.85% Pick rate 15.02%",
//     tier "2 Tier". In Arena, OP.GG's "win" is a top-4 finish (of 8 teams).
//   - Arena items use their own ids: regular items + 220000 (Infinity Edge 3031 → 223031) and
//     Prismatic items 44xxxx (Reaper's Toll 443090). Copies are mapped back to the regular id.
//   - CommunityDragon `cdragon/arena/en_us.json`: {"augments":[{id, apiName, name, desc, tooltip,
//     rarity: 0 silver | 1 gold | 2 prismatic | 4 special (anvils, voucher, …), iconSmall, iconLarge,
//     dataValues, calculations}]} (~225 entries incl. retired ones).

import type { AugmentRarity, ChampionStats, StaticData, WinStat } from "../types";
import { norm } from "../text";
import { decodeRsc } from "./hexmayhem";
import { OPGG_SITE, flattenHtml, opggSlug, parseOpggChampionPage, type Skill } from "./opgg";

export const ARENA_CDRAGON_URL = "https://raw.communitydragon.org/latest/cdragon/arena/en_us.json";
export const ARENA_TIER_URL = `${OPGG_SITE}/lol/modes/arena`;
export type ArenaPage = "augments" | "build" | "items";

export function arenaChampionUrl(championId: string, page: ArenaPage = "augments"): string {
  return `${OPGG_SITE}/lol/modes/arena/${opggSlug(championId)}/${page}`;
}

// ---------------------------------------------------------------- parsed shape

export interface ArenaRate {
  games: number;
  /** Top-4 rate, 0..1. */
  winRate: number;
  pickRate?: number;
  avgPlace?: number;
  /** Share of 1st places, 0..1. */
  firstRate?: number;
}

export interface ArenaAugmentStat {
  id?: number;
  name: string;
  rarity: AugmentRarity;
  games?: number;
  /** 0..1 */
  winRate?: number;
  /** 0..1 */
  pickRate?: number;
  /** OP.GG tier 0 (best) .. 5, when the page publishes one. */
  tier?: number;
  /** OP.GG "performance" score, when published. */
  performance?: number;
  desc?: string;
  icon?: string;
}

export interface ArenaChampion {
  winRate?: number;
  pickRate?: number;
  banRate?: number;
  avgPlace?: number;
  firstRate?: number;
  /** OP.GG champion tier 0 .. 5. */
  tier?: number;
  /** Estimated sample size (OP.GG shows none). */
  games?: number;
  augments: ArenaAugmentStat[];
  coreBuilds: Array<ArenaRate & { items: number[] }>;
  boots: Array<ArenaRate & { id: number }>;
  prismatic: Array<ArenaRate & { id: number }>;
  items: Array<ArenaRate & { id: number }>;
  starters: Array<ArenaRate & { items: number[] }>;
  skillOrder?: Array<ArenaRate & { order: string }>;
  skillSequence?: Skill[];
}

// ---------------------------------------------------------------- helpers

type Raw = Record<string, unknown>;
const num = (x: unknown): number | undefined => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** Percent → fraction, rounded to kill float noise. */
const frac = (x: unknown): number | undefined => {
  const n = num(x);
  return n === undefined ? undefined : Math.round(n * 100) / 1e4;
};

/** OP.GG augment rarity (1 / 4 / 8, or a word) → ours. */
export function opggAugmentRarity(r: unknown): AugmentRarity {
  if (typeof r === "string") {
    const s = r.toLowerCase();
    if (s.startsWith("prism")) return "prismatic";
    if (s.startsWith("gold")) return "gold";
    if (/^\d+$/.test(s)) return opggAugmentRarity(Number(s));
    return "silver";
  }
  return r === 8 ? "prismatic" : r === 4 ? "gold" : "silver";
}

/** Parse the balanced JSON object starting at `start` (a "{"). */
function objectAt(text: string, start: number): Raw | undefined {
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
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      if (--depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, k + 1)) as unknown;
          return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- augments (RSC JSON)

/** Every augment row in an OP.GG RSC payload (Arena shape or Mayhem-style tier/performance shape). */
export function parseArenaAugments(rsc: string): ArenaAugmentStat[] {
  const out: ArenaAugmentStat[] = [];
  const seen = new Set<string>();
  const re = /\{"id":\d+,"(?:name|tier|rarity|rareity)"/g;
  for (let m: RegExpExecArray | null; (m = re.exec(rsc)); ) {
    const o = objectAt(rsc, m.index);
    if (!o || typeof o.name !== "string" || !o.name.trim()) continue;
    const hasRates = o.win_rate !== undefined || o.play !== undefined;
    const hasTier = o.performance !== undefined || (o.tier !== undefined && o.popular !== undefined);
    const rarityRaw = o.rareity ?? o.rarity;
    if ((!hasRates && !hasTier) || rarityRaw === undefined) continue;
    const name = o.name.trim();
    if (seen.has(norm(name))) continue;
    seen.add(norm(name));
    const games = num(o.play) ?? num(o.games);
    const winRate = frac(o.win_rate);
    const pickRate = frac(o.pick_rate) ?? frac(o.popular);
    const tier = num(o.tier);
    out.push({
      ...(num(o.id) !== undefined ? { id: num(o.id) } : {}),
      name,
      rarity: opggAugmentRarity(rarityRaw),
      ...(games !== undefined ? { games } : {}),
      ...(winRate !== undefined ? { winRate } : {}),
      ...(pickRate !== undefined ? { pickRate } : {}),
      ...(tier !== undefined ? { tier } : {}),
      ...(num(o.performance) !== undefined ? { performance: num(o.performance) } : {}),
      ...(typeof o.desc === "string" && o.desc ? { desc: o.desc } : {}),
      ...(typeof o.image_url === "string" ? { icon: o.image_url } : {}),
    });
    re.lastIndex = m.index + 1;
  }
  return out;
}

// ---------------------------------------------------------------- item tables (HTML text)

const SECTIONS = ["Prism items", "Core builds", "Boots", "Starter items", "Final items"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_RE = new RegExp(
  `\\b(${SECTIONS.join("|")})\\b(?:\\s+(?:${[...SECTIONS, "Synergies"].join("|")}))*\\s+Avg\\. place 1st place Pick rate Win rate`,
  "gi", // OP.GG changes the case of its labels now and then ("Games" → "games")
);
const canonicalSection = (s: string): Section => SECTIONS.find((x) => x.toLowerCase() === s.toLowerCase()) ?? (s as Section);
/** "<avg place> <1st %|-> <pick %> <n> Games <win %>" */
const ROW_RE = /(\d+(?:\.\d+)?)\s+(?:(\d+(?:\.\d+)?)\s*%|-)\s+(\d+(?:\.\d+)?)\s*%\s+([\d,]+)\s*Games\s+(\d+(?:\.\d+)?)\s*%/gi;

function sectionRows(text: string): Array<{ section: Section; items: number[]; rate: ArenaRate }> {
  const heads = [...text.matchAll(SECTION_RE)].map((m) => ({ section: canonicalSection(m[1]), start: m.index! + m[0].length, at: m.index! }));
  const out: Array<{ section: Section; items: number[]; rate: ArenaRate }> = [];
  heads.forEach((h, i) => {
    const body = text.slice(h.start, i + 1 < heads.length ? heads[i + 1].at : undefined);
    let prev = 0;
    for (const m of body.matchAll(ROW_RE)) {
      const pre = body.slice(prev, m.index);
      prev = m.index! + m[0].length;
      const items = [...pre.matchAll(/\{item:(\d+)\}/g)].map((t) => Number(t[1]));
      if (!items.length) continue;
      const firstRate = frac(m[2]);
      out.push({
        section: h.section,
        items,
        rate: {
          avgPlace: Number(m[1]),
          ...(firstRate !== undefined ? { firstRate } : {}),
          pickRate: frac(m[3]),
          games: num(m[4]) ?? 0,
          winRate: frac(m[5]) ?? 0,
        },
      });
    }
  });
  return out;
}

function headerNumber(text: string, label: string): number | undefined {
  const m = new RegExp(`${label}\\s+(\\d+(?:\\.\\d+)?)\\s*(%)?`).exec(text);
  return m ? (m[2] ? frac(m[1]) : Number(m[1])) : undefined;
}

// ---------------------------------------------------------------- page parser

/**
 * Parse an OP.GG Arena champion page (augments / build / items). Returns undefined when the page
 * has no usable stats (404, redirect, layout change).
 */
export function parseArenaChampionPage(html: string): ArenaChampion | undefined {
  const res: ArenaChampion = { augments: [], coreBuilds: [], boots: [], prismatic: [], items: [], starters: [] };
  try {
    const rsc = decodeRsc(html);
    if (rsc) res.augments = parseArenaAugments(rsc);

    const text = flattenHtml(html);
    const head = text.slice(0, Math.max(0, text.search(/Avg\. place 1st place Pick rate Win rate/i)) || text.length);
    res.avgPlace = headerNumber(head, "Avg\\. place");
    res.firstRate = headerNumber(head, "1st place");
    res.banRate = headerNumber(head, "Ban rate");
    res.winRate = headerNumber(head, "Win rate");
    res.pickRate = headerNumber(head, "Pick rate");
    const tier = /\b(\d)\s*Tier\b/.exec(head);
    if (tier) res.tier = Number(tier[1]);

    for (const r of sectionRows(text)) {
      if (r.section === "Prism items") res.prismatic.push({ id: r.items[0], ...r.rate });
      else if (r.section === "Boots" || (r.section === "Core builds" && r.items.length === 1)) res.boots.push({ id: r.items[0], ...r.rate });
      else if (r.section === "Core builds") res.coreBuilds.push({ items: r.items, ...r.rate });
      else if (r.section === "Starter items") res.starters.push({ items: r.items, ...r.rate });
      else if (r.section === "Final items") res.items.push({ id: r.items[0], ...r.rate });
    }
    // The same table can appear twice (build summary + full list): keep the first of each row.
    const dedupe = <T>(rows: T[], key: (r: T) => string) => {
      const seen = new Set<string>();
      return rows.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true)));
    };
    res.boots = dedupe(res.boots, (r) => String(r.id));
    res.prismatic = dedupe(res.prismatic, (r) => String(r.id));
    res.items = dedupe(res.items, (r) => String(r.id));
    res.coreBuilds = dedupe(res.coreBuilds, (r) => r.items.join(","));
    res.starters = dedupe(res.starters, (r) => r.items.join(","));

    // Skill order uses the same table as ARAM / SR.
    const op = parseOpggChampionPage(html);
    if (op?.skillOrder?.length) res.skillOrder = op.skillOrder;
    if (op?.skillSequence) res.skillSequence = op.skillSequence;
  } catch {
    /* fall through: whatever was parsed */
  }
  res.games = estimateGames(res);
  const has = res.augments.length || res.coreBuilds.length || res.boots.length || res.prismatic.length || res.items.length;
  return has ? res : undefined;
}

/** OP.GG shows no total: recover it from the boots table (one pair per game), else the augments. */
function estimateGames(c: ArenaChampion): number | undefined {
  const est = (rows: Array<{ games?: number; pickRate?: number }>) => {
    const r = [...rows].filter((x) => (x.pickRate ?? 0) > 0.05 && (x.games ?? 0) > 0).sort((a, b) => (b.games ?? 0) - (a.games ?? 0))[0];
    return r?.pickRate ? Math.round((r.games ?? 0) / r.pickRate) : undefined;
  };
  return est(c.boots) ?? est(c.augments) ?? est(c.prismatic);
}

/** Combine several parsed pages of the same champion (e.g. augments + build + items). */
export function mergeArenaChampion(...parts: Array<ArenaChampion | undefined>): ArenaChampion | undefined {
  const ps = parts.filter((p): p is ArenaChampion => !!p);
  if (!ps.length) return undefined;
  const longest = <K extends keyof ArenaChampion>(k: K) =>
    ps.map((p) => p[k]).filter((v) => Array.isArray(v) && v.length).sort((a, b) => (b as unknown[]).length - (a as unknown[]).length)[0];
  const first = <K extends keyof ArenaChampion>(k: K) => ps.map((p) => p[k]).find((v) => v !== undefined);
  const merged: ArenaChampion = {
    winRate: first("winRate"),
    pickRate: first("pickRate"),
    banRate: first("banRate"),
    avgPlace: first("avgPlace"),
    firstRate: first("firstRate"),
    tier: first("tier"),
    augments: (longest("augments") as ArenaChampion["augments"]) ?? [],
    coreBuilds: (longest("coreBuilds") as ArenaChampion["coreBuilds"]) ?? [],
    boots: (longest("boots") as ArenaChampion["boots"]) ?? [],
    prismatic: (longest("prismatic") as ArenaChampion["prismatic"]) ?? [],
    items: (longest("items") as ArenaChampion["items"]) ?? [],
    starters: (longest("starters") as ArenaChampion["starters"]) ?? [],
    skillOrder: longest("skillOrder") as ArenaChampion["skillOrder"],
    skillSequence: first("skillSequence"),
  };
  // Re-estimate on the merged tables (boots beat the augments page's per-slot denominators).
  merged.games = estimateGames(merged) ?? first("games");
  return merged;
}

// ---------------------------------------------------------------- augment tiers

/**
 * Tier 0 (best) .. 5 for an augment. Uses the page's own tier when published; otherwise derives
 * one from the augment's top-4 rate vs the champion's (smoothed toward the average, 200 games).
 */
export function deriveAugmentTier(a: ArenaAugmentStat, championWinRate = 0.5): number | undefined {
  if (a.tier !== undefined) return Math.max(0, Math.min(5, Math.round(a.tier)));
  if (a.winRate === undefined || !a.games) return undefined;
  const prior = 200;
  const wr = (a.winRate * a.games + championWinRate * prior) / (a.games + prior);
  const lift = (wr - championWinRate) * 100;
  return lift >= 3 ? 0 : lift >= 1.5 ? 1 : lift >= 0.4 ? 2 : lift >= -0.6 ? 3 : lift >= -2 ? 4 : 5;
}

const lastTiers = new Map<string, Record<string, number>>();
let lastChampion: string | undefined;

/** Remember a champion's Arena augment tiers (done by the stats provider). */
export function rememberArenaAugmentTiers(championId: string, tiers: Record<string, number>) {
  lastTiers.set(championId, tiers);
  lastChampion = championId;
}

/**
 * OP.GG Arena tier (0 best .. 5) of an augment for a champion (default: the champion loaded last),
 * or undefined when unknown.
 */
export function arenaAugmentTier(name: string, championId?: string): number | undefined {
  const tiers = lastTiers.get(championId ?? lastChampion ?? "");
  if (!tiers) return undefined;
  if (tiers[name] !== undefined) return tiers[name];
  const k = norm(name);
  for (const [n, t] of Object.entries(tiers)) if (norm(n) === k) return t;
  return undefined;
}

// ---------------------------------------------------------------- engine conversion

/** Arena copy id → regular item id (223031 → 3031) when the regular item exists; Prismatic ids kept. */
export function arenaItemId(id: number, data: StaticData): number {
  if (id >= 220000 && id < 230000 && data.items.has(id - 220000)) return id - 220000;
  return id;
}

const winStat = (games: number, winRate: number | undefined, pickRate?: number): WinStat => ({
  games,
  wins: Math.round(games * (winRate ?? 0)),
  ...(pickRate !== undefined ? { pickRate } : {}),
});

/** Convert parsed Arena pages into the engine's ChampionStats (mode "arena", source "opgg"). */
export function arenaToChampionStats(parsed: ArenaChampion, data: StaticData): ChampionStats {
  const games = parsed.games ?? 0;
  const champWr = parsed.winRate ?? 0.5;
  const id = (x: number) => arenaItemId(x, data);

  const augments: Record<string, WinStat> = {};
  const augmentTiers: Record<string, number> = {};
  for (const a of parsed.augments) {
    if (a.games !== undefined && a.winRate !== undefined) augments[a.name] = winStat(a.games, a.winRate, a.pickRate);
    const t = deriveAugmentTier(a, champWr);
    if (t !== undefined) augmentTiers[a.name] = t;
  }

  const items: Record<string, WinStat> = {};
  for (const it of [...parsed.items, ...parsed.prismatic]) {
    const k = String(id(it.id));
    if (!items[k]) items[k] = winStat(it.games, it.winRate, it.pickRate);
  }
  if (!parsed.items.length) {
    // No "Final items" table: approximate from the core builds that contain each item.
    for (const b of parsed.coreBuilds)
      for (const raw of b.items) {
        const k = String(id(raw));
        const cur = items[k] ?? { games: 0, wins: 0 };
        items[k] = { games: cur.games + b.games, wins: cur.wins + Math.round(b.games * b.winRate) };
      }
  }

  const boots: Record<string, WinStat> = {};
  for (const b of parsed.boots) boots[String(id(b.id))] = winStat(b.games, b.winRate, b.pickRate);

  const builds = parsed.coreBuilds.map((b) => ({ items: b.items.map(id), ...winStat(b.games, b.winRate, b.pickRate) }));
  const top = [...builds].sort((a, b) => b.games - a.games)[0];

  return {
    ...winStat(games, parsed.winRate, parsed.pickRate),
    items,
    boots,
    builds,
    starters: parsed.starters.map((s) => ({ items: s.items.map(id), ...winStat(s.games, s.winRate, s.pickRate) })),
    bestBuild: top?.items,
    augments,
    ...(Object.keys(augmentTiers).length ? { augmentTiers } : {}),
    skillOrders: parsed.skillOrder?.map((s) => ({ order: s.order, ...winStat(s.games, s.winRate, s.pickRate) })),
    ...(parsed.skillSequence ? { skillSequence: parsed.skillSequence } : {}),
    ...(parsed.avgPlace !== undefined ? { avgPlace: parsed.avgPlace } : {}),
    ...(parsed.firstRate !== undefined ? { firstRate: parsed.firstRate } : {}),
    mode: "arena",
    source: "opgg",
  };
}

// ---------------------------------------------------------------- CommunityDragon catalogue

export interface ArenaCatalogueEntry {
  id: number;
  name: string;
  rarity: AugmentRarity;
  desc: string;
  icon?: string;
}

const CDRAGON_RARITY: Record<number, AugmentRarity> = { 0: "silver", 1: "gold", 2: "prismatic" };
const CDRAGON_ASSETS = "https://raw.communitydragon.org/latest/game/";

/**
 * Parse CommunityDragon's Arena augment list. Special entries (rarity 4: stat anvils, vouchers,
 * augment-slot tokens) and nameless ones are skipped.
 */
export function parseArenaCatalogue(json: unknown): ArenaCatalogueEntry[] {
  const list = json && typeof json === "object" ? (json as { augments?: unknown }).augments : undefined;
  if (!Array.isArray(list)) return [];
  const out: ArenaCatalogueEntry[] = [];
  const seen = new Set<string>();
  for (const a of list as Raw[]) {
    if (!a || typeof a !== "object") continue;
    const rarity = CDRAGON_RARITY[num(a.rarity) ?? -1];
    const name = typeof a.name === "string" ? a.name.trim() : "";
    if (!rarity || !name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    const icon = typeof a.iconLarge === "string" && a.iconLarge ? `${CDRAGON_ASSETS}${a.iconLarge.toLowerCase()}` : undefined;
    out.push({ id: num(a.id) ?? 0, name, rarity, desc: typeof a.desc === "string" ? a.desc : "", ...(icon ? { icon } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- provider

type FetchText = (url: string, cache: string, maxAgeHours?: number) => Promise<string>;
type FetchJson = <T = unknown>(url: string, cache: string, maxAgeHours?: number) => Promise<T>;
type Register = (list: Array<{ name: string; rarity: string; desc?: string }>) => number;

/**
 * Build the Arena champion-stats provider: fetches the augments + build + items pages, registers
 * the Arena augment catalogue (CommunityDragon once, plus every augment seen on OP.GG) through
 * `register` (augments.ts `registerArenaAugments`), and returns ChampionStats.
 */
export function arenaStatsProvider(fetchText: FetchText, fetchJson: FetchJson, register: Register) {
  let catalogue: Promise<void> | undefined;
  const loadCatalogue = (maxAge: number) =>
    (catalogue ??= fetchJson(ARENA_CDRAGON_URL, "cdragon-arena-en_us.json", Math.max(maxAge, 24))
      .then((j) => void register(parseArenaCatalogue(j)))
      .catch(() => {
        catalogue = undefined; // retry next time; OP.GG names still register below
      }));
  return async (championId: string, data: StaticData, maxAgeHours: number): Promise<ChampionStats | undefined> => {
    const get = (page: ArenaPage) =>
      fetchText(arenaChampionUrl(championId, page), `opgg-arena-${championId.toLowerCase()}-${page}.html`, maxAgeHours)
        .then(parseArenaChampionPage)
        .catch(() => undefined);
    const [augs, build, items] = await Promise.all([get("augments"), get("build"), get("items"), loadCatalogue(maxAgeHours)]);
    const merged = mergeArenaChampion(augs, build, items);
    if (!merged) return undefined;
    register(merged.augments.map((a) => ({ name: a.name, rarity: a.rarity, desc: a.desc })));
    const stats = arenaToChampionStats(merged, data);
    if (stats.augmentTiers) rememberArenaAugmentTiers(championId, stats.augmentTiers);
    return stats;
  };
}
