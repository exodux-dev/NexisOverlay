import { describe, expect, it } from "vitest";
import {
  avgCsPerMin,
  csAt10,
  csTarget,
  farmPace,
  farmTone,
  gameCsPerMin,
} from "./farm";
import type { MatchRecord } from "./types";

const sample = (t: number, cs: number) => ({
  t,
  level: 1,
  cs,
  kills: 0,
  deaths: 0,
  assists: 0,
  itemGold: 0,
  teamItemGold: 0,
  enemyItemGold: 0,
});
const match = (samples?: Array<[number, number]>): MatchRecord => ({
  id: "x",
  date: "2026-11-20T10:00:00Z",
  champion: "Ahri",
  result: "Win",
  kills: 1,
  deaths: 1,
  assists: 1,
  durationSec: 1800,
  items: [],
  augments: [],
  enemies: [],
  gameMode: "CLASSIC",
  ...(samples
    ? {
        timeline: {
          samples: samples.map(([t, cs]) => sample(t, cs)),
          items: [],
          levels: [],
        },
      }
    : {}),
});

describe("farm", () => {
  it("targets by role on the Rift only", () => {
    expect(csTarget("sr", "MIDDLE")).toBe(7);
    expect(csTarget("sr", "JUNGLE")).toBe(6);
    expect(csTarget("sr", "UTILITY")).toBeUndefined();
    expect(csTarget("sr")).toBe(7);
    expect(csTarget("aram", "MIDDLE")).toBeUndefined();
  });

  it("tones against the target", () => {
    expect(farmTone(7.2, 7)).toBe("good");
    expect(farmTone(6, 7)).toBe("ok");
    expect(farmTone(4.9, 7)).toBe("low");
    expect(farmTone(4, undefined)).toBeUndefined();
  });

  it("live pace waits for minions and skips Arena", () => {
    expect(farmPace({ cs: 10, gameTime: 100, mode: "sr" })).toBeUndefined();
    expect(farmPace({ cs: 50, gameTime: 600, mode: "arena" })).toBeUndefined();
    expect(farmPace({ gameTime: 600, mode: "sr" })).toBeUndefined();
    expect(
      farmPace({ cs: 70, gameTime: 600, mode: "sr", position: "MIDDLE" }),
    ).toEqual({ cs: 70, perMin: 7, target: 7, tone: "good" });
    expect(farmPace({ cs: 45, gameTime: 600, mode: "aram" })).toEqual({
      cs: 45,
      perMin: 4.5,
    });
  });

  it("per-game CS/min, CS at 10 and averages from timelines", () => {
    const a = match([
      [300, 30],
      [600, 72],
      [1200, 150],
    ]);
    expect(gameCsPerMin(a)).toBe(7.5);
    expect(csAt10(a)).toBe(72);
    expect(
      csAt10(
        match([
          [300, 30],
          [480, 50],
        ]),
      ),
    ).toBeUndefined();
    expect(gameCsPerMin(match())).toBeUndefined();
    expect(avgCsPerMin([a, match([[600, 50]]), match()])).toEqual({
      perMin: 6.3,
      games: 2,
    });
    expect(avgCsPerMin([match()])).toBeUndefined();
  });
});
