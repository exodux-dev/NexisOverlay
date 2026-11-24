// OP.GG (op.gg) — public champion statistics for Summoner's Rift (ranked/normal) and regular ARAM.
//
// OP.GG is a Next.js app, like HexMayhem, but its champion pages are server components: most
// tables (summoner spells, skill order, starters, boots, core builds, counters) arrive as
// server-rendered HTML whose RSC twin is split into many lazy `$L..` references. So we read:
//   - the rune pages from the RSC payload — a clean embedded JSON array (`"rune_pages":[...]`),
//     plus the champion's position list;
//   - everything else from the rendered tables, located by their (hidden, accessibility)
//     `<caption>` names, e.g. "Boots Table", "Builds Table", "SummonerSpells Table".
// Every extractor is optional: if the site changes, the affected field is simply missing and the
// app falls back to its other data sources. Riot ids are used throughout (item / perk / spell).
//
// URL scheme (verified Nov 2026, patch 16.23):
//   Summoner's Rift: https://op.gg/lol/champions/<slug>/<page>[/<position>]
//     page ∈ build | items | runes | skills | counters; position ∈ top | jungle | mid | adc | support
//     (no position = the champion's main role; unknown positions such as "bottom" redirect to it).
//   ARAM:            https://op.gg/lol/modes/aram/<slug>/<page>      (page ∈ build | items | runes | skills)
//   <slug> is the lowercase Data Dragon id: monkeyking (not wukong), nunu, kogmaw, ksante, belveth.
// The build page carries spells, skill order (+ level sequence), starters, boots, core builds, the
// top 2 rune pages, header win/pick/ban rate, tier and (SR main role) counters. The items page adds
// per-item stats and longer boots/starter lists; the runes page has more rune pages; the skills
// page has more skill orders. `mergeOpggChampion` combines several parsed pages.

import type { ChampionStats, StaticData, WinStat } from "../types";
import { decodeRsc, grabJson } from "./hexmayhem";

export const OPGG_SITE = "https://op.gg";

/** "aram-mayhem" is used for rune pages only: its build tables publish no games / win rates. */
export type OpggMode = "ranked" | "aram" | "aram-mayhem";
export type OpggPosition = "top" | "jungle" | "mid" | "adc" | "support";
export type OpggPage = "build" | "items" | "runes" | "skills" | "counters";

const POSITION_ALIASES: Record<string, OpggPosition> = {
  top: "top",
  jungle: "jungle",
  jg: "jungle",
  mid: "mid",
  middle: "mid",
  adc: "adc",
  bot: "adc",
  bottom: "adc",
  support: "support",
  sup: "support",
  utility: "support",
};

/** Normalise a role name ("MIDDLE", "bottom", "UTILITY", ...) to OP.GG's URL segment. */
export function opggPosition(p?: string): OpggPosition | undefined {
  return p ? POSITION_ALIASES[p.toLowerCase()] : undefined;
}

/** OP.GG champion slug: the lowercase Data Dragon id (MonkeyKing → monkeyking). */
export function opggSlug(championId: string): string {
  return championId.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Champion page URL. `position` only applies to Summoner's Rift. */
export function opggChampionUrl(mode: OpggMode, championId: string, position?: string, page: OpggPage = "build"): string {
  const slug = opggSlug(championId);
  if (mode !== "ranked") return `${OPGG_SITE}/lol/modes/${mode}/${slug}/${page}`;
  const pos = opggPosition(position);
  return `${OPGG_SITE}/lol/champions/${slug}/${page}${pos ? `/${pos}` : ""}`;
}

// ---------------------------------------------------------------- parsed shape

/** One table row: rates are fractions (0..1). ARAM spell rows publish no pick rate. */
export interface OpggRate {
  games: number;
  winRate: number;
  pickRate?: number;
}

export type Skill = "Q" | "W" | "E" | "R";

export interface OpggChampion {
  /** Estimated sample size (OP.GG shows no total; derived from row games ÷ pick rate). */
  games?: number;
  winRate?: number;
  pickRate?: number;
  banRate?: number;
  /** OP.GG tier, 0 ("OP") .. 5; lower is better. */
  tier?: number;
  position?: OpggPosition;
  positions?: string[];
  coreBuilds: Array<OpggRate & { items: number[] }>;
  boots: Array<OpggRate & { id: number }>;
  starters: Array<OpggRate & { items: number[] }>;
  /** Per-item stats (items page only). */
  items?: Array<OpggRate & { id: number }>;
  runes: Array<OpggRate & { primary: number; sub: number; perks: number[]; shards?: number[] }>;
  /** `ids` are Riot summoner spell keys (Flash = 4); 0 when the icon is unknown — see `keys`. */
  spells: Array<OpggRate & { ids: [number, number]; keys: [string, string] }>;
  skillOrder?: Array<OpggRate & { order: string }>;
  skillSequence?: Skill[];
  /** Matchups shown on the SR build page: our win rate vs that champion. */
  counters?: Array<{ championKey: string; games: number; winRate: number; kind: "weak" | "strong" }>;
}

// ---------------------------------------------------------------- html helpers

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };
const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (e, k: string) => {
    const lk = k.toLowerCase();
    if (ENTITIES[lk]) return ENTITIES[lk];
    if (lk.startsWith("#x")) return String.fromCodePoint(parseInt(lk.slice(2), 16));
    if (lk.startsWith("#")) return String.fromCodePoint(parseInt(lk.slice(1), 10));
    return e;
  });

/**
 * Flatten an HTML fragment to text; meta images become tokens like `{item:3020}`,
 * `{spell:SummonerFlash}`, `{champion:Ziggs}`, `{perk:8112}`.
 */
export function flattenHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<img\b[^>]*?\bsrc="[^"]*?\/(item|spell|champion|perk|perkStyle|perkShard)\/([^/."?]+)\.png[^"]*"[^>]*>/gi, " {$1:$2} ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

const toNum = (s: string | undefined) => (s === undefined ? undefined : Number(s.replace(/,/g, "")));
/** "51.68" → 0.5168 (rounded to kill float noise). */
const pct = (s: string | undefined) => (s === undefined ? undefined : Math.round(Number(s) * 1e4) / 1e6);

/** Stats at the end of a row: "<pick>% <games> Games <win>%" (pick may be "-" on ARAM). */
const ROW_STATS = /(?:(\d+(?:\.\d+)?)\s*%|-)\s+([\d,]+)\s*Games(?:\s+(\d+(?:\.\d+)?)\s*%)?/i;

interface Row {
  tokens: Array<{ kind: string; id: string }>;
  pre: string; // text before the stats
  rate: OpggRate;
}

function parseRow(text: string): Row | undefined {
  const m = ROW_STATS.exec(text);
  if (!m || m[3] === undefined) return undefined; // header rows, "Nth item" tables without a win rate
  const pre = text.slice(0, m.index);
  const tokens = [...pre.matchAll(/\{(\w+):([^}]+)\}/g)].map((t) => ({ kind: t[1], id: t[2] }));
  const pickRate = pct(m[1]);
  return { tokens, pre, rate: { games: toNum(m[2]) ?? 0, winRate: pct(m[3]) ?? 0, ...(pickRate !== undefined ? { pickRate } : {}) } };
}

interface Table {
  caption: string;
  heading: string; // visible text just before the table (items page section titles)
  rows: Row[];
}

/** All `<table>`s that have a `<caption>`, with their parsed data rows. */
function tables(html: string): Table[] {
  const out: Table[] = [];
  const re = /<caption>([\s\S]*?)<\/caption>/g;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    const end = html.indexOf("</table>", m.index);
    const body = html.slice(m.index + m[0].length, end < 0 ? undefined : end);
    const prevEnd = html.lastIndexOf("</table>", m.index);
    const before = flattenHtml(html.slice(Math.max(prevEnd, m.index - 4000, 0), m.index).replace(/<table\b[^>]*>$/, ""));
    const rows = body
      .split(/<tr\b/)
      .map((r) => parseRow(flattenHtml(`<tr${r}`)))
      .filter((r): r is Row => !!r);
    out.push({ caption: flattenHtml(m[1]), heading: before.slice(-60), rows });
  }
  return out;
}

const ids = (row: Row, kind: string) => row.tokens.filter((t) => t.kind === kind).map((t) => Number(t.id)).filter(Number.isFinite);

/** Riot summoner spell keys by Data Dragon image name. */
export const SPELL_IDS: Record<string, number> = {
  SummonerBoost: 1,
  SummonerExhaust: 3,
  SummonerFlash: 4,
  SummonerHaste: 6,
  SummonerHeal: 7,
  SummonerSmite: 11,
  SummonerTeleport: 12,
  SummonerMana: 13,
  SummonerDot: 14,
  SummonerBarrier: 21,
  SummonerSnowball: 32,
  SummonerSnowURFSnowball_Mark: 39,
};

// ---------------------------------------------------------------- runes (RSC JSON)

interface RawRuneRef {
  id?: number;
  isActive?: boolean;
}
interface RawRuneBuild {
  id?: number;
  play?: number;
  win?: number;
  pick_rate?: number;
  win_rate?: number;
  primary_page_id?: number;
  secondary_page_id?: number;
  primary_rune_ids?: number[];
  secondary_rune_ids?: number[];
  stat_mod_ids?: number[];
  primary_perk_style?: { id?: number };
  perk_sub_style?: { id?: number };
  main_runes?: RawRuneRef[][];
  sub_runes?: RawRuneRef[][];
  shards?: RawRuneRef[][];
  importClientData?: { primaryStyleId?: number; subStyleId?: number; selectedPerkIds?: number[] };
}
interface RawRunePage extends RawRuneBuild {
  builds?: RawRuneBuild[];
}

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const numList = (x: unknown): number[] | undefined =>
  Array.isArray(x) && x.length && x.every((v) => typeof v === "number") ? (x as number[]) : undefined;
const active = (rows?: RawRuneRef[][]) =>
  (rows ?? []).flatMap((r) => (Array.isArray(r) ? r : [])).filter((r) => r?.isActive && typeof r.id === "number").map((r) => r.id as number);

/** Perks / shards of one rune build, from whichever representation the page uses. */
function runeSelection(b: RawRuneBuild): { primary?: number; sub?: number; perks: number[]; shards: number[] } {
  const primary = num(b.primary_page_id) ?? num(b.primary_perk_style?.id) ?? num(b.importClientData?.primaryStyleId);
  const sub = num(b.secondary_page_id) ?? num(b.perk_sub_style?.id) ?? num(b.importClientData?.subStyleId);
  const sel = numList(b.importClientData?.selectedPerkIds);
  const shards = numList(b.stat_mod_ids) ?? (active(b.shards).length === 3 ? active(b.shards) : sel?.slice(6)) ?? [];
  const p = numList(b.primary_rune_ids);
  const s = numList(b.secondary_rune_ids);
  if (p && s) return { primary, sub, perks: [...p, ...s], shards };
  // The rune grid lists picks in slot order; the import blob is the fallback.
  const grid = [...active(b.main_runes), ...active(b.sub_runes)];
  if (grid.length >= 6) return { primary, sub, perks: grid, shards };
  return { primary, sub, perks: sel?.slice(0, 6) ?? [], shards };
}

function parseRunes(rsc: string): OpggChampion["runes"] {
  const pages = grabJson<RawRunePage[]>(rsc, /"rune_pages":(?=\[)/);
  if (!Array.isArray(pages)) return [];
  const out: OpggChampion["runes"] = [];
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const best = [...(page.builds ?? [])].sort((a, b) => (num(b.play) ?? 0) - (num(a.play) ?? 0))[0];
    // Prefer the most-played concrete page; fall back to the group's own selection.
    let sel = best ? runeSelection(best) : undefined;
    if (!sel || sel.perks.length < 6) sel = runeSelection(page);
    // The concrete build may omit its shards while the group lists them.
    else if (!sel.shards.length) sel = { ...sel, shards: runeSelection(page).shards };
    if (sel.primary === undefined || sel.sub === undefined || sel.perks.length < 6) continue;
    // Group-level stats (all variants of this keystone + trees) are what OP.GG shows; use the
    // concrete build's numbers only when the group lacks them.
    const games = num(page.play) ?? num(best?.play) ?? 0;
    const winRate = num(page.win_rate) ?? num(best?.win_rate) ?? (best?.play ? (num(best.win) ?? 0) / best.play : 0);
    out.push({
      primary: sel.primary,
      sub: sel.sub,
      perks: sel.perks,
      ...(sel.shards.length ? { shards: sel.shards } : {}),
      games,
      winRate,
      ...(num(page.pick_rate) !== undefined ? { pickRate: page.pick_rate } : {}),
    });
  }
  return out.sort((a, b) => b.games - a.games);
}

// ---------------------------------------------------------------- page parser

function headerRate(html: string, label: string): number | undefined {
  const m = new RegExp(`>\\s*${label}\\s*</(?:em|span)>\\s*<b\\b[^>]*>\\s*([\\d.]+)\\s*%`).exec(html);
  return m ? pct(m[1]) : undefined;
}

const SKILLS = new Set(["Q", "W", "E", "R"]);

function parseCounters(html: string): OpggChampion["counters"] {
  const out: NonNullable<OpggChampion["counters"]> = [];
  const weak = html.search(/>\s*Weak against\s*</);
  const strong = html.search(/>\s*Strong against\s*</);
  const grab = (from: number, to: number, kind: "weak" | "strong") => {
    if (from < 0) return;
    const text = flattenHtml(html.slice(from, to > from ? to : from + 8000));
    const re = /\{champion:([^}]+)\}\s*(\d+(?:\.\d+)?)\s*%\s*([\d,]+)\s*Games/gi;
    for (let m: RegExpExecArray | null; (m = re.exec(text)) && out.filter((c) => c.kind === kind).length < 10; )
      out.push({ championKey: m[1], winRate: pct(m[2]) ?? 0, games: toNum(m[3]) ?? 0, kind });
  };
  grab(weak, strong, "weak");
  grab(strong, -1, "strong");
  return out.length ? out : undefined;
}

/**
 * Parse an OP.GG champion page (build / items / runes / skills, SR or ARAM).
 * Returns undefined when the page has no usable stats (404, redirect to the champion list, ...).
 */
export function parseOpggChampionPage(html: string): OpggChampion | undefined {
  const res: OpggChampion = { coreBuilds: [], boots: [], starters: [], runes: [], spells: [] };

  const rsc = decodeRsc(html);
  if (rsc) {
    res.runes = parseRunes(rsc);
    const pos = /"positions":(\[\{"name":[^\]]*\]),"position":"(\w+)"/.exec(rsc);
    if (pos) {
      try {
        const list = JSON.parse(pos[1]) as Array<{ name?: string }>;
        res.positions = list.map((p) => opggPosition(p.name) ?? String(p.name).toLowerCase());
      } catch {
        /* ignore */
      }
      res.position = opggPosition(pos[2]);
    }
  }

  res.winRate = headerRate(html, "Win rate");
  res.pickRate = headerRate(html, "Pick rate");
  res.banRate = headerRate(html, "Ban rate");
  const tier = />\s*(\d)\s*Tier\s*</.exec(html);
  if (tier) res.tier = Number(tier[1]);

  for (const t of tables(html)) {
    const cap = t.caption.toLowerCase();
    const head = t.heading.toLowerCase();
    if (cap.startsWith("summonerspells")) {
      for (const r of t.rows) {
        const keys = r.tokens.filter((k) => k.kind === "spell").map((k) => k.id);
        if (keys.length < 2) continue;
        res.spells.push({ keys: [keys[0], keys[1]], ids: [SPELL_IDS[keys[0]] ?? 0, SPELL_IDS[keys[1]] ?? 0], ...r.rate });
      }
    } else if (cap.startsWith("skillorder") || cap.startsWith("skill table")) {
      for (const r of t.rows) {
        const letters = r.pre.split(" ").filter((w) => SKILLS.has(w)) as Skill[];
        const order = letters.slice(0, 3).join("");
        if (!/^[QWE]{3}$/.test(order)) continue;
        (res.skillOrder ??= []).push({ order, ...r.rate });
        const seq = letters.slice(3, 21);
        if (!res.skillSequence && seq.length >= 6) res.skillSequence = seq;
      }
    } else if (cap === "builds table" || (cap.startsWith("core items") && /core builds\s*$/.test(head))) {
      for (const r of t.rows) {
        const items = ids(r, "item");
        if (items.length) res.coreBuilds.push({ items, ...r.rate });
      }
    } else if (cap === "boots table" || (cap.startsWith("core items") && /boots\s*$/.test(head))) {
      for (const r of t.rows) {
        const [id] = ids(r, "item");
        if (id) res.boots.push({ id, ...r.rate });
      }
    } else if (cap === "items table" || (cap.startsWith("core items") && /starter items\s*$/.test(head))) {
      for (const r of t.rows) {
        const items = ids(r, "item");
        if (items.length) res.starters.push({ items, ...r.rate });
      }
    } else if (cap.startsWith("core items") && /items\s*$/.test(head)) {
      for (const r of t.rows) {
        const [id] = ids(r, "item");
        if (id) (res.items ??= []).push({ id, ...r.rate });
      }
    }
  }

  res.counters = parseCounters(html);
  res.games = estimateGames(res);

  const has =
    res.coreBuilds.length || res.boots.length || res.starters.length || res.items?.length || res.runes.length || res.spells.length || res.skillOrder?.length;
  return has ? res : undefined;
}

/** OP.GG shows no total game count; recover it from the best-populated "every game" table. */
function estimateGames(c: OpggChampion): number | undefined {
  const est = (rows: OpggRate[]) => {
    const r = [...rows].filter((x) => (x.pickRate ?? 0) > 0.05 && x.games > 0).sort((a, b) => b.games - a.games)[0];
    return r?.pickRate ? Math.round(r.games / r.pickRate) : undefined;
  };
  return est(c.spells) ?? est(c.runes) ?? est(c.starters) ?? est(c.boots);
}

/** Combine several parsed pages of the same champion/mode (e.g. build + items + runes). */
export function mergeOpggChampion(...parts: Array<OpggChampion | undefined>): OpggChampion | undefined {
  const ps = parts.filter((p): p is OpggChampion => !!p);
  if (!ps.length) return undefined;
  const longest = <K extends keyof OpggChampion>(k: K) =>
    ps.map((p) => p[k]).filter((v) => Array.isArray(v) && v.length).sort((a, b) => (b as unknown[]).length - (a as unknown[]).length)[0];
  const first = <K extends keyof OpggChampion>(k: K) => ps.map((p) => p[k]).find((v) => v !== undefined);
  return {
    games: first("games"),
    winRate: first("winRate"),
    pickRate: first("pickRate"),
    banRate: first("banRate"),
    tier: first("tier"),
    position: first("position"),
    positions: first("positions"),
    coreBuilds: (longest("coreBuilds") as OpggChampion["coreBuilds"]) ?? [],
    boots: (longest("boots") as OpggChampion["boots"]) ?? [],
    starters: (longest("starters") as OpggChampion["starters"]) ?? [],
    items: longest("items") as OpggChampion["items"],
    runes: (longest("runes") as OpggChampion["runes"]) ?? [],
    spells: (longest("spells") as OpggChampion["spells"]) ?? [],
    skillOrder: longest("skillOrder") as OpggChampion["skillOrder"],
    skillSequence: first("skillSequence"),
    counters: longest("counters") as OpggChampion["counters"],
  };
}

// ---------------------------------------------------------------- engine conversion

const winStat = (games: number, winRate: number | undefined, pickRate?: number): WinStat => ({
  games,
  wins: Math.round(games * (winRate ?? 0)),
  ...(pickRate !== undefined ? { pickRate } : {}),
});

/** Convert a parsed OP.GG page into the engine's ChampionStats shape. */
/** Rune pages (games / win rates) from an OP.GG page, in ChampionStats form; [] when none. */
export function opggRunePages(html: string): NonNullable<ChampionStats["runes"]> {
  return (parseOpggChampionPage(html)?.runes ?? []).map((r) => ({ primary: r.primary, sub: r.sub, perks: r.perks, ...(r.shards ? { shards: r.shards } : {}), ...winStat(r.games, r.winRate, r.pickRate) }));
}

/** Fill in rune pages a source lacks (HexMayhem publishes none) without touching anything else. */
export function withOpggRunes(stats: ChampionStats, runes: ChampionStats["runes"] | undefined): ChampionStats {
  if (stats.runes?.length || !runes?.length) return stats;
  return { ...stats, runes, runesSource: "opgg" };
}

export function opggToChampionStats(parsed: OpggChampion, data: StaticData): ChampionStats {
  const games = parsed.games ?? 0;

  const items: Record<string, WinStat> = {};
  if (parsed.items?.length) {
    for (const it of parsed.items) items[String(it.id)] = winStat(it.games, it.winRate, it.pickRate);
  } else {
    // No per-item table on the build page: approximate from the core builds that contain each item.
    const acc = new Map<number, { games: number; wins: number }>();
    for (const b of parsed.coreBuilds)
      for (const id of b.items) {
        const a = acc.get(id) ?? { games: 0, wins: 0 };
        a.games += b.games;
        a.wins += b.games * b.winRate;
        acc.set(id, a);
      }
    for (const [id, a] of acc) items[String(id)] = { games: a.games, wins: Math.round(a.wins), ...(games ? { pickRate: a.games / games } : {}) };
  }

  const boots: Record<string, WinStat> = {};
  for (const b of parsed.boots) boots[String(b.id)] = winStat(b.games, b.winRate, b.pickRate);

  const spellByIcon = (key: string) => [...data.spells.values()].find((s) => s.icon.endsWith(`/${key}.png`))?.id;
  const spells = parsed.spells
    .map((s) => {
      const a = s.ids[0] || spellByIcon(s.keys[0]);
      const b = s.ids[1] || spellByIcon(s.keys[1]);
      if (!a || !b) return undefined;
      return { ids: [a, b].sort((x, y) => x - y) as [number, number], ...winStat(s.games, s.winRate, s.pickRate) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const top = [...parsed.coreBuilds].sort((a, b) => b.games - a.games)[0];

  return {
    ...winStat(games, parsed.winRate, parsed.pickRate),
    items,
    boots,
    builds: parsed.coreBuilds.map((b) => ({ items: b.items, ...winStat(b.games, b.winRate, b.pickRate) })),
    starters: parsed.starters.map((s) => ({ items: s.items, ...winStat(s.games, s.winRate, s.pickRate) })),
    bestBuild: top?.items,
    runes: parsed.runes.map((r) => ({ primary: r.primary, sub: r.sub, perks: r.perks, ...(r.shards ? { shards: r.shards } : {}), ...winStat(r.games, r.winRate, r.pickRate) })),
    spells,
    skillOrders: parsed.skillOrder?.map((s) => ({ order: s.order, ...winStat(s.games, s.winRate, s.pickRate) })),
    ...(parsed.skillSequence ? { skillSequence: parsed.skillSequence } : {}),
    ...(parsed.counters ? { counters: parsed.counters.map((c) => ({ championKey: c.championKey, games: c.games, winRate: c.winRate })) } : {}),
    source: "opgg",
  };
}
