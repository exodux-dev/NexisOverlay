import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import type { ChampionTierRow } from "./sources/tierlists";
import { findChampion } from "./staticData";
import type { MatchRecord } from "./types";
import { yourBestPicks } from "./yourPicks";

const data = makeFixtureStaticData();
const c = (id: string) => findChampion(data, id)!;
let n = 0;
const games = (champion: string, wins: number, losses: number): MatchRecord[] =>
  [...Array(wins).fill("Win"), ...Array(losses).fill("Lose")].map((result) => ({ id: String(n++), date: "2026-11-20T10:00:00Z", champion, result, kills: 0, deaths: 0, assists: 0, durationSec: 1200, items: [], augments: [], enemies: [], gameMode: "CLASSIC" }));
const row = (championKey: string, winRate: number, position = "top"): ChampionTierRow => ({ championKey, tier: 2, winRate, position }) as unknown as ChampionTierRow;

describe("your best picks", () => {
  const history = [...games("Malphite", 7, 2), ...games("Darius", 3, 5), ...games("Garen", 1, 0), ...games("Ahri", 6, 1)];
  const rows = [row("Malphite", 0.51), row("Darius", 0.5), row("Garen", 0.53), row("Ahri", 0.52, "mid")];
  it("ranks champions you play by your record, tier and fit; role-filtered on the Rift", () => {
    const picks = yourBestPicks({ data, history, mode: "sr", rows, position: "top", team: [c("Lux"), c("Jinx")] });
    expect(picks.map((p) => p.champion.id)).toEqual(["Malphite", "Darius"]); // Garen: 1 game; Ahri: not a top laner
    expect(picks[0]).toMatchObject({ games: 9, wins: 7 });
  });
  it("skips champions already taken, and in ARAM only what you can get", () => {
    expect(yourBestPicks({ data, history, mode: "sr", rows, position: "top", team: [c("Malphite")] }).map((p) => p.champion.id)).toEqual(["Darius"]);
    const aram = yourBestPicks({ data, history, mode: "aram", team: [c("Lux")], available: [c("Ahri"), c("Darius")] });
    expect(aram.map((p) => p.champion.id)).toEqual(["Ahri", "Darius"]);
  });
});
