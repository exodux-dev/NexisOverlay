// Shared domain types for the recommendation engine and UI.

import type { DDSpellLike } from "./tooltipText";
import type { GameTimeline } from "./timeline";

export type DamageType = "ap" | "ad" | "mixed";

export type Archetype =
  | "mage_burst"
  | "mage_poke"
  | "mage_dps"
  | "ap_assassin"
  | "ap_bruiser"
  | "ap_onhit"
  | "adc_crit"
  | "adc_onhit"
  | "adc_caster"
  | "ad_assassin"
  | "bruiser"
  | "tank"
  | "enchanter";

export type Playstyle = "auto" | "aggressive" | "balanced" | "safe" | "frontline";

/** Static champion knowledge (Data Dragon + our curated traits). */
export interface Champion {
  id: string; // Data Dragon id, e.g. "MonkeyKing"
  key: number; // numeric champion id
  name: string; // display name, e.g. "Wukong"
  tags: string[]; // Riot tags: Mage, Tank, ...
  archetype: Archetype;
  damage: DamageType;
  ranged: boolean;
  traits: ChampionTraits;
  icon: string;
}

export interface ChampionTraits {
  heal: number; // 0..3 how much healing the champ brings
  shield: number; // 0..3
  cc: number; // 0..3
  suppress?: boolean; // point-and-click suppression / unstoppable-requiring CC
}

export interface Item {
  id: number;
  name: string;
  cost: number;
  icon: string;
  from: number[];
  into: number[];
  tags: string[];
  stats: Record<string, number>;
  aram: boolean;
  sr: boolean; // purchasable on Summoner's Rift
  /** Purchasable in Arena (Rings of Wrath, map 30) — directly or via its Arena copy (id + 220000). */
  arena?: boolean;
  completed: boolean; // legendary / final item
  plaintext: string; // one-line summary from Riot
  statLines: string[]; // e.g. "80 Ability Power"
  effects: Array<{ name: string; text: string }>; // passives / actives
}

export interface ChampionSpell {
  key: "P" | "Q" | "W" | "E" | "R";
  name: string;
  icon: string;
  /** Plain-text description (tags stripped). */
  description: string;
  /** Cooldown per rank, Data Dragon "burn" form ("9/8/7/6/5"). */
  cooldown?: string;
  /** Resolved cost line ("55/65/75/85/95 Mana"); absent when free. */
  cost?: string;
  /** Cast range ("970", "Global"). */
  range?: string;
  maxRank?: number;
  /** Raw Data Dragon detail used to render the rich tooltip body (see engine/tooltipText). */
  detail?: DDSpellLike;
  /** The champion's resource (Mana, Energy, …) for placeholder resolution. */
  resource?: string;
}

export interface Rune {
  id: number;
  name: string;
  icon: string;
  tree?: string;
  /** Data Dragon rich text (tags intact); absent for rune paths. */
  shortDesc?: string;
  longDesc?: string;
  /** Row in its tree: 0 = keystone. */
  slot?: number;
}

export interface SummonerSpell {
  id: number; // numeric key
  name: string;
  icon: string;
  description?: string;
  /** Cooldown in seconds ("300"). */
  cooldown?: string;
  range?: string;
  summonerLevel?: number;
}

export interface StaticData {
  version: string;
  champions: Champion[];
  championsById: Map<string, Champion>; // by DDragon id
  championsByName: Map<string, Champion>; // normalized display name + id
  championsByKey: Map<number, Champion>;
  items: Map<number, Item>;
  itemsByName: Map<string, Item>; // normalized name (ARAM-available variant preferred)
  itemsByNameSr: Map<string, Item>; // normalized name (Summoner's Rift variant preferred)
  /** Normalized name (Arena variant preferred); optional so hand-built StaticData in tests stays valid. */
  itemsByNameArena?: Map<string, Item>;
  runes: Map<number, Rune>;
  spells: Map<number, SummonerSpell>;
}

// --------------------------------------------------------------- game state

export interface PlayerItem {
  id: number;
  name: string;
}

export interface PlayerState {
  championName: string;
  champion?: Champion;
  riotId: string;
  team: "ORDER" | "CHAOS";
  level: number;
  items: PlayerItem[];
  kills: number;
  deaths: number;
  assists: number;
  isMe: boolean;
  /** Summoner's Rift lane from the live game ("TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY"), if known. */
  position?: string;
  /** You only: dead right now (Live Client API). */
  dead?: boolean;
  /** Scoreboard minions + monsters killed, when the live game reports it. */
  creepScore?: number;
}

export interface GameSnapshot {
  source: "live" | "demo";
  gameMode: string;
  gameTime: number; // seconds
  gold: number;
  me: PlayerState;
  allies: PlayerState[]; // excluding me
  enemies: PlayerState[];
  ended?: { result: "Win" | "Lose" };
  /** True on the loading screen (players known, game not started yet). */
  loading?: boolean;
  /** Your ability ranks (Live Client API), when known — used to show the next skill to level. */
  skills?: Record<"Q" | "W" | "E" | "R", number>;
  /** Seconds until you respawn, while dead. */
  respawnIn?: number;
  /** Game time (s) of the first turret kill (Live Client events), if any. */
  firstTowerAt?: number;
  /** Aphelios only: the main-hand weapon, read from his current Q in the Live Client API. */
  apheliosMain?: "Calibrum" | "Severum" | "Gravitum" | "Infernum" | "Crescendum";
}

// --------------------------------------------------------------- augments

export type AugmentRarity = "silver" | "gold" | "prismatic";

export type AugmentTag =
  | "ap" | "ad" | "as" | "crit" | "onhit" | "haste" | "ult" | "hp" | "resist" | "sustain"
  | "enchanter" | "mobility" | "cc" | "burn" | "snowball" | "gold" | "range" | "summon"
  | "mana" | "true" | "pen" | "spell" | "quest" | "random" | "melee" | "ranged" | "dash"
  | "stats" | "shield" | "lethality";

export interface Augment {
  name: string;
  rarity: AugmentRarity;
  desc: string;
  tags: AugmentTag[];
}

// --------------------------------------------------------------- stats

export interface WinStat {
  games: number;
  wins: number;
  /** Fraction of games (0..1) where this was picked, when the source provides it. */
  pickRate?: number;
}

/** Aggregated dataset produced by scripts/aggregate-stats.ts (Riot API). */
export interface StatsDataset {
  patch: string;
  queueId: number;
  generatedAt: string;
  totalGames: number;
  champions: Record<string, ChampionStats>; // keyed by DDragon id
}

export interface ChampionStats extends WinStat {
  /** Where these numbers come from (for labels). */
  source?: "riot" | "hexmayhem" | "opgg" | "personal";
  /** Recommended core build (item ids) from the data source, if it publishes one. */
  bestBuild?: number[];
  /** Most common skill max orders, e.g. "QEW" (from match timelines). */
  skillOrders?: Array<WinStat & { order: string }>;
  pickRate?: number;
  items: Record<string, WinStat>; // item id -> stat
  builds?: Array<WinStat & { items: number[] }>; // ordered first 3 completed items
  starters?: Array<WinStat & { items: number[] }>;
  boots?: Record<string, WinStat>;
  augments?: Record<string, WinStat>; // augment name -> stat
  runes?: Array<WinStat & { primary: number; sub: number; perks: number[]; shards?: number[] }>;
  /** Set when the rune pages come from another source than the rest (Mayhem: OP.GG runes). */
  runesSource?: "opgg";
  spells?: Array<WinStat & { ids: [number, number] }>;
  /** Most common level-by-level skill sequence (first 15-18 levels), when the source has one. */
  skillSequence?: Array<"Q" | "W" | "E" | "R">;
  /** Lane matchups: this champion's win rate (0..1) against `championKey` (Data Dragon id). */
  counters?: Array<{ championKey: string; games: number; winRate: number }>;
  /** Game mode these numbers are for, when it isn't implied by the source (e.g. "arena"). */
  mode?: string;
  /** Per-augment tier published or derived by the source: 0 (best, "OP") .. 5 (worst). */
  augmentTiers?: Record<string, number>;
  /** Arena: average placement (1..8) and share of 1st places (0..1). */
  avgPlace?: number;
  firstRate?: number;
}

export interface MatchRecord {
  id: string;
  date: string;
  champion: string; // DDragon id
  result: "Win" | "Lose";
  kills: number;
  deaths: number;
  assists: number;
  durationSec: number;
  items: number[];
  augments: string[];
  enemies: string[];
  gameMode: string;
  /** Your game over time (item gold, CS, KDA, item timings) — absent on older entries / imports without it. */
  timeline?: GameTimeline;
}
