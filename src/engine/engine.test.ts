import { describe, expect, it } from "vitest";
import { CHAMPION_KB } from "../data/championKb";
import { ALL_BOOTS, ARCHETYPE_BUILDS, CHAMPION_BUILDS, COUNTER_ITEMS, ENEMY_ITEM_SIGNALS } from "../data/itemKb";
import {
  FIXTURE_REMOVED_ITEMS,
  FIXTURE_VERSION,
  demoAllGameData,
  fixtureResponseFor,
  fixtureResponses,
  makeFixtureRaw,
  makeFixtureStaticData,
} from "../dev/fixture";
import { findAugment, rankAugments, scoreAugment } from "./augments";
import { investedGold, recommendBuild } from "./build";
import { parseLiveGame } from "./live";
import { findChampion, findItem } from "./staticData";
import { levenshtein, norm, similarity, smoothedWinRate } from "./text";
import { analyzeEnemies } from "./threat";
import type { PlayerState, StaticData } from "./types";

const data = makeFixtureStaticData();

function player(data: StaticData, champ: string, team: "ORDER" | "CHAOS", items: string[] = []): PlayerState {
  const champion = findChampion(data, champ);
  if (!champion) throw new Error(`unknown champion ${champ}`);
  return {
    championName: champion.name,
    champion,
    riotId: `${champ}#TEST`,
    team,
    level: 11,
    items: items.map((n) => {
      const it = findItem(data, n);
      if (!it) throw new Error(`unknown item ${n}`);
      return { id: it.id, name: it.name };
    }),
    kills: 2,
    deaths: 2,
    assists: 2,
    isMe: false,
  };
}

function demo() {
  const snap = parseLiveGame(demoAllGameData(), data);
  if (!snap) throw new Error("demo did not parse");
  return snap;
}

function augs(...names: string[]) {
  return names.map((n) => {
    const a = findAugment(n);
    if (!a) throw new Error(`unknown augment ${n}`);
    return a;
  });
}

// ------------------------------------------------------------------ fixture

describe("Data Dragon fixture", () => {
  it("covers every champion in the KB with unique keys and sensible display names", () => {
    expect(data.version).toBe(FIXTURE_VERSION);
    for (const id of Object.keys(CHAMPION_KB)) expect(data.championsById.has(id), id).toBe(true);
    expect(data.championsByKey.size).toBe(data.champions.length);
    expect(data.championsByKey.get(103)?.id).toBe("Ahri");
    expect(data.championsByKey.get(266)?.id).toBe("Aatrox");
    expect(findChampion(data, "Wukong")?.id).toBe("MonkeyKing");
    expect(findChampion(data, "Kai'Sa")?.id).toBe("Kaisa");
    expect(findChampion(data, "Nunu & Willump")?.id).toBe("Nunu");
    expect(findChampion(data, "Ahri")?.ranged).toBe(true);
    expect(findChampion(data, "Aatrox")?.ranged).toBe(false);
    // KB `r` override wins over Data Dragon range.
    expect(findChampion(data, "Jayce")?.ranged).toBe(true);
  });

  it("resolves every item name in itemKb (except items removed from the game)", () => {
    const names = new Set<string>([
      ...Object.values(ARCHETYPE_BUILDS).flatMap((b) => [...b.core, ...b.flex]),
      ...Object.values(CHAMPION_BUILDS).flatMap((b) => [...b.core, ...(b.flex ?? [])]),
      ...ALL_BOOTS,
      ...Object.values(COUNTER_ITEMS).flatMap((byFam) => Object.values(byFam).flat()),
      ...Object.keys(ENEMY_ITEM_SIGNALS),
    ]);
    const missing = [...names].filter((n) => !findItem(data, n));
    expect(missing.sort()).toEqual([...FIXTURE_REMOVED_ITEMS].sort());
  });

  it("has consistent component trees and completed flags", () => {
    const raw = makeFixtureRaw();
    for (const [id, it] of Object.entries(raw.items)) {
      if (Number(id) >= 200000) continue;
      for (const c of it.from ?? []) expect(raw.items[c]?.into, `${it.name} <- ${c}`).toContain(id);
      for (const p of it.into ?? []) expect(raw.items[p]?.from, `${it.name} -> ${p}`).toContain(id);
    }
    expect(data.items.get(3031)?.completed).toBe(true); // Infinity Edge
    expect(data.items.get(3020)?.completed).toBe(true); // boots count as completed
    expect(data.items.get(3108)?.completed).toBe(false); // Fiendish Codex
    expect(data.items.get(1001)?.completed).toBe(false); // plain Boots
  });

  it("filters mode copies, champion-only and non-store items, and hides non-ARAM items", () => {
    expect(data.items.has(223031)).toBe(false);
    expect(data.items.has(3599)).toBe(false);
    expect(data.items.has(3513)).toBe(false);
    expect(data.items.get(3340)?.aram).toBe(false);
    expect(findItem(data, "Stealth Ward")).toBeUndefined();
    expect(findItem(data, "Infinity Edge")?.id).toBe(3031);
  });

  it("builds runes, spells and fake HTTP responses", () => {
    expect(data.runes.get(8112)).toMatchObject({ name: "Electrocute", tree: "Domination" });
    expect(data.runes.get(8000)?.name).toBe("Precision");
    expect(data.spells.get(4)?.name).toBe("Flash");
    expect(data.spells.get(32)?.name).toBe("Mark");
    const res = fixtureResponses();
    expect((res["api/versions.json"] as string[])[0]).toBe(FIXTURE_VERSION);
    expect(Object.keys(res)).toEqual(
      expect.arrayContaining(["data/en_US/champion.json", "data/en_US/item.json", "data/en_US/runesReforged.json", "data/en_US/summoner.json"]),
    );
    const champs = fixtureResponseFor(`https://ddragon.leagueoflegends.com/cdn/${FIXTURE_VERSION}/data/en_US/champion.json`) as {
      data: Record<string, unknown>;
    };
    expect(champs.data.Ahri).toBeDefined();
    expect(fixtureResponseFor("https://example.com/nope.json")).toBeUndefined();
  });
});

// ------------------------------------------------------------------ live

describe("parseLiveGame", () => {
  it("picks me, allies and enemies", () => {
    const snap = demo();
    expect(snap.me.champion?.id).toBe("Ahri");
    expect(snap.me.isMe).toBe(true);
    expect(snap.me.team).toBe("ORDER");
    expect(snap.gold).toBe(1850);
    expect(snap.gameMode).toBe("KIWI");
    expect(snap.gameTime).toBe(742);
    expect(snap.allies).toHaveLength(4);
    expect(snap.allies.every((p) => p.team === "ORDER" && !p.isMe)).toBe(true);
    expect(snap.enemies.map((p) => p.champion?.id)).toEqual(["Soraka", "Aatrox", "Vladimir", "Zed", "Malphite"]);
    expect(snap.me.items.map((i) => i.name)).toEqual(["Luden's Echo", "Sorcerer's Shoes", "Fiendish Codex"]);
    expect(snap.ended).toBeUndefined();
  });

  it("matches me by game name when the riot id tag differs, and reads GameEnd", () => {
    const raw = demoAllGameData();
    raw.activePlayer = { riotIdGameName: "You", riotId: "You#EUW", currentGold: 10 };
    raw.events = { Events: [{ EventName: "GameEnd", Result: "Win" }] };
    const snap = parseLiveGame(raw, data)!;
    expect(snap.me.champion?.id).toBe("Ahri");
    expect(snap.ended).toEqual({ result: "Win" });
  });

  it("returns null without players", () => {
    expect(parseLiveGame({ activePlayer: {}, allPlayers: [] }, data)).toBeNull();
  });
});

// ------------------------------------------------------------------ threat

describe("analyzeEnemies", () => {
  it("reads the demo comp: heavy healing, AD burst, tanky", () => {
    const t = analyzeEnemies(demo().enemies);
    expect(t.heal).toBeGreaterThanOrEqual(0.55);
    expect(t.burst).toBeGreaterThan(0);
    expect(t.tankiness).toBeGreaterThan(0.3);
    expect(t.assassinsAd).toBe(1);
    expect(t.suppress).toEqual([]);
    expect(t.apShare + t.adShare).toBeCloseTo(1);
    const heal = t.meters.find((m) => m.key === "heal")!;
    expect(heal.sources).toEqual(expect.arrayContaining(["Soraka", "Aatrox", "Vladimir", "Aatrox (Sundered Sky)"]));
  });

  it("lists suppression champions", () => {
    const t = analyzeEnemies([player(data, "Malzahar", "CHAOS"), player(data, "Warwick", "CHAOS"), player(data, "Lux", "CHAOS")]);
    expect(t.suppress.sort()).toEqual(["Malzahar", "Warwick"]);
  });
});

// ------------------------------------------------------------------ build

describe("recommendBuild", () => {
  it("adapts Ahri's build to the demo comp", () => {
    const snap = demo();
    const threat = analyzeEnemies(snap.enemies);
    const plan = recommendBuild({ data, champion: snap.me.champion!, threat, me: snap.me, gold: snap.gold });

    expect(plan.family).toBe("ap");
    expect(plan.order).toHaveLength(6);
    expect(plan.order[0].item.name).toBe("Luden's Echo");
    expect(plan.order[1].kind).toBe("boots");
    expect(plan.order[1].item.name).toBe("Sorcerer's Shoes");

    const morello = plan.situational.find((r) => r.item.name === "Morellonomicon");
    expect(morello?.counter).toBe("antiheal");
    expect(morello!.urgency!).toBeGreaterThanOrEqual(0.55);
    expect(plan.order.some((r) => r.item.name === "Morellonomicon")).toBe(true);

    // Owned flags.
    const owned = plan.order.filter((r) => r.owned).map((r) => r.item.name);
    expect(owned).toEqual(["Luden's Echo", "Sorcerer's Shoes"]);

    // Next buy = first unowned item in order.
    const firstUnowned = plan.order.find((r) => !r.owned)!;
    expect(plan.next?.rec.item.id).toBe(firstUnowned.item.id);
    expect(plan.next?.missingGold).toBe(firstUnowned.item.cost - firstUnowned.invested);
    expect(plan.next?.affordable).toBe(snap.gold >= plan.next!.missingGold);
    if (!plan.next!.affordable) expect(plan.next!.component!.cost).toBeLessThanOrEqual(snap.gold);

    // Fiendish Codex in the bag counts toward Morellonomicon.
    const codex = findItem(data, "Fiendish Codex")!;
    const inOrder = plan.order.find((r) => r.item.name === "Morellonomicon")!;
    expect(inOrder.invested).toBe(codex.cost);
    expect(investedGold(data, findItem(data, "Morellonomicon")!, snap.me.items.map((i) => i.id))).toBe(codex.cost);
  });

  it("puts urgent counters in urgency order (most urgent first)", () => {
    const snap = demo();
    const plan = recommendBuild({ data, champion: snap.me.champion!, threat: analyzeEnemies(snap.enemies), me: snap.me });
    const urgent = plan.order.filter((r) => r.kind === "situational").map((r) => r.urgency!);
    expect(urgent.length).toBeGreaterThan(1);
    expect([...urgent].sort((a, b) => b - a)).toEqual(urgent);
    expect(plan.order[2].item.name).toBe("Shadowflame"); // core #2 stays ahead of counters
    expect(plan.order[3].item.name).toBe("Morellonomicon");
  });

  it("suggests Mortal Reminder for an ADC vs heavy healing", () => {
    const threat = analyzeEnemies(demo().enemies);
    const plan = recommendBuild({ data, champion: findChampion(data, "Jinx")!, threat });
    expect(plan.family).toBe("adc");
    expect(plan.situational[0].item.name).toBe("Mortal Reminder");
    expect(plan.order.map((r) => r.item.name)).toContain("Mortal Reminder");
  });

  it("gives a tank armor + Plated Steelcaps vs heavy AD", () => {
    const enemies = ["Zed", "Talon", "Jinx", "Darius", "Draven"].map((c) => player(data, c, "CHAOS"));
    const threat = analyzeEnemies(enemies);
    expect(threat.adShare).toBeGreaterThan(0.9);
    const plan = recommendBuild({ data, champion: findChampion(data, "Malphite")!, threat });
    expect(plan.boots?.item.name).toBe("Plated Steelcaps");
    expect(plan.situational.some((r) => r.counter === "armor" && r.item.stats.FlatArmorMod > 0)).toBe(true);
    expect(plan.order.map((r) => r.item.name)).toContain("Randuin's Omen");
  });

  it("says 'most built' when a rarely built pair has the better rate (no false 'highest')", () => {
    const berserker = findItem(data, "Berserker's Greaves")!.id;
    const swift = findItem(data, "Boots of Swiftness")!.id;
    const stats = { games: 1400, wins: 560, items: {}, boots: { [berserker]: { games: 1297, wins: 492 }, [swift]: { games: 69, wins: 43 } } };
    const plan = recommendBuild({ data, champion: findChampion(data, "Jinx")!, threat: analyzeEnemies([]), stats });
    expect(plan.boots?.item.id).toBe(berserker);
    expect(plan.boots?.reasons.join(' ')).toMatch(/Most built boots/);
    const clear = { ...stats, boots: { [berserker]: { games: 1297, wins: 700 }, [swift]: { games: 69, wins: 30 } } };
    expect(recommendBuild({ data, champion: findChampion(data, "Jinx")!, threat: analyzeEnemies([]), stats: clear }).boots?.reasons.join(' ')).toMatch(/Highest win rate boots/);
  });

  it("keeps the boots the player already owns", () => {
    const me = { ...player(data, "Ahri", "ORDER", ["Mercury's Treads"]), isMe: true };
    const plan = recommendBuild({ data, champion: me.champion!, threat: analyzeEnemies(demo().enemies), me });
    expect(plan.boots?.item.name).toBe("Mercury's Treads");
    expect(plan.boots?.owned).toBe(true);
  });
});

// ------------------------------------------------------------------ augments

describe("rankAugments", () => {
  const threat = analyzeEnemies(demo().enemies);
  const pool = augs("Eureka", "Infinite Recursion", "Jeweled Gauntlet", "Draw Your Sword", "Big Shot", "Deft");
  const rank = (champ: string) => rankAugments(pool, { champion: findChampion(data, champ)!, threat }).map((s) => s.augment.name);

  it("prefers AP/haste augments for Ahri", () => {
    const order = rank("Ahri");
    for (const good of ["Eureka", "Infinite Recursion", "Jeweled Gauntlet"])
      for (const bad of ["Draw Your Sword", "Big Shot", "Deft"]) expect(order.indexOf(good), `${good} > ${bad}`).toBeLessThan(order.indexOf(bad));
  });

  it("prefers crit augments for Jinx", () => {
    const order = rank("Jinx");
    expect(order.indexOf("Big Shot")).toBeLessThan(order.indexOf("Eureka"));
  });

  it("penalises ranged-only augments on melee champions", () => {
    const [scoped] = augs("Scoped Weapons");
    const melee = scoreAugment(scoped, { champion: findChampion(data, "Aatrox")! });
    const ranged = scoreAugment(scoped, { champion: findChampion(data, "Jinx")! });
    expect(melee.score).toBeLessThan(ranged.score);
    expect(melee.reasons.join(" ")).toMatch(/Ranged-only/);
  });

  it("penalises augments already owned", () => {
    const [eureka] = augs("Eureka");
    const ahri = findChampion(data, "Ahri")!;
    expect(scoreAugment(eureka, { champion: ahri, owned: ["Eureka"] }).score).toBeLessThan(scoreAugment(eureka, { champion: ahri }).score);
  });
});

// ------------------------------------------------------------------ text

describe("text helpers", () => {
  it("normalizes names", () => {
    expect(norm("Kai'Sa")).toBe("kaisa");
    expect(norm("Nunu & Willump")).toBe("nunuandwillump");
    expect(norm("Jak'Sho, The Protean")).toBe("jakshotheprotean");
  });

  it("computes similarity", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(similarity("Kai'Sa", "kaisa")).toBe(1);
    expect(similarity("", "abc")).toBe(0);
    expect(similarity("Infinity Edge", "Infinty Edge")).toBeGreaterThan(0.9);
    expect(similarity("Ahri", "Zed")).toBeLessThan(0.3);
  });

  it("smooths win rates toward the prior", () => {
    expect(smoothedWinRate(0, 0)).toBe(0.5);
    expect(smoothedWinRate(3, 3)).toBeCloseTo(13 / 23);
    expect(smoothedWinRate(3, 3)).toBeLessThan(1);
    expect(smoothedWinRate(600, 1000)).toBeCloseTo(0.598, 3);
    expect(smoothedWinRate(10, 10, 0.4, 10)).toBeCloseTo(0.7);
  });
});

import { levelSequence, skillPlanFor } from "./guide";
import { SKILL_ORDERS } from "../data/coachKb";

describe("skill order", () => {
  it("expands a plan into 18 levels with R at 6/11/16", () => {
    const seq = levelSequence({ max: ["Q", "E", "W"], start: ["Q", "W", "E"] });
    expect(seq).toHaveLength(18);
    expect(seq.slice(0, 3)).toEqual(["Q", "W", "E"]);
    expect([seq[5], seq[10], seq[15]]).toEqual(["R", "R", "R"]);
    const count = (k: string) => seq.filter((s) => s === k).length;
    expect([count("Q"), count("W"), count("E"), count("R")]).toEqual([5, 5, 5, 3]);
    // Q maxed first: 5th Q point lands before any 3rd E point beyond start.
    expect(seq.lastIndexOf("Q")).toBeLessThan(seq.lastIndexOf("E"));
    expect(seq.lastIndexOf("E")).toBeLessThan(seq.lastIndexOf("W"));
  });
  it("has a curated plan for every champion", () => {
    for (const id of Object.keys(CHAMPION_KB)) {
      const p = SKILL_ORDERS[id];
      expect(p, id).toBeDefined();
      expect([...p.max].sort().join(""), id).toBe("EQW");
      expect(levelSequence(p), id).toHaveLength(18);
    }
  });
  it("prefers aggregated skill orders when present", () => {
    const data = makeFixtureStaticData();
    const ahri = data.championsById.get("Ahri")!;
    const plan = skillPlanFor(ahri, undefined, { games: 100, wins: 50, items: {}, skillOrders: [{ order: "WEQ", games: 60, wins: 33 }] });
    expect(plan.max).toEqual(["W", "E", "Q"]);
    expect(plan.source).toBe("stats");
  });
});
