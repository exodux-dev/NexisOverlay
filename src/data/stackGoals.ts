// Stacking champions: milestone stack counts and a rough pace to aim for, per mode.
// Pre-game / reference info only. The Live Client API doesn't report stack counts, so Nexis shows
// the next target for the current game time — it never reads or guesses your actual stacks.

import type { GameModeKind } from "../engine/mode";

export interface StackGoal {
  stacks: number;
  /** What the milestone unlocks / why it matters. */
  unlock: string;
  /** Rough game minute to reach it by, per mode (omitted = no pace for that mode). */
  by: Partial<Record<GameModeKind, number>>;
}

export interface StackPlan {
  /** What the stacks are called in game. */
  name: string;
  goals: StackGoal[];
  tip: string;
}

export const STACK_PLANS: Record<string, StackPlan> = {
  Smolder: {
    name: "Dragon Practice",
    goals: [
      { stacks: 25, unlock: "Q explodes on hit (AoE splash)", by: { sr: 6, aram: 4, mayhem: 3 } },
      { stacks: 125, unlock: "Q burns targets", by: { sr: 15, aram: 11, mayhem: 8 } },
      { stacks: 225, unlock: "Q executes low-HP targets", by: { sr: 25, aram: 18, mayhem: 14 } },
    ],
    tip: "Q champions and Q-kill minions to stack — every ability hit on a champion counts. Don't skip waves for fights you can't win before 25 stacks.",
  },
  Veigar: {
    name: "Phenomenal Evil",
    goals: [
      { stacks: 100, unlock: "Solid one-shot potential with R", by: { sr: 14, aram: 10, mayhem: 8 } },
      { stacks: 250, unlock: "Huge AP lead — E/W combos delete squishies", by: { sr: 25, aram: 18, mayhem: 14 } },
      { stacks: 500, unlock: "Late-game monster", by: { sr: 40, aram: 28, mayhem: 22 } },
    ],
    tip: "Last-hit minions with Q (2 per Q in ARAM waves) and hit champions with abilities for stacks.",
  },
  Nasus: {
    name: "Siphoning Strike",
    goals: [
      { stacks: 100, unlock: "Q starts winning trades", by: { sr: 12, aram: 10, mayhem: 8 } },
      { stacks: 300, unlock: "Q chunks squishies", by: { sr: 25, aram: 18, mayhem: 14 } },
      { stacks: 500, unlock: "Q one-shots carries", by: { sr: 35, aram: 26, mayhem: 20 } },
    ],
    tip: "Last-hit every minion you can with Q — Q kills on champions and large monsters give more stacks.",
  },
  Senna: {
    name: "Mist / Absolution",
    goals: [
      { stacks: 20, unlock: "Extra crit chance starts showing", by: { sr: 15, aram: 10, mayhem: 8 } },
      { stacks: 60, unlock: "Strong range and crit scaling", by: { sr: 30, aram: 20, mayhem: 16 } },
    ],
    tip: "Collect Mist souls from minions you or allies kill near you, and Absolution from champions.",
  },
  Kindred: {
    name: "Mark of the Kindred",
    goals: [
      { stacks: 4, unlock: "Bigger attack range", by: { sr: 15 } },
      { stacks: 7, unlock: "Range increases again", by: { sr: 25 } },
      { stacks: 10, unlock: "Max range bonus tier", by: { sr: 32 } },
    ],
    tip: "Take marked jungle camps and champions; marks matter less in ARAM.",
  },
  AurelionSol: {
    name: "Stardust",
    goals: [
      { stacks: 50, unlock: "Q burst size up", by: { sr: 15, aram: 10, mayhem: 8 } },
      { stacks: 75, unlock: "R becomes The Skies Descend (bigger, knockup)", by: { sr: 20, aram: 14, mayhem: 11 } },
    ],
    tip: "Channel Q on champions and execute low-HP enemies with E to collect Stardust.",
  },
  Belveth: {
    name: "Lavender (Death in Lavender)",
    goals: [{ stacks: 10, unlock: "Noticeably faster attacks", by: { sr: 15 } }],
    tip: "Take epic monsters and champion kills for permanent attack speed stacks.",
  },
  Chogath: {
    name: "Feast",
    goals: [{ stacks: 6, unlock: "Max size from champion Feasts", by: { sr: 25, aram: 18, mayhem: 14 } }],
    tip: "Use R on champions when possible — champion Feasts give the full stack; minions only half.",
  },
};

/** The next milestone to aim for at this game time (or the last one once all are due). */
export function nextStackGoal(championId: string, mode: GameModeKind, gameMinutes: number): (StackGoal & { name: string; late: boolean }) | undefined {
  const plan = STACK_PLANS[championId];
  if (!plan) return undefined;
  const paced = plan.goals.filter((g) => g.by[mode] !== undefined);
  if (!paced.length) return undefined;
  const next = paced.find((g) => (g.by[mode] as number) >= gameMinutes) ?? paced[paced.length - 1]!;
  return { ...next, name: plan.name, late: (next.by[mode] as number) < gameMinutes };
}
