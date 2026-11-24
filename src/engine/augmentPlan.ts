// "Look for next": the best augments still to take, per rarity, for this champion and the augments
// you already own (the ranking already accounts for owned ones). Mayhem / Arena offers come in one
// rarity at a time, so each rarity gets its own short list.
import type { AugmentRarity } from "./types";
import { synergiesFor, type AugmentContext, type AugmentScore } from "./augments";

export interface AugmentTarget {
  score: AugmentScore;
  /** Owned augments it pairs with (a known combo), if any. */
  pairsWith: string[];
}

export const RARITY_ORDER: AugmentRarity[] = ["prismatic", "gold", "silver"];

export function augmentTargets(ranked: AugmentScore[], ctx: Pick<AugmentContext, "combos" | "owned" | "champion">, perRarity = 2): Record<AugmentRarity, AugmentTarget[]> {
  const owned = new Set((ctx.owned ?? []).map((o) => o.toLowerCase()));
  const out = { prismatic: [], gold: [], silver: [] } as Record<AugmentRarity, AugmentTarget[]>;
  const sorted = [...ranked].filter((r) => !owned.has(r.augment.name.toLowerCase()) && !r.unproven).sort((a, b) => b.score - a.score);
  for (const r of sorted) {
    const list = out[r.augment.rarity];
    if (!list || list.length >= perRarity) continue;
    const pairsWith = synergiesFor(r.augment, ctx)
      .filter((s) => s.kind === "owned")
      .flatMap((s) => s.partners);
    list.push({ score: r, pairsWith: [...new Set(pairsWith)] });
  }
  return out;
}
