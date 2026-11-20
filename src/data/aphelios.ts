// Aphelios weapon reference (main hand is read from the Live Client API; off-hand and the queue are
// not exposed to apps). Reference info only — no "burn now" prompts (Riot third-party policy).

import type { ApheliosWeapon } from "../engine/live";

export interface WeaponInfo {
  color: string;
  role: string;
  /** Off-hands that pair well with this main hand (common guide consensus). */
  pairs: ApheliosWeapon[];
}

export const APHELIOS_INFO: Record<ApheliosWeapon, WeaponInfo> = {
  Calibrum: { color: "#43c58a", role: "Long-range poke · Q marks for follow-up hits", pairs: ["Gravitum", "Infernum"] },
  Severum: { color: "#e2554f", role: "Lifesteal · Q fires fast at nearby enemies", pairs: ["Infernum", "Crescendum"] },
  Gravitum: { color: "#9b6bdc", role: "Slows · Q roots everyone it marked", pairs: ["Calibrum", "Crescendum"] },
  Infernum: { color: "#4f8fe8", role: "Cone splash · best R for teamfights", pairs: ["Crescendum", "Calibrum"] },
  Crescendum: { color: "#e8e6df", role: "Chakrams stack up close · Q turret", pairs: ["Severum", "Infernum"] },
};

/** What each main / off-hand pair is good at (order-independent). Common guide consensus. */
export const PAIR_NOTES: Record<string, string> = {
  "Calibrum+Severum": "Safe start: poke with Calibrum, swap to Severum to heal and trade",
  "Calibrum+Gravitum": "Pick and siege: mark, then root with Gravitum Q",
  "Calibrum+Infernum": "Long-range poke and waveclear",
  "Calibrum+Crescendum": "Weak pair: Crescendum wants to be close, Calibrum far",
  "Gravitum+Severum": "Duelling and peel: slow, then shred with Severum",
  "Infernum+Severum": "Waveclear plus sustain in skirmishes",
  "Crescendum+Severum": "Strongest duel / dive pair up close",
  "Gravitum+Infernum": "Teamfight control: root clumps, Infernum splash",
  "Crescendum+Gravitum": "Kite and turret: Gravitum slows, chakrams stack",
  "Crescendum+Infernum": "Best teamfight pair: Infernum R, Crescendum burst",
};

export function pairNote(a: ApheliosWeapon, b: ApheliosWeapon): string {
  return PAIR_NOTES[[a, b].sort().join("+")] ?? "";
}

export interface BurnStep {
  main: ApheliosWeapon;
  off: ApheliosWeapon;
  queue: ApheliosWeapon[];
  /** The weapon to run out of ammo on at this step (it's always the main hand when it empties). */
  burn: ApheliosWeapon;
  note: string;
}

/**
 * Simulates the weapon queue: a weapon that runs out goes to the back of the queue and the
 * front of the queue takes its place. `burns` = the weapon emptied at each step (main or off hand;
 * burning the off hand means swapping it to main first).
 */
export function simulateBurns(burns: ApheliosWeapon[]): BurnStep[] {
  let main: ApheliosWeapon = "Calibrum";
  let off: ApheliosWeapon = "Severum";
  let queue: ApheliosWeapon[] = ["Gravitum", "Infernum", "Crescendum"];
  const steps: BurnStep[] = [];
  for (const burn of burns) {
    if (burn !== main && burn !== off) break;
    steps.push({ main, off, queue: [...queue], burn, note: pairNote(main, off) });
    const next = queue[0]!;
    queue = [...queue.slice(1), burn];
    if (burn === main) main = next;
    else off = next;
  }
  steps.push({ main, off, queue: [...queue], burn: main, note: pairNote(main, off) });
  return steps;
}

/** A standard first rotation (popular guide order): fastest route to Infernum + Crescendum. */
export const STANDARD_BURNS: ApheliosWeapon[] = ["Calibrum", "Severum", "Gravitum"];
