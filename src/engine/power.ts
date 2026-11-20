// Team power: item-gold, level and kill totals per team, Summoner's Rift lane-by-lane matchups and
// what each enemy is building toward (from the components in their inventory).
//
// Policy: everything here comes from the scoreboard (Tab) every player can see — items, levels,
// K/D/A and creep score. No timers, cooldowns or hidden state, and the output is information
// ("Enemy team +2.1k item gold"), never a combat prompt.

import { COUNTER_ITEMS, ENEMY_ITEM_SIGNALS, FAMILY, type Counter, type Family } from "../data/itemKb";
import { inventoryValue, isLegendary } from "./intel";
import type { GameModeKind } from "./mode";
import { findItem } from "./staticData";
import type { Champion, GameSnapshot, Item, PlayerState, StaticData } from "./types";

// ------------------------------------------------------------------ types

export type Lane = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
export const LANES: Lane[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
export const LANE_LABEL: Record<Lane, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" };

export interface PlayerPower {
  riotId: string;
  championName: string;
  champion?: Champion;
  side: "ally" | "enemy";
  isMe: boolean;
  position?: Lane;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Creep score, when the live game reports it. */
  cs?: number;
  /** Gold value of the inventory (completed items + components; consumables and trinkets excluded). */
  itemGold: number;
  /** Completed non-boot items. */
  legendaries: number;
}

export interface TeamSide {
  itemGold: number;
  levels: number;
  kills: number;
  avgLevel: number;
  players: PlayerPower[];
}

export interface LaneMatchup {
  lane: Lane;
  ally: PlayerPower;
  enemy: PlayerPower;
  /** ally − enemy */
  itemGold: number;
  level: number;
  /** Undefined when either creep score is unknown. */
  cs?: number;
  /** Your own lane. */
  mine: boolean;
}

export type BuildCategory =
  | "antiheal"
  | "lethality"
  | "armorpen"
  | "magicpen"
  | "mr"
  | "armor"
  | "healing"
  | "shield"
  | "crit"
  | "attackspeed"
  | "health"
  | "support"
  | "ap"
  | "ad";

export const CATEGORY_LABEL: Record<BuildCategory, string> = {
  antiheal: "Anti-heal",
  lethality: "Lethality",
  armorpen: "Armor pen",
  magicpen: "Magic pen",
  mr: "Magic resist",
  armor: "Armor",
  healing: "Sustain",
  shield: "Shields",
  crit: "Crit",
  attackspeed: "Attack speed",
  health: "Health",
  support: "Support",
  ap: "Ability power",
  ad: "Attack damage",
};

export interface BuildingToward {
  /** Most likely next completed item. */
  item: Item;
  category: BuildCategory;
  label: string;
  /** Components held that go into `item`. */
  parts: Item[];
  /** Share of `item`'s cost already held (0..1). */
  progress: number;
  /** Gold still needed to finish `item`. */
  missing: number;
  /** "likely" when the components clearly point one way, else "possible". */
  confidence: "likely" | "possible";
  /** Short note for you, e.g. "Consider Zhonya's Hourglass or armor". */
  hint: string;
  /** Item answer for your champion, when one resolves. */
  counter?: Item;
}

export interface EnemyBuild {
  riotId: string;
  championName: string;
  champion?: Champion;
  level: number;
  /** Completed items (legendaries first, then boots). */
  completed: Item[];
  /** Unfinished components in the inventory. */
  components: Item[];
  itemGold: number;
  toward?: BuildingToward;
}

export interface TeamPower {
  ally: TeamSide;
  enemy: TeamSide;
  /** ally − enemy */
  diff: { itemGold: number; levels: number; kills: number };
  /**
   * False when the two sides aren't real teams (Arena: 2v2v2v2 and the scoreboard doesn't say which
   * enemies are paired), so team bars should be skipped.
   */
  teamsComparable: boolean;
  /** Summoner's Rift lane matchups (empty without positions, e.g. ARAM / Mayhem / Arena). */
  lanes: LaneMatchup[];
  myLane?: LaneMatchup;
  builds: EnemyBuild[];
}

export interface PowerOptions {
  mode: GameModeKind;
  /** Your champion (build variant applied) — picks counter items that fit your build. */
  myChampion?: Champion;
}

// ------------------------------------------------------------------ helpers

/** Scoreboard numbers can be missing on partial Live Client data: count them as 0, never NaN. */
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const isLane = (p?: string): p is Lane => !!p && (LANES as string[]).includes(p.toUpperCase());

function playerPower(p: PlayerState, side: "ally" | "enemy", data: StaticData): PlayerPower {
  const legendaries = p.items.filter((i) => isLegendary(data.items.get(i.id))).length;
  return {
    riotId: p.riotId,
    championName: p.champion?.name ?? p.championName,
    champion: p.champion,
    side,
    isMe: p.isMe,
    ...(isLane(p.position) ? { position: p.position.toUpperCase() as Lane } : {}),
    level: num(p.level),
    kills: num(p.kills),
    deaths: num(p.deaths),
    assists: num(p.assists),
    ...(typeof p.creepScore === "number" ? { cs: p.creepScore } : {}),
    itemGold: inventoryValue(p, data),
    legendaries,
  };
}

function side(players: PlayerPower[]): TeamSide {
  const itemGold = players.reduce((s, p) => s + p.itemGold, 0);
  const levels = players.reduce((s, p) => s + p.level, 0);
  const kills = players.reduce((s, p) => s + p.kills, 0);
  return { itemGold, levels, kills, avgLevel: players.length ? levels / players.length : 0, players };
}

/** Pair allies and enemies by Summoner's Rift position. Players without a position are left out. */
export function laneMatchups(allies: PlayerPower[], enemies: PlayerPower[]): LaneMatchup[] {
  const out: LaneMatchup[] = [];
  for (const lane of LANES) {
    const a = allies.find((p) => p.position === lane);
    const e = enemies.find((p) => p.position === lane);
    if (!a || !e) continue;
    out.push({
      lane,
      ally: a,
      enemy: e,
      itemGold: a.itemGold - e.itemGold,
      level: a.level - e.level,
      ...(a.cs !== undefined && e.cs !== undefined ? { cs: a.cs - e.cs } : {}),
      mine: a.isMe,
    });
  }
  return out;
}

// ------------------------------------------------------------------ building toward

const isValued = (it: Item | undefined): it is Item => !!it && !it.tags.includes("Consumable") && !it.tags.includes("Trinket");
const isBoots = (it: Item) => it.tags.includes("Boots");
/** Unfinished component that builds into something (not boots tiers, not consumables). */
const isComponent = (it: Item) => !it.completed && !isBoots(it) && it.into.length > 0;

function onMap(it: Item, mode: GameModeKind): boolean {
  if (mode === "sr") return it.sr !== false;
  if (mode === "arena") return it.arena !== false;
  return it.aram !== false;
}

/** Completed items reachable from a component (through intermediate components). */
function descendants(data: StaticData, id: number, seen = new Set<number>()): Item[] {
  const out: Item[] = [];
  for (const next of data.items.get(id)?.into ?? []) {
    if (seen.has(next)) continue;
    seen.add(next);
    const it = data.items.get(next);
    if (!it) continue;
    if (it.completed) out.push(it);
    else out.push(...descendants(data, next, seen));
  }
  return out;
}

/** Owned components that fit `target`'s recipe (top-down, each owned copy used once) and their gold. */
function coveredBy(data: StaticData, target: Item, owned: Map<number, number>): { gold: number; parts: Item[] } {
  const left = new Map(owned);
  const parts: Item[] = [];
  let gold = 0;
  const walk = (id: number) => {
    for (const c of data.items.get(id)?.from ?? []) {
      const n = left.get(c) ?? 0;
      const it = data.items.get(c);
      if (!it) continue;
      if (n > 0) {
        left.set(c, n - 1);
        parts.push(it);
        gold += it.cost;
      } else walk(c);
    }
  };
  walk(target.id);
  return { gold, parts };
}

/** What kind of item this is, from the counter's point of view (first matching rule wins). */
export function categoryOf(it: Item): BuildCategory {
  const t = new Set(it.tags);
  const sig = ENEMY_ITEM_SIGNALS[it.name] ?? {};
  const dmg = t.has("Damage") || t.has("SpellDamage") || t.has("CriticalStrike") || t.has("AttackSpeed");
  if (t.has("GrievousWounds")) return "antiheal";
  if (t.has("ArmorPenetration")) return t.has("CriticalStrike") ? "armorpen" : "lethality";
  if (t.has("MagicPenetration")) return "magicpen";
  if (t.has("SpellBlock") && (!dmg || (sig.mr ?? 0) > 0)) return "mr";
  if (t.has("Armor") && (!dmg || (sig.armor ?? 0) > 0)) return "armor";
  if ((sig.heal ?? 0) >= 1 || t.has("LifeSteal") || t.has("SpellVamp")) return "healing";
  if ((sig.shield ?? 0) >= 1) return "shield";
  if (t.has("SpellBlock")) return "mr";
  if (t.has("Armor")) return "armor";
  if (t.has("CriticalStrike")) return "crit";
  if (t.has("AttackSpeed") || t.has("OnHit")) return "attackspeed";
  if (t.has("ManaRegen")) return "support";
  if (t.has("SpellDamage")) return "ap";
  if (t.has("Damage")) return "ad";
  return "health";
}

/** How well an item fits the enemy champion's damage type / role (multiplier). */
function fit(it: Item, c?: Champion): number {
  if (!c) return 1;
  const ap = it.tags.includes("SpellDamage");
  const ad = it.tags.includes("Damage") || it.tags.includes("CriticalStrike");
  const defensive = !ap && !ad && (it.tags.includes("Armor") || it.tags.includes("SpellBlock") || it.tags.includes("Health"));
  if (c.archetype === "tank") return defensive ? 1.5 : 0.7;
  if (c.archetype === "enchanter") return it.tags.includes("ManaRegen") ? 1.4 : defensive ? 1 : 0.8;
  if (c.damage === "ap") return ap ? 1.4 : ad ? 0.5 : 0.9;
  if (c.damage === "ad") return ad ? 1.4 : ap ? 0.5 : 0.9;
  return 1;
}

/** Below this much gold in matching components the guess is too weak to show (a lone Long Sword). */
const MIN_COVERED = 400;

const COUNTER_FOR: Record<BuildCategory, Counter | undefined> = {
  antiheal: undefined,
  lethality: "armor",
  armorpen: "armor",
  magicpen: "mr",
  mr: "magicpen",
  armor: "armorpen",
  healing: "antiheal",
  shield: "antishield",
  crit: "anticrit",
  attackspeed: "antias",
  health: "antitank",
  support: "antiheal",
  ap: "mr",
  ad: "armor",
};

const GENERIC: Record<BuildCategory, string> = {
  antiheal: "Cuts healing and regeneration",
  lethality: "armor",
  armorpen: "armor (less effective vs pen) or health",
  magicpen: "magic resist",
  mr: "magic penetration",
  armor: "armor penetration",
  healing: "anti-heal",
  shield: "anti-shield",
  crit: "armor",
  attackspeed: "armor",
  health: "%-health damage",
  support: "anti-heal",
  ap: "magic resist",
  ad: "armor",
};

/** Short counter note for you, phrased as build reference (never a combat prompt). */
function counterHint(cat: BuildCategory, data: StaticData, mine?: Champion): { hint: string; counter?: Item } {
  if (cat === "antiheal") return { hint: GENERIC.antiheal };
  const fam: Family | undefined = mine ? FAMILY[mine.archetype] : undefined;
  // Penetration only matters for the damage you deal.
  if (cat === "mr" && mine && mine.damage === "ad") return { hint: "Little effect on your physical damage" };
  if (cat === "armor" && mine && mine.damage === "ap") return { hint: "Little effect on your magic damage" };
  const key = COUNTER_FOR[cat];
  const names = key && fam ? (COUNTER_ITEMS[key][fam] ?? []) : [];
  const counter = names.map((n) => findItem(data, n)).find((i): i is Item => !!i);
  if (counter) return { hint: `Consider ${counter.name}${GENERIC[cat] !== counter.name ? ` or ${GENERIC[cat]}` : ""}`, counter };
  return { hint: `Consider ${GENERIC[cat]}` };
}

/**
 * Most likely next completed item for a player, from the components they hold. Candidates are the
 * completed items those components build into, scored by the share of the recipe already held and
 * by how well they fit the champion; the winning category's best item is returned.
 */
export function buildingToward(p: PlayerState, data: StaticData, opts: PowerOptions): BuildingToward | undefined {
  const owned = new Map<number, number>();
  const ownedIds = new Set<number>();
  for (const i of p.items) {
    const it = data.items.get(i.id);
    if (!isValued(it)) continue;
    ownedIds.add(it.id);
    if (isComponent(it)) owned.set(it.id, (owned.get(it.id) ?? 0) + 1);
  }
  if (!owned.size) return undefined;
  const candidates = new Map<number, Item>();
  for (const id of owned.keys()) for (const it of descendants(data, id)) if (!isBoots(it) && onMap(it, opts.mode) && !ownedIds.has(it.id)) candidates.set(it.id, it);

  type Scored = { item: Item; cat: BuildCategory; score: number; gold: number; parts: Item[] };
  const scored: Scored[] = [];
  for (const it of candidates.values()) {
    const cov = coveredBy(data, it, owned);
    if (cov.gold < MIN_COVERED) continue;
    const progress = Math.min(1, cov.gold / Math.max(1, it.cost));
    scored.push({ item: it, cat: categoryOf(it), score: progress * fit(it, p.champion), gold: cov.gold, parts: cov.parts });
  }
  if (!scored.length) return undefined;
  const byCat = new Map<BuildCategory, number>();
  for (const s of scored) byCat.set(s.cat, (byCat.get(s.cat) ?? 0) + s.score);
  const total = [...byCat.values()].reduce((a, b) => a + b, 0);
  const [cat, catScore] = [...byCat.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
  const best = scored.filter((s) => s.cat === cat).sort((a, b) => b.score - a.score || a.item.cost - b.item.cost || a.item.id - b.item.id)[0]!;
  const share = total ? catScore / total : 0;
  const { hint, counter } = counterHint(cat, data, opts.myChampion);
  return {
    item: best.item,
    category: cat,
    label: CATEGORY_LABEL[cat],
    parts: best.parts,
    progress: Math.min(1, best.gold / Math.max(1, best.item.cost)),
    missing: Math.max(0, best.item.cost - best.gold),
    confidence: share >= 0.5 ? "likely" : "possible",
    hint,
    ...(counter ? { counter } : {}),
  };
}

function enemyBuild(p: PlayerState, data: StaticData, opts: PowerOptions): EnemyBuild {
  const items = p.items.map((i) => data.items.get(i.id)).filter(isValued);
  const legendary = items.filter((it) => isLegendary(it));
  const boots = items.filter((it) => it.completed && isBoots(it));
  const toward = buildingToward(p, data, opts);
  return {
    riotId: p.riotId,
    championName: p.champion?.name ?? p.championName,
    champion: p.champion,
    level: num(p.level),
    completed: [...legendary, ...boots],
    components: items.filter((it) => !it.completed),
    itemGold: inventoryValue(p, data),
    ...(toward ? { toward } : {}),
  };
}

// ------------------------------------------------------------------ main

/** Team power for a game snapshot (see module comment). */
export function teamPower(snap: Pick<GameSnapshot, "me" | "allies" | "enemies">, data: StaticData, opts: PowerOptions): TeamPower {
  const allies = [snap.me, ...snap.allies].map((p) => playerPower(p, "ally", data));
  const enemies = snap.enemies.map((p) => playerPower(p, "enemy", data));
  const ally = side(allies);
  const enemy = side(enemies);
  const lanes = opts.mode === "sr" ? laneMatchups(allies, enemies) : [];
  return {
    ally,
    enemy,
    diff: { itemGold: ally.itemGold - enemy.itemGold, levels: ally.levels - enemy.levels, kills: ally.kills - enemy.kills },
    teamsComparable: opts.mode !== "arena",
    lanes,
    myLane: lanes.find((l) => l.mine),
    builds: snap.enemies.map((p) => enemyBuild(p, data, opts)),
  };
}

/**
 * Team power for the game being displayed, or undefined when there is no scoreboard behind it:
 * no game / data, no enemies, or the explore / champ-select stand-in (gameMode "EXPLORE", every
 * player level 1 with no items), which would otherwise read as a real "even" game.
 */
export function scoreboardPower(snap: GameSnapshot | null | undefined, data: StaticData | null | undefined, opts: PowerOptions): TeamPower | undefined {
  if (!snap || !data || snap.gameMode === "EXPLORE" || !snap.enemies.length) return undefined;
  return teamPower(snap, data, opts);
}

// ------------------------------------------------------------------ text

/** "2.1k" / "850" (no sign). */
export function shortGold(n: number): string {
  const a = Math.abs(Math.round(n));
  return a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "")}k` : String(a);
}

/** Signed short gold: "+2.1k", "−850", "±0". */
export function signedGold(n: number): string {
  const r = Math.round(n);
  return r === 0 ? "±0" : `${r > 0 ? "+" : "−"}${shortGold(r)}`;
}

/** Item gold lead as information: "Your team +2.1k item gold", "Enemy team +850 item gold", "Even item gold". */
export function teamDiffText(diff: number, even = 300): string {
  if (Math.abs(diff) < even) return "Even item gold";
  return `${diff > 0 ? "Your team" : "Enemy team"} +${shortGold(diff)} item gold`;
}
