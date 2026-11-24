import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { historyCsv, historyTsv } from "./historyExport";
import type { MatchRecord } from "./types";

const data = makeFixtureStaticData();
const rec = (o: Partial<MatchRecord>): MatchRecord => ({ id: "1", date: "2026-11-20T21:05:00Z", champion: "Ahri", result: "Win", kills: 9, deaths: 2, assists: 11, durationSec: 1230, items: [], augments: [], enemies: ["Zed"], gameMode: "KIWI", ...o });

describe("history export", () => {
  it("writes a header and one row per game, newest first, with names", () => {
    const csv = historyCsv([rec({ id: "a", date: "2026-11-19T10:00:00Z", result: "Lose" }), rec({ id: "b", augments: ["Eureka", "Back To Basics"] })], data);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Mode,Champion,Result,Kills,Deaths,Assists,KDA,Minutes,Items,Augments,Enemies");
    expect(lines[1]).toBe("2026-11-20 21:05,ARAM: Mayhem,Ahri,Win,9,2,11,10.00,20.5,,Eureka; Back To Basics,Zed");
    expect(lines[2]).toContain(",Loss,");
  });
  it("quotes commas / quotes and neutralises formulas", () => {
    const csv = historyCsv([rec({ augments: ['Say "Hi", All', "=HYPERLINK(1)"] })], data);
    expect(csv).toContain('"Say ""Hi"", All; =HYPERLINK(1)"');
    const f = historyCsv([rec({ gameMode: "=cmd" , augments: []})], data);
    expect(f).toContain(",'=cmd,");
  });
  it("tab-separated copy has no tabs or newlines inside cells", () => {
    const tsv = historyTsv([rec({ augments: ["A\tB"] })], data);
    expect(tsv.split("\n")).toHaveLength(2);
    expect(tsv.split("\n")[1].split("\t")).toHaveLength(12);
  });
});
