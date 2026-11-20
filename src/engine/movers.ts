// Patch movers: a compact per-patch snapshot of each tier list (kept in the data dir as
// tierHistory.json) and the champions whose tier / win rate moved since the previous patch.
// Everything here is pure; persistence lives in src/app/tierHistory.ts.

import { TIER_RANK, type ChampionTierRow, type Tier, type TierPosition } from "./sources/tierlists";

/** One champion (in one role on Summoner's Rift) in a snapshot. Short keys keep the file small. */
export interface SnapshotRow {
  id: string;
  tier: Tier;
  /** win rate 0..1 */
  wr: number;
  /** pick rate 0..1 */
  pr?: number;
  pos?: TierPosition;
}

export interface TierSnapshot {
  /** "16.23" */
  patch: string;
  /** epoch ms of the last update of this snapshot */
  at: number;
  rows: SnapshotRow[];
}

/** tierHistory.json: snapshots per mode, oldest patch → newest. */
export interface TierHistory {
  v: 1;
  modes: Record<string, TierSnapshot[]>;
}

export const MAX_PATCHES = 3;
/** Minimum win-rate change (0..1) to count as a mover without a tier change. */
export const MIN_WR_DELTA = 0.01;

export const emptyHistory = (): TierHistory => ({ v: 1, modes: {} });

/** "16.23.1" / "16.23" → [16, 23]; undefined when it isn't a patch. */
export function patchParts(p: string | undefined): [number, number] | undefined {
  const m = /^(\d+)\.(\d+)/.exec(p ?? "");
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/** "16.23.1" → "16.23" */
export const majorPatch = (p: string | undefined): string | undefined => {
  const x = patchParts(p);
  return x ? `${x[0]}.${x[1]}` : undefined;
};

/** <0 when a is an older patch than b. */
export function comparePatch(a: string, b: string): number {
  const x = patchParts(a) ?? [0, 0];
  const y = patchParts(b) ?? [0, 0];
  return x[0] - y[0] || x[1] - y[1];
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Tier list rows → compact snapshot rows (one per champion / role). */
export function compactRows(rows: ChampionTierRow[]): SnapshotRow[] {
  const seen = new Set<string>();
  const out: SnapshotRow[] = [];
  for (const r of rows) {
    const k = `${r.championKey}|${r.position ?? ""}`;
    if (seen.has(k) || !Number.isFinite(r.winRate)) continue;
    seen.add(k);
    out.push({
      id: r.championKey,
      tier: r.tier,
      wr: r4(r.winRate),
      ...(r.pickRate !== undefined && Number.isFinite(r.pickRate) ? { pr: r4(r.pickRate) } : {}),
      ...(r.position ? { pos: r.position } : {}),
    });
  }
  return out;
}

/** Loose validation of a loaded file (anything unexpected → empty history). */
export function normalizeHistory(raw: unknown): TierHistory {
  if (!raw || typeof raw !== "object" || (raw as TierHistory).v !== 1) return emptyHistory();
  const modes: TierHistory["modes"] = {};
  for (const [mode, snaps] of Object.entries((raw as TierHistory).modes ?? {})) {
    if (!Array.isArray(snaps)) continue;
    const ok = snaps.filter((s): s is TierSnapshot => !!s && typeof s.patch === "string" && !!patchParts(s.patch) && Array.isArray(s.rows));
    if (ok.length) modes[mode] = ok.sort((a, b) => comparePatch(a.patch, b.patch)).slice(-MAX_PATCHES);
  }
  return { v: 1, modes };
}

/**
 * Store this patch's tier list for a mode: replaces the snapshot of the same patch (so it holds
 * the latest numbers of the patch), keeps the last `MAX_PATCHES` patches. Returns the same object
 * when nothing changed (no save needed).
 */
export function recordSnapshot(history: TierHistory, mode: string, patch: string | undefined, rows: ChampionTierRow[], now = Date.now()): TierHistory {
  const p = majorPatch(patch);
  if (!p || !rows.length) return history;
  const compact = compactRows(rows);
  const list = history.modes[mode] ?? [];
  const cur = list.find((s) => s.patch === p);
  if (cur && JSON.stringify(cur.rows) === JSON.stringify(compact)) return history;
  const next = [...list.filter((s) => s.patch !== p), { patch: p, at: now, rows: compact }]
    .sort((a, b) => comparePatch(a.patch, b.patch))
    .slice(-MAX_PATCHES);
  return { v: 1, modes: { ...history.modes, [mode]: next } };
}

/** The newest snapshot of a patch older than `patch` (the one to compare against). */
export function previousSnapshot(history: TierHistory | undefined, mode: string, patch: string | undefined): TierSnapshot | undefined {
  const p = majorPatch(patch);
  if (!history || !p) return undefined;
  const older = (history.modes[mode] ?? []).filter((s) => comparePatch(s.patch, p) < 0);
  return older.sort((a, b) => comparePatch(a.patch, b.patch))[older.length - 1];
}

export interface Mover {
  id: string;
  position?: TierPosition;
  oldTier: Tier;
  newTier: Tier;
  /** Tiers gained (+) or lost (−): A → S = +1. */
  tierDelta: number;
  oldWr: number;
  newWr: number;
  /** newWr − oldWr (0..1 scale) */
  wrDelta: number;
  pickRate?: number;
}

export interface Movers {
  risers: Mover[];
  fallers: Mover[];
}

const key = (id: string, pos?: string) => `${id}|${pos ?? ""}`;

/** Compare one snapshot row with the current one. */
function diff(prev: SnapshotRow, cur: ChampionTierRow): Mover {
  return {
    id: cur.championKey,
    ...(cur.position ? { position: cur.position } : {}),
    oldTier: prev.tier,
    newTier: cur.tier,
    tierDelta: TIER_RANK[prev.tier] - TIER_RANK[cur.tier],
    oldWr: prev.wr,
    newWr: cur.winRate,
    wrDelta: r4(cur.winRate - prev.wr),
    ...(cur.pickRate !== undefined ? { pickRate: cur.pickRate } : {}),
  };
}

/**
 * Risers / fallers between the previous patch's snapshot and the current rows. A champion moves
 * when its tier changed or its win rate moved by at least `minWrDelta` (1.0 pt). Direction
 * follows the tier first, then the win rate. Sorted by size of the move: tiers, then win rate.
 * `position` narrows Summoner's Rift to one role.
 */
export function computeMovers(
  prev: TierSnapshot | undefined,
  rows: ChampionTierRow[] | undefined,
  opts: { position?: string; limit?: number; minWrDelta?: number } = {},
): Movers {
  const out: Movers = { risers: [], fallers: [] };
  if (!prev || !rows?.length) return out;
  const min = opts.minWrDelta ?? MIN_WR_DELTA;
  const hasPos = rows.some((r) => r.position);
  const pos = hasPos ? opts.position : undefined;
  const before = new Map(prev.rows.map((r) => [key(r.id, r.pos), r]));
  const seen = new Set<string>();
  for (const r of rows) {
    if (pos && r.position !== pos) continue;
    const k = key(r.championKey, r.position);
    if (seen.has(k)) continue;
    seen.add(k);
    const p = before.get(k);
    if (!p) continue;
    const m = diff(p, r);
    // 1e-9: float noise on exactly 1.0 pt.
    const wrMoved = Math.abs(m.wrDelta) + 1e-9 >= min;
    if (m.tierDelta > 0 || (m.tierDelta === 0 && wrMoved && m.wrDelta > 0)) out.risers.push(m);
    else if (m.tierDelta < 0 || (m.tierDelta === 0 && wrMoved && m.wrDelta < 0)) out.fallers.push(m);
  }
  out.risers.sort((a, b) => b.tierDelta - a.tierDelta || b.wrDelta - a.wrDelta || a.id.localeCompare(b.id));
  out.fallers.sort((a, b) => a.tierDelta - b.tierDelta || a.wrDelta - b.wrDelta || a.id.localeCompare(b.id));
  const n = opts.limit ?? 5;
  return { risers: out.risers.slice(0, n), fallers: out.fallers.slice(0, n) };
}

/**
 * A champion's tier change since the previous patch (for a badge), for its current row (same
 * role on Summoner's Rift); undefined when its tier didn't change or it wasn't listed before.
 */
export function tierChange(prev: TierSnapshot | undefined, row: ChampionTierRow | undefined): Mover | undefined {
  if (!prev || !row) return undefined;
  const p = prev.rows.find((r) => r.id === row.championKey && (r.pos ?? "") === (row.position ?? ""));
  if (!p) return undefined;
  const m = diff(p, row);
  return m.tierDelta !== 0 ? m : undefined;
}
