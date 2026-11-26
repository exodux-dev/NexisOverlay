// "Compared with your usual": one game against your own earlier games on the same champion and
// mode. Only your own recorded data (scoreboard samples), no prompts — a post-game reflection.

import { isLegendary } from "./intel";
import { matchMode } from "./mode";
import { csAt10, gameCsPerMin } from "./farm";
import type { MatchRecord, StaticData } from "./types";

export interface ReportRow {
  key: "csMin" | "cs10" | "firstItem" | "deaths" | "kda";
  label: string;
  /** This game, formatted. */
  value: string;
  /** Your average before this game, formatted. */
  avg: string;
  /** Signed improvement in the metric's own unit (positive = better). */
  delta: number;
  better: boolean;
  /** Formatted difference, e.g. "+0.8", "1:05 sooner". */
  diff: string;
}

/** Earlier games needed before a comparison means anything. */
export const REPORT_MIN_GAMES = 2;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const kdaRatio = (m: MatchRecord) => (m.kills + m.assists) / Math.max(1, m.deaths);

/** Game time of your first completed legendary item (from the timeline), if recorded. */
export function firstItemAt(m: MatchRecord, data: StaticData | null | undefined): number | undefined {
  const ev = m.timeline?.items;
  if (!ev?.length) return undefined;
  const first = data ? ev.find((e) => isLegendary(data.items.get(e.itemId))) : ev[0];
  return first?.t;
}

/**
 * Rows comparing `record` with your earlier games (same champion and mode, played before it).
 * Metrics without enough earlier data are left out; empty when there's nothing to compare.
 */
export function compareToUsual(record: MatchRecord, history: MatchRecord[], data?: StaticData | null): ReportRow[] {
  const mode = matchMode(record);
  const before = history.filter((m) => m.id !== record.id && m.champion === record.champion && matchMode(m) === mode && m.date < record.date);
  if (before.length < REPORT_MIN_GAMES) return [];
  const rows: ReportRow[] = [];
  const add = (key: ReportRow["key"], label: string, mine: number | undefined, pick: (m: MatchRecord) => number | undefined, opts: { lowerIsBetter?: boolean; fmt: (v: number) => string; diff: (d: number) => string; minDelta: number }) => {
    if (mine === undefined) return;
    const xs = before.map(pick).filter((v): v is number => v !== undefined && Number.isFinite(v));
    if (xs.length < REPORT_MIN_GAMES) return;
    const a = avg(xs);
    const delta = opts.lowerIsBetter ? a - mine : mine - a;
    if (Math.abs(delta) < opts.minDelta) return; // about the same: not worth a line
    rows.push({ key, label, value: opts.fmt(mine), avg: opts.fmt(a), delta, better: delta > 0, diff: opts.diff(delta) });
  };
  const signed = (d: number, digits: number) => `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)}`;
  add("csMin", "CS per minute", gameCsPerMin(record), gameCsPerMin, { fmt: (v) => v.toFixed(1), diff: (d) => signed(d, 1), minDelta: 0.3 });
  add("cs10", "CS at 10 min", csAt10(record), csAt10, { fmt: (v) => String(Math.round(v)), diff: (d) => signed(Math.round(d), 0), minDelta: 5 });
  add("firstItem", "First item", firstItemAt(record, data), (m) => firstItemAt(m, data), {
    lowerIsBetter: true,
    fmt: clock,
    diff: (d) => `${clock(Math.abs(d))} ${d > 0 ? "sooner" : "later"}`,
    minDelta: 30,
  });
  add("deaths", "Deaths", record.deaths, (m) => m.deaths, { lowerIsBetter: true, fmt: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)), diff: (d) => `${Math.abs(d).toFixed(1)} ${d > 0 ? "fewer" : "more"}`, minDelta: 1 });
  add("kda", "KDA", kdaRatio(record), kdaRatio, { fmt: (v) => v.toFixed(2), diff: (d) => signed(d, 2), minDelta: 0.3 });
  return rows.sort((a, b) => Number(b.better) - Number(a.better));
}
