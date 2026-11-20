import { describe, expect, it } from "vitest";
import { HISTORY_TIMELINES, currentStreak, itemStats, parseHistoryImport, rollingWinRate, trimHistory, withValidTimeline } from "./history";
import type { MatchRecord } from "./types";

const rec = (result: "Win" | "Lose", extra: Partial<MatchRecord> = {}): MatchRecord => ({
  id: Math.random().toString(36),
  date: "2026-11-01T12:00:00.000Z",
  champion: "Ahri",
  result,
  kills: 5,
  deaths: 3,
  assists: 10,
  durationSec: 1200,
  items: [3089, 3020],
  augments: [],
  enemies: [],
  gameMode: "KIWI",
  ...extra,
});

describe("history helpers", () => {
  it("counts the current streak from the newest game", () => {
    expect(currentStreak([])).toBeUndefined();
    expect(currentStreak([rec("Lose"), rec("Win"), rec("Win")])).toEqual({ result: "Win", count: 2 });
    expect(currentStreak([rec("Win"), rec("Lose")])).toEqual({ result: "Lose", count: 1 });
  });

  it("computes a trailing rolling win rate", () => {
    const r = rollingWinRate([rec("Win"), rec("Lose"), rec("Win"), rec("Win")], 2);
    expect(r).toEqual([1, 0.5, 0.5, 1]);
  });

  it("counts each item once per game", () => {
    const s = itemStats([rec("Win", { items: [1, 1, 2] }), rec("Lose", { items: [1] }), rec("Win", { champion: "Lux", items: [1] })], "Ahri");
    expect(s["1"]).toEqual({ games: 2, wins: 1 });
    expect(s["2"]).toEqual({ games: 1, wins: 1 });
  });

  it("validates imported records", () => {
    const good = rec("Win", { id: "a" });
    const { records, invalid } = parseHistoryImport([good, { champion: "Lux" }, 42, { ...good, id: undefined, items: [3089, "x", -1] }]);
    expect(invalid).toBe(2);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(good);
    expect(records[1].id).toMatch(/Ahri$/);
    expect(records[1].items).toEqual([3089]);
    expect(parseHistoryImport({ history: [good] }).records).toHaveLength(1);
    expect(() => parseHistoryImport({ foo: 1 })).toThrow();
  });
});

describe("stored history", () => {
  const timeline = { samples: [{ t: 0, level: 1, cs: 0, kills: 0, deaths: 0, assists: 0, itemGold: 0, teamItemGold: 0, enemyItemGold: 0 }], items: [], levels: [] };

  it("keeps timelines only on the most recent matches", () => {
    const all = Array.from({ length: HISTORY_TIMELINES + 5 }, () => rec("Win", { timeline }));
    const out = trimHistory(all);
    expect(out).toHaveLength(all.length);
    expect(out.filter((m) => m.timeline)).toHaveLength(HISTORY_TIMELINES);
    expect(out[out.length - 1].timeline).toBe(timeline);
    expect(out[0].timeline).toBeUndefined();
  });

  it("drops a malformed stored timeline instead of crashing the views", () => {
    const bad = { ...rec("Win"), timeline: { samples: null } } as unknown as MatchRecord;
    expect("timeline" in withValidTimeline(bad)).toBe(false);
    expect(withValidTimeline(rec("Win", { timeline })).timeline).toEqual(timeline);
  });
});
