import { describe, expect, it } from "vitest";
import { compareToUsual } from "./gameReport";
import type { MatchRecord } from "./types";

const sample = (t: number, cs: number) => ({ t, level: 1, cs, kills: 0, deaths: 0, assists: 0, itemGold: 0, teamItemGold: 0, enemyItemGold: 0 });
let n = 0;
const game = (o: { cs10?: number; csEnd?: number; firstItem?: number; deaths?: number; kills?: number; date?: string; champion?: string }): MatchRecord => ({
  id: `g${n++}`,
  date: o.date ?? `2026-11-${String(10 + n).padStart(2, "0")}T10:00:00Z`,
  champion: o.champion ?? "Ahri",
  result: "Win",
  kills: o.kills ?? 5,
  deaths: o.deaths ?? 5,
  assists: 5,
  durationSec: 1200,
  items: [],
  augments: [],
  enemies: [],
  gameMode: "CLASSIC",
  timeline: { samples: [sample(600, o.cs10 ?? 60), sample(1200, o.csEnd ?? 120)], items: o.firstItem ? [{ t: o.firstItem, itemId: 1 }] : [], levels: [] },
});

describe("compareToUsual", () => {
  it("needs a couple of earlier games on the champion", () => {
    const g = game({});
    expect(compareToUsual(g, [game({}), g])).toEqual([]);
  });

  it("lists what went better first, then what was worse; skips near-equal metrics", () => {
    const earlier = [game({ cs10: 60, csEnd: 120, firstItem: 600, deaths: 6 }), game({ cs10: 64, csEnd: 128, firstItem: 660, deaths: 4 })];
    const now = game({ cs10: 80, csEnd: 170, firstItem: 760, deaths: 5, date: "2026-11-30T10:00:00Z" });
    const rows = compareToUsual(now, [...earlier, now, game({ champion: "Zed", date: "2026-11-29T00:00:00Z" })]);
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(["csMin", "cs10", "firstItem"]); // deaths 5 vs 5 and KDA equal are skipped
    expect(rows[0]).toMatchObject({ better: true, value: "8.5", avg: "6.2" });
    expect(rows[1]).toMatchObject({ better: true, value: "80", avg: "62", diff: "+18" });
    expect(rows[2]).toMatchObject({ better: false, value: "12:40", diff: "2:10 later" });
  });

  it("ignores later games and other champions", () => {
    const now = game({ date: "2026-11-05T00:00:00Z" });
    expect(compareToUsual(now, [game({}), game({}), now])).toEqual([]);
  });
});
