import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { poolSuggestions } from "./poolCoach";
import type { ChampionTierRow } from "./sources/tierlists";
import type { MatchRecord } from "./types";

const data = makeFixtureStaticData();
let n = 0;
const games = (champion: string, wins: number, losses: number): MatchRecord[] =>
  [...Array(wins).fill("Win"), ...Array(losses).fill("Lose")].map((result) => ({ id: String(n++), date: "2026-11-20T10:00:00Z", champion, result, kills: 0, deaths: 0, assists: 0, durationSec: 1200, items: [], augments: [], enemies: [], gameMode: "ARAM" }));
const row = (championKey: string, winRate: number, tier = 1) => ({ championKey, tier, winRate }) as unknown as ChampionTierRow;

describe("champion pool coach", () => {
  const ahri = data.championsById.get("Ahri")!;
  // Mages that play like Ahri vs. an unrelated tank, all strong.
  const mages = data.champions.filter((c) => c.archetype === ahri.archetype && c.id !== "Ahri").slice(0, 3);
  const tank = data.champions.find((c) => c.archetype === "tank")!;
  const rows = [row(tank.id, 0.56), ...mages.map((c, i) => row(c.id, 0.53 - i * 0.005)), row("Ahri", 0.55)];
  it("suggests strong champions in your style that you don't play yet", () => {
    const s = poolSuggestions({ data, history: games("Ahri", 6, 2), rows, mode: "aram" });
    expect(s.map((x) => x.champion.id)).toEqual(mages.map((c) => c.id));
    expect(s[0].like?.id).toBe("Ahri");
    expect(s.some((x) => x.champion.id === "Ahri")).toBe(false);
  });
  it("needs a few games and a tier list", () => {
    expect(poolSuggestions({ data, history: games("Ahri", 2, 1), rows, mode: "aram" })).toEqual([]);
    expect(poolSuggestions({ data, history: games("Ahri", 6, 2), rows: undefined, mode: "aram" })).toEqual([]);
  });
});
