import { describe, expect, it } from "vitest";
import { formSummary, recentChampions, topPicks } from "./home";
import type { ChampionTierRow } from "./sources/tierlists";
import type { MatchRecord } from "./types";

let seq = 0;
const rec = (champion: string, result: "Win" | "Lose", date: string, kda: [number, number, number] = [5, 3, 10]): MatchRecord => ({
  id: `m${seq++}`,
  date,
  champion,
  result,
  kills: kda[0],
  deaths: kda[1],
  assists: kda[2],
  durationSec: 1200,
  items: [],
  augments: [],
  enemies: [],
  gameMode: "KIWI",
});

describe("recentChampions", () => {
  it("merges games and picks newest first, de-duplicated", () => {
    const history = [rec("Ahri", "Win", "2026-11-01T10:00:00Z"), rec("Lux", "Lose", "2026-11-02T10:00:00Z"), rec("Ahri", "Win", "2026-11-03T10:00:00Z")];
    const picks = [{ id: "Jinx", at: Date.parse("2026-11-02T12:00:00Z") }, { id: "Lux", at: Date.parse("2026-11-01T00:00:00Z") }];
    const r = recentChampions(history, picks);
    expect(r.map((c) => c.id)).toEqual(["Ahri", "Jinx", "Lux"]);
    expect(r[0].source).toBe("game");
    expect(r[1].source).toBe("pick");
    // Lux: the game (Nov 2) is newer than the pick (Nov 1).
    expect(r[2].source).toBe("game");
  });

  it("appends the last detected champion after dated entries, respects limit and known()", () => {
    const history = [rec("Ahri", "Win", "2026-11-01T10:00:00Z"), rec("Fake", "Win", "2026-11-04T10:00:00Z")];
    const r = recentChampions(history, [], { lastChampion: "Zed", known: (id) => id !== "Fake" });
    expect(r.map((c) => c.id)).toEqual(["Ahri", "Zed"]);
    expect(r[1].source).toBe("detected");
    expect(recentChampions(history, [{ id: "Lux", at: 1 }], { limit: 1 }).map((c) => c.id)).toEqual(["Fake"]);
  });

  it("is empty with nothing to go on", () => {
    expect(recentChampions([], [])).toEqual([]);
  });
});

describe("formSummary", () => {
  it("summarises the last n games", () => {
    const h = [
      rec("Ahri", "Win", "2026-11-01T10:00:00Z", [10, 0, 5]),
      rec("Lux", "Lose", "2026-11-02T10:00:00Z", [2, 4, 6]),
      rec("Lux", "Win", "2026-11-03T10:00:00Z", [4, 2, 10]),
      rec("Ahri", "Win", "2026-11-04T10:00:00Z", [6, 2, 4]),
    ];
    const f = formSummary(h, 3);
    expect(f.games).toBe(3);
    expect(f.wins).toBe(2);
    expect(f.losses).toBe(1);
    expect(f.winRate).toBeCloseTo(2 / 3);
    expect(f.results.map((r) => r.win)).toEqual([false, true, true]);
    expect(f.kda).toBeCloseTo((12 + 20) / 8);
    expect(f.mostPlayed).toEqual({ champion: "Lux", games: 2, wins: 1 });
    expect(f.streak).toEqual({ win: true, count: 2 });
    expect(f.results[2].kda).toBe("6/2/4");
  });

  it("sorts by date, breaks most-played ties by recency, handles deathless games", () => {
    const h = [rec("Zed", "Lose", "2026-11-05T10:00:00Z", [3, 0, 3]), rec("Ahri", "Lose", "2026-11-01T10:00:00Z", [3, 0, 3])];
    const f = formSummary(h);
    expect(f.results.map((r) => r.champion)).toEqual(["Ahri", "Zed"]);
    expect(f.mostPlayed?.champion).toBe("Zed");
    expect(f.kda).toBe(12);
    expect(f.streak).toEqual({ win: false, count: 2 });
  });

  it("returns an empty summary without games", () => {
    const f = formSummary([]);
    expect(f.games).toBe(0);
    expect(f.winRate).toBeUndefined();
    expect(f.kda).toBeUndefined();
    expect(f.mostPlayed).toBeUndefined();
    expect(f.streak).toBeUndefined();
  });
});

describe("topPicks", () => {
  const row = (championKey: string, tier: ChampionTierRow["tier"], winRate: number, position?: ChampionTierRow["position"], rank?: number): ChampionTierRow => ({
    championKey,
    tier,
    winRate,
    position,
    rank,
  });
  it("takes the best rows, one per champion, filtered by role", () => {
    const rows = [row("A", "A", 0.55), row("B", "S", 0.52, "mid", 2), row("C", "S", 0.51, "mid", 1), row("B", "S", 0.5, "top", 1), row("D", "S", 0.53, "top", 2)];
    expect(topPicks(rows, 2, "mid").map((r) => r.championKey)).toEqual(["C", "B"]);
    expect(topPicks(rows, 5).map((r) => r.championKey)).toEqual(["C", "B", "D", "A"]);
    expect(topPicks(undefined)).toEqual([]);
  });
});

describe("favorites settings migration", () => {
  it("only adds the favorites key and keeps everything else", async () => {
    const { normalizeSettings } = await import("../app/store");
    const old = { hotkeyToggle: "Ctrl+Alt+O", lastChampion: "Ahri", playstyle: "safe", opacity: 0.8 };
    const s = normalizeSettings(old, true);
    expect(s.favorites).toEqual([]);
    expect(s.hotkeyToggle).toBe("Ctrl+Alt+O");
    expect(s.lastChampion).toBe("Ahri");
    expect(s.playstyle).toBe("safe");
    expect(s.opacity).toBe(0.8);
    expect(normalizeSettings({ ...old, favorites: ["Jinx", 3, "Lux"] }).favorites).toEqual(["Jinx", "Lux"]);
    expect(normalizeSettings({ ...old, favorites: ["Jinx"] }).favorites).toEqual(["Jinx"]);
  });
});

import { displayPatch } from "../ui/format";
describe("displayPatch", () => {
  it("shows the season-year patch name", () => {
    expect(displayPatch("16.23.1")).toBe("26.23");
    expect(displayPatch("16.23")).toBe("26.23");
    expect(displayPatch("15.24.1")).toBe("25.24");
    expect(displayPatch("26.1")).toBe("26.1");
    expect(displayPatch(undefined)).toBeUndefined();
  });
});
