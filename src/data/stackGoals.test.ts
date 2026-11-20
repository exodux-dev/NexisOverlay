import { describe, expect, it } from "vitest";
import { nextStackGoal, STACK_PLANS } from "./stackGoals";
import { CHAMPION_KB } from "./championKb";

describe("stack goals", () => {
  it("gives the next Smolder milestone for the game time", () => {
    expect(nextStackGoal("Smolder", "sr", 3)?.stacks).toBe(25);
    expect(nextStackGoal("Smolder", "sr", 10)?.stacks).toBe(125);
    expect(nextStackGoal("Smolder", "mayhem", 10)?.stacks).toBe(225);
    const late = nextStackGoal("Smolder", "sr", 40);
    expect(late?.stacks).toBe(225);
    expect(late?.late).toBe(true);
  });
  it("is empty for other champions and modes without a pace", () => {
    expect(nextStackGoal("Ahri", "sr", 5)).toBeUndefined();
    expect(nextStackGoal("Kindred", "aram", 5)).toBeUndefined();
  });
  it("uses real champion ids", () => {
    for (const id of Object.keys(STACK_PLANS)) expect(CHAMPION_KB[id], id).toBeDefined();
  });
});

import { apheliosMain } from "../engine/live";
describe("aphelios main hand", () => {
  it("reads the weapon from his Q", () => {
    expect(apheliosMain({ id: "ApheliosCalibrumQ" })).toBe("Calibrum");
    expect(apheliosMain({ displayName: "Moonshot", rawDisplayName: "GeneratedTip_Spell_ApheliosInfernumQ_DisplayName" })).toBe("Infernum");
    expect(apheliosMain({ id: "AhriOrbofDeception" })).toBeUndefined();
    expect(apheliosMain(undefined)).toBeUndefined();
  });
});

import { simulateBurns, STANDARD_BURNS } from "./aphelios";
describe("aphelios burn simulation", () => {
  it("follows the queue", () => {
    const s = simulateBurns(STANDARD_BURNS);
    expect([s[0]!.main, s[0]!.off]).toEqual(["Calibrum", "Severum"]);
    expect([s[1]!.main, s[1]!.off]).toEqual(["Gravitum", "Severum"]);
    expect([s[2]!.main, s[2]!.off]).toEqual(["Gravitum", "Infernum"]);
    expect([s[3]!.main, s[3]!.off]).toEqual(["Crescendum", "Infernum"]);
    expect(s[3]!.queue).toEqual(["Calibrum", "Severum", "Gravitum"]);
  });
});
