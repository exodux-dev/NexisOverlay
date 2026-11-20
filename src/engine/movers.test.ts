import { describe, expect, it } from "vitest";
import {
  MAX_PATCHES,
  comparePatch,
  compactRows,
  computeMovers,
  emptyHistory,
  normalizeHistory,
  previousSnapshot,
  recordSnapshot,
  tierChange,
  type TierSnapshot,
} from "./movers";
import type { ChampionTierRow, Tier, TierPosition } from "./sources/tierlists";

const row = (championKey: string, tier: Tier, winRate: number, position?: TierPosition, pickRate = 0.05): ChampionTierRow => ({
  championKey,
  tier,
  winRate,
  pickRate,
  ...(position ? { position } : {}),
});
const snap = (patch: string, rows: ChampionTierRow[]): TierSnapshot => ({ patch, at: 0, rows: compactRows(rows) });

describe("patches", () => {
  it("compares numerically", () => {
    expect(comparePatch("16.9", "16.10")).toBeLessThan(0);
    expect(comparePatch("17.1", "16.24")).toBeGreaterThan(0);
    expect(comparePatch("16.23.1", "16.23")).toBe(0);
  });
});

describe("compactRows", () => {
  it("keeps id / tier / rounded rates / role, one row per champion and role", () => {
    const c = compactRows([row("Ahri", "S", 0.523456, "mid", 0.081234), row("Ahri", "A", 0.5, "mid"), row("Ahri", "B", 0.49, "support")]);
    expect(c).toEqual([
      { id: "Ahri", tier: "S", wr: 0.5235, pr: 0.0812, pos: "mid" },
      { id: "Ahri", tier: "B", wr: 0.49, pr: 0.05, pos: "support" },
    ]);
  });
});

describe("recordSnapshot", () => {
  it("adds, replaces the same patch and keeps the last 3 patches", () => {
    let h = emptyHistory();
    h = recordSnapshot(h, "aram", "16.20.1", [row("Ahri", "S", 0.52)], 1);
    h = recordSnapshot(h, "aram", "16.21", [row("Ahri", "A", 0.51)], 2);
    h = recordSnapshot(h, "aram", "16.21", [row("Ahri", "B", 0.5)], 3);
    expect(h.modes.aram.map((s) => s.patch)).toEqual(["16.20", "16.21"]);
    expect(h.modes.aram[1].rows[0].tier).toBe("B");
    h = recordSnapshot(h, "aram", "16.23", [row("Ahri", "S", 0.53)], 4);
    h = recordSnapshot(h, "aram", "16.22", [row("Ahri", "S", 0.53)], 5);
    expect(h.modes.aram.map((s) => s.patch)).toEqual(["16.21", "16.22", "16.23"]);
    expect(h.modes.aram).toHaveLength(MAX_PATCHES);
  });

  it("returns the same object when nothing changed or there's no patch / rows", () => {
    const h = recordSnapshot(emptyHistory(), "sr", "16.23", [row("Ahri", "S", 0.52, "mid")]);
    expect(recordSnapshot(h, "sr", "16.23", [row("Ahri", "S", 0.52, "mid")], 99)).toBe(h);
    expect(recordSnapshot(h, "sr", undefined, [row("Ahri", "S", 0.52)])).toBe(h);
    expect(recordSnapshot(h, "sr", "16.24", [])).toBe(h);
  });
});

describe("previousSnapshot / normalizeHistory", () => {
  it("finds the newest older patch for the mode", () => {
    let h = emptyHistory();
    for (const p of ["16.21", "16.22", "16.23"]) h = recordSnapshot(h, "aram", p, [row("Ahri", "S", 0.52)]);
    expect(previousSnapshot(h, "aram", "16.23")?.patch).toBe("16.22");
    expect(previousSnapshot(h, "aram", "16.24.2")?.patch).toBe("16.23");
    expect(previousSnapshot(h, "aram", "16.21")).toBeUndefined();
    expect(previousSnapshot(h, "sr", "16.23")).toBeUndefined();
  });

  it("drops junk from a loaded file", () => {
    expect(normalizeHistory(null)).toEqual(emptyHistory());
    expect(normalizeHistory({ v: 2, modes: {} })).toEqual(emptyHistory());
    const h = normalizeHistory({ v: 1, modes: { aram: [{ patch: "x", rows: [] }, { patch: "16.2", at: 0, rows: [] }, 5], sr: "nope" } });
    expect(h.modes).toEqual({ aram: [{ patch: "16.2", at: 0, rows: [] }] });
  });
});

describe("computeMovers", () => {
  const prev = snap("16.22", [
    row("Ahri", "A", 0.51),
    row("Zed", "S", 0.53),
    row("Lux", "B", 0.5),
    row("Jinx", "B", 0.5),
    row("Garen", "C", 0.48),
    row("Teemo", "B", 0.5),
  ]);
  const cur = [
    row("Ahri", "S", 0.525), // tier up
    row("Zed", "B", 0.5), // two tiers down
    row("Lux", "B", 0.51), // +1.0 pt, same tier → riser
    row("Jinx", "B", 0.505), // +0.5 pt → not a mover
    row("Garen", "C", 0.465), // −1.5 pt → faller
    row("Teemo", "A", 0.49), // tier up although WR fell → riser (tier wins)
    row("Smolder", "S", 0.55), // new: no previous row
  ];

  it("splits risers and fallers, biggest moves first", () => {
    const m = computeMovers(prev, cur);
    expect(m.risers.map((r) => r.id)).toEqual(["Ahri", "Teemo", "Lux"]);
    expect(m.fallers.map((r) => r.id)).toEqual(["Zed", "Garen"]);
    expect(m.risers[0]).toMatchObject({ oldTier: "A", newTier: "S", tierDelta: 1, wrDelta: 0.015 });
    expect(m.fallers[0]).toMatchObject({ oldTier: "S", newTier: "B", tierDelta: -2 });
    expect(m.fallers[1].wrDelta).toBeCloseTo(-0.015);
  });

  it("limits and honours the threshold", () => {
    expect(computeMovers(prev, cur, { limit: 1 }).risers.map((r) => r.id)).toEqual(["Ahri"]);
    expect(computeMovers(prev, cur, { minWrDelta: 0.005 }).risers.map((r) => r.id)).toContain("Jinx");
    expect(computeMovers(undefined, cur)).toEqual({ risers: [], fallers: [] });
  });

  it("matches Summoner's Rift rows per role and narrows to a position", () => {
    const p = snap("16.22", [row("Ahri", "B", 0.5, "mid"), row("Ahri", "C", 0.48, "support"), row("Vi", "A", 0.51, "jungle")]);
    const c = [row("Ahri", "A", 0.51, "mid"), row("Ahri", "C", 0.46, "support"), row("Vi", "C", 0.49, "jungle")];
    const all = computeMovers(p, c);
    expect(all.risers.map((r) => `${r.id}/${r.position}`)).toEqual(["Ahri/mid"]);
    expect(all.fallers.map((r) => `${r.id}/${r.position}`)).toEqual(["Vi/jungle", "Ahri/support"]);
    const mid = computeMovers(p, c, { position: "mid" });
    expect(mid.fallers).toEqual([]);
    expect(mid.risers).toHaveLength(1);
  });
});

describe("tierChange", () => {
  it("only reports changed tiers for the same role", () => {
    const p = snap("16.22", [row("Ahri", "A", 0.51), row("Lux", "B", 0.5), row("Vi", "A", 0.5, "jungle")]);
    expect(tierChange(p, row("Ahri", "S", 0.52))).toMatchObject({ oldTier: "A", newTier: "S", tierDelta: 1 });
    expect(tierChange(p, row("Lux", "B", 0.53))).toBeUndefined();
    expect(tierChange(p, row("Vi", "C", 0.5, "top"))).toBeUndefined();
    expect(tierChange(p, row("Vi", "C", 0.5, "jungle"))?.tierDelta).toBe(-2);
    expect(tierChange(undefined, row("Ahri", "S", 0.52))).toBeUndefined();
  });
});
