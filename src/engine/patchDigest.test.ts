import { describe, expect, it } from "vitest";
import { diffChampion, diffItem, previousVersion } from "./patchDigest";

describe("patch digest", () => {
  it("finds base stat and ability changes, buff or nerf", () => {
    const prev = { id: "Ahri", name: "Ahri", stats: { hp: 590, armor: 21, movespeed: 330 }, spells: [{ name: "Orb", cooldown: [7, 7, 7, 7, 7], cost: [55, 65, 75, 85, 95] }, { name: "W", cooldown: [9] }] };
    const cur = { id: "Ahri", name: "Ahri", stats: { hp: 610, armor: 21, movespeed: 325 }, spells: [{ name: "Orb", cooldown: [7, 6.5, 6, 5.5, 5], cost: [55, 65, 75, 85, 95] }, { name: "W", cooldown: [9] }] };
    const d = diffChampion(prev, cur);
    expect(d.changes).toEqual([
      { label: "Base health", from: 590, to: 610, buff: true },
      { label: "Move speed", from: 330, to: 325, buff: false },
      { label: "Q cooldown", from: 7, to: 5, buff: true },
    ]);
  });
  it("finds item cost and stat changes", () => {
    const d = diffItem("6655", { name: "Luden's", gold: { total: 2750 }, stats: { FlatMagicDamageMod: 100, FlatMPPoolMod: 600 } }, { name: "Luden's", gold: { total: 2850 }, stats: { FlatMagicDamageMod: 110, FlatMPPoolMod: 600 } });
    expect(d.changes).toEqual([
      { label: "Cost", from: 2750, to: 2850, buff: false },
      { label: "Ability power", from: 100, to: 110, buff: true },
    ]);
  });
  it("previous patch = the newest version of the patch before", () => {
    expect(previousVersion(["16.23.1", "16.22.2", "16.22.1", "16.21.1"], "16.23.1")).toBe("16.22.2");
    expect(previousVersion(["16.23.1"], "16.23.1")).toBeUndefined();
    expect(previousVersion(["lolpatch_7.20", "16.23.1", "16.22.1"], "16.23.1")).toBe("16.22.1");
  });
});
