import { describe, expect, it } from "vitest";
import { augmentTargets } from "./augmentPlan";
import type { AugmentScore } from "./augments";
import type { AugmentRarity } from "./types";

const s = (name: string, rarity: AugmentRarity, score: number, unproven = false): AugmentScore =>
  ({ augment: { name, rarity, tags: [], desc: "" }, score, grade: "A", reasons: [], ...(unproven ? { unproven } : {}) }) as unknown as AugmentScore;

describe("augment targets (Look for next)", () => {
  const ranked = [s("P1", "prismatic", 0.9), s("P2", "prismatic", 0.8), s("P3", "prismatic", 0.7), s("G1", "gold", 0.85), s("G2", "gold", 0.6, true), s("S1", "silver", 0.5), s("Owned", "gold", 0.99)];
  it("top picks per rarity, skipping owned and unproven", () => {
    const t = augmentTargets(ranked, { owned: ["Owned"] });
    expect(t.prismatic.map((x) => x.score.augment.name)).toEqual(["P1", "P2"]);
    expect(t.gold.map((x) => x.score.augment.name)).toEqual(["G1"]);
    expect(t.silver.map((x) => x.score.augment.name)).toEqual(["S1"]);
  });
  it("notes owned augments it pairs with (combos)", () => {
    const t = augmentTargets(ranked, { owned: ["Owned"], combos: [{ augments: ["G1", "Owned"], winRate: 0.6 }] });
    expect(t.gold[0].pairsWith).toEqual(["Owned"]);
    expect(t.prismatic[0].pairsWith).toEqual([]);
  });
});
