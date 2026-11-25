import { describe, expect, it } from "vitest";
import { NEW_TRACKER, stepPick, type PickTracker } from "./pickDetect";

const run = (scans: string[][]) => {
  let t: PickTracker = NEW_TRACKER;
  const picks: string[] = [];
  for (const s of scans) {
    const r = stepPick(t, s);
    t = r.tracker;
    if (r.picked) picks.push(r.picked);
  }
  return { t, picks };
};
const OFFER = ["Eureka", "Clown College", "Draw Your Sword"];

describe("augment pick detection from scans", () => {
  it("picks the one card left on screen for three scans", () => {
    expect(run([OFFER, OFFER, ["Clown College"], ["Clown College"], ["Clown College"]]).picks).toEqual(["Clown College"]);
  });
  it("needs three scans in a row (a brief single read, e.g. a hover tooltip, isn't a pick)", () => {
    expect(run([OFFER, ["Eureka"], OFFER, ["Clown College"]]).picks).toEqual([]);
    expect(run([OFFER, ["Eureka"], ["Eureka"], OFFER]).picks).toEqual([]);
  });
  it("a screen that just closes leaves the pick unknown", () => {
    const r = run([OFFER, [], [], [], [], []]);
    expect(r.picks).toEqual([]);
    expect(r.t.offer).toEqual([]);
  });
  it("a reroll starts over with the new cards", () => {
    const reroll = ["Jeweled Gauntlet", "Clown College", "Infinite Recursion"];
    expect(run([OFFER, reroll, ["Eureka"], ["Eureka"], ["Eureka"]]).picks).toEqual([]);
    expect(run([OFFER, reroll, ["Infinite Recursion"], ["Infinite Recursion"], ["Infinite Recursion"]]).picks).toEqual(["Infinite Recursion"]);
  });
  it("ignores single cards when no offer was seen, and other text", () => {
    expect(run([["Eureka"], ["Eureka"], ["Eureka"]]).picks).toEqual([]);
    expect(run([OFFER, ["Some Other Augment"], ["Some Other Augment"], ["Some Other Augment"]]).picks).toEqual([]);
  });
  it("one pick per offer", () => {
    expect(run([OFFER, ["Eureka"], ["Eureka"], ["Eureka"], ["Eureka"], ["Eureka"]]).picks).toEqual(["Eureka"]);
  });
});
