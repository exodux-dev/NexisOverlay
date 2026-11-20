import { describe, expect, it } from "vitest";
import { augmentStats, personalChampionStats } from "./history";
import { datasetMode, historyForMode, matchMode, modeFromQueue } from "./mode";
import type { MatchRecord } from "./types";

const rec = (gameMode: string, augments: string[] = [], extra: Partial<MatchRecord> = {}): MatchRecord => ({
  id: Math.random().toString(36),
  date: "2026-11-01T12:00:00.000Z",
  champion: "Ahri",
  result: "Win",
  kills: 5,
  deaths: 3,
  assists: 10,
  durationSec: 1200,
  items: [3089],
  augments,
  enemies: [],
  gameMode,
  ...extra,
});

describe("match mode attribution", () => {
  it("uses the recorded gameMode", () => {
    expect(matchMode(rec("KIWI"))).toBe("mayhem");
    expect(matchMode(rec("CHERRY", ["Jeweled Gauntlet"]))).toBe("arena");
    expect(matchMode(rec("ARAM"))).toBe("aram");
    expect(matchMode(rec("CLASSIC"))).toBe("sr");
  });

  it("treats mode-less records as Mayhem only when they have augments", () => {
    expect(matchMode(rec("", ["Goliath"]))).toBe("mayhem");
    expect(matchMode(rec("UNKNOWN", ["Goliath"]))).toBe("mayhem");
    expect(matchMode(rec(""))).toBeUndefined();
    expect(matchMode(rec("UNKNOWN"))).toBeUndefined();
  });

  it("keeps Mayhem items and augments out of other modes' personal stats", () => {
    const history = [
      rec("KIWI", ["Goliath"], { items: [1111] }),
      rec("", ["Goliath"], { items: [1111] }),
      rec("", [], { items: [2222] }),
      rec("CHERRY", ["Jeweled Gauntlet"], { items: [3333] }),
      rec("ARAM", [], { items: [4444] }),
    ];
    const mayhem = personalChampionStats(historyForMode(history, "mayhem"), "Ahri")!;
    expect(mayhem.games).toBe(2);
    expect(Object.keys(mayhem.items)).toEqual(["1111"]);
    expect(Object.keys(mayhem.augments ?? {})).toEqual(["Goliath"]);

    const arena = personalChampionStats(historyForMode(history, "arena"), "Ahri")!;
    expect(arena.games).toBe(1);
    expect(Object.keys(arena.items)).toEqual(["3333"]);
    expect(augmentStats(historyForMode(history, "arena"))).toEqual({ "Jeweled Gauntlet": { games: 1, wins: 1 } });

    const aram = personalChampionStats(historyForMode(history, "aram"), "Ahri")!;
    expect(Object.keys(aram.items)).toEqual(["4444"]);
    expect(aram.augments).toEqual({});
    expect(personalChampionStats(historyForMode(history, "sr"), "Ahri")).toBeUndefined();
  });
});

describe("stats dataset mode", () => {
  it("maps the dataset's queue id and defaults to Mayhem", () => {
    expect(datasetMode({ queueId: 2400 })).toBe("mayhem");
    expect(datasetMode({ queueId: 450 })).toBe("aram");
    expect(datasetMode({ queueId: 1700 })).toBe("arena");
    expect(datasetMode({ queueId: 420 })).toBe("sr");
    expect(datasetMode({ queueId: 9999 })).toBe("mayhem");
    expect(datasetMode({} as { queueId: number })).toBe("mayhem");
    expect(modeFromQueue(undefined)).toBeUndefined();
  });
});
