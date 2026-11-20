// Game timeline: a compact record of your own game (scoreboard data only), sampled from the
// live snapshots while you play and attached to the match history entry for post-game review.
//
//   let rec: TimelineRecorder | null = null;
//   rec = stepTimeline(rec, snap, data);      // every live snapshot (main window)
//   record.timeline = rec?.timeline;          // when the game ends
//
// Everything is pure: the store owns the recorder between snapshots.

import { inventoryValue, isBigItem, isLegendary } from "./intel";
import type { GameSnapshot, Item, PlayerState, StaticData } from "./types";

export interface TimelineSample {
  /** Game time (s). */
  t: number;
  level: number;
  cs: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Gold value of your inventory. */
  itemGold: number;
  /** Average inventory value per player on your team (you included). */
  teamItemGold: number;
  /** Average inventory value per player on the enemy team. */
  enemyItemGold: number;
}

export interface GameTimeline {
  /** One sample every `SAMPLE_EVERY` s of game time (thinned to stay under `MAX_SAMPLES`). */
  samples: TimelineSample[];
  /** Completed items as they were bought, in order. */
  items: Array<{ t: number; itemId: number }>;
  /** Times you reached level 6 / 11 / 16. */
  levels: Array<{ t: number; level: number }>;
}

export interface TimelineRecorder {
  timeline: GameTimeline;
  /** Completed item ids in your inventory at the last snapshot (multiset). */
  owned: number[];
  level: number;
  lastT: number;
  /** Current sample spacing (doubles whenever the sample cap is hit). */
  every: number;
  nextAt: number;
}

export const SAMPLE_EVERY = 30;
export const MAX_SAMPLES = 120;
export const MAX_ITEM_EVENTS = 40;
/** A completed item gone again within this many seconds of buying it was an undo, not a buy + sell. */
export const UNDO_WINDOW = 30;
/** Items already owned in the first snapshot count as bought only before this (opening shop). */
const OPENING_SHOP = 60;
/** Game time going back further than this means a different game. */
const REWIND = 10;
const LEVEL_MARKS = [6, 11, 16];

/** Completed (legendary or finished boots) items worth a timing — no consumables / trinkets. */
export function isCompletedItem(it: Item | undefined, items?: Map<number, Item>): it is Item {
  if (!it || it.tags.includes("Consumable") || it.tags.includes("Trinket")) return false;
  if (it.completed) return true;
  // Transforming legendaries (Manamune → Muramana, Archangel's → Seraph's) only build "into" a
  // non-store item, so they count as completed when bought.
  return !!items && it.cost >= 2000 && it.into.length > 0 && it.into.every((id) => !items.has(id));
}

function completedIds(p: PlayerState, data: StaticData): number[] {
  return p.items.map((i) => i.id).filter((id) => isCompletedItem(data.items.get(id), data.items));
}

function avg(ps: PlayerState[], data: StaticData): number {
  return ps.length ? Math.round(ps.reduce((s, p) => s + inventoryValue(p, data), 0) / ps.length) : 0;
}

function sampleOf(snap: GameSnapshot, data: StaticData): TimelineSample {
  const me = snap.me;
  return {
    t: Math.round(snap.gameTime),
    level: me.level,
    cs: me.creepScore ?? 0,
    kills: me.kills,
    deaths: me.deaths,
    assists: me.assists,
    itemGold: inventoryValue(me, data),
    teamItemGold: avg([me, ...snap.allies], data),
    enemyItemGold: avg(snap.enemies, data),
  };
}

/** Keep the first, every other and the last sample — halves the density, keeps the whole game. */
function thin(samples: TimelineSample[]): TimelineSample[] {
  const out = samples.filter((_, i) => i % 2 === 0);
  const last = samples[samples.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Count of each id in `list`. */
function counts(list: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const id of list) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function start(snap: GameSnapshot, data: StaticData): TimelineRecorder {
  const t = Math.round(snap.gameTime);
  const owned = completedIds(snap.me, data);
  return {
    // App opened mid-game: what you already own is the baseline, not a purchase at this time.
    timeline: { samples: [], items: t < OPENING_SHOP ? owned.map((itemId) => ({ t, itemId })) : [], levels: [] },
    owned,
    level: snap.me.level,
    lastT: t,
    every: SAMPLE_EVERY,
    nextAt: 0,
  };
}

/**
 * Feed one live snapshot. Returns the updated recorder (a new object when anything changed;
 * the same one for ignored snapshots). Loading-screen snapshots are ignored; game time going
 * backwards starts a fresh timeline (a new game).
 */
export function stepTimeline(rec: TimelineRecorder | null, snap: GameSnapshot, data: StaticData): TimelineRecorder | null {
  if (snap.loading) return rec;
  const t = Math.round(snap.gameTime);
  if (rec && t < rec.lastT - REWIND) rec = null;
  const fresh = !rec;
  const r: TimelineRecorder = rec ? { ...rec, timeline: { ...rec.timeline } } : start(snap, data);
  const tl = r.timeline;

  if (!fresh) {
    // Purchases / undos: compare completed-item multisets.
    const now = completedIds(snap.me, data);
    const before = counts(r.owned);
    const after = counts(now);
    let items = tl.items;
    let undoneAt = Infinity;
    for (const [id, n] of after) {
      for (let k = before.get(id) ?? 0; k < n; k++) items = [...items, { t, itemId: id }];
    }
    // Items that appeared now and were built from a vanished one (e.g. boots tier 2 → tier 3):
    // the vanished item was upgraded, not undone.
    const added = [...after].filter(([id, n]) => n > (before.get(id) ?? 0)).map(([id]) => data.items.get(id));
    for (const [id, n] of before) {
      if (added.some((it) => it?.from.includes(id))) continue;
      for (let k = after.get(id) ?? 0; k < n; k++) {
        // Undo (or an instant sell) right after buying: the purchase didn't really happen.
        let idx = -1;
        for (let i = items.length - 1; i >= 0; i--) if (items[i].itemId === id) { idx = i; break; }
        if (idx >= 0 && t - items[idx].t <= UNDO_WINDOW) {
          undoneAt = Math.min(undoneAt, items[idx].t);
          items = items.filter((_, i) => i !== idx);
        }
      }
    }
    // A sample taken while the undone item sat in the inventory would show a false gold spike.
    const lastS = tl.samples[tl.samples.length - 1];
    if (lastS && lastS.t >= undoneAt) tl.samples = [...tl.samples.slice(0, -1), { ...sampleOf(snap, data), t: lastS.t }];
    tl.items = items.length > MAX_ITEM_EVENTS ? items.slice(0, MAX_ITEM_EVENTS) : items;
    r.owned = now;

    // Level milestones.
    const lvl = snap.me.level;
    for (const L of LEVEL_MARKS) if (r.level < L && lvl >= L && !tl.levels.some((e) => e.level === L)) tl.levels = [...tl.levels, { t, level: L }];
    r.level = lvl;
  }

  // Sampling: every `every` seconds, plus always the final snapshot.
  const last = tl.samples[tl.samples.length - 1];
  if (t >= r.nextAt || (snap.ended && (!last || last.t < t))) {
    const s = sampleOf(snap, data);
    tl.samples = last && last.t === s.t ? [...tl.samples.slice(0, -1), s] : [...tl.samples, s];
    r.nextAt = Math.floor(t / r.every) * r.every + r.every;
    if (tl.samples.length > MAX_SAMPLES) {
      tl.samples = thin(tl.samples);
      r.every *= 2;
      r.nextAt = Math.floor(t / r.every) * r.every + r.every;
    }
  }
  r.lastT = t;
  return r;
}

// ------------------------------------------------------------------ analysis (for the views)

export interface ItemTiming {
  t: number;
  item: Item | undefined;
  itemId: number;
  boots: boolean;
  /** 1-based count among legendaries (non-boots), when it is one. */
  legendaryNo?: number;
  /** Completes the 3-item core (or is a high-impact item). */
  spike: boolean;
}

export interface TimelineSummary {
  timings: ItemTiming[];
  firstItemAt?: number;
  /** Game time the 3rd legendary was finished. */
  coreDoneAt?: number;
  /** CS per minute and KDA ratio per sample (skips t = 0). */
  csPerMin: Array<{ t: number; v: number }>;
  kda: Array<{ t: number; v: number }>;
}

export function kdaRatio(k: number, d: number, a: number): number {
  return d === 0 ? k + a : (k + a) / d;
}

export function summarizeTimeline(tl: GameTimeline, data: StaticData | null): TimelineSummary {
  let n = 0;
  let firstItemAt: number | undefined;
  let coreDoneAt: number | undefined;
  const timings: ItemTiming[] = tl.items.map((e) => {
    const item = data?.items.get(e.itemId);
    const legendary = isLegendary(item);
    const boots = !!item?.tags.includes("Boots");
    const no = legendary ? ++n : undefined;
    if (no === 1) firstItemAt = e.t;
    if (no === 3) coreDoneAt = e.t;
    return { t: e.t, item, itemId: e.itemId, boots, legendaryNo: no, spike: no === 3 || (legendary && isBigItem(item)) };
  });
  const later = tl.samples.filter((s) => s.t >= 60);
  return {
    timings,
    firstItemAt,
    coreDoneAt,
    csPerMin: later.map((s) => ({ t: s.t, v: s.cs / (s.t / 60) })),
    kda: later.map((s) => ({ t: s.t, v: kdaRatio(s.kills, s.deaths, s.assists) })),
  };
}

// ------------------------------------------------------------------ persistence

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Validate a stored / imported timeline; undefined when it isn't one (older entries have none). */
export function normalizeTimeline(raw: unknown): GameTimeline | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.samples)) return undefined;
  const samples = o.samples
    .filter((s): s is TimelineSample => {
      const x = s as Record<string, unknown> | null;
      return !!x && (["t", "level", "cs", "kills", "deaths", "assists", "itemGold", "teamItemGold", "enemyItemGold"] as const).every((k) => fin(x[k]));
    })
    .slice(0, MAX_SAMPLES * 2)
    // The chart draws (and looks up item dots) in time order.
    .sort((a, b) => a.t - b.t);
  const items = (Array.isArray(o.items) ? o.items : [])
    .filter((e): e is { t: number; itemId: number } => !!e && fin((e as { t?: unknown }).t) && fin((e as { itemId?: unknown }).itemId))
    .slice(0, MAX_ITEM_EVENTS)
    .map((e) => ({ t: e.t, itemId: e.itemId }));
  const levels = (Array.isArray(o.levels) ? o.levels : [])
    .filter((e): e is { t: number; level: number } => !!e && fin((e as { t?: unknown }).t) && fin((e as { level?: unknown }).level))
    .slice(0, LEVEL_MARKS.length)
    .map((e) => ({ t: e.t, level: e.level }));
  if (!samples.length && !items.length) return undefined;
  return { samples, items, levels };
}
