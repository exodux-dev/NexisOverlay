// HexMayhem (hexmayhem.com) — public ARAM: Mayhem statistics.
//
// The site is a Next.js app; its pages embed their data as React Server Component
// payload chunks (`self.__next_f.push([1,"..."])`). We decode those chunks and read the
// structured JSON objects inside, instead of scraping visual HTML, which keeps the parser
// small and resilient. Every extractor is optional: if the site changes, the affected field
// is simply missing and the app falls back to its other data sources.

import type { ChampionStats, StaticData, WinStat } from "../types";
import { norm } from "../text";

export const HEXMAYHEM = "https://hexmayhem.com";

export function championUrl(championId: string): string {
  return `${HEXMAYHEM}/champions/${championId.toLowerCase()}`;
}
export const AUGMENTS_URL = `${HEXMAYHEM}/augments`;

/** Concatenate and unescape all RSC payload chunks of a Next.js page. */
export function decodeRsc(html: string): string {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(`"${m[1]}"`) as string);
    } catch {
      /* skip a malformed chunk */
    }
  }
  return out.join("");
}

/** Parse the JSON value (object/array) that starts right after `marker`. */
export function grabJson<T = unknown>(text: string, marker: string | RegExp): T | undefined {
  let start: number;
  if (typeof marker === "string") {
    const i = text.indexOf(marker);
    if (i < 0) return undefined;
    start = i + marker.length;
  } else {
    const m = marker.exec(text);
    if (!m) return undefined;
    start = m.index + m[0].length;
  }
  const open = text[start];
  if (open !== "[" && open !== "{") return undefined;
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
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, k + 1)) as T;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

export interface HMAugmentStat {
  id: number;
  name: string;
  rarity: string;
  wr: number; // %
  pr: number; // %
  n: number;
  lift?: number;
  tier?: string;
  desc?: string;
}

export interface HMChampion {
  games: number;
  winRate: number; // %
  items: Array<{ id: number; games: number; wr: number; pr: number }>;
  augments: HMAugmentStat[];
  bestBuild: number[];
  skillOrders: Array<{ order: string; wr: number; pr: number; lift: number }>;
  spells: Array<{ names: [string, string]; wr: number; pr: number; lift: number }>;
}

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/** Parse a champion page (`/champions/<id>`). Returns undefined if the page has no stats. */
export function parseChampionPage(html: string): HMChampion | undefined {
  const rsc = decodeRsc(html);
  if (!rsc) return undefined;

  const stats = grabJson<{ unfiltered?: { n?: number; wr?: number; all?: unknown[] } }>(rsc, /"champId":\d+,"stats":/);
  const base = stats?.unfiltered;
  const games = num(base?.n) ?? 0;
  const winRate = num(base?.wr) ?? 0;
  const items = (base?.all ?? [])
    .filter((r): r is number[] => Array.isArray(r) && r.length >= 4 && r.every((x) => typeof x === "number"))
    .map(([id, n, wr, pr]) => ({ id, games: n, wr, pr }));

  const augRaw = grabJson<unknown[]>(rsc, /"champId":\d+,"all":/) ?? [];
  const augments = augRaw.filter(isAugStat);

  const bestBuild = (grabJson<number[]>(rsc, /"Best build"[\s\S]{0,400}?"ids":/) ?? []).filter((x) => typeof x === "number");

  const skillOrders: HMChampion["skillOrders"] = [];
  const skillRe = /\["\$","tr","([QWE]>[QWE]>[QWE])",\{[\s\S]*?"children":\[([\d.]+),"%"\][\s\S]*?"children":\[([\d.]+),"%"\][\s\S]*?"v":(-?[\d.]+)/g;
  for (let m: RegExpExecArray | null; (m = skillRe.exec(rsc)); ) {
    skillOrders.push({ order: m[1].replace(/>/g, ""), wr: Number(m[2]), pr: Number(m[3]), lift: Number(m[4]) });
  }

  const spells: HMChampion["spells"] = [];
  const spellStart = rsc.indexOf('"Summoner spells"');
  if (spellStart >= 0) {
    const seg = rsc.slice(spellStart, spellStart + 12000);
    const rowRe = /\["\$","tr","\d+",\{[\s\S]*?"alt":"([^"]+)"[\s\S]*?"alt":"([^"]+)"[\s\S]*?"children":\[([\d.]+),"%"\][\s\S]*?"children":\[([\d.]+),"%"\][\s\S]*?"v":(-?[\d.]+)/g;
    for (let m: RegExpExecArray | null; (m = rowRe.exec(seg)); ) {
      spells.push({ names: [m[1], m[2]], wr: Number(m[3]), pr: Number(m[4]), lift: Number(m[5]) });
    }
  }

  if (!games && !augments.length) return undefined;
  return { games, winRate, items, augments, bestBuild, skillOrders, spells };
}

function isAugStat(x: unknown): x is HMAugmentStat {
  const a = x as HMAugmentStat;
  return !!a && typeof a.name === "string" && typeof a.wr === "number" && typeof a.n === "number";
}

/** Parse the global augment table (`/augments`). */
export function parseAugmentTable(html: string): { patch?: string; rows: HMAugmentStat[] } {
  const rsc = decodeRsc(html);
  const rows = (grabJson<unknown[]>(rsc, '"initialRows":') ?? []).filter(isAugStat);
  const patch = /Patch[^0-9]{0,40}(\d+\.\d+)/.exec(rsc)?.[1] ?? /strength (\d+\.\d+)/.exec(html)?.[1];
  return { patch, rows };
}

const winStat = (games: number, wrPct: number, pickRate?: number): WinStat & { pickRate?: number } => ({
  games,
  wins: Math.round((games * wrPct) / 100),
  ...(pickRate !== undefined ? { pickRate: pickRate / 100 } : {}),
});

/** Convert a parsed champion page into the engine's ChampionStats shape. */
export function toChampionStats(hm: HMChampion, data: StaticData): ChampionStats {
  const items: Record<string, WinStat> = {};
  const boots: Record<string, WinStat> = {};
  for (const it of hm.items) {
    const item = data.items.get(it.id);
    (item?.tags.includes("Boots") ? boots : items)[String(it.id)] = winStat(it.games, it.wr, it.pr);
  }
  const augments: Record<string, WinStat & { pickRate?: number }> = {};
  for (const a of hm.augments) augments[a.name] = winStat(a.n, a.wr, a.pr);

  const spellId = (name: string) => [...data.spells.values()].find((s) => norm(s.name) === norm(name))?.id;
  const spells = hm.spells
    .map((s) => {
      const a = spellId(s.names[0]);
      const b = spellId(s.names[1]);
      if (a === undefined || b === undefined) return undefined;
      return { ids: [a, b].sort((x, y) => x - y) as [number, number], ...winStat(Math.round((hm.games * s.pr) / 100), s.wr, s.pr) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return {
    ...winStat(hm.games, hm.winRate),
    items,
    boots,
    augments,
    bestBuild: hm.bestBuild.filter((id) => data.items.get(id)?.aram),
    skillOrders: hm.skillOrders.map((s) => ({ order: s.order, ...winStat(Math.round((hm.games * s.pr) / 100), s.wr) })),
    spells,
    source: "hexmayhem",
  };
}
