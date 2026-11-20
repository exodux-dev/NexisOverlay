import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureStaticData } from "../dev/fixture";
import { parseLiveGame } from "./live";
import { buildingToward, categoryOf, laneMatchups, scoreboardPower, shortGold, signedGold, teamDiffText, teamPower } from "./power";
import { findItem } from "./staticData";
import type { GameSnapshot, PlayerState } from "./types";

const data = makeFixtureStaticData();

const id = (name: string) => {
  const it = findItem(data, name);
  if (!it) throw new Error(`unknown item ${name}`);
  return it.id;
};
const cost = (name: string) => data.items.get(id(name))!.cost;

const SR_POS: Record<string, string> = {
  Ahri: "MIDDLE", Jinx: "BOTTOM", Leona: "UTILITY", Lux: "JUNGLE", Darius: "TOP",
  Soraka: "UTILITY", Aatrox: "TOP", Vladimir: "JUNGLE", Zed: "MIDDLE", Malphite: "BOTTOM",
};

/** The fixture game, optionally as Summoner's Rift (positions + creep score). */
function game(sr = false, edit: (raw: ReturnType<typeof demoAllGameData>) => void = () => {}): GameSnapshot {
  const raw = demoAllGameData();
  if (sr) {
    raw.gameData = { ...raw.gameData, gameMode: "CLASSIC" };
    for (const p of raw.allPlayers!) p.position = SR_POS[(p as { rawChampionName: string }).rawChampionName.split("_").pop()!];
  }
  edit(raw);
  const s = parseLiveGame(raw, data);
  if (!s) throw new Error("no snapshot");
  return s;
}

const withItems = (s: GameSnapshot, champ: string, names: string[]): GameSnapshot => {
  const set = (p: PlayerState): PlayerState => (p.champion?.id === champ ? { ...p, items: names.map((n) => ({ id: id(n), name: n })) } : p);
  return { ...s, me: set(s.me), allies: s.allies.map(set), enemies: s.enemies.map(set) };
};

describe("teamPower totals", () => {
  it("sums item gold, levels and kills per team and diffs them", () => {
    const s = game();
    const p = teamPower(s, data, { mode: "mayhem" });
    const soraka = p.enemy.players.find((x) => x.champion?.id === "Soraka")!;
    expect(soraka.itemGold).toBe([6617, 3158, 3114].reduce((t, i) => t + data.items.get(i)!.cost, 0));
    expect(p.ally.levels).toBe(11 + 11 + 10 + 11 + 12);
    expect(p.enemy.levels).toBe(10 + 12 + 12 + 11 + 11);
    expect(p.ally.kills).toBe(14);
    expect(p.enemy.kills).toBe(16);
    expect(p.diff).toEqual({ itemGold: p.ally.itemGold - p.enemy.itemGold, levels: -1, kills: -2 });
    expect(p.ally.avgLevel).toBeCloseTo(11);
    expect(p.teamsComparable).toBe(true);
  });

  it("excludes consumables and trinkets from item gold", () => {
    const base = teamPower(game(), data, { mode: "aram" });
    const more = teamPower(
      game(false, (r) => r.allPlayers![0]!.items.push({ itemID: 2003, displayName: "Health Potion" }, { itemID: 3340, displayName: "Stealth Ward" })),
      data,
      { mode: "aram" },
    );
    expect(more.ally.itemGold).toBe(base.ally.itemGold);
  });

  it("counts Arena copies as the regular item and skips team comparison in Arena", () => {
    const p = teamPower(
      game(false, (r) => {
        r.gameData = { ...r.gameData, gameMode: "CHERRY" };
        r.allPlayers![0]!.items = [{ itemID: 223031, displayName: "Infinity Edge" }];
      }),
      data,
      { mode: "arena" },
    );
    expect(p.ally.players.find((x) => x.isMe)!.itemGold).toBe(cost("Infinity Edge"));
    expect(p.teamsComparable).toBe(false);
    expect(p.lanes).toEqual([]);
  });
});

describe("lane matchups", () => {
  it("pairs players by position on Summoner's Rift", () => {
    const s = game(true);
    const p = teamPower(s, data, { mode: "sr" });
    expect(p.lanes.map((l) => l.lane)).toEqual(["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]);
    const mid = p.lanes.find((l) => l.lane === "MIDDLE")!;
    expect(mid.ally.championName).toBe("Ahri");
    expect(mid.enemy.championName).toBe("Zed");
    expect(mid.mine).toBe(true);
    expect(mid.itemGold).toBe(mid.ally.itemGold - mid.enemy.itemGold);
    expect(mid.level).toBe(0);
    expect(mid.cs).toBe(11 * 4 - 11 * 4);
    expect(p.myLane).toBe(mid);
  });

  it("has no lanes without positions (ARAM / Mayhem) or outside SR", () => {
    expect(teamPower(game(), data, { mode: "sr" }).lanes).toEqual([]);
    expect(teamPower(game(true), data, { mode: "aram" }).lanes).toEqual([]);
  });

  it("skips lanes with a missing side and leaves cs undefined when unknown", () => {
    const p = teamPower(game(true), data, { mode: "sr" });
    const allies = p.ally.players.map((x) => (x.position === "TOP" ? { ...x, position: undefined } : x));
    const enemies = p.enemy.players.map((x) => ({ ...x, cs: undefined }));
    const lanes = laneMatchups(allies, enemies);
    expect(lanes.map((l) => l.lane)).not.toContain("TOP");
    expect(lanes.every((l) => l.cs === undefined)).toBe(true);
  });

  it("accepts lower-case positions and ignores unknown ones", () => {
    const p = teamPower(
      game(true, (r) => {
        r.allPlayers![0]!.position = "middle";
        r.allPlayers![1]!.position = "NONE";
      }),
      data,
      { mode: "sr" },
    );
    expect(p.myLane?.lane).toBe("MIDDLE");
    expect(p.lanes.map((l) => l.lane)).not.toContain("BOTTOM");
  });
});

describe("building toward", () => {
  const zedWith = (items: string[], mode: "sr" | "aram" = "aram") => {
    const s = withItems(game(), "Zed", items);
    const zed = s.enemies.find((e) => e.champion?.id === "Zed")!;
    return buildingToward(zed, data, { mode, myChampion: s.me.champion });
  };

  it("Executioner's Calling points at anti-heal", () => {
    const t = zedWith(["Executioner's Calling"])!;
    expect(t.category).toBe("antiheal");
    expect(["Mortal Reminder", "Chempunk Chainsword"]).toContain(t.item.name);
    expect(t.parts.map((i) => i.name)).toEqual(["Executioner's Calling"]);
    expect(t.missing).toBe(t.item.cost - cost("Executioner's Calling"));
    expect(t.confidence).toBe("likely");
  });

  it("Null-Magic Mantle points at magic resist", () => {
    const s = withItems(game(), "Malphite", ["Null-Magic Mantle", "Plated Steelcaps"]);
    const t = buildingToward(s.enemies.find((e) => e.champion?.id === "Malphite")!, data, { mode: "aram", myChampion: s.me.champion })!;
    expect(t.category).toBe("mr");
    expect(t.item.tags).toContain("SpellBlock");
    // You're on Ahri (AP): the answer is magic penetration.
    expect(t.hint).toMatch(/Void Staff|Bloodletter|Cryptbloom|penetration/);
  });

  it("Serrated Dirk on an assassin reads as lethality with an armor answer for an AP champion", () => {
    const t = zedWith(["Serrated Dirk", "Ionian Boots of Lucidity"])!;
    expect(t.category).toBe("lethality");
    expect(t.label).toBe("Lethality");
    expect(t.counter?.name).toBe("Zhonya's Hourglass");
    expect(t.hint).toBe("Consider Zhonya's Hourglass or armor");
  });

  it("uses every held component of the recipe", () => {
    const t = zedWith(["Serrated Dirk", "Caulfield's Warhammer"])!;
    expect(["Youmuu's Ghostblade", "Axiom Arc", "Serylda's Grudge", "Eclipse"]).toContain(t.item.name);
    expect(t.progress).toBeGreaterThan(0.5);
  });

  it("returns nothing without meaningful components", () => {
    expect(zedWith([])).toBeUndefined();
    expect(zedWith(["Long Sword"])).toBeUndefined(); // too little to tell
    expect(zedWith(["Youmuu's Ghostblade", "Ionian Boots of Lucidity"])).toBeUndefined();
    expect(zedWith(["Health Potion" as string].filter((n) => findItem(data, n)))).toBeUndefined();
  });

  it("doesn't predict an item the player already owns", () => {
    const t = zedWith(["Executioner's Calling", "Mortal Reminder"]);
    expect(t?.item.name).not.toBe("Mortal Reminder");
  });

  it("says when penetration doesn't affect your damage type", () => {
    const s = withItems(game(), "Malphite", ["Null-Magic Mantle"]);
    const jinx = s.allies.find((a) => a.champion?.id === "Jinx")!.champion!;
    const t = buildingToward(s.enemies.find((e) => e.champion?.id === "Malphite")!, data, { mode: "aram", myChampion: jinx })!;
    expect(t.category).toBe("mr");
    expect(t.hint).toMatch(/physical/);
    expect(t.counter).toBeUndefined();
  });

  it("enemy builds list completed items and components", () => {
    const s = withItems(game(), "Zed", ["Youmuu's Ghostblade", "Ionian Boots of Lucidity", "Serrated Dirk", "Health Potion"].filter((n) => findItem(data, n)));
    const b = teamPower(s, data, { mode: "aram", myChampion: s.me.champion }).builds.find((x) => x.champion?.id === "Zed")!;
    expect(b.completed.map((i) => i.name)).toEqual(["Youmuu's Ghostblade", "Ionian Boots of Lucidity"]);
    expect(b.components.map((i) => i.name)).toEqual(["Serrated Dirk"]);
    expect(b.toward?.category).toBe("lethality");
  });
});

describe("categoryOf", () => {
  const cat = (n: string) => categoryOf(data.items.get(id(n))!);
  it("classifies items by what answers them", () => {
    expect(cat("Mortal Reminder")).toBe("antiheal");
    expect(cat("Youmuu's Ghostblade")).toBe("lethality");
    expect(cat("Lord Dominik's Regards")).toBe("armorpen");
    expect(cat("Void Staff")).toBe("magicpen");
    expect(cat("Force of Nature")).toBe("mr");
    expect(cat("Randuin's Omen")).toBe("armor");
    expect(cat("Bloodthirster")).toBe("healing");
    expect(cat("Infinity Edge")).toBe("crit");
    expect(cat("Rabadon's Deathcap")).toBe("ap");
    expect(cat("Warmog's Armor")).toBe("health");
    expect(cat("Shurelya's Battlesong")).toBe("support");
  });
});

describe("text", () => {
  it("formats gold leads as information", () => {
    expect(shortGold(2140)).toBe("2.1k");
    expect(shortGold(-850)).toBe("850");
    expect(shortGold(12000)).toBe("12k");
    expect(signedGold(2100)).toBe("+2.1k");
    expect(signedGold(-850)).toBe("−850");
    expect(signedGold(0)).toBe("±0");
    expect(teamDiffText(-2100)).toBe("Enemy team +2.1k item gold");
    expect(teamDiffText(1000)).toBe("Your team +1k item gold");
    expect(teamDiffText(120)).toBe("Even item gold");
  });
});

describe("scoreboardPower", () => {
  it("skips the explore / champ-select stand-in and games without enemies", () => {
    const s = game(true);
    expect(scoreboardPower(s, data, { mode: "sr" })).toBeDefined();
    expect(scoreboardPower({ ...s, source: "demo", gameMode: "EXPLORE" }, data, { mode: "sr" })).toBeUndefined();
    expect(scoreboardPower({ ...s, enemies: [] }, data, { mode: "sr" })).toBeUndefined();
    expect(scoreboardPower(null, data, { mode: "sr" })).toBeUndefined();
    expect(scoreboardPower(s, null, { mode: "sr" })).toBeUndefined();
  });

  it("never yields NaN when the scoreboard omits a level", () => {
    const s = game(true, (raw) => {
      delete (raw.allPlayers![0] as { level?: number }).level;
    });
    const p = teamPower(s, data, { mode: "sr" });
    expect(Number.isNaN(p.diff.levels)).toBe(false);
    expect(Number.isNaN(p.ally.avgLevel)).toBe(false);
    expect(Number.isNaN(p.enemy.avgLevel)).toBe(false);
  });
});
