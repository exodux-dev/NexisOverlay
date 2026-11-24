import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOpggSynergies } from "./opgg";

const read = (f: string) => readFileSync(new URL(`../../../e2e/fixtures/${f}`, import.meta.url), "utf8");

describe("OP.GG synergies (real pages, trimmed)", () => {
  it("Arena: duo partners with placement, games and win rate", () => {
    const r = parseOpggSynergies(read("opgg-arena-jinx-synergies.html"));
    expect(r.all.length).toBeGreaterThan(20);
    expect(r.all[0]).toEqual({ championKey: "Sett", avgPlace: 3.19, firstRate: 0.2403, pickRate: 0.0129, games: 1103, winRate: 0.5811 });
  });
  it("Rift: partners per lane", () => {
    const r = parseOpggSynergies(read("opgg-sr-jinx-synergies.html"));
    expect(Object.keys(r).sort()).toEqual(["jungle", "middle", "support", "top"]);
    expect(r.support[0]).toEqual({ championKey: "Lulu", pickRate: 0.1536, games: 18782, winRate: 0.5034 });
  });
  it("no table / no data: empty", () => {
    expect(parseOpggSynergies("<html></html>")).toEqual({});
    expect(parseOpggSynergies('<table><caption>Synergies</caption><tr><td>No data available.</td></tr></table>')).toEqual({ all: [] });
  });
});
