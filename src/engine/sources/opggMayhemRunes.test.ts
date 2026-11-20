import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../../dev/fixture";
import { buildRunePage } from "../importLeague";
import { findChampion } from "../staticData";
import type { ChampionStats } from "../types";
import { opggChampionUrl, opggRunePages, withOpggRunes } from "./opgg";

// Real op.gg/lol/modes/aram-mayhem/yasuo/runes page (Nov 2026, patch 16.23), trimmed to the title and
// the RSC rune_pages payload. OP.GG's Mayhem build tables publish no games / win rates; runes do.
const html = readFileSync(new URL("../../../e2e/fixtures/opgg-mayhem-yasuo-runes.html", import.meta.url), "utf8");
const data = makeFixtureStaticData();
const hexStats: ChampionStats = { games: 2_700_000, wins: 1_431_000, items: { "3153": { games: 1000, wins: 560 } }, bestBuild: [3153, 6673, 3031], source: "hexmayhem" };

describe("OP.GG ARAM: Mayhem runes", () => {
  it("builds the Mayhem runes URL", () => {
    expect(opggChampionUrl("aram-mayhem", "Yasuo", undefined, "runes")).toBe("https://op.gg/lol/modes/aram-mayhem/yasuo/runes");
    expect(opggChampionUrl("aram", "Yasuo")).toBe("https://op.gg/lol/modes/aram/yasuo/build");
  });

  it("parses the real rune pages with games and win rates", () => {
    const runes = opggRunePages(html);
    expect(runes).toHaveLength(5);
    expect(runes[0]).toMatchObject({ primary: 8000, sub: 8100, perks: [8010, 9111, 9104, 8014, 8135, 8139], shards: [5005, 5008, 5001], games: 222 });
    expect(runes[0].wins / runes[0].games).toBeCloseTo(0.5225, 3);
    expect(runes.every((r) => r.games > 0 && r.perks.length === 6)).toBe(true);
    expect(opggRunePages("<html>not found</html>")).toEqual([]);
  });

  it("fills HexMayhem's missing runes without touching the build", () => {
    const merged = withOpggRunes(hexStats, opggRunePages(html));
    expect(merged.runesSource).toBe("opgg");
    expect(merged.runes).toHaveLength(5);
    expect({ ...merged, runes: undefined, runesSource: undefined }).toEqual({ ...hexStats, runes: undefined, runesSource: undefined });
    // Failure / no data: unchanged (no runes, as before).
    expect(withOpggRunes(hexStats, undefined)).toBe(hexStats);
    expect(withOpggRunes(hexStats, [])).toBe(hexStats);
    // A source with its own runes keeps them.
    const own = { ...hexStats, runes: [{ primary: 8100, sub: 8200, perks: [8112, 8139, 8138, 8135, 8226, 8210], games: 9, wins: 5 }] };
    expect(withOpggRunes(own, opggRunePages(html))).toBe(own);
  });

  it("Import to League writes the OP.GG Mayhem rune page", () => {
    const yasuo = findChampion(data, "Yasuo") ?? findChampion(data, "Ahri")!;
    const page = buildRunePage(yasuo, withOpggRunes(hexStats, opggRunePages(html)));
    expect(page).toMatchObject({ primary: 8000, sub: 8100, perks: [8010, 9111, 9104, 8014, 8135, 8139, 5005, 5008, 5001] });
  });
});
