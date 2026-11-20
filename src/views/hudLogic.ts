// Pure helpers behind the mini HUD (kept out of Layer.tsx so they're unit-testable).

import type { SkillKey } from "../engine/guide";
import type { TeamPower } from "../engine/power";
import type { PlayerState } from "../engine/types";

// ------------------------------------------------------------------ shop advice contract
// Mirrors `Derived.shop` (src/app/store.ts, engine/phase.ts). Declared here so the HUD compiles and
// degrades gracefully while that field doesn't exist; read it with optional chaining only.

export type GamePhase = "pregame" | "early" | "laning" | "mid" | "late";
export interface ShopBuy {
  itemId: string;
  name: string;
  icon?: string;
  cost: number;
  reason: string;
}
export interface ShopAdvice {
  phase: GamePhase;
  phaseLabel: string;
  gold?: number;
  buyNow: ShopBuy[];
  saveFor?: { itemId: string; name: string; icon?: string; need: number };
  tips: string[];
}

/** `derived.shop` if the store provides it and it looks valid. */
export function shopOf(derived: unknown): ShopAdvice | undefined {
  const s = (derived as { shop?: ShopAdvice } | null | undefined)?.shop;
  if (!s || typeof s !== "object" || !Array.isArray(s.buyNow)) return undefined;
  return s;
}

// ------------------------------------------------------------------ skills

export type SkillLevels = Record<SkillKey, number>;

const cap = (k: SkillKey, lvl: number) => (k === "R" ? (lvl >= 16 ? 3 : lvl >= 11 ? 2 : lvl >= 6 ? 1 : 0) : Math.min(5, Math.ceil(lvl / 2)));

/**
 * Next ability to put a point in, following the planned 18-level order but starting from the
 * points actually spent (`have`), so it stays right when the player deviated from the plan.
 * Returns undefined when no point is available or the plan has nothing levelable.
 */
export function nextSkill(order: SkillKey[], have: SkillLevels, level: number): SkillKey | undefined {
  const spent = have.Q + have.W + have.E + have.R;
  if (spent >= level) return undefined;
  const planned: SkillLevels = { Q: 0, W: 0, E: 0, R: 0 };
  for (const k of order) {
    planned[k]++;
    if (planned[k] > have[k] && have[k] < cap(k, level)) return k;
  }
  // Plan exhausted / blocked: any basic ability that can still take a point.
  return (["R", "Q", "W", "E"] as SkillKey[]).find((k) => have[k] < cap(k, level));
}

/** Skill points available to spend (0 when unknown). */
export function pendingPoints(have: SkillLevels | undefined, level: number): number {
  if (!have) return 0;
  return Math.max(0, level - (have.Q + have.W + have.E + have.R));
}

// ------------------------------------------------------------------ enemy damage split

/** Champions whose damage profile leans heavily on true damage (abilities, passives, ultimates). */
const TRUE_DAMAGE = new Set(["Vayne", "Fiora", "Camille", "Darius", "Garen", "Chogath", "Olaf", "MasterYi", "Gwen", "Pyke", "Sett"]);

export interface DamageSplit {
  ad: number;
  ap: number;
  /** True-damage share (rough: part of a true-damage champion's output). */
  tru: number;
}

/** Enemy team damage split (fractions summing to 1); undefined while no enemy champion is known. */
export function damageSplit(enemies: PlayerState[]): DamageSplit | undefined {
  let ad = 0;
  let ap = 0;
  let tru = 0;
  for (const e of enemies) {
    const c = e.champion;
    if (!c) continue;
    let w = c.archetype === "tank" || c.archetype === "enchanter" ? 0.5 : 1;
    if (TRUE_DAMAGE.has(c.id)) {
      tru += w * 0.35;
      w *= 0.65;
    }
    if (c.damage === "ap") ap += w;
    else if (c.damage === "ad") ad += w;
    else {
      ap += w / 2;
      ad += w / 2;
    }
  }
  const total = ad + ap + tru;
  if (!total) return undefined;
  return { ad: ad / total, ap: ap / total, tru: tru / total };
}

/** One short line for the HUD: what the enemy damage split asks for. */
export function splitAdvice(s: DamageSplit): string {
  if (s.ad >= 0.65) return "Mostly physical — armor is efficient";
  if (s.ap >= 0.65) return "Mostly magic — magic resist is efficient";
  if (s.tru >= 0.2) return "Lots of true damage — health over resists";
  return "Mixed damage — balance armor and MR";
}

// ------------------------------------------------------------------ team power line

/** What the HUD "power" widget shows: team item-gold diff and your lane's (ally − enemy). */
export interface HudPower {
  team?: number;
  lane?: { label: string; diff: number; vs: string };
}

const LANE_SHORT: Record<string, string> = { TOP: "Top", JUNGLE: "Jgl", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Sup" };

/** HUD power line from `derived.power` (engine/power.ts); undefined when there is nothing to show. */
export function powerOf(derived: unknown): HudPower | undefined {
  const p = (derived as { power?: TeamPower } | null | undefined)?.power;
  if (!p || typeof p !== "object") return undefined;
  // Loading screen / opening seconds: nobody owns items yet, so "Team even" would be noise.
  if (p.ally && p.enemy && p.ally.itemGold + p.enemy.itemGold === 0) return undefined;
  const out: HudPower = {};
  if (p.teamsComparable && p.ally && p.enemy) out.team = p.diff.itemGold;
  if (p.myLane) out.lane = { label: LANE_SHORT[p.myLane.lane] ?? p.myLane.lane, diff: p.myLane.itemGold, vs: p.myLane.enemy.championName };
  return out.team === undefined && !out.lane ? undefined : out;
}
