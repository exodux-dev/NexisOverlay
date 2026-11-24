import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOpggChampionPage } from "./opgg";

// Real op.gg Yasuo mid build page (Nov 2026, patch 16.23), trimmed to its stats tables. OP.GG changed
// "1,234 Games" to "1,234 games": the parser must read both, or every OP.GG build falls back to the template.
const html = readFileSync(new URL("../../../e2e/fixtures/opgg-sr-yasuo-build.html", import.meta.url), "utf8");

describe("OP.GG build page (real, lowercase 'games')", () => {
  const p = parseOpggChampionPage(html)!;
  it("reads core builds, boots, starters and spells with their numbers", () => {
    expect(p.coreBuilds[0]).toEqual({ items: [6673, 3031, 6333], games: 13654, winRate: 0.5738, pickRate: 0.2705 });
    expect(p.boots[0]).toMatchObject({ id: 3006, games: 79141 });
    expect(p.starters[0]).toMatchObject({ items: [1086, 2003], games: 67194 });
    expect(p.spells.map((s) => s.keys)).toEqual([
      ["SummonerFlash", "SummonerDot"],
      ["SummonerExhaust", "SummonerFlash"],
    ]);
    expect(p.skillOrder?.[0].order).toBe("QEW");
    expect(p.coreBuilds.length).toBeGreaterThanOrEqual(4);
  });
});
