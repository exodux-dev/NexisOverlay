import { describe, expect, it } from "vitest";
import {
  aggregateMatches,
  purchasesByParticipant,
  skillOrdersByParticipant,
  type RiotMatch,
  type RiotParticipant,
  type RiotTimeline,
} from "./aggregate-core";

const SORC = 3020; // Sorcerer's Shoes (boots)
const LUDEN = 6655;
const RABADON = 3089;
const ZHONYA = 3157;
const VOID = 3135;
const DORAN = 1056;
const POT = 2003;
const AMP_TOME = 1052; // component

function runes(primary: number, sub: number, perks: number[]): RiotParticipant["perks"] {
  return {
    styles: [
      { description: "primaryStyle", style: primary, selections: perks.slice(0, 4).map((perk) => ({ perk })) },
      { description: "subStyle", style: sub, selections: perks.slice(4).map((perk) => ({ perk })) },
    ],
  };
}

function player(over: Partial<RiotParticipant> & Pick<RiotParticipant, "puuid" | "championName" | "win">): RiotParticipant {
  return {
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 3364,
    summoner1Id: 4,
    summoner2Id: 32,
    perks: runes(8200, 8300, [8229, 8226, 8210, 8237, 8304, 8347]),
    ...over,
  };
}

const match1: RiotMatch = {
  metadata: { matchId: "NA1_1", participants: ["a", "b", "c"] },
  info: {
    queueId: 2400,
    gameVersion: "15.20.715.1234",
    participants: [
      player({
        puuid: "a",
        participantId: 1,
        championName: "Lux",
        win: true,
        item0: SORC,
        item1: RABADON, // slot order differs from purchase order on purpose
        item2: LUDEN,
        item3: ZHONYA,
        item4: AMP_TOME,
        playerAugment1: 1,
        playerAugment2: 2,
        playerAugment3: 999,
      }),
      player({
        puuid: "b",
        participantId: 2,
        championName: "MonkeyKing",
        win: true,
        summoner1Id: 32,
        summoner2Id: 4, // same pair as default, reversed
        item0: 3071,
      }),
      player({ puuid: "c", participantId: 3, championName: "Kaisa", win: false, item0: 3006 }),
    ],
  },
};

const match2: RiotMatch = {
  metadata: { matchId: "NA1_2", participants: ["d", "e"] },
  info: {
    queueId: 2400,
    gameVersion: "15.20.716.1",
    participants: [
      player({
        puuid: "d",
        participantId: 1,
        championName: "Lux",
        win: false,
        item0: LUDEN,
        item1: ZHONYA,
        item2: VOID,
        item3: SORC,
        summoner1Id: 4,
        summoner2Id: 14,
        perks: runes(8100, 8000, [8112, 8139, 8138, 8135, 9111, 8014]),
        playerAugment1: 2,
      }),
      player({ puuid: "e", participantId: 2, championName: "Kaisa", win: true }),
    ],
  },
};

// Different queue: must be ignored entirely.
const aramMatch: RiotMatch = {
  metadata: { matchId: "NA1_3", participants: ["f"] },
  info: {
    queueId: 450,
    gameVersion: "14.1.1.1",
    participants: [player({ puuid: "f", championName: "Lux", win: true, item0: LUDEN })],
  },
};

const timeline1: RiotTimeline = {
  info: {
    participants: [
      { participantId: 1, puuid: "a" },
      { participantId: 2, puuid: "b" },
      { participantId: 3, puuid: "c" },
    ],
    frames: [
      {
        events: [
          { type: "ITEM_PURCHASED", timestamp: 1000, participantId: 1, itemId: DORAN },
          { type: "ITEM_PURCHASED", timestamp: 1500, participantId: 1, itemId: POT },
          { type: "ITEM_PURCHASED", timestamp: 2000, participantId: 1, itemId: POT },
          { type: "ITEM_UNDO", timestamp: 2500, participantId: 1, beforeId: POT, afterId: 0 },
        ],
      },
      {
        events: [
          { type: "ITEM_PURCHASED", timestamp: 300_000, participantId: 1, itemId: LUDEN },
          { type: "ITEM_SOLD", timestamp: 400_000, participantId: 1, itemId: DORAN },
          { type: "ITEM_PURCHASED", timestamp: 450_000, participantId: 1, itemId: SORC },
          { type: "ITEM_PURCHASED", timestamp: 600_000, participantId: 1, itemId: ZHONYA },
          { type: "ITEM_PURCHASED", timestamp: 900_000, participantId: 1, itemId: RABADON },
        ],
      },
      {
        // Lux (pid 1) maxes Q then E; W stays low. R and EVOLVE are ignored.
        events: [
          ...skillUps(1, [1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 3, 2, 3], 10_000),
          { type: "SKILL_LEVEL_UP", timestamp: 999_000, participantId: 1, skillSlot: 2, levelUpType: "EVOLVE" },
          // Kai'Sa (pid 3) short game: E=2, W=2 (W reached 2 first), Q=1 -> "WEQ".
          ...skillUps(3, [3, 2, 2, 1, 3], 10_000),
          // Wukong (pid 2): only R levelled -> no skill order recorded.
          ...skillUps(2, [4], 10_000),
        ],
      },
    ],
  },
};

function skillUps(participantId: number, slots: number[], start: number): RiotTimeline["info"]["frames"][0]["events"] {
  return slots.map((skillSlot, i) => ({
    type: "SKILL_LEVEL_UP",
    timestamp: start + i * 60_000,
    participantId,
    skillSlot,
    levelUpType: "NORMAL",
  }));
}

const augmentNames = { "1": "Goliath", "2": "Mystic Punch" };

function run() {
  return aggregateMatches([match1, match2, aramMatch, match1], { NA1_1: timeline1 }, augmentNames, {
    queueId: 2400,
    generatedAt: "2026-01-01T00:00:00.000Z",
    isCompletedItem: (id) => id !== AMP_TOME,
  });
}

describe("aggregateMatches", () => {
  it("counts games, wins, pick rate and patch for the requested queue only", () => {
    const ds = run();
    expect(ds.totalGames).toBe(2); // ARAM match and the duplicate are skipped
    expect(ds.queueId).toBe(2400);
    expect(ds.patch).toBe("15.20");
    expect(ds.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(Object.keys(ds.champions).sort()).toEqual(["Kaisa", "Lux", "MonkeyKing"]);

    const lux = ds.champions.Lux;
    expect(lux.games).toBe(2);
    expect(lux.wins).toBe(1);
    expect(lux.pickRate).toBe(1);
    expect(ds.champions.MonkeyKing.pickRate).toBe(0.5);
    expect(ds.champions.Kaisa).toMatchObject({ games: 2, wins: 1 });
  });

  it("splits items and boots, skips components and trinkets", () => {
    const lux = run().champions.Lux;
    expect(lux.items).toEqual({
      [LUDEN]: { games: 2, wins: 1 },
      [ZHONYA]: { games: 2, wins: 1 },
      [RABADON]: { games: 1, wins: 1 },
      [VOID]: { games: 1, wins: 0 },
    });
    expect(lux.boots).toEqual({ [SORC]: { games: 2, wins: 1 } });
    expect(run().champions.Kaisa.boots).toEqual({ 3006: { games: 1, wins: 0 } });
  });

  it("builds use timeline purchase order, else final slot order", () => {
    const lux = run().champions.Lux;
    expect(lux.builds).toEqual([
      { games: 1, wins: 1, items: [LUDEN, ZHONYA, RABADON] }, // timeline order
      { games: 1, wins: 0, items: [LUDEN, ZHONYA, VOID] }, // slot order fallback
    ]);
    // Only one completed item -> no 3-item path.
    expect(run().champions.MonkeyKing.builds).toEqual([]);
  });

  it("starters come from purchases before 60s, honouring undo", () => {
    const lux = run().champions.Lux;
    expect(lux.starters).toEqual([{ games: 1, wins: 1, items: [DORAN, POT].sort((a, b) => a - b) }]);
    expect(run().champions.Kaisa.starters).toBeUndefined();
  });

  it("aggregates augments by name with #id fallback", () => {
    const lux = run().champions.Lux;
    expect(lux.augments).toEqual({
      Goliath: { games: 1, wins: 1 },
      "Mystic Punch": { games: 2, wins: 1 },
      "#999": { games: 1, wins: 1 },
    });
  });

  it("aggregates rune pages and sorted spell pairs", () => {
    const ds = run();
    expect(ds.champions.Lux.runes).toEqual([
      { games: 1, wins: 1, primary: 8200, sub: 8300, perks: [8229, 8226, 8210, 8237, 8304, 8347] },
      { games: 1, wins: 0, primary: 8100, sub: 8000, perks: [8112, 8139, 8138, 8135, 9111, 8014] },
    ]);
    expect(ds.champions.Lux.spells).toEqual([
      { games: 1, wins: 1, ids: [4, 32] },
      { games: 1, wins: 0, ids: [4, 14] },
    ]);
    expect(ds.champions.MonkeyKing.spells).toEqual([{ games: 1, wins: 1, ids: [4, 32] }]);
    expect(ds.champions.Kaisa.spells).toEqual([{ games: 2, wins: 1, ids: [4, 32] }]);
  });
});

describe("skill orders", () => {
  it("derives max order from SKILL_LEVEL_UP events", () => {
    const orders = skillOrdersByParticipant(timeline1);
    expect(orders.get(1)).toBe("QEW");
    expect(orders.get(3)).toBe("WEQ");
    expect(orders.has(2)).toBe(false); // only R levelled
  });

  it("aggregates skillOrders per champion (timelines only)", () => {
    const ds = run();
    expect(ds.champions.Lux.skillOrders).toEqual([{ games: 1, wins: 1, order: "QEW" }]);
    expect(ds.champions.Kaisa.skillOrders).toEqual([{ games: 1, wins: 0, order: "WEQ" }]);
    expect(ds.champions.MonkeyKing.skillOrders).toBeUndefined();
  });
});

describe("purchasesByParticipant", () => {
  it("applies undo and marks sold items", () => {
    const p = purchasesByParticipant(timeline1).get(1)!;
    expect(p.map((x) => x.itemId)).toEqual([DORAN, POT, LUDEN, SORC, ZHONYA, RABADON]);
    expect(p[0].sold).toBe(true);
    expect(p.filter((x) => x.sold)).toHaveLength(1);
  });
});
