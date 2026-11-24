// Arena (gameMode CHERRY) build behavior: Arena-only item pool, Prismatic items in their own list,
// per-round gold (no fake start gold), top-4 wording — and other modes unchanged.

import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureRaw, makeFixtureStaticData } from "../dev/fixture";
import { rankAugments, findAugment } from "./augments";
import { recommendBuild } from "./build";
import { skillPlanFor } from "./guide";
import { parseLiveGame } from "./live";
import { assembleStaticData, findChampion, getItemMap, setItemMap } from "./staticData";
import { analyzeEnemies } from "./threat";
import type { ChampionStats, Item } from "./types";

// Arena item pool: everything except a few items Arena's shop doesn't sell.
const NOT_IN_ARENA = ["Mortal Reminder", "Mercury's Treads", "Long Sword", "Pickaxe", "B. F. Sword"];
const raw = makeFixtureRaw();
for (const it of Object.values(raw.items)) {
  if (!it.maps || it.maps["12"] === false) continue;
  it.maps = { ...it.maps, "30": !NOT_IN_ARENA.includes(it.name) };
}
raw.items["443090"] = {
  name: "Reaper's Toll",
  gold: { base: 2750, total: 2750, sell: 2750, purchasable: true },
  tags: ["Damage"],
  maps: { "11": false, "12": false, "30": true },
  image: { full: "443090.png" },
};
const data = assembleStaticData(raw.version, raw.champions, raw.items, raw.runes, raw.spells);
const enemies = parseLiveGame(demoAllGameData(), data)!.enemies; // heavy healing (Soraka, Aatrox, Vladimir)
const threat = analyzeEnemies(enemies);
const jinx = findChampion(data, "Jinx")!;
const byName = (n: string) => [...data.items.values()].find((i) => i.name === n)!;

function arenaStats(extra: Partial<ChampionStats> = {}): ChampionStats {
  const ie = byName("Infinity Edge").id;
  return {
    games: 10000,
    wins: 5300,
    mode: "arena",
    source: "opgg",
    avgPlace: 3.39,
    firstRate: 0.19,
    items: {
      [String(ie)]: { games: 4000, wins: 2200 },
      // The best-performing item on the champion is Prismatic: it must not join the gold build.
      "443090": { games: 1500, wins: 1100 },
    },
    boots: {},
    ...extra,
  } as ChampionStats;
}

const allIds = (plan: ReturnType<typeof recommendBuild>): Item[] => [
  ...plan.order.map((r) => r.item),
  ...plan.situational.map((r) => r.item),
  ...plan.bootsAlternatives.map((a) => a.item),
  ...plan.starter,
  ...(plan.next?.component ? [plan.next.component] : []),
];

describe("recommendBuild in Arena", () => {
  it("only recommends items sold in Arena (counters, boots, alternatives, components)", () => {
    const aram = recommendBuild({ data, champion: jinx, threat, mode: "aram", gold: 900 });
    expect(aram.situational.some((r) => r.item.name === "Mortal Reminder")).toBe(true); // control

    const plan = recommendBuild({ data, champion: jinx, threat, mode: "arena", gold: 900 });
    for (const it of allIds(plan)) expect(it.arena, it.name).toBe(true);
    expect(plan.situational.some((r) => r.item.name === "Mortal Reminder")).toBe(false);
    expect(plan.bootsAlternatives.some((a) => a.item.name === "Mercury's Treads")).toBe(false);
    expect(plan.situational.length).toBeGreaterThan(0);
    expect(plan.boots?.item.arena).toBe(true);
  });

  it("restores the globally active item map", () => {
    const prev = getItemMap();
    try {
      setItemMap("sr");
      recommendBuild({ data, champion: jinx, threat, mode: "arena" });
      expect(getItemMap()).toBe("sr");
    } finally {
      setItemMap(prev);
    }
  });

  it("lists Prismatic items separately, never in the gold build", () => {
    const plan = recommendBuild({ data, champion: jinx, threat, mode: "arena", stats: arenaStats() });
    expect(plan.prismatic.map((r) => r.item.id)).toEqual([443090]);
    expect(plan.prismatic[0].winRate).toMatchObject({ metric: "top4", games: 1500 });
    expect(plan.order.some((r) => r.item.id === 443090)).toBe(false);
    expect(plan.situational.some((r) => r.item.id === 443090)).toBe(false);
    expect(plan.next?.rec.item.id).not.toBe(443090);
  });

  it("has no Prismatic list outside Arena", () => {
    const plan = recommendBuild({ data: makeFixtureStaticData(), champion: jinx, threat, mode: "aram" });
    expect(plan.prismatic).toEqual([]);
  });

  it("says top 4 instead of win rate", () => {
    const stats = arenaStats({ bestBuild: [byName("Infinity Edge").id, byName("Phantom Dancer")?.id ?? 3046, byName("Lord Dominik's Regards")?.id ?? 3036] });
    const plan = recommendBuild({ data, champion: jinx, threat, mode: "arena", stats });
    expect(plan.sourceLabel).toMatch(/top 4/);
    expect(plan.sourceLabel).not.toMatch(/WR/);
    const ie = plan.order.find((r) => r.item.name === "Infinity Edge");
    expect(ie?.winRate?.metric).toBe("top4");

    // Same stats outside Arena keep the win wording.
    const sr = recommendBuild({ data, champion: jinx, threat, mode: "aram", stats: { ...stats, mode: undefined } });
    expect(sr.sourceLabel).toMatch(/WR/);
    expect(sr.order.find((r) => r.item.name === "Infinity Edge")?.winRate?.metric).toBeUndefined();
  });

  it("doesn't fake gold before the game: next buy has no affordability or component", () => {
    const plan = recommendBuild({ data, champion: jinx, threat, mode: "arena" });
    expect(plan.next?.goldUnknown).toBe(true);
    expect(plan.next?.affordable).toBe(false);
    expect(plan.next?.component).toBeUndefined();
    // No ARAM start-gold components either; no stats → no starter.
    expect(plan.starter).toEqual([]);
    expect(plan.starterSource).toBeUndefined();
  });

  it("uses live per-round gold when there is some", () => {
    const plan = recommendBuild({ data, champion: jinx, threat, mode: "arena", gold: 5000 });
    expect(plan.next?.goldUnknown).toBeUndefined();
    expect(plan.next?.affordable).toBe(true);
  });

  it("takes the most-played first shop from the stats as the starter", () => {
    const ie = byName("Infinity Edge").id;
    const boots = byName("Berserker's Greaves").id;
    const stats = arenaStats({ starters: [{ items: [boots], games: 100, wins: 50 }, { items: [ie], games: 900, wins: 500 }] });
    const plan = recommendBuild({ data, champion: jinx, threat, mode: "arena", stats });
    expect(plan.starter.map((i) => i.id)).toEqual([ie]);
    expect(plan.starterSource).toBe("stats");
  });

  it("leaves ARAM's start-gold starter unchanged", () => {
    const plan = recommendBuild({ data: makeFixtureStaticData(), champion: jinx, threat, mode: "aram", startGold: 1400 });
    expect(plan.starter.length).toBeGreaterThan(0);
    expect(plan.starter.reduce((s, i) => s + i.cost, 0)).toBeLessThanOrEqual(1400);
    expect(plan.starterSource).toBe("gold");
  });
});

describe("Arena live items", () => {
  it("maps Arena item copies (id + 220000) to the regular item", () => {
    const g = demoAllGameData();
    const me = g.allPlayers![0];
    me.items = [{ itemID: 223031, displayName: "Infinity Edge" }, { itemID: 443090, displayName: "Reaper's Toll" }];
    const snap = parseLiveGame(g, data)!;
    const p = [snap.me, ...snap.allies, ...snap.enemies].find((x) => x.items.some((i) => i.name === "Reaper's Toll"))!;
    expect(p.items.map((i) => i.id)).toEqual([3031, 443090]);
  });
});

describe("Arena wording in augments and the skill guide", () => {
  const aug = findAugment("Jeweled Gauntlet") ?? findAugment("Infinite Recursion");
  it("tags champion augment rates as top-4 rates in Arena only", () => {
    if (!aug) throw new Error("fixture augment missing");
    const stats = { games: 10000, wins: 5000, items: {}, augments: { [aug.name]: { games: 2000, wins: 1300 } } } as unknown as ChampionStats;
    const [arena] = rankAugments([aug], { champion: jinx, stats: { ...stats, mode: "arena" }, mode: "arena" });
    expect(arena.winRate).toMatchObject({ source: "champion", metric: "top4" });
    expect(arena.reasons.join(" ")).toMatch(/top-4 rate/);
    const [mayhem] = rankAugments([aug], { champion: jinx, stats, mode: "mayhem" });
    expect(mayhem.winRate?.metric).toBeUndefined();
    expect(mayhem.reasons.join(" ")).toMatch(/win rate/);
  });
  it("labels the stats skill order with top 4 in Arena", () => {
    const stats = { games: 1000, wins: 500, items: {}, skillOrders: [{ order: "QWE", games: 400, wins: 220 }] } as unknown as ChampionStats;
    expect(skillPlanFor(jinx, undefined, { ...stats, mode: "arena" }).note).toMatch(/55\.0% top 4 over 400 games/);
    expect(skillPlanFor(jinx, undefined, stats).note).toMatch(/55\.0% WR/);
  });
});
