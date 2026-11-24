// Augment knowledge: tags derived from tooltip text + curated overrides, and
// a context-aware scorer (champion fit, enemy comp, stats data, personal history).

import RAW from "../data/augments.json";
import type { Archetype, Augment, AugmentRarity, AugmentTag, Champion, ChampionStats, MatchRecord } from "./types";
import { clamp, norm, smoothedWinRate } from "./text";
import type { ThreatReport } from "./threat";
import type { AugmentCombo } from "./sources/combos";

const TAG_RULES: Array<[RegExp, AugmentTag[]]> = [
  [/ability power|\bap\b|lich brain/i, ["ap"]],
  [/attack damage|lethality/i, ["ad"]],
  [/adaptive force/i, ["ap", "ad"]],
  [/attack speed/i, ["as"]],
  [/critical|crit /i, ["crit"]],
  [/on-hit/i, ["onhit"]],
  [/ability haste|cooldown/i, ["haste"]],
  [/ultimate/i, ["ult"]],
  [/max health|bonus health|\bhealth\b(?! regen)/i, ["hp"]],
  [/armor|magic resist|tenacity|damage reduction/i, ["resist"]],
  [/lifesteal|life steal|omnivamp|heal (you|for)|restores health|heals you|health regen/i, ["sustain"]],
  [/(ally|allies|allied).*(heal|shield)|(heal|shield).*(ally|allies|allied)|heal and shield power/i, ["enchanter"]],
  [/shield/i, ["shield"]],
  [/dash|blink|teleport/i, ["dash"]],
  [/movement speed|move speed/i, ["mobility"]],
  [/immobiliz|knock|stun|fear|taunt|charm|polymorph|slow/i, ["cc"]],
  [/burn/i, ["burn"]],
  [/snowball/i, ["snowball"]],
  [/\bgold\b/i, ["gold"]],
  [/attack range/i, ["range"]],
  [/summon/i, ["summon"]],
  [/\bmana\b/i, ["mana"]],
  [/true damage/i, ["true"]],
  [/penetration|shred/i, ["pen"]],
  [/\[spell\]|empower [qwer]!|your [qwe] gains/i, ["spell"]],
  [/quest/i, ["quest"]],
  [/random/i, ["random"]],
  [/stat anvil/i, ["stats"]],
];

const OVERRIDES: Record<string, { add?: AugmentTag[]; remove?: AugmentTag[]; power?: number }> = {
  "Draw Your Sword": { add: ["ranged", "ad", "as"], power: -0.15 },
  "Scoped Weapons": { add: ["ranged"] },
  "Scopier Weapons": { add: ["ranged"] },
  "Scopiest Weapons": { add: ["ranged"], power: 0.2 },
  "Lil' Extra Help": { add: ["ranged"] },
  "Giant Slayer": { add: ["ad", "ap"], power: 0.2 },
  Goliath: { add: ["hp", "ap", "ad"], power: 0.35 },
  "Hand of Baron": { power: 0.3 },
  "Jeweled Gauntlet": { add: ["ap"], remove: ["ad"], power: 0.25 },
  "Infinite Recursion": { power: 0.3 },
  Eureka: { add: ["ap"], power: 0.15 },
  "Back To Basics": { remove: ["ult"], add: ["ap", "haste"], power: 0.1 },
  "Big Shot": { add: ["crit"], power: 0.2 },
  "Dual Wield": { add: ["ranged"], power: 0.15 },
  "Mystic Punch": { add: ["haste"], power: 0.15 },
  "Typhoon": { add: ["ranged"] },
  "Tank Engine": { add: ["hp"], power: 0.15 },
  "Mad Scientist": { add: ["ap", "ad", "hp"], power: 0.1 },
  "Transmute: Chaos": { power: 0.1 },
  "Pandora's Box": { power: -0.1 },
  "Urf's Champion": { power: 0.05 },
  "Celestial Body": { add: ["hp"], power: -0.05 },
  "Glass Cannon": { remove: ["hp"], add: ["true"], power: 0 },
  "Donation": { add: ["gold"], power: 0.1 },
  "Clown College": { power: -0.1 },
  "Biggest Snowball Ever": { power: 0.1 },
  "Ultimate Awakening": { power: 0.1 },
  "Can't Touch This": { power: 0.05 },
  "Final Form": { power: 0.05 },
  "Quickstep": { add: ["spell", "dash"] },
  "Witchful Thinking": { add: ["ap"] },
  "Blunt Force": { add: ["ad"] },
  "Deft": { add: ["as"] },
  "Recursion": { add: ["haste"] },
  "It's Critical": { add: ["crit"] },
  "Goredrink": { add: ["sustain"] },
  "Heavy Hitter": { add: ["hp", "melee"] },
  "Protein Shake": { add: ["enchanter", "resist"] },
  "Overflow": { add: ["mana", "ap"] },
  "Mind to Matter": { add: ["mana", "hp"] },
  "Gift of the Drowned": { add: ["hp", "ad", "lethality"] },
  "ADAPt": { add: ["ap"], remove: ["ad"] },
  "escAPADe": { add: ["ad"], remove: ["ap"] },
  "Tooth Fairy": { add: ["lethality", "ap", "ad"] },
  "Minionmancer": { add: ["summon"] },
};

const RARITY_BASE: Record<AugmentRarity, number> = { prismatic: 0.55, gold: 0.5, silver: 0.45 };

function deriveTags(name: string, desc: string): AugmentTag[] {
  const tags = new Set<AugmentTag>();
  for (const [re, t] of TAG_RULES) if (re.test(desc)) t.forEach((x) => tags.add(x));
  const o = OVERRIDES[name];
  o?.add?.forEach((t) => tags.add(t));
  o?.remove?.forEach((t) => tags.delete(t));
  return [...tags];
}

export const AUGMENTS: Augment[] = (RAW as Array<{ name: string; rarity: AugmentRarity; desc: string }>).map((a) => ({
  ...a,
  tags: deriveTags(a.name, a.desc),
}));

const BY_NORM = new Map(AUGMENTS.map((a) => [norm(a.name), a]));
export function findAugment(name: string): Augment | undefined {
  return BY_NORM.get(norm(name));
}

/**
 * Add augments discovered from live data (e.g. new ones added in a patch) to the catalogue,
 * so they can be OCR-matched and ranked. Returns how many were added.
 */
export function registerAugments(list: Array<{ name: string; rarity: string; desc?: string }>): number {
  let added = 0;
  for (const a of list) {
    if (!a.name) continue;
    if (BY_NORM.has(norm(a.name))) {
      ARENA_ONLY.delete(norm(a.name)); // also offered outside Arena
      continue;
    }
    const rarity: AugmentRarity = a.rarity === "prismatic" || a.rarity === "gold" ? a.rarity : "silver";
    const desc = cleanDesc(a.desc);
    const aug: Augment = { name: a.name, rarity, desc, tags: deriveTags(a.name, desc) };
    AUGMENTS.push(aug);
    BY_NORM.set(norm(a.name), aug);
    added++;
  }
  return added;
}

const normIndex = new WeakMap<object, Map<string, unknown>>();
/** `rec[name]`, falling back to a case/punctuation-insensitive match ("Light 'em Up!" = "Light 'Em Up!"). */
function byName<T>(rec: Record<string, T> | undefined, name: string): T | undefined {
  if (!rec) return undefined;
  if (rec[name] !== undefined) return rec[name];
  let idx = normIndex.get(rec);
  if (!idx) {
    idx = new Map(Object.entries(rec).map(([k, v]) => [norm(k), v]));
    normIndex.set(rec, idx);
  }
  return idx.get(norm(name)) as T | undefined;
}

/** Tooltip markup → plain text; unresolved `@Var@` placeholders (CommunityDragon) become "?". */
function cleanDesc(desc?: string): string {
  return (desc ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/@[^@\s]{1,60}@/g, "?")
    // CommunityDragon keyword templates: "{{ Item_Keyword_OnHit }}" → "On-Hit".
    .replace(/\{\{\s*(?:[A-Za-z]+_)*([A-Za-z]+)\s*\}\}/g, (_, k: string) => (k === "OnHit" ? "On-Hit" : k.replace(/([a-z])([A-Z])/g, "$1 $2")))
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------------ Arena augment pool
//
// Arena (2v2v2v2, gameMode "CHERRY") has its own augment pool. Many names are shared with
// ARAM: Mayhem (Mayhem borrowed them), some exist only in Arena. The catalogue (AUGMENTS) holds
// both; ranking filters it to the pool of the mode being played.

/** Normalized names of augments in the Arena pool. */
const ARENA = new Set<string>();
/** Normalized names registered only for Arena (hidden from the Mayhem pool). */
const ARENA_ONLY = new Set<string>();

/**
 * Add Arena augments (CommunityDragon catalogue or OP.GG pages) to the catalogue and mark them as
 * part of the Arena pool. Returns how many were new to the catalogue.
 */
export function registerArenaAugments(list: Array<{ name: string; rarity: string; desc?: string }>): number {
  let added = 0;
  for (const a of list) {
    if (!a.name) continue;
    const k = norm(a.name);
    const known = BY_NORM.get(k);
    if (!known) {
      const rarity: AugmentRarity = a.rarity === "prismatic" || a.rarity === "gold" ? a.rarity : "silver";
      const desc = cleanDesc(a.desc);
      const aug: Augment = { name: a.name, rarity, desc, tags: deriveTags(a.name, desc) };
      AUGMENTS.push(aug);
      BY_NORM.set(k, aug);
      ARENA_ONLY.add(k);
      added++;
    } else if (!known.desc && a.desc) {
      known.desc = cleanDesc(a.desc);
      known.tags = deriveTags(known.name, known.desc);
    }
    ARENA.add(k);
  }
  return added;
}

/** Is this augment in the Arena pool (as far as the loaded Arena data knows)? */
export function isArenaAugment(name: string): boolean {
  return ARENA.has(norm(name));
}

/** Pool used by `rankAugments` when the context doesn't say: set from the effective game mode. */
let activePool: "arena" | "default" = "default";
export function setAugmentPool(pool: "arena" | "default") {
  activePool = pool;
}

function poolOf(ctx: AugmentContext): "arena" | "default" {
  const m = ctx.mode ?? ctx.stats?.mode;
  return m === "arena" ? "arena" : m ? "default" : activePool;
}

/** Keep the augments of the mode's pool (no-op until Arena data has been registered). */
export function augmentsInPool<T extends Augment>(augs: T[], pool: "arena" | "default"): T[] {
  if (pool === "arena") return ARENA.size ? augs.filter((a) => ARENA.has(norm(a.name))) : augs;
  return ARENA_ONLY.size ? augs.filter((a) => !ARENA_ONLY.has(norm(a.name))) : augs;
}

// OP.GG-style augment tiers: 0 ("OP") .. 5. Score adjustment and the letter shown in the UI.
const TIER_BONUS = [0.18, 0.1, 0.04, 0, -0.06, -0.12];
const TIER_LETTER = ["S", "S", "A", "B", "C", "D"];
const tierIndex = (t: number) => Math.max(0, Math.min(5, Math.round(t)));
/** Score adjustment for an OP.GG augment tier (0 best .. 5 worst). */
export function augmentTierBonus(tier: number): number {
  return TIER_BONUS[tierIndex(tier)];
}
/** OP.GG augment tier (0 .. 5) → letter grade. */
export function augmentTierLetter(tier: number): string {
  return TIER_LETTER[tierIndex(tier)];
}

// How much each archetype values each augment tag (0..1). Missing = 0.
type Weights = Partial<Record<AugmentTag, number>>;
const GENERIC: Weights = { stats: 0.6, gold: 0.5, snowball: 0.35, true: 0.4, random: 0.3, hp: 0.25, mobility: 0.25 };
const ARCH_WEIGHTS: Record<Archetype, Weights> = {
  mage_burst: { ap: 1, haste: 0.8, ult: 0.6, mana: 0.5, burn: 0.4, pen: 0.6, spell: 0.6, crit: 0.15 },
  mage_poke: { ap: 1, haste: 0.9, mana: 0.5, burn: 0.5, pen: 0.5, spell: 0.6, range: 0.1 },
  mage_dps: { ap: 1, haste: 0.8, burn: 0.8, mana: 0.5, sustain: 0.3, pen: 0.6, spell: 0.6, cc: 0.3 },
  ap_assassin: { ap: 1, haste: 0.6, dash: 0.7, mobility: 0.6, ult: 0.5, pen: 0.6, spell: 0.5 },
  ap_bruiser: { ap: 0.9, hp: 0.7, sustain: 0.7, resist: 0.5, haste: 0.6, burn: 0.6, melee: 0.4, spell: 0.5 },
  ap_onhit: { ap: 0.9, as: 0.9, onhit: 1, range: 0.4, haste: 0.3, ranged: 0.5 },
  adc_crit: { ad: 1, crit: 1, as: 0.8, range: 0.8, onhit: 0.3, sustain: 0.4, ranged: 0.8, pen: 0.4 },
  adc_onhit: { ad: 0.6, as: 1, onhit: 1, range: 0.8, crit: 0.3, sustain: 0.4, ranged: 0.8 },
  adc_caster: { ad: 1, haste: 0.8, crit: 0.6, range: 0.5, spell: 0.6, ranged: 0.6, pen: 0.5 },
  ad_assassin: { ad: 1, lethality: 0.9, pen: 0.8, dash: 0.7, mobility: 0.7, haste: 0.5, ult: 0.4, spell: 0.5 },
  bruiser: { ad: 0.9, hp: 0.8, sustain: 0.8, resist: 0.6, haste: 0.7, melee: 0.6, dash: 0.4, spell: 0.5, onhit: 0.3 },
  tank: { hp: 1, resist: 1, cc: 0.8, shield: 0.4, haste: 0.5, melee: 0.5, sustain: 0.4, burn: 0.3, spell: 0.4 },
  enchanter: { enchanter: 1, shield: 0.7, haste: 0.8, ap: 0.5, mana: 0.5, cc: 0.4, spell: 0.6 },
};

export interface AugmentScore {
  augment: Augment;
  score: number; // 0..1
  grade: "S" | "A" | "B" | "C" | "D";
  reasons: string[];
  winRate?: {
    rate: number;
    games: number;
    pickRate?: number;
    source: "champion" | "global" | "personal";
    /** What `rate` measures: games won, or (Arena champion stats) top-4 finishes. Absent = win. */
    metric?: "win" | "top4";
  };
  /** Tier published by the global data source (S/A/B/…), if any. */
  globalTier?: string;
  /** No reliable win rate on this champion although the champion has a dataset (grade capped at C). */
  unproven?: boolean;
}

export interface GlobalAugmentStat {
  wr: number; // 0..1
  pr: number; // 0..1
  n: number;
  tier?: string;
}

export interface AugmentContext {
  champion?: Champion;
  threat?: ThreatReport;
  owned?: string[]; // augments already taken this game
  stats?: ChampionStats;
  history?: MatchRecord[];
  /** Mode-wide augment stats (all champions), used when champion-specific data is thin. */
  global?: Record<string, GlobalAugmentStat>;
  globalAvgWr?: number;
  /** Known strong combos (HexMayhem "God-Tier Combos"): augment(s) + champion + core build. */
  combos?: AugmentCombo[];
  /** Game mode being played; "arena" ranks the Arena augment pool. Defaults to `stats.mode`, then `setAugmentPool`. */
  mode?: string;
  /** Per-augment tiers 0 (best) .. 5 (OP.GG style); defaults to `stats.augmentTiers`. */
  augmentTiers?: Record<string, number>;
}

function absoluteGrade(score: number): AugmentScore["grade"] {
  if (score >= 0.78) return "S";
  if (score >= 0.66) return "A";
  if (score >= 0.54) return "B";
  if (score >= 0.42) return "C";
  return "D";
}

/** Grade by percentile within this champion's full augment pool (S ≈ top 8%). */
function percentileGrade(score: number, pool: number[]): AugmentScore["grade"] {
  if (!pool.length) return absoluteGrade(score);
  let below = 0;
  for (const p of pool) if (p < score) below++;
  const pct = below / pool.length; // 0 = worst, ~1 = best
  if (pct >= 0.92) return "S";
  if (pct >= 0.75) return "A";
  if (pct >= 0.45) return "B";
  if (pct >= 0.18) return "C";
  return "D";
}

const TAG_LABEL: Partial<Record<AugmentTag, string>> = {
  ap: "ability power", ad: "attack damage", as: "attack speed", crit: "crit", onhit: "on-hit",
  haste: "ability haste", ult: "your ultimate", hp: "health", resist: "resistances", sustain: "sustain",
  enchanter: "heals & shields", mobility: "mobility", cc: "crowd control", burn: "burn damage",
  dash: "dashes", range: "attack range", mana: "mana", pen: "penetration", lethality: "lethality",
  summon: "summons", shield: "shields",
};

export function scoreAugment(aug: Augment, ctx: AugmentContext): AugmentScore {
  const reasons: string[] = [];
  let score = RARITY_BASE[aug.rarity] + (OVERRIDES[aug.name]?.power ?? 0) * 0.5;
  const champ = ctx.champion;

  if (champ) {
    const w = { ...GENERIC, ...ARCH_WEIGHTS[champ.archetype] };
    const fits = aug.tags
      .filter((t) => t !== "ranged" && t !== "melee")
      .map((t) => [t, w[t] ?? 0] as const)
      .sort((a, b) => b[1] - a[1]);
    // Weighted fit: best tag counts most, the rest add diminishing value.
    const fit = fits.reduce((acc, [, v], i) => acc + v * (i === 0 ? 1 : i === 1 ? 0.25 : 0.08), 0);
    const neutral = 0.55;
    score += (Math.min(fit, 1.25) - neutral) * 0.5;

    // Stat-identity mismatch: an augment built around a stat your champion doesn't use.
    const isAp = champ.damage !== "ad";
    const isAd = champ.damage !== "ap";
    const mism =
      (aug.tags.includes("ap") && !aug.tags.includes("ad") && !isAp) ||
      (aug.tags.includes("ad") && !aug.tags.includes("ap") && !isAd && !aug.tags.includes("hp")) ||
      ((aug.tags.includes("crit") || aug.tags.includes("onhit")) && (w.crit ?? 0) < 0.3 && (w.onhit ?? 0) < 0.3 && !aug.tags.includes("ap"));
    if (mism) score -= 0.14;

    const strong = fits.filter(([t, v]) => v >= 0.7 && TAG_LABEL[t]).slice(0, 2).map(([t]) => TAG_LABEL[t]!);
    if (strong.length) reasons.push(`Scales with ${strong.join(" + ")} (${champ.name})`);
    const weak = aug.tags.find((t) => (t === "ap" || t === "ad" || t === "crit" || t === "onhit" || t === "enchanter") && (w[t] ?? 0) <= 0.15);
    if (mism) reasons.push(`Off-stat for ${champ.name}`);
    else if (weak && !strong.length) reasons.push(`Little ${TAG_LABEL[weak]} synergy with ${champ.name}`);

    if (aug.tags.includes("ranged") && !champ.ranged) {
      score -= 0.3;
      reasons.push("Ranged-only value — weak on melee");
    }
    if (aug.tags.includes("melee") && champ.ranged) score -= 0.1;
    if (aug.tags.includes("spell")) reasons.push("Ability-specific: strongest on your best spammable spell");
    if (aug.tags.includes("quest")) {
      score -= 0.03;
      reasons.push("Quest augment: delayed payoff");
    }
  }

  // Enemy context.
  const t = ctx.threat;
  if (t) {
    if (aug.tags.includes("resist") && t.burst > 0.55) {
      score += 0.05;
      reasons.push("Extra durability vs. their burst");
    }
    if (aug.tags.includes("true") && t.tankiness > 0.55) {
      score += 0.06;
      reasons.push("True damage cuts through their tanks");
    }
    if (aug.tags.includes("pen") && t.tankiness > 0.55) score += 0.04;
    if (aug.tags.includes("sustain") && t.poke > 0.55) {
      score += 0.04;
      reasons.push("Sustain vs. their poke");
    }
  }

  // Data: champion-specific stats, then mode-wide stats, then personal history.
  // When the champion has a real dataset, its own win rates decide the ranking; the
  // champion-fit heuristic only breaks ties. Augments missing from that dataset are rarely
  // picked on the champion, so they're treated as unproven rather than trusted on fit alone.
  let winRate: AugmentScore["winRate"];
  let unproven = false;
  // Arena (OP.GG): a "win" is a top-4 finish.
  const top4 = (ctx.mode ?? ctx.stats?.mode) === "arena";
  const rateWord = top4 ? "top-4 rate" : "win rate";
  const g = byName(ctx.stats?.augments, aug.name);
  const champAvg = ctx.stats && ctx.stats.games ? ctx.stats.wins / ctx.stats.games : 0.5;
  const champHasAugData = !!ctx.stats?.augments && Object.keys(ctx.stats.augments).length >= 30;
  if (g && g.games >= 15) {
    const wr = smoothedWinRate(g.wins, g.games, champAvg, 200);
    const lift = (g.wins / g.games - champAvg) * 100;
    if (g.games >= 300) {
      // ±6 percentage points of win rate vs the champion's average spans the whole scale.
      const dataScore = clamp(0.5 + (wr - champAvg) * 8);
      // Bigger samples leave less room for the fit heuristic (it only breaks near-ties).
      const fitWeight = g.games >= 5000 ? 0.06 : g.games >= 1500 ? 0.12 : 0.2;
      score = score * fitWeight + dataScore * (1 - fitWeight);
      if (Math.abs(lift) >= 0.5) reasons.unshift(`${lift > 0 ? "+" : ""}${lift.toFixed(1)}% ${rateWord} vs ${champ?.name ?? "champion"} average`);
    } else {
      score += (wr - champAvg) * 1.2;
    }
    winRate = { rate: g.wins / g.games, games: g.games, pickRate: g.pickRate, source: "champion", ...(top4 ? { metric: "top4" as const } : {}) };
  } else if (champHasAugData && champ) {
    score = 0.12 + score * 0.3; // caps unproven picks below any augment with average real results
    reasons.unshift(`Rarely picked on ${champ.name} — no reliable ${rateWord}`);
    unproven = true;
  }
  // Published / derived augment tier (OP.GG Arena): decisive when there's no win rate to go on,
  // a nudge on thin samples, display-only once the champion's own win rate is reliable.
  const tierN = byName(ctx.augmentTiers ?? ctx.stats?.augmentTiers, aug.name);
  let tierLetter: string | undefined;
  if (typeof tierN === "number" && Number.isFinite(tierN)) {
    tierLetter = augmentTierLetter(tierN);
    const reliable = !!winRate && winRate.games >= 300;
    if (!reliable) {
      if (unproven) {
        // A published tier is evidence: undo the unproven cap applied above.
        score = (score - 0.12) / 0.3;
        unproven = false;
        reasons.shift();
      }
      score += augmentTierBonus(tierN) * (winRate ? 0.5 : 1);
    }
    if (tierN <= 1) reasons.unshift(`Tier ${tierLetter} augment${champ ? ` on ${champ.name}` : ""}`);
    else if (tierN >= 4 && !reliable) reasons.push(`Low tier (${tierLetter})${champ ? ` on ${champ.name}` : ""}`);
  }

  const gl = ctx.global?.[aug.name];
  if (gl && gl.n >= 200) {
    if (!winRate && !champHasAugData) {
      const avg = ctx.globalAvgWr ?? 0.5;
      score = score * 0.8 + clamp(0.5 + (gl.wr - avg) * 5) * 0.2;
    }
    if (!winRate) winRate = { rate: gl.wr, games: gl.n, pickRate: gl.pr, source: "global" };
  }
  const mine = ctx.history?.filter((m) => m.champion === champ?.id && m.augments.includes(aug.name));
  if (mine && mine.length >= 3) {
    const wins = mine.filter((m) => m.result === "Win").length;
    score += (smoothedWinRate(wins, mine.length, 0.5, 6) - 0.5) * 0.5;
    if (!winRate) winRate = { rate: wins / mine.length, games: mine.length, source: "personal" };
    reasons.push(`You're ${wins}-${mine.length - wins} with it on ${champ?.name}`);
  }

  // Diminishing returns for stacking the same stat on top of owned augments.
  const owned = (ctx.owned ?? []).map(findAugment).filter(Boolean) as Augment[];
  if (owned.some((o) => o.name === aug.name)) score -= 0.5;
  const shared = owned.filter((o) => o.tags.some((x) => aug.tags.includes(x) && (x === "crit" || x === "onhit" || x === "enchanter"))).length;
  if (shared) {
    score += 0.04;
    reasons.push("Synergises with augments you already own");
  }

  // Known combos: completes a combo with an augment you own, or is a god-tier pick on your champion.
  if (ctx.combos?.length && !owned.some((o) => o.name === aug.name)) {
    const syn = synergiesFor(aug, ctx)[0];
    if (syn) {
      score += syn.bonus;
      reasons.unshift(syn.reason);
    }
  }

  score = clamp(score, 0, 1);
  return { augment: aug, score, grade: absoluteGrade(score), reasons: reasons.slice(0, 3), winRate, globalTier: gl?.tier ?? tierLetter, ...(unproven ? { unproven } : {}) };
}

const poolCache = new WeakMap<AugmentContext, Map<string, number[]>>();
function poolScores(ctx: AugmentContext, which: "arena" | "default"): number[] {
  let byPool = poolCache.get(ctx);
  if (!byPool) poolCache.set(ctx, (byPool = new Map()));
  const sig = `${which}|${AUGMENTS.length}|${ARENA.size}|${ARENA_ONLY.size}`;
  let pool = byPool.get(sig);
  if (!pool) {
    const scored = augmentsInPool(AUGMENTS, which).map((a) => scoreAugment(a, { ...ctx, owned: [] }));
    // Arena sources only list each champion's most-picked augments: grade against those (not the
    // long tail of unproven ones), or every listed augment would land in S/A.
    const proven = scored.filter((r) => !r.unproven);
    pool = (which === "arena" && proven.length >= 20 ? proven : scored).map((r) => r.score);
    byPool.set(sig, pool);
  }
  return pool;
}

/**
 * Score + grade augments. Grades are relative to the champion's whole augment pool.
 * Augments outside the mode's pool (Arena vs everything else, see `augmentsInPool`) are dropped.
 */
export function rankAugments(augs: Augment[], ctx: AugmentContext): AugmentScore[] {
  const which = poolOf(ctx);
  const pool = ctx.champion ? poolScores(ctx, which) : [];
  return augmentsInPool(augs, which)
    .map((a) => {
      const r = scoreAugment(a, ctx);
      let grade = ctx.champion ? percentileGrade(r.score, pool) : r.grade;
      if (r.unproven && (grade === "S" || grade === "A" || grade === "B")) grade = "C";
      return { ...r, grade };
    })
    .sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ combos

export interface AugmentSynergy {
  combo: AugmentCombo;
  /** owned: completes a combo with augments you already have; champion: a known combo on your champion;
   *  starter: first piece of a multi-augment combo on your champion. */
  kind: "owned" | "champion" | "starter";
  /** The other augments of the combo (owned ones for kind "owned"). */
  partners: string[];
  bonus: number;
  reason: string;
}

const fmtWr = (wr?: number) => (wr !== undefined ? ` · ${Math.round(wr * 100)}% WR` : "");

/** Score bonus for a combo: +0.06 (≤55% WR) up to +0.12 (≥75% WR). */
export function comboBonus(winRate?: number): number {
  if (winRate === undefined) return 0.06;
  return 0.06 + 0.06 * clamp((winRate - 0.55) / 0.2);
}

/** Does this combo apply to the champion? Combos without champions apply to everyone. */
export function comboFitsChampion(combo: AugmentCombo, champion?: Pick<Champion, "id" | "name">): boolean {
  if (!combo.champions?.length) return true;
  if (!champion) return false;
  const ids = [norm(champion.id), norm(champion.name)];
  return combo.champions.some((c) => ids.includes(norm(c))) || !!combo.championNames?.some((c) => ids.includes(norm(c)));
}

/**
 * Combos this augment takes part in, given what you own and who you play — best first.
 * Only combos it completes/extends with an owned augment, or combos for your champion, count.
 */
export function synergiesFor(augment: Augment | string, ctx: Pick<AugmentContext, "combos" | "owned" | "champion">): AugmentSynergy[] {
  const name = typeof augment === "string" ? augment : augment.name;
  const key = norm(name);
  if (!ctx.combos?.length || !key) return [];
  const owned = new Map((ctx.owned ?? []).map((o) => [norm(o), o]));
  const out: AugmentSynergy[] = [];
  for (const combo of ctx.combos) {
    if (!combo.augments.some((a) => norm(a) === key)) continue;
    if (!comboFitsChampion(combo, ctx.champion)) continue;
    const others = combo.augments.filter((a) => norm(a) !== key);
    const champSpecific = !!combo.champions?.length;
    const bonus = comboBonus(combo.winRate);
    const ownedPartners = others.filter((a) => owned.has(norm(a))).map((a) => owned.get(norm(a))!);
    if (ownedPartners.length) {
      const missing = others.length - ownedPartners.length;
      out.push({
        combo,
        kind: "owned",
        partners: ownedPartners,
        bonus: missing ? bonus * 0.6 : bonus,
        reason: `Combo with ${ownedPartners.join(" + ")}${fmtWr(combo.winRate)}`,
      });
    } else if (champSpecific && !others.length) {
      out.push({ combo, kind: "champion", partners: [], bonus, reason: `God-tier combo on ${ctx.champion!.name}${fmtWr(combo.winRate)}` });
    } else if (champSpecific) {
      out.push({ combo, kind: "starter", partners: others, bonus: bonus * 0.5, reason: `Starts a combo with ${others.join(" + ")}${fmtWr(combo.winRate)}` });
    }
  }
  return out.sort((a, b) => b.bonus - a.bonus || (b.combo.winRate ?? 0) - (a.combo.winRate ?? 0));
}

/** Combos worth showing for your champion / owned augments, best first. */
export function combosFor(ctx: Pick<AugmentContext, "combos" | "owned" | "champion">, limit = 6): AugmentCombo[] {
  if (!ctx.combos?.length) return [];
  const owned = new Set((ctx.owned ?? []).map(norm));
  const relevant = ctx.combos.filter(
    (c) => (c.champions?.length && comboFitsChampion(c, ctx.champion)) || (c.augments.length > 1 && c.augments.some((a) => owned.has(norm(a))) && comboFitsChampion(c, ctx.champion)),
  );
  return relevant.sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0)).slice(0, limit);
}

// ------------------------------------------------------------------ reroll advice

const GRADE_RANK: Record<AugmentScore["grade"], number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };

/**
 * Static advice on the augments on screen: ARAM: Mayhem lets you reroll augment offers, and
 * a weak set is usually worth rerolling. Returns null when there's too little to judge.
 */
export function rerollAdvice(offered: AugmentScore[]): { reroll: boolean; reason: string } | null {
  if (offered.length < 2) return null;
  const sorted = [...offered].sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || b.score - a.score);
  const best = sorted[0];
  const rest = sorted.slice(1);
  if (GRADE_RANK[best.grade] <= GRADE_RANK.C) {
    return { reroll: true, reason: `Best offer is only ${best.grade} (${best.augment.name}) — consider rerolling.` };
  }
  if (best.grade === "B" && rest.every((s) => s.grade === "D")) {
    return { reroll: true, reason: `Only ${best.augment.name} is decent (B), the rest are D — a reroll will likely do better.` };
  }
  return { reroll: false, reason: `${best.augment.name} (${best.grade}) is worth taking — no need to reroll.` };
}
