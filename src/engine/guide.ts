// Skill level order + champion coaching (pre-fight reference, never real-time combat prompts —
// Riot's third-party policy forbids apps that tell you when to press abilities mid-fight).

import { GUIDES, SKILL_ORDERS, type ChampionGuide, type SkillKey, type SkillPlan } from "../data/coachKb";
import type { Champion, ChampionStats, PlayerState } from "./types";
import type { BuildVariant } from "./variants";

export type { ChampionGuide, SkillKey, SkillPlan };

/** Expand a skill plan into the 18-level sequence (R at 6/11/16, 5 points per basic ability). */
export function levelSequence(plan: SkillPlan): SkillKey[] {
  const seq: SkillKey[] = [];
  const pts: Record<SkillKey, number> = { Q: 0, W: 0, E: 0, R: 0 };
  const cap: Record<SkillKey, (lvl: number) => number> = {
    Q: (l) => Math.min(5, Math.ceil(l / 2)),
    W: (l) => Math.min(5, Math.ceil(l / 2)),
    E: (l) => Math.min(5, Math.ceil(l / 2)),
    R: (l) => (l >= 16 ? 3 : l >= 11 ? 2 : l >= 6 ? 1 : 0),
  };
  for (let lvl = 1; lvl <= 18; lvl++) {
    let pick: SkillKey | undefined;
    if (pts.R < cap.R(lvl)) pick = "R";
    else if (lvl <= plan.start.length) {
      const s = plan.start[lvl - 1];
      if (pts[s] < cap[s](lvl)) pick = s;
    }
    if (!pick) pick = plan.max.find((k) => pts[k] < cap[k](lvl));
    if (!pick) pick = (["Q", "W", "E"] as SkillKey[]).find((k) => pts[k] < cap[k](lvl));
    if (!pick) break;
    pts[pick]++;
    seq.push(pick);
  }
  return seq;
}

export function skillPlanFor(champion: Champion, variant?: BuildVariant, stats?: ChampionStats): SkillPlan & { source: "stats" | "curated" | "generic" } {
  // Highest-sample skill order from aggregated match data wins when available (default style only).
  const top = stats?.skillOrders?.filter((s) => s.games >= 20).sort((a, b) => b.games - a.games)[0];
  if (top && /^[QWE]{3}$/.test(top.order)) {
    const max = top.order.split("") as ("Q" | "W" | "E")[];
    const curated = SKILL_ORDERS[champion.id];
    return {
      max,
      start: curated?.start ?? max,
      note: `Most common order · ${(top.wins / top.games * 100).toFixed(1)}% ${stats?.mode === "arena" ? "top 4" : "WR"} over ${top.games} games`,
      source: "stats",
    };
  }
  const curated = (variant && SKILL_ORDERS[`${champion.id}:${variant.id}`]) || SKILL_ORDERS[champion.id];
  if (curated) return { ...curated, source: "curated" };
  return { max: ["Q", "E", "W"], start: ["Q", "E", "W"], note: "Generic order — no curated data for this champion yet", source: "generic" };
}

export interface CoachAdvice {
  title: string;
  text: string;
  /** Build style this advice recommends (matches variants.ts ids), if any. */
  variantId?: string;
  tone: "info" | "good" | "warn";
}

/** Matchup-dependent advice computed from the enemy team (champion-specific). */
export function matchupAdvice(champion: Champion, enemies: PlayerState[]): CoachAdvice[] {
  const champs = enemies.map((e) => e.champion).filter((c): c is Champion => !!c);
  if (!champs.length) return [];
  const ranged = champs.filter((c) => c.ranged).length;
  const melee = champs.length - ranged;
  const tanks = champs.filter((c) => c.archetype === "tank" || c.archetype === "bruiser" || c.archetype === "ap_bruiser").length;
  const squishy = champs.filter((c) => ["adc_crit", "adc_onhit", "adc_caster", "mage_burst", "mage_poke", "mage_dps", "enchanter"].includes(c.archetype)).length;
  const out: CoachAdvice[] = [];

  switch (champion.id) {
    case "Kayn": {
      // Rhaast (red) orbs come from hitting MELEE champions, Shadow Assassin (blue) from RANGED.
      const red = melee >= 3 || tanks >= 2;
      out.push({
        title: red ? "Go Rhaast (red)" : "Go Shadow Assassin (blue)",
        text: red
          ? `${melee} melee / ${tanks} durable enemies — Rhaast's %-health damage and healing win extended fights, and melee hits charge red quickly.`
          : `${ranged} ranged and ${squishy} squishy enemies — Shadow Assassin dives the backline and ranged hits charge blue quickly.`,
        variantId: red ? "red" : "blue",
        tone: "good",
      });
      break;
    }
    case "Aphelios": {
      const dive = champs.filter((c) => ["ad_assassin", "ap_assassin", "bruiser", "tank"].includes(c.archetype)).length;
      out.push(
        dive >= 3
          ? { title: "Peel weapons ready", text: `${dive} divers — keep Gravitum (root) or Crescendum (turret) in your off-hand when fights start.`, tone: "warn" }
          : { title: "Poke & siege", text: "Few divers — Calibrum/Infernum lead into long-range poke; save Crescendum for the all-in.", tone: "info" },
      );
      if (tanks >= 2) out.push({ title: "Vs tanks", text: "Infernum + Crescendum or Severum sustain trades out-damage tanky frontlines.", tone: "info" });
      break;
    }
    default:
      break;
  }

  // Generic matchup notes for everyone.
  if (melee >= 4 && champion.ranged) out.push({ title: "Kite them", text: `${melee} melee enemies — stay at max range and punish their engage cooldowns.`, tone: "info" });
  if (ranged >= 4 && !champion.ranged) out.push({ title: "Poke-heavy enemies", text: `${ranged} ranged enemies — don't waste HP in the poke phase; use brush and wait for engage windows.`, tone: "warn" });
  return out;
}

export function guideFor(champion: Champion): ChampionGuide | undefined {
  return GUIDES[champion.id];
}
