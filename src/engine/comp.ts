// Team composition analysis: damage profile, frontline, engage, peel, CC, poke, sustain, waveclear,
// split-push and power curve for a list of champions, plus short strategic notes (warnings /
// strengths), a comparison against the enemy team and "what this pick adds" for the pick helper.
// Pure: champions in, numbers + text out. Uses only what the client shows (picked champions).

import { ARCHETYPE_COMP, ARCHETYPE_CURVE, COMP_OVERRIDES, CURVE_OVERRIDES, TRUE_DAMAGE, type CompTrait } from "../data/compKb";
import type { GameModeKind } from "./mode";
import type { Champion } from "./types";
import { clamp } from "./text";

/** The parts of a champion the analysis needs (a full `Champion` works). */
export type CompChampion = Pick<Champion, "id" | "name" | "archetype" | "damage" | "traits">;

export type CompAxis = "frontline" | "engage" | "peel" | "cc" | "poke" | "sustain" | "waveclear" | "splitpush" | "late";

export const AXIS_LABEL: Record<CompAxis, string> = {
  frontline: "Frontline",
  engage: "Engage",
  peel: "Peel",
  cc: "Crowd control",
  poke: "Poke",
  sustain: "Sustain",
  waveclear: "Waveclear",
  splitpush: "Split-push",
  late: "Late game",
};

export const AXIS_HINT: Record<CompAxis, string> = {
  frontline: "Tanks and bruisers who can stand in front and absorb the first wave of damage.",
  engage: "Ways to start a fight on your terms: hard engage, dives, long-range catches.",
  peel: "Disengage and protection for carries: knock-backs, shields, slows, zone control.",
  cc: "Total reliable crowd control (stuns, roots, knock-ups, slows).",
  poke: "Long-range damage that whittles enemies down before a fight.",
  sustain: "Healing and shielding that keeps the team topped up between fights.",
  waveclear: "How fast the team clears minion waves (holding sieges, pushing).",
  splitpush: "Champions who can pressure a side lane alone.",
  late: "How strong the team gets with full items compared with early on.",
};

export type NoteTone = "warn" | "good" | "info";
export interface CompNote {
  key: string;
  tone: NoteTone;
  text: string;
}

export interface CompProfile {
  /** Champions analysed. */
  count: number;
  /** Expected team size for the mode (5, or 2 in Arena). */
  size: number;
  /** Damage shares (sum to 1 when count > 0). */
  damage: { ad: number; ap: number; true: number };
  /** 0..1 per axis (late = late-game strength). */
  scores: Record<CompAxis, number>;
  /** Team power curve, 0..1 each. */
  curve: { early: number; mid: number; late: number };
  /** Axes that are meaningful in this mode, in display order. */
  axes: CompAxis[];
  /** Champions contributing most to each axis (names). */
  sources: Record<CompAxis, string[]>;
  warnings: CompNote[];
  strengths: CompNote[];
}

const TEAM_SIZE: Record<GameModeKind, number> = { sr: 5, aram: 5, mayhem: 5, arena: 2 };

/** Axes shown per mode: no split-push on single-lane maps, no waves in Arena. */
export function compAxes(mode: GameModeKind): CompAxis[] {
  if (mode === "arena") return ["frontline", "engage", "peel", "cc", "poke", "sustain", "late"];
  if (mode === "sr") return ["frontline", "engage", "peel", "cc", "poke", "sustain", "waveclear", "splitpush", "late"];
  return ["frontline", "engage", "peel", "cc", "poke", "sustain", "waveclear", "late"];
}

/** Sum that saturates a 5-champion team at 1.0 (scaled down for smaller modes). */
const NORM: Record<Exclude<CompAxis, "late">, number> = {
  frontline: 6,
  engage: 6,
  peel: 5,
  cc: 10,
  poke: 7,
  sustain: 6,
  waveclear: 10,
  splitpush: 4,
};

function trait(c: CompChampion, t: CompTrait): number {
  return COMP_OVERRIDES[c.id]?.[t] ?? ARCHETYPE_COMP[c.archetype]?.[t] ?? 0;
}

function curveOf(c: CompChampion): [number, number, number] {
  return CURVE_OVERRIDES[c.id] ?? ARCHETYPE_CURVE[c.archetype] ?? [2, 2, 2];
}

/** How much a champion contributes to each axis (0..3). */
export function championAxes(c: CompChampion): Record<Exclude<CompAxis, "late">, number> {
  return {
    frontline: trait(c, "frontline"),
    engage: trait(c, "engage"),
    peel: trait(c, "peel") + (c.traits.shield >= 2 ? 0.5 : 0),
    cc: c.traits.cc,
    poke: trait(c, "poke"),
    sustain: c.traits.heal + c.traits.shield * 0.6,
    waveclear: trait(c, "waveclear"),
    splitpush: trait(c, "splitpush"),
  };
}

/** A champion's damage split (ad/ap/true) and how much damage it deals overall. */
function damageOf(c: CompChampion): { ad: number; ap: number; tr: number } {
  const w = c.archetype === "tank" || c.archetype === "enchanter" ? 0.45 : 1;
  const tr = (TRUE_DAMAGE[c.id] ?? 0) * w;
  const rest = w - tr;
  if (c.damage === "mixed") return { ad: rest / 2, ap: rest / 2, tr };
  return c.damage === "ad" ? { ad: rest, ap: 0, tr } : { ad: 0, ap: rest, tr };
}

const CARRY = new Set<Champion["archetype"]>(["adc_crit", "adc_onhit", "adc_caster", "mage_dps", "mage_poke", "ap_onhit"]);

export function analyzeComp(champs: CompChampion[], mode: GameModeKind = "sr"): CompProfile {
  const size = TEAM_SIZE[mode] ?? 5;
  const axes = compAxes(mode);
  const sum = { frontline: 0, engage: 0, peel: 0, cc: 0, poke: 0, sustain: 0, waveclear: 0, splitpush: 0 };
  const sources = Object.fromEntries(axes.concat("late").map((a) => [a, [] as string[]])) as Record<CompAxis, string[]>;
  let ad = 0;
  let ap = 0;
  let tr = 0;
  let early = 0;
  let mid = 0;
  let late = 0;
  for (const c of champs) {
    const ax = championAxes(c);
    for (const k of Object.keys(sum) as Array<keyof typeof sum>) {
      sum[k] += ax[k];
      if (ax[k] >= 2) sources[k]?.push(c.name);
    }
    const d = damageOf(c);
    ad += d.ad;
    ap += d.ap;
    tr += d.tr;
    const [e, m, l] = curveOf(c);
    early += e;
    mid += m;
    late += l;
    if (l >= 3 && e <= 1.5) sources.late.push(c.name);
  }
  const n = champs.length;
  const dmgTotal = ad + ap + tr;
  const damage = dmgTotal > 0 ? { ad: ad / dmgTotal, ap: ap / dmgTotal, true: tr / dmgTotal } : { ad: 0, ap: 0, true: 0 };
  // Scores scale with the full team size, so a half-picked team reads as "so far".
  const k = size / 5;
  const scores = {} as Record<CompAxis, number>;
  for (const a of Object.keys(NORM) as Array<keyof typeof NORM>) scores[a] = clamp(sum[a] / (NORM[a] * k));
  // Power curve: average per-champion value (0..3 → 0..1); independent of how many are picked.
  const curve = n ? { early: early / n / 3, mid: mid / n / 3, late: late / n / 3 } : { early: 0, mid: 0, late: 0 };
  scores.late = curve.late;

  const profile: CompProfile = { count: n, size, damage, scores, curve, axes, sources, warnings: [], strengths: [] };
  const notes = teamNotes(profile, champs, mode);
  profile.warnings = notes.filter((x) => x.tone === "warn");
  profile.strengths = notes.filter((x) => x.tone !== "warn");
  return profile;
}

/** Notes about one team. Missing-piece warnings wait until most of the team is known. */
function teamNotes(p: CompProfile, champs: CompChampion[], mode: GameModeKind): CompNote[] {
  const out: CompNote[] = [];
  if (!p.count) return out;
  const s = p.scores;
  const enough = p.count >= Math.max(2, p.size - 2); // 3+ of 5, 2 of 2
  const has = (a: CompAxis) => p.axes.includes(a);
  const warn = (key: string, text: string) => out.push({ key, tone: "warn", text });
  const good = (key: string, text: string) => out.push({ key, tone: "good", text });

  // Damage profile (meaningful from 2 champions on).
  if (p.count >= 2) {
    const phys = p.damage.ad;
    const mag = p.damage.ap;
    if (phys >= 0.9) warn("dmg-ad", "All physical damage — enemies can stack armor");
    else if (phys >= 0.75) warn("dmg-ad", "Mostly physical damage — armor stacking hurts you");
    else if (mag >= 0.9) warn("dmg-ap", "All magic damage — enemies can stack magic resist");
    else if (mag >= 0.75) warn("dmg-ap", "Mostly magic damage — magic resist stacking hurts you");
    else if (phys >= 0.3 && mag >= 0.3 && enough) good("dmg-mixed", "Mixed damage — hard to itemize against");
    if (p.damage.true >= 0.12) good("dmg-true", "Real true damage threat — resists help the enemy less");
  }

  if (enough) {
    if (s.frontline < 0.2) warn("frontline", "No frontline — fights start on your carries");
    else if (s.frontline < 0.38) warn("frontline", "Light frontline — keep carries behind whoever can tank");
    else if (s.frontline >= 0.75) good("frontline", "Sturdy frontline");

    if (s.engage < 0.25) warn("engage", "Low engage — you rely on the enemy walking in");
    else if (s.engage >= 0.7) good("engage", "Strong engage — you choose when fights start");

    const carries = champs.filter((c) => CARRY.has(c.archetype)).length;
    if (carries >= 2 && s.peel < 0.3) warn("peel", "Little peel for your carries — divers can reach them");
    else if (s.peel >= 0.65) good("peel", "Lots of peel — hard to dive");

    if (s.cc < 0.3) warn("cc", "Low crowd control — hard to lock targets down");
    else if (s.cc >= 0.75) good("cc", "Heavy crowd control — chain it in fights");

    if (s.poke >= 0.6) {
      if (s.sustain < 0.3) good("poke", "Heavy poke comp — siege, but you lack sustain if fights drag on");
      else good("poke", "Heavy poke comp — chip enemies down before committing");
    }
    if (s.sustain >= 0.7) good("sustain", "Strong sustain — long fights favor you");
    else if (s.sustain < 0.15 && mode !== "sr") warn("sustain", "Almost no healing or shielding — buy sustain where you can");

    if (has("waveclear") && s.waveclear < 0.35) warn("waveclear", "Weak waveclear — sieges are hard to hold off");
    else if (has("waveclear") && s.waveclear >= 0.8) good("waveclear", "Great waveclear — easy to hold and push lanes");

    if (has("splitpush") && s.splitpush >= 0.6) good("splitpush", "Split-push threat — side lanes pull enemies apart");

    if (p.curve.late >= 0.85 && p.curve.early <= 0.6) good("late", "Strong late game — scale safely, avoid early coin flips");
    else if (p.curve.late <= 0.66) warn("late", "Comp falls off late — play for early fights and objectives");
    if (p.curve.early <= 0.5) warn("early", "Weak early game — expect early pressure");
    else if (p.curve.early >= 0.8) good("early", "Strong early game — press the advantage");
  }
  return out;
}

/** Ally-vs-enemy notes (only when the enemy team is known: live game / loading screen). */
export function compareComps(ally: CompProfile, enemy: CompProfile): CompNote[] {
  const out: CompNote[] = [];
  if (ally.count < Math.max(2, ally.size - 1) || enemy.count < Math.max(2, enemy.size - 1)) return out;
  const a = ally.scores;
  const e = enemy.scores;
  const warn = (key: string, text: string) => out.push({ key, tone: "warn", text });
  const good = (key: string, text: string) => out.push({ key, tone: "good", text });

  const lateDiff = ally.curve.late - enemy.curve.late;
  if (lateDiff <= -0.08) warn("vs-late", "Enemy team outscales yours late — your window is earlier");
  else if (lateDiff >= 0.08) good("vs-late", "Your team outscales late — stalling favors you");
  const earlyDiff = ally.curve.early - enemy.curve.early;
  if (earlyDiff <= -0.1) warn("vs-early", "Enemy is stronger early — avoid even fights before items");
  else if (earlyDiff >= 0.1) good("vs-early", "You're stronger early — early fights favor you");

  if (e.engage - a.engage >= 0.2) warn("vs-engage", "Enemy has more engage — stay grouped, avoid being caught");
  else if (a.engage - e.engage >= 0.2) good("vs-engage", "You have more engage — you decide when fights start");

  if (e.poke >= 0.5 && e.poke - a.poke >= 0.15) {
    warn("vs-poke", a.sustain < 0.4 ? "Enemy has heavy poke — consider sustain, or force fights" : "Enemy out-pokes you — your sustain and engage are the answer");
  }
  if (e.frontline - a.frontline >= 0.25) warn("vs-frontline", "Enemy frontline is beefier — penetration and %HP damage pay off");
  else if (a.frontline - e.frontline >= 0.25) good("vs-frontline", "Your frontline is stronger — you can hold the front");
  if (e.cc - a.cc >= 0.25) warn("vs-cc", "Enemy has more crowd control — tenacity and cleanses help");
  if (e.sustain - a.sustain >= 0.3) warn("vs-sustain", "Enemy sustains more — anti-heal helps, short fights favor you");
  if (enemy.damage.ad >= 0.75) out.push({ key: "vs-dmg", tone: "info", text: "Enemy damage is mostly physical — armor is extra valuable" });
  else if (enemy.damage.ap >= 0.75) out.push({ key: "vs-dmg", tone: "info", text: "Enemy damage is mostly magic — magic resist is extra valuable" });
  if (ally.axes.includes("splitpush") && a.splitpush - e.splitpush >= 0.35) good("vs-split", "You have the stronger side-laners — split pressure works");
  return out;
}

export interface PickImpact {
  /** Score changes worth mentioning, biggest first. */
  deltas: Array<{ axis: CompAxis; delta: number }>;
  /** Warnings this pick resolves / introduces. */
  fixes: CompNote[];
  adds: CompNote[];
  /** Short line, e.g. "+Frontline +Engage · fixes all-physical damage". Empty when the pick changes little. */
  summary: string;
}

const DMG_FIX: Record<string, string> = { "dmg-ad": "adds magic damage", "dmg-ap": "adds physical damage" };

/**
 * What swapping `current` (your champion, if any) for `candidate` does to the team.
 * `team` may include `current`; it is replaced, otherwise the candidate is added.
 */
export function pickImpact(team: CompChampion[], current: CompChampion | undefined, candidate: CompChampion, mode: GameModeKind = "sr"): PickImpact {
  // A trade with a teammate keeps the same five champions; otherwise the candidate takes your slot.
  const trade = !!current && team.some((c) => c.id === candidate.id);
  const next = trade ? team : [...team.filter((c) => c.id !== current?.id && c.id !== candidate.id), candidate];
  const before = analyzeComp(team, mode);
  const after = analyzeComp(next, mode);
  const deltas = before.axes
    .map((axis) => ({ axis, delta: after.scores[axis] - before.scores[axis] }))
    .filter((d) => Math.abs(d.delta) >= (d.axis === "late" ? 0.05 : 0.08))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const keys = (p: CompProfile) => new Set(p.warnings.map((w) => w.key));
  const bk = keys(before);
  const ak = keys(after);
  const fixes = before.warnings.filter((w) => !ak.has(w.key));
  const adds = after.warnings.filter((w) => !bk.has(w.key));

  // Damage balance: moving a one-sided team toward the other damage type is worth saying.
  let fix = fixes.map((f) => DMG_FIX[f.key]).find(Boolean);
  if (!fix && before.count >= 2) {
    if (before.damage.ad >= 0.75 && after.damage.ap - before.damage.ap >= 0.12) fix = DMG_FIX["dmg-ad"];
    else if (before.damage.ap >= 0.75 && after.damage.ad - before.damage.ad >= 0.12) fix = DMG_FIX["dmg-ap"];
  }
  const ups = deltas.filter((d) => d.delta > 0).slice(0, fix ? 2 : 3).map((d) => `+${AXIS_LABEL[d.axis]}`);
  const parts: string[] = [];
  if (ups.length) parts.push(ups.join(" "));
  if (fix) parts.push(fix);
  // The biggest loss, when it matters (or when nothing improves).
  const down = deltas.find((d) => d.delta < 0 && (!ups.length || d.delta <= -0.15));
  if (down) parts.push(`−${AXIS_LABEL[down.axis]}`);
  return { deltas, fixes, adds, summary: parts.join(" · ") };
}
