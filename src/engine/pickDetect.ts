// Infers which augment you picked from the background OCR scans alone (no mouse / input reading).
// After a 3-card offer, the game closes or dims the cards you didn't take: when exactly one card of
// the offer is still read in three scans in a row (~1.8 s), that one is taken as your pick (two
// was too few: a hover tooltip over the other cards could fake it). A screen that
// just closes (no single card seen) leaves the pick unknown — the reminder covers that case.

export interface PickTracker {
  /** The current offer (3+ names), once seen. */
  offer: string[];
  /** A single remaining card of the offer, and in how many scans in a row it was alone. */
  single?: string;
  singleCount: number;
  /** Scans in a row with no card of the offer: the offer is forgotten after a few. */
  empty: number;
}

export const NEW_TRACKER: PickTracker = { offer: [], singleCount: 0, empty: 0 };

/** Scans in a row that must show only the picked card. */
export const PICK_SCANS = 3;

/** Scans with no card before the offer is dropped (~3 s at one scan every 0.6 s). */
const FORGET_AFTER = 5;

export function stepPick(t: PickTracker, names: string[]): { tracker: PickTracker; picked?: string } {
  const inOffer = names.filter((n) => t.offer.includes(n));
  if (names.length >= 3) {
    // A (new or re-read) full offer; a reroll swaps the cards and starts over.
    const same = names.length === t.offer.length && names.every((n) => t.offer.includes(n));
    return { tracker: same ? { ...t, single: undefined, singleCount: 0, empty: 0 } : { offer: [...names], singleCount: 0, empty: 0 } };
  }
  if (!t.offer.length) return { tracker: t };
  if (inOffer.length === 1 && names.length === 1) {
    const name = inOffer[0];
    const count = t.single === name ? t.singleCount + 1 : 1;
    if (count >= PICK_SCANS) return { tracker: NEW_TRACKER, picked: name };
    return { tracker: { ...t, single: name, singleCount: count, empty: 0 } };
  }
  if (!inOffer.length) {
    const empty = t.empty + 1;
    return { tracker: empty >= FORGET_AFTER ? NEW_TRACKER : { ...t, single: undefined, singleCount: 0, empty } };
  }
  // Two cards still readable: in between, nothing decided yet.
  return { tracker: { ...t, single: undefined, singleCount: 0, empty: 0 } };
}
