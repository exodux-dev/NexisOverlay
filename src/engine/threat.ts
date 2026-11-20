// Enemy team analysis: damage profile, healing, shields, tankiness, CC, burst…
// Produces 0..1 meters plus the champions/items that caused each one.

import { ENEMY_ITEM_SIGNALS } from "../data/itemKb";
import type { Champion, PlayerState } from "./types";
import { clamp } from "./text";

export interface ThreatMeter {
  key: ThreatKey;
  label: string;
  value: number; // 0..1
  sources: string[]; // champion names / items responsible
}

export type ThreatKey = "heal" | "shield" | "tankiness" | "cc" | "burst" | "crit" | "attackSpeed" | "poke";

export interface ThreatReport {
  apShare: number; // 0..1 share of enemy damage that is magic
  adShare: number;
  heal: number;
  shield: number;
  tankiness: number;
  cc: number;
  burst: number;
  crit: number;
  attackSpeed: number;
  poke: number;
  suppress: string[]; // champions with suppression
  meters: ThreatMeter[];
  assassinsAd: number;
  assassinsAp: number;
}

const BURST_AD = new Set(["ad_assassin"]);
const BURST_AP = new Set(["ap_assassin", "mage_burst"]);

export function analyzeEnemies(enemies: PlayerState[]): ThreatReport {
  let ap = 0;
  let ad = 0;
  const m: Record<ThreatKey, { v: number; src: Set<string> }> = {
    heal: { v: 0, src: new Set() },
    shield: { v: 0, src: new Set() },
    tankiness: { v: 0, src: new Set() },
    cc: { v: 0, src: new Set() },
    burst: { v: 0, src: new Set() },
    crit: { v: 0, src: new Set() },
    attackSpeed: { v: 0, src: new Set() },
    poke: { v: 0, src: new Set() },
  };
  const add = (k: ThreatKey, v: number, who: string) => {
    if (v <= 0) return;
    m[k].v += v;
    m[k].src.add(who);
  };
  const suppress: string[] = [];
  let assassinsAd = 0;
  let assassinsAp = 0;

  for (const e of enemies) {
    const c: Champion | undefined = e.champion;
    const name = c?.name ?? e.championName;
    if (c) {
      const w = c.damage === "mixed" ? 0.5 : 1;
      if (c.damage === "ap" || c.damage === "mixed") ap += w;
      if (c.damage === "ad" || c.damage === "mixed") ad += w;
      // Tanks & enchanters deal less damage overall.
      if (c.archetype === "tank" || c.archetype === "enchanter") {
        if (c.damage === "ad") ad -= 0.5;
        else ap -= 0.5;
      }
      add("heal", c.traits.heal, name);
      add("shield", c.traits.shield, name);
      add("cc", c.traits.cc, name);
      if (c.traits.suppress) suppress.push(name);
      if (c.archetype === "tank") add("tankiness", 3, name);
      else if (c.archetype === "bruiser" || c.archetype === "ap_bruiser") add("tankiness", 1.5, name);
      if (BURST_AD.has(c.archetype)) {
        add("burst", 3, name);
        assassinsAd++;
      }
      if (BURST_AP.has(c.archetype)) {
        add("burst", c.archetype === "ap_assassin" ? 3 : 2, name);
        if (c.archetype === "ap_assassin") assassinsAp++;
      }
      if (c.archetype === "adc_crit") add("crit", 3, name);
      if (c.archetype === "adc_onhit" || c.archetype === "ap_onhit") add("attackSpeed", 3, name);
      if (c.archetype === "adc_crit") add("attackSpeed", 1.5, name);
      if (c.archetype === "mage_poke") add("poke", 3, name);
      if (c.archetype === "adc_caster" || c.archetype === "mage_dps") add("poke", 1, name);
    }
    // Items they actually bought sharpen the picture as the game goes on.
    for (const it of e.items) {
      const sig = ENEMY_ITEM_SIGNALS[it.name];
      if (!sig) continue;
      const label = `${name} (${it.name})`;
      add("heal", (sig.heal ?? 0) * 1.2, label);
      add("shield", (sig.shield ?? 0) * 1.2, label);
      add("tankiness", ((sig.armor ?? 0) + (sig.mr ?? 0) + (sig.hp ?? 0)) * 0.7, label);
      if (/infinity edge|navori|phantom dancer|yun tal/i.test(it.name)) add("crit", 1, label);
    }
  }

  const total = Math.max(0.5, ap + ad);
  // No enemies known yet (champ select / explore): neutral split, so no resist item is pushed.
  const resolved = enemies.filter((e) => e.champion).length;
  const apShare = resolved ? clamp(ap / total) : 0.5;
  // Scales chosen so that "a lot" (e.g. 2 strong healers) saturates near 0.8-1.
  const scale: Record<ThreatKey, number> = { heal: 6, shield: 6, tankiness: 8, cc: 10, burst: 7, crit: 6, attackSpeed: 6, poke: 6 };
  const labels: Record<ThreatKey, string> = {
    heal: "Healing",
    shield: "Shielding",
    tankiness: "Tankiness",
    cc: "Crowd control",
    burst: "Burst",
    crit: "Crit damage",
    attackSpeed: "Attack speed",
    poke: "Poke",
  };
  const val = (k: ThreatKey) => clamp(m[k].v / scale[k]);
  const meters: ThreatMeter[] = (Object.keys(m) as ThreatKey[]).map((k) => ({
    key: k,
    label: labels[k],
    value: val(k),
    sources: [...m[k].src],
  }));

  return {
    apShare,
    adShare: 1 - apShare,
    heal: val("heal"),
    shield: val("shield"),
    tankiness: val("tankiness"),
    cc: val("cc"),
    burst: val("burst"),
    crit: val("crit"),
    attackSpeed: val("attackSpeed"),
    poke: val("poke"),
    suppress,
    meters,
    assassinsAd,
    assassinsAp,
  };
}

export function threatLevel(v: number): "low" | "medium" | "high" | "extreme" {
  if (v >= 0.8) return "extreme";
  if (v >= 0.55) return "high";
  if (v >= 0.3) return "medium";
  return "low";
}
