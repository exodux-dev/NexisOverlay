import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { recommendBuild, type BuildPlan } from "./build";
import type { GameModeKind } from "./mode";
import {
  CONTROL_WARD,
  ELIXIR_SORCERY,
  ELIXIR_WRATH,
  gamePhase,
  laningEndsAt,
  phaseLabel,
  shopAdvice,
  type ShopAdvice,
} from "./phase";
import { findChampion, indexItemsByName } from "./staticData";
import { analyzeEnemies, type ThreatReport } from "./threat";
import type { GameSnapshot, Item, PlayerState, StaticData } from "./types";

// ------------------------------------------------------------------ fixture

function consumable(id: number, name: string, cost: number, sr: boolean, aram: boolean, tags: string[]): Item {
  return { id, name, cost, icon: `${id}.png`, from: [], into: [], tags, stats: {}, aram, sr, completed: false, plaintext: "", statLines: [], effects: [] };
}

function makeData(): StaticData {
  const data = makeFixtureStaticData();
  // Real Data Dragon has these; the fixture doesn't.
  data.items.set(CONTROL_WARD, consumable(CONTROL_WARD, "Control Ward", 75, true, false, ["Consumable", "Vision"]));
  data.items.set(2138, consumable(2138, "Elixir of Iron", 500, true, true, ["Consumable"]));
  data.items.set(ELIXIR_SORCERY, consumable(ELIXIR_SORCERY, "Elixir of Sorcery", 500, true, true, ["Consumable"]));
  data.items.set(ELIXIR_WRATH, consumable(ELIXIR_WRATH, "Elixir of Wrath", 500, true, true, ["Consumable"]));
  data.items.set(3340, consumable(3340, "Stealth Ward", 0, true, false, ["Trinket", "Vision"]));
  return data;
}

const data = makeData();
const id = (name: string) => {
  const it = [...data.items.values()].find((i) => i.name === name);
  if (!it) throw new Error(`unknown item ${name}`);
  return it.id;
};

function player(champ: string, team: "ORDER" | "CHAOS", items: string[] = [], isMe = false, level = 9): PlayerState {
  const champion = findChampion(data, champ);
  if (!champion) throw new Error(champ);
  return {
    championName: champion.name,
    champion,
    riotId: `${champ}#T`,
    team,
    level,
    items: items.map((n) => ({ id: id(n), name: n })),
    kills: 1,
    deaths: 1,
    assists: 1,
    isMe,
  };
}

const HEALERS = ["Soraka", "Aatrox", "Vladimir", "Zed", "Malphite"];
const NO_HEAL = ["Zed", "Malphite", "Jinx", "Lux", "Darius"];

interface Setup {
  champ?: string;
  mode?: GameModeKind;
  items?: string[];
  gold?: number;
  time?: number;
  level?: number;
  enemies?: string[];
  loading?: boolean;
  explore?: boolean;
  firstTowerAt?: number;
  data?: StaticData;
}

function setup(s: Setup = {}): { advice: ShopAdvice; plan: BuildPlan; game: GameSnapshot; threat: ThreatReport } {
  const d = s.data ?? data;
  const mode = s.mode ?? "sr";
  const me = player(s.champ ?? "Ahri", "ORDER", s.items ?? [], true, s.level ?? 9);
  const enemies = (s.enemies ?? NO_HEAL).map((n) => player(n, "CHAOS"));
  const threat = analyzeEnemies(enemies);
  const game: GameSnapshot = {
    source: "live",
    gameMode: s.explore ? "EXPLORE" : mode === "sr" ? "CLASSIC" : "ARAM",
    gameTime: s.time ?? 10 * 60,
    gold: s.gold ?? 0,
    me,
    allies: [],
    enemies,
    ...(s.loading ? { loading: true } : {}),
    ...(s.firstTowerAt !== undefined ? { firstTowerAt: s.firstTowerAt } : {}),
  };
  const champion = me.champion!;
  const plan = recommendBuild({ data: d, champion, threat, me, gold: game.gold, mode, startGold: mode === "sr" ? 500 : 1400 });
  return { advice: shopAdvice({ data: d, plan, game, mode, threat }), plan, game, threat };
}

const names = (a: ShopAdvice) => a.buyNow.map((b) => b.name);

// ------------------------------------------------------------------ phase

describe("gamePhase", () => {
  const p = (mode: GameModeKind, gameTime: number, level = 9, extra: Partial<Parameters<typeof gamePhase>[0]> = {}) =>
    gamePhase({ mode, inGame: true, gameTime, level, ...extra });

  it("is pregame outside a game", () => {
    for (const mode of ["sr", "aram", "mayhem", "arena"] as const) expect(gamePhase({ mode, inGame: false, gameTime: 900, level: 12 })).toBe("pregame");
  });

  it("Summoner's Rift: early < 3:30, laning to 14:00, mid to 25:00, then late", () => {
    expect(p("sr", 0)).toBe("early");
    expect(p("sr", 209)).toBe("early");
    expect(p("sr", 210)).toBe("laning");
    expect(p("sr", 13 * 60 + 59)).toBe("laning");
    expect(p("sr", 14 * 60)).toBe("mid");
    expect(p("sr", 24 * 60 + 59)).toBe("mid");
    expect(p("sr", 25 * 60)).toBe("late");
  });

  it("Summoner's Rift: an early first tower ends the laning phase (never before 9:00)", () => {
    expect(laningEndsAt(undefined)).toBe(14 * 60);
    expect(laningEndsAt(11 * 60)).toBe(11 * 60);
    expect(laningEndsAt(6 * 60)).toBe(9 * 60);
    expect(laningEndsAt(20 * 60)).toBe(14 * 60);
    expect(p("sr", 12 * 60, 9, { firstTowerAt: 11 * 60 })).toBe("mid");
    expect(p("sr", 8 * 60, 9, { firstTowerAt: 6 * 60 })).toBe("laning");
  });

  it("ARAM / Mayhem: no lane phase — early by time or level, late by time or full build", () => {
    for (const mode of ["aram", "mayhem"] as const) {
      expect(p(mode, 5 * 60, 12)).toBe("early");
      expect(p(mode, 8 * 60, 8)).toBe("early");
      expect(p(mode, 8 * 60, 10)).toBe("mid");
      expect(p(mode, 18 * 60, 14)).toBe("mid");
      expect(p(mode, 18 * 60 + 1, 14)).toBe("late");
      expect(p(mode, 12 * 60, 14, { fullBuild: true })).toBe("late");
      expect(p(mode, 30 * 60, 18)).not.toBe("laning");
    }
  });

  it("Arena: phase follows items owned (and level), not the clock", () => {
    expect(p("arena", 20 * 60, 3, { completedItems: 0 })).toBe("early");
    expect(p("arena", 60, 6, { completedItems: 2 })).toBe("mid");
    expect(p("arena", 60, 11, { completedItems: 1 })).toBe("mid");
    expect(p("arena", 60, 12, { completedItems: 4 })).toBe("late");
    expect(p("arena", 60, 8, { fullBuild: true })).toBe("late");
  });

  it("labels phases per mode", () => {
    expect(phaseLabel("laning", "sr")).toBe("Laning phase");
    expect(phaseLabel("mid", "sr")).toBe("Mid game");
    expect(phaseLabel("late", "aram")).toBe("Late game");
    expect(phaseLabel("early", "arena")).toBe("Early rounds");
  });
});

// ------------------------------------------------------------------ shop advice

describe("shopAdvice — pregame", () => {
  it("recommends starting items and the first item to save for", () => {
    const { advice, plan } = setup({ explore: true, gold: 500 });
    expect(advice.phase).toBe("pregame");
    expect(advice.phaseLabel).toBe("Pre-game");
    expect(advice.gold).toBeUndefined();
    expect(advice.buyNow.map((b) => Number(b.itemId))).toEqual(plan.starter.slice(0, 3).map((i) => i.id));
    expect(advice.saveFor?.name).toBe(plan.order[0].item.name);
    expect(advice.tips[0]).toContain(plan.order[0].item.name);
    expect(advice.tips.length).toBeLessThanOrEqual(3);
  });

  it("treats the loading screen as pregame", () => {
    expect(setup({ loading: true, gold: 500 }).advice.phase).toBe("pregame");
  });

  it("works without a plan or a game", () => {
    const a = shopAdvice({ data, game: null, mode: "aram" });
    expect(a).toMatchObject({ phase: "pregame", buyNow: [] });
  });
});

describe("shopAdvice — gold paths (Ahri, Summoner's Rift)", () => {
  // Ahri's plan: Luden's Echo (Lost Chapter + Blasting Wand) → Sorcerer's Shoes → Shadowflame …
  it("completes the next item when affordable and starts the following one", () => {
    const { advice, plan } = setup({ items: ["Lost Chapter", "Boots"], gold: 2000 });
    expect(plan.order[0].item.name).toBe("Luden's Echo");
    expect(advice.buyNow[0]).toMatchObject({ name: "Luden's Echo", cost: 2750 - 1200 });
    expect(advice.buyNow[0].reason).toMatch(/combines your components/);
    // 450g left: the next planned item is the boots upgrade (Amplifying Tome).
    expect(names(advice)).toContain("Amplifying Tome");
    expect(advice.gold).toBe(2000);
  });

  it("buys the most valuable affordable component when the item is out of reach", () => {
    const { advice } = setup({ gold: 1300, time: 5 * 60 });
    expect(advice.phase).toBe("laning");
    expect(advice.buyNow[0]).toMatchObject({ name: "Lost Chapter", cost: 1200 });
    expect(advice.buyNow[0].reason).toBe("Builds into Luden's Echo");
    // 100g left → a Control Ward (75g), which does not count toward the item.
    expect(names(advice)).toEqual(["Lost Chapter", "Control Ward"]);
    expect(advice.saveFor).toMatchObject({ name: "Luden's Echo", need: 2750 - 1300 + 75 });
  });

  it("prices components net of owned sub-components", () => {
    const { advice } = setup({ items: ["Amplifying Tome"], gold: 900, time: 5 * 60 });
    const lc = advice.buyNow.find((b) => b.name === "Lost Chapter");
    expect(lc).toMatchObject({ cost: 800 });
    expect(lc!.reason).toMatch(/uses your Amplifying Tome/);
  });

  it("never picks a component and its own sub-component together", () => {
    const { advice } = setup({ gold: 1700, time: 5 * 60 });
    expect(names(advice)).toContain("Lost Chapter");
    expect(names(advice)).not.toContain("Amplifying Tome");
    expect(names(advice)).not.toContain("Sapphire Crystal");
  });

  it("fills leftover gold with tier-1 boots early and a Control Ward on SR", () => {
    const { advice } = setup({ gold: 1675, time: 4 * 60 });
    expect(names(advice)).toEqual(["Lost Chapter", "Boots", "Control Ward"]);
    expect(advice.buyNow.every((b) => b.cost <= 1675)).toBe(true);
    expect(advice.buyNow.reduce((s, b) => s + b.cost, 0)).toBeLessThanOrEqual(1675);
  });

  it("stops suggesting Control Wards once you carry two", () => {
    const one = setup({ items: ["Stealth Ward", "Boots", "Control Ward"], gold: 80, time: 9 * 60 }).advice;
    expect(names(one)).toEqual(["Control Ward"]);
    expect(one.buyNow[0].reason).toMatch(/Second/);
    const two = setup({ items: ["Stealth Ward", "Boots", "Control Ward", "Control Ward"], gold: 80, time: 9 * 60 }).advice;
    expect(names(two)).not.toContain("Control Ward");
  });

  it("is always affordable", () => {
    for (const gold of [0, 74, 200, 450, 900, 1250, 2400, 3500, 6000]) {
      const { advice } = setup({ gold, time: 8 * 60 });
      expect(advice.buyNow.reduce((s, b) => s + b.cost, 0)).toBeLessThanOrEqual(gold);
      expect(advice.buyNow.length).toBeLessThanOrEqual(3);
    }
    expect(setup({ gold: 0 }).advice.buyNow).toEqual([]);
  });

  it("treats a missing / garbage gold value as 0 (never NaN)", () => {
    const { advice } = setup({ gold: Number.NaN, time: 8 * 60 });
    expect(advice.gold).toBe(0);
    expect(advice.buyNow).toEqual([]);
    expect(Number.isFinite(advice.saveFor?.need)).toBe(true);
  });

  it("respects a full inventory (no free slot for an extra component)", () => {
    const items = ["Luden's Echo", "Sorcerer's Shoes", "Shadowflame", "Morellonomicon", "Long Sword", "Dagger"];
    const { advice } = setup({ items, gold: 1250, time: 22 * 60 });
    // Rabadon's is next; its parts would need a seventh slot.
    expect(names(advice)).toEqual([]);
    expect(advice.saveFor?.name).toBe("Rabadon's Deathcap");
  });
});

describe("shopAdvice — unique items", () => {
  it("never recommends an item you already completed", () => {
    const { advice } = setup({ items: ["Luden's Echo", "Sorcerer's Shoes"], gold: 5000, time: 16 * 60 });
    expect(names(advice)).not.toContain("Luden's Echo");
    expect(names(advice)).not.toContain("Sorcerer's Shoes");
    expect(names(advice)[0]).toBe("Shadowflame");
  });

  it("never recommends a second pair of boots", () => {
    const { advice } = setup({ items: ["Mercury's Treads"], gold: 5000, time: 6 * 60 });
    expect(advice.buyNow.some((b) => data.items.get(Number(b.itemId))?.tags.includes("Boots"))).toBe(false);
  });

  it("does not add tier-1 boots when you already have boots", () => {
    const { advice } = setup({ items: ["Boots"], gold: 1700, time: 5 * 60 });
    expect(names(advice).filter((n) => n === "Boots")).toEqual([]);
  });

  it("does not repeat an item within one suggestion", () => {
    for (const gold of [400, 1600, 3200, 5000]) {
      const ids = setup({ gold, time: 6 * 60 }).advice.buyNow.map((b) => b.itemId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("shopAdvice — anti-heal", () => {
  it("puts a Grievous Wounds component first against heavy healing and says why", () => {
    const { advice, threat } = setup({ enemies: HEALERS, gold: 900, time: 6 * 60 });
    expect(threat.heal).toBeGreaterThanOrEqual(0.8);
    expect(advice.buyNow[0].name).toBe("Oblivion Orb");
    expect(advice.buyNow[0].reason).toMatch(/^Anti-heal vs Soraka, Aatrox — builds into Morellonomicon$/);
    expect(advice.tips[0]).toBe("Enemy has heavy healing — buy Oblivion Orb early");
  });

  it("drops the anti-heal advice once you own it", () => {
    const { advice } = setup({ enemies: HEALERS, items: ["Oblivion Orb"], gold: 900, time: 6 * 60 });
    expect(names(advice)).not.toContain("Oblivion Orb");
    expect(advice.tips.join(" ")).not.toMatch(/healing/);
  });
});

describe("shopAdvice — full build", () => {
  const full = ["Luden's Echo", "Sorcerer's Shoes", "Shadowflame", "Morellonomicon", "Rabadon's Deathcap", "Void Staff"];

  it("suggests an Elixir late on SR and the sell-boots tip", () => {
    const { advice } = setup({ items: full, gold: 1500, time: 32 * 60, level: 18 });
    expect(advice.phase).toBe("late");
    expect(names(advice)).toEqual(["Elixir of Sorcery"]);
    expect(advice.saveFor).toBeUndefined();
    expect(advice.tips.some((t) => /selling boots/.test(t))).toBe(true);
  });

  it("ARAM: full build → late game Elixir, no Control Ward, no sell-boots tip", () => {
    const { advice } = setup({ mode: "aram", items: full, gold: 1500, time: 15 * 60, level: 16 });
    expect(advice.phase).toBe("late");
    expect(names(advice)).toEqual(["Elixir of Sorcery"]);
    expect(advice.tips.join(" ")).not.toMatch(/selling boots/);
  });

  it("marksmen get Elixir of Wrath", () => {
    const items = ["Yun Tal Wildarrows", "Berserker's Greaves", "Infinity Edge", "Mortal Reminder", "Phantom Dancer", "Lord Dominik's Regards"];
    const { advice } = setup({ champ: "Jinx", mode: "aram", items, gold: 700, time: 20 * 60, level: 18 });
    expect(names(advice)).toEqual(["Elixir of Wrath"]);
  });

  it("no Elixir before the late game", () => {
    const { advice } = setup({ items: full, gold: 1500, time: 20 * 60, level: 15 });
    expect(advice.phase).toBe("mid");
    expect(names(advice)).not.toContain("Elixir of Sorcery");
  });
});

describe("shopAdvice — map filtering", () => {
  it("ARAM / Mayhem never suggest Control Wards (Summoner's Rift only)", () => {
    for (const mode of ["aram", "mayhem"] as const) {
      const { advice } = setup({ mode, gold: 1500, time: 4 * 60, level: 5 });
      expect(advice.phase).toBe("early");
      expect(names(advice)).not.toContain("Control Ward");
      expect(advice.buyNow.length).toBeGreaterThan(0);
    }
  });

  it("skips components that aren't sold on the map", () => {
    const d = makeData();
    const lc = d.items.get(id("Lost Chapter"))!;
    d.items.set(lc.id, { ...lc, aram: false });
    const { advice } = setup({ data: d, mode: "aram", gold: 1300, time: 4 * 60, level: 5 });
    expect(names(advice)).not.toContain("Lost Chapter");
    expect(advice.buyNow.every((b) => d.items.get(Number(b.itemId))!.aram)).toBe(true);
  });

  it("Arena: only Arena items, no wards or elixirs, phase by items", () => {
    const d = makeData();
    for (const it of d.items.values()) if (it.id !== CONTROL_WARD && it.id !== ELIXIR_SORCERY && it.id !== 2138 && it.id !== ELIXIR_WRATH) d.items.set(it.id, { ...it, arena: true });
    d.itemsByNameArena = indexItemsByName(d.items, "arena");
    const { advice, plan } = setup({ data: d, mode: "arena", gold: 1500, time: 3 * 60, level: 3 });
    expect(advice.phase).toBe("early");
    expect(advice.phaseLabel).toBe("Early rounds");
    expect(advice.buyNow.length).toBeGreaterThan(0);
    expect(advice.buyNow.every((b) => d.items.get(Number(b.itemId))!.arena)).toBe(true);
    expect(names(advice)).not.toContain("Control Ward");
    expect(plan.order.length).toBeGreaterThan(0);
  });
});

describe("shopAdvice — tips", () => {
  it("are shop-only, max 3, and phase specific", () => {
    const banned = /cooldown|flash|summoner|dragon|baron|herald|jungle|respawns? in|timer|fight now|go (top|mid|bot)|gank/i;
    const cases: Setup[] = [
      { time: 2 * 60, gold: 500 },
      { time: 8 * 60, gold: 1000 },
      { time: 18 * 60, gold: 1000, items: ["Luden's Echo", "Boots"] },
      { time: 30 * 60, gold: 1000 },
      { mode: "aram", time: 3 * 60, gold: 1000, level: 4 },
      { mode: "mayhem", time: 12 * 60, gold: 1000, level: 12 },
      { mode: "aram", time: 22 * 60, gold: 1000, level: 18 },
      { enemies: HEALERS, time: 8 * 60, gold: 1000 },
    ];
    for (const c of cases) {
      const { advice } = setup(c);
      expect(advice.tips.length).toBeGreaterThan(0);
      expect(advice.tips.length).toBeLessThanOrEqual(3);
      for (const t of advice.tips) expect(t).not.toMatch(banned);
    }
  });

  it("laning phase mentions Control Wards; mid game points at the 2nd core item and the boots upgrade", () => {
    expect(setup({ time: 8 * 60, gold: 100 }).advice.tips.join(" ")).toMatch(/Control Ward each back/);
    const mid = setup({ time: 17 * 60, gold: 100, items: ["Luden's Echo", "Boots"] }).advice;
    expect(mid.phaseLabel).toBe("Mid game");
    expect(mid.tips.join(" ")).toMatch(/Upgrade your tier-1 boots/);
    expect(mid.tips.join(" ")).toMatch(/2nd core item/);
  });
});
