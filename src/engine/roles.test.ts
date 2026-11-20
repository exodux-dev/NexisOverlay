import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureStaticData } from "../dev/fixture";
import { parseLiveGame } from "./live";
import { teamPower } from "./power";
import { activeRoles, applyRoles, assignRole, effectiveLane, NO_OVERRIDES, playerKey, roleGameKey } from "./roles";
import type { GameSnapshot, PlayerState } from "./types";

const data = makeFixtureStaticData();
const SR_POS: Record<string, string> = {
  Ahri: "MIDDLE", Jinx: "BOTTOM", Leona: "UTILITY", Lux: "JUNGLE", Darius: "TOP",
  Soraka: "UTILITY", Aatrox: "TOP", Vladimir: "JUNGLE", Zed: "MIDDLE", Malphite: "BOTTOM",
};

function srGame(): GameSnapshot {
  const raw = demoAllGameData();
  raw.gameData = { ...raw.gameData, gameMode: "CLASSIC" };
  for (const p of raw.allPlayers!) p.position = SR_POS[(p as { rawChampionName: string }).rawChampionName.split("_").pop()!];
  return parseLiveGame(raw, data)!;
}
const all = (s: GameSnapshot) => [s.me, ...s.allies, ...s.enemies];
const find = (s: GameSnapshot, name: string): PlayerState => all(s).find((p) => p.champion?.id === name)!;

describe("role overrides", () => {
  const s = srGame();
  const key = roleGameKey(s);

  it("swaps two teammates in one action", () => {
    const vlad = find(s, "Vladimir");
    const roles = assignRole(s, NO_OVERRIDES, vlad, "MIDDLE");
    expect(roles).toEqual({ [playerKey(vlad)]: "MIDDLE", [playerKey(find(s, "Zed"))]: "JUNGLE" });
    const g = applyRoles(s, roles);
    expect(find(g, "Vladimir").position).toBe("MIDDLE");
    expect(find(g, "Zed").position).toBe("JUNGLE");
    // Allies untouched, same objects.
    expect(g.allies).toBe(s.allies);
    expect(g.me).toBe(s.me);
  });

  it("merges on top of the API and drops entries that match it again", () => {
    const vlad = find(s, "Vladimir");
    const r1 = assignRole(s, NO_OVERRIDES, vlad, "MIDDLE");
    const back = assignRole(s, r1, vlad, "JUNGLE");
    expect(back).toEqual({});
    // A chain of moves keeps one champion per lane.
    const r2 = assignRole(s, r1, find(s, "Aatrox"), "MIDDLE");
    const lanes = s.enemies.map((p) => effectiveLane(p, r2));
    expect(new Set(lanes).size).toBe(5);
    expect(effectiveLane(find(s, "Aatrox"), r2)).toBe("MIDDLE");
    expect(effectiveLane(find(s, "Vladimir"), r2)).toBe("TOP");
  });

  it("only moves within the player's own team (me included)", () => {
    const roles = assignRole(s, NO_OVERRIDES, s.me, "TOP");
    expect(effectiveLane(s.me, roles)).toBe("TOP");
    expect(effectiveLane(find(s, "Darius"), roles)).toBe("MIDDLE");
    expect(effectiveLane(find(s, "Aatrox"), roles)).toBe("TOP");
  });

  it("applies only to the game it was stored for", () => {
    const roles = assignRole(s, NO_OVERRIDES, find(s, "Vladimir"), "MIDDLE");
    expect(activeRoles({ game: key, roles }, key)).toEqual(roles);
    const next = { ...s, enemies: s.enemies.map((p) => (p.champion?.id === "Zed" ? { ...p, championName: "Yasuo" } : p)) };
    expect(roleGameKey(next)).not.toBe(key);
    expect(activeRoles({ game: key, roles }, roleGameKey(next))).toBe(NO_OVERRIDES);
    expect(activeRoles(null, key)).toBe(NO_OVERRIDES);
    expect(activeRoles({ game: key, roles: { x: "MOON" } }, key)).toBe(NO_OVERRIDES);
    expect(applyRoles(s, NO_OVERRIDES)).toBe(s);
  });

  it("keeps object identity across polls (no recompute per poll)", () => {
    const roles = assignRole(s, NO_OVERRIDES, find(s, "Vladimir"), "MIDDLE");
    expect(applyRoles(s, { ...roles })).toBe(applyRoles(s, roles));
  });

  it("lane pairing follows the overrides", () => {
    const before = teamPower(s, data, { mode: "sr" });
    expect(before.myLane?.enemy.champion?.id).toBe("Zed");
    const g = applyRoles(s, assignRole(s, NO_OVERRIDES, find(s, "Vladimir"), "MIDDLE"));
    const after = teamPower(g, data, { mode: "sr" });
    expect(after.myLane?.enemy.champion?.id).toBe("Vladimir");
    expect(after.lanes.find((l) => l.lane === "JUNGLE")?.enemy.champion?.id).toBe("Zed");
    // My own role change re-pairs me.
    const g2 = applyRoles(s, assignRole(s, NO_OVERRIDES, s.me, "TOP"));
    expect(teamPower(g2, data, { mode: "sr" }).myLane?.enemy.champion?.id).toBe("Aatrox");
  });
});
