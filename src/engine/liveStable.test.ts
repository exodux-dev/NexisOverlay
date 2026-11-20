import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureStaticData } from "../dev/fixture";
import { parseLiveGame } from "./live";
import { sameValue, stabilizeSnapshot } from "./liveStable";

const data = makeFixtureStaticData();
const parse = (raw: ReturnType<typeof demoAllGameData>) => parseLiveGame(raw, data)!;

describe("live snapshot structural sharing", () => {
  it("returns the previous snapshot when a poll changed nothing", () => {
    const a = parse(demoAllGameData());
    const b = parse(demoAllGameData());
    expect(b).not.toBe(a);
    expect(stabilizeSnapshot(a, b)).toBe(a);
  });

  it("keeps players and lists when only the clock and gold moved", () => {
    const a = parse(demoAllGameData());
    const raw = demoAllGameData();
    raw.gameData!.gameTime = 760;
    raw.activePlayer!.currentGold = 1900;
    const s = stabilizeSnapshot(a, parse(raw));
    expect(s).not.toBe(a);
    expect(s.gameTime).toBe(760);
    expect(s.gold).toBe(1900);
    expect(s.me).toBe(a.me);
    expect(s.allies).toBe(a.allies);
    expect(s.enemies).toBe(a.enemies);
  });

  it("replaces only the player that changed", () => {
    const a = parse(demoAllGameData());
    const raw = demoAllGameData();
    const enemy = raw.allPlayers!.find((p) => p.team !== raw.allPlayers![0]!.team)!;
    enemy.items = [...enemy.items, { itemID: 3089, displayName: "Rabadon's Deathcap" }];
    const s = stabilizeSnapshot(a, parse(raw));
    expect(s.enemies).not.toBe(a.enemies);
    expect(s.allies).toBe(a.allies);
    expect(s.me).toBe(a.me);
    const changed = s.enemies.filter((p, i) => p !== a.enemies[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.items.some((i) => i.id === 3089)).toBe(true);
  });

  it("compares plain data deeply", () => {
    expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue(NaN, NaN)).toBe(true);
    expect(sameValue(new Map(), new Map())).toBe(false);
  });
});
