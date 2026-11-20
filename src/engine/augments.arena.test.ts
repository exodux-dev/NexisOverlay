import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import {
  AUGMENTS,
  augmentTierBonus,
  augmentTierLetter,
  augmentsInPool,
  findAugment,
  isArenaAugment,
  rankAugments,
  registerArenaAugments,
  registerAugments,
  scoreAugment,
  setAugmentPool,
} from "./augments";
import { findChampion } from "./staticData";
import type { ChampionStats } from "./types";

// Runs in its own module context (vitest isolates files), so registering Arena augments here
// doesn't leak into other tests.

const data = makeFixtureStaticData();
const jinx = findChampion(data, "Jinx")!;

describe("Arena augment pool", () => {
  const before = AUGMENTS.length;
  const added = registerArenaAugments([
    { name: "Deft", rarity: "silver", desc: "Gain attack speed." }, // shared with Mayhem
    { name: "Warmup Routine", rarity: "silver", desc: "Gain the <spellName>Warmup Routine</spellName> Summoner Spell.<br><br>Up to @MaxStacks@% damage." },
    { name: "Fallen Aegis", rarity: "gold", desc: "Gain a shield at the start of each round." },
    { name: "Fan the Hammer", rarity: "prismatic", desc: "Fire bolts that apply your {{ Item_Keyword_OnHit }} and {{ Spell_Keyword_TrueDamage }}." },
  ]);

  it("adds Arena-only augments to the catalogue with clean descriptions", () => {
    expect(added).toBe(AUGMENTS.length - before);
    expect(findAugment("Warmup Routine")?.desc).toBe("Gain the Warmup Routine Summoner Spell. Up to ?% damage.");
    expect(findAugment("Fan the Hammer")?.rarity).toBe("prismatic");
    expect(findAugment("Fan the Hammer")?.desc).toBe("Fire bolts that apply your On-Hit and True Damage.");
    expect(isArenaAugment("deft")).toBe(true);
    expect(isArenaAugment("Warmup Routine")).toBe(true);
  });

  it("ranks only the Arena pool in Arena and hides Arena-only augments elsewhere", () => {
    const arena = rankAugments([...AUGMENTS], { champion: jinx, mode: "arena" }).map((s) => s.augment.name);
    expect(new Set(arena)).toEqual(new Set(["Deft", "Warmup Routine", "Fallen Aegis", "Fan the Hammer"]));
    const mayhem = rankAugments([...AUGMENTS], { champion: jinx, mode: "mayhem" }).map((s) => s.augment.name);
    expect(mayhem).toContain("Deft");
    expect(mayhem).not.toContain("Warmup Routine");
    expect(mayhem.length).toBeGreaterThan(arena.length);
  });

  it("infers the pool from stats.mode, then from setAugmentPool", () => {
    const stats: ChampionStats = { games: 1000, wins: 520, items: {}, mode: "arena" };
    expect(rankAugments([...AUGMENTS], { champion: jinx, stats })).toHaveLength(4);
    setAugmentPool("arena");
    try {
      expect(rankAugments([...AUGMENTS], { champion: jinx })).toHaveLength(4);
      expect(rankAugments([...AUGMENTS], { champion: jinx, mode: "mayhem" }).length).toBeGreaterThan(4);
    } finally {
      setAugmentPool("default");
    }
    expect(rankAugments([...AUGMENTS], { champion: jinx }).map((s) => s.augment.name)).not.toContain("Fallen Aegis");
  });

  it("an augment later seen outside Arena joins the default pool", () => {
    registerAugments([{ name: "Fallen Aegis", rarity: "gold" }]);
    expect(augmentsInPool([findAugment("Fallen Aegis")!], "default")).toHaveLength(1);
  });
});

describe("augment tiers", () => {
  it("maps tier 0..5 to a bonus/penalty and a letter", () => {
    expect([0, 1, 2, 3, 4, 5].map(augmentTierBonus)).toEqual([0.18, 0.1, 0.04, 0, -0.06, -0.12]);
    expect([0, 1, 2, 3, 4, 5, 9, -1].map(augmentTierLetter)).toEqual(["S", "S", "A", "B", "C", "D", "D", "S"]);
  });

  it("decides the order when there is no win rate, and shows the tier", () => {
    const deft = findAugment("Deft")!;
    const ctx = (tier: number) => ({ champion: jinx, augmentTiers: { Deft: tier } });
    const top = scoreAugment(deft, ctx(0));
    const bottom = scoreAugment(deft, ctx(5));
    const none = scoreAugment(deft, { champion: jinx });
    expect(top.score).toBeGreaterThan(none.score);
    expect(bottom.score).toBeLessThan(none.score);
    expect(top.globalTier).toBe("S");
    expect(bottom.globalTier).toBe("D");
    expect(top.reasons[0]).toMatch(/Tier S augment on Jinx/);
  });

  it("uses stats.augmentTiers and lifts the unproven cap for tiered augments", () => {
    const augments: ChampionStats["augments"] = {};
    for (const a of AUGMENTS.slice(0, 40)) if (a.name !== "Deft") augments[a.name] = { games: 400, wins: 200 };
    const stats: ChampionStats = { games: 4000, wins: 2000, items: {}, augments, augmentTiers: { Deft: 0 } };
    const tiered = scoreAugment(findAugment("Deft")!, { champion: jinx, stats });
    expect(tiered.unproven).toBeUndefined();
    const untiered = scoreAugment(findAugment("Deft")!, { champion: jinx, stats: { ...stats, augmentTiers: {} } });
    expect(untiered.unproven).toBe(true);
    expect(tiered.score).toBeGreaterThan(untiered.score);
  });

  it("is display-only once the champion's own win rate is reliable", () => {
    const stats = (tier: number): ChampionStats => ({ games: 10000, wins: 5000, items: {}, augments: { Deft: { games: 2000, wins: 1100 } }, augmentTiers: { Deft: tier } });
    const a = scoreAugment(findAugment("Deft")!, { champion: jinx, stats: stats(0) });
    const b = scoreAugment(findAugment("Deft")!, { champion: jinx, stats: stats(5) });
    expect(a.score).toBeCloseTo(b.score, 6);
    expect(a.winRate?.source).toBe("champion");
  });
});

describe("Arena stats lookups", () => {
  it("matches stats keyed with different capitalisation", () => {
    const stats: ChampionStats = { games: 4000, wins: 2000, items: {}, augments: { deft: { games: 900, wins: 540 } }, augmentTiers: { DEFT: 0 } };
    const r = scoreAugment(findAugment("Deft")!, { champion: jinx, stats });
    expect(r.winRate).toMatchObject({ games: 900, source: "champion" });
    expect(r.globalTier).toBe("S");
  });

  it("grades Arena augments against the champion's listed (proven) augments", () => {
    const names = AUGMENTS.slice(0, 30).map((a) => a.name);
    registerArenaAugments(names.map((name) => ({ name, rarity: "gold" })));
    const augments: ChampionStats["augments"] = {};
    names.forEach((n, i) => (augments[n] = { games: 1000, wins: 400 + i * 8 })); // 40% .. 63%
    const stats: ChampionStats = { games: 10000, wins: 5000, items: {}, augments, mode: "arena" };
    const ranked = rankAugments([...AUGMENTS], { champion: jinx, stats });
    const listed = ranked.filter((r) => !r.unproven); // sorted best first
    expect(listed).toHaveLength(30);
    expect(listed[0].grade).toBe("S");
    expect(listed[29].grade).toBe("D"); // worst listed augment is not inflated by the unproven tail
    expect(listed.filter((r) => r.grade === "S").length).toBeLessThanOrEqual(3);
  });
});
