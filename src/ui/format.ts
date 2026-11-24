// Small display helpers shared by the overlay views.

import type { Archetype, AugmentRarity, Playstyle } from "../engine/types";

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  mage_burst: "Burst mage",
  mage_poke: "Poke mage",
  mage_dps: "Battle mage",
  ap_assassin: "AP assassin",
  ap_bruiser: "AP bruiser",
  ap_onhit: "AP on-hit",
  adc_crit: "Crit marksman",
  adc_onhit: "On-hit marksman",
  adc_caster: "Caster marksman",
  ad_assassin: "AD assassin",
  bruiser: "Bruiser",
  tank: "Tank",
  enchanter: "Enchanter",
};

export const PLAYSTYLES: Array<{ value: Playstyle; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "Adapts to how your game is going" },
  { value: "aggressive", label: "Aggressive", hint: "More damage, fewer defensive items" },
  { value: "balanced", label: "Balanced", hint: "Even mix of damage and safety" },
  { value: "safe", label: "Safe", hint: "Prioritize survival items" },
  { value: "frontline", label: "Frontline", hint: "Soak damage for your team" },
];

export const RARITY_LABEL: Record<AugmentRarity, string> = { prismatic: "Prismatic", gold: "Gold", silver: "Silver" };

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function gold(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** Win rates are always shown with one decimal: 0.5234 → "52.3%". */
export function winRate(x: number): string {
  return pct(x, 1);
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable hue per name, used for fallback tiles. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function kda(k: number, d: number, a: number): string {
  return d === 0 ? "Perfect" : ((k + a) / d).toFixed(2);
}

export function relativeDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Patch label as players know it. Riot names patches by season year (26.23) but Data Dragon and some
 * stats sites still number them 16.23 — show the season name.
 */
export function displayPatch(v: string | undefined | null): string | undefined {
  if (!v) return v ?? undefined;
  const m = String(v).match(/^(\d+)\.(\d+)/);
  if (!m) return String(v);
  const major = Number(m[1]);
  return `${major >= 15 && major < 25 ? major + 10 : major}.${m[2]}`;
}
