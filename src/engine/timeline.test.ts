import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureStaticData } from "../dev/fixture";
import { inventoryValue } from "./intel";
import { parseLiveGame } from "./live";
import { findItem } from "./staticData";
import { MAX_SAMPLES, SAMPLE_EVERY, normalizeTimeline, stepTimeline, summarizeTimeline, type TimelineRecorder } from "./timeline";
import type { GameSnapshot, PlayerItem } from "./types";

const data = makeFixtureStaticData();

const item = (name: string): PlayerItem => {
  const it = findItem(data, name);
  if (!it) throw new Error(`unknown item ${name}`);
  return { id: it.id, name: it.name };
};

function base(): GameSnapshot {
  const s = parseLiveGame(demoAllGameData(), data);
  if (!s) throw new Error("demo did not parse");
  return s;
}

/** A snapshot at `t` with your inventory / level replaced. */
function snap(t: number, items: PlayerItem[] = [], extra: Partial<GameSnapshot["me"]> = {}, o: Partial<GameSnapshot> = {}): GameSnapshot {
  const s = base();
  return { ...s, gameTime: t, loading: false, ended: undefined, me: { ...s.me, items, level: 1, kills: 0, deaths: 0, assists: 0, creepScore: 0, ...extra }, ...o };
}

function run(snaps: GameSnapshot[], rec: TimelineRecorder | null = null): TimelineRecorder {
  for (const s of snaps) rec = stepTimeline(rec, s, data);
  if (!rec) throw new Error("no recorder");
  return rec;
}

const ids = (r: TimelineRecorder) => r.timeline.items.map((e) => [e.t, e.itemId]);

describe("stepTimeline — purchases", () => {
  const sword = item("Long Sword");
  const ie = item("Infinity Edge");
  const dcap = item("Rabadon's Deathcap");

  it("records completed items, not components, at the snapshot they appear", () => {
    const r = run([snap(10), snap(300, [sword]), snap(301.5, [sword, sword]), snap(600, [ie]), snap(900, [ie, dcap])]);
    expect(ids(r)).toEqual([
      [600, ie.id],
      [900, dcap.id],
    ]);
  });

  it("drops a purchase that's undone right away, keeps a later sell", () => {
    const r = run([snap(10), snap(600, [ie]), snap(612, []), snap(700, [ie]), snap(1000, [])]);
    expect(ids(r)).toEqual([[700, ie.id]]);
    // A sample taken between the buy and the undo doesn't keep the phantom item's gold.
    const u = run([snap(10), snap(590, [ie]), snap(596, [])]);
    expect(u.timeline.samples.map((x) => [x.t, x.itemGold])).toEqual([
      [10, 0],
      [590, 0],
    ]);
  });

  it("records a second copy and a rebuy after selling", () => {
    const r = run([snap(10), snap(600, [ie]), snap(800, [ie, ie]), snap(900, [ie]), snap(1000, [ie, ie])]);
    expect(ids(r)).toEqual([
      [600, ie.id],
      [800, ie.id],
      [1000, ie.id],
    ]);
  });

  it("treats items owned when the app joins mid-game as a baseline", () => {
    const r = run([snap(900, [ie]), snap(1200, [ie, dcap])]);
    expect(ids(r)).toEqual([[1200, dcap.id]]);
    // …but items bought in the opening shop count.
    const early = run([snap(5, [ie])]);
    expect(ids(early)).toEqual([[5, ie.id]]);
  });

  it("maps Arena item copies (id + 220000) to the regular item via live.ts", () => {
    const raw = demoAllGameData();
    const me = raw.allPlayers!.find((p) => p.riotId === "You#NA1")!;
    const at = (t: number, itemIds: number[]) => {
      const r = { ...raw, gameData: { ...raw.gameData, gameTime: t }, allPlayers: raw.allPlayers!.map((p) => (p === me ? { ...p, items: itemIds.map((id) => ({ itemID: id, displayName: "" })) } : p)) };
      return parseLiveGame(r, data)!;
    };
    const rec = run([at(100, []), at(400, [ie.id + 220000])]);
    expect(ids(rec)).toEqual([[400, ie.id]]);
  });

  it("records level 6/11/16 milestones once", () => {
    const r = run([snap(10, [], { level: 1 }), snap(400, [], { level: 6 }), snap(420, [], { level: 7 }), snap(900, [], { level: 12 }), snap(1500, [], { level: 18 })]);
    expect(r.timeline.levels).toEqual([
      { t: 400, level: 6 },
      { t: 900, level: 11 },
      { t: 1500, level: 16 },
    ]);
  });
});

describe("stepTimeline — sampling", () => {
  it("samples every 30 s of game time, not every snapshot", () => {
    const snaps = Array.from({ length: 100 }, (_, i) => snap(i * 1.5)); // 0 .. 148.5 s
    const r = run(snaps);
    expect(r.timeline.samples.map((s) => s.t)).toEqual([0, 30, 60, 90, 120]);
  });

  it("stores your stats and item gold (you vs team avg vs enemy avg)", () => {
    const s = snap(600, [item("Infinity Edge")], { level: 9, kills: 3, deaths: 1, assists: 4, creepScore: 80 });
    const [smp] = run([s]).timeline.samples;
    expect(smp).toMatchObject({ t: 600, level: 9, cs: 80, kills: 3, deaths: 1, assists: 4, itemGold: inventoryValue(s.me, data) });
    const team = [s.me, ...s.allies].reduce((t, p) => t + inventoryValue(p, data), 0) / (s.allies.length + 1);
    expect(smp.teamItemGold).toBe(Math.round(team));
    expect(smp.enemyItemGold).toBe(Math.round(s.enemies.reduce((t, p) => t + inventoryValue(p, data), 0) / s.enemies.length));
  });

  it("always samples the final (ended) snapshot", () => {
    const r = run([snap(0), snap(30), snap(44, [], {}, { ended: { result: "Win" } })]);
    expect(r.timeline.samples.map((s) => s.t)).toEqual([0, 30, 44]);
  });

  it("caps samples by thinning while still covering the whole game", () => {
    const snaps = Array.from({ length: 400 }, (_, i) => snap(i * SAMPLE_EVERY, [], {}, i === 399 ? { ended: { result: "Lose" } } : {})); // 200 min
    const r = run(snaps);
    const ts = r.timeline.samples.map((s) => s.t);
    expect(ts.length).toBeLessThanOrEqual(MAX_SAMPLES);
    expect(ts[0]).toBe(0);
    expect(ts[ts.length - 1]).toBe(399 * SAMPLE_EVERY);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it("ignores the loading screen", () => {
    const loading = snap(0, [item("Infinity Edge")], { level: 3 }, { loading: true });
    expect(stepTimeline(null, loading, data)).toBeNull();
    const r = run([snap(10)]);
    expect(stepTimeline(r, loading, data)).toBe(r);
  });

  it("starts over when game time rewinds (a new game)", () => {
    const r = run([snap(0), snap(600, [item("Infinity Edge")], { level: 11 }), snap(1200)]);
    const next = run([snap(3)], r);
    expect(next.timeline.samples.map((s) => s.t)).toEqual([3]);
    expect(next.timeline.items).toEqual([]);
    expect(next.timeline.levels).toEqual([]);
  });
});

describe("summarizeTimeline / normalizeTimeline", () => {
  it("finds first item, core (3rd legendary) and power spikes; boots aren't legendaries", () => {
    const boots = data.items.get(3020) ?? [...data.items.values()].find((i) => i.completed && i.tags.includes("Boots"))!;
    const [a, b, c] = ["Infinity Edge", "Phantom Dancer", "Lord Dominik's Regards"].map((n) => findItem(data, n)!);
    const r = run([snap(0), snap(300, [{ id: boots.id, name: boots.name }]), snap(600, [{ id: a.id, name: a.name }]), snap(900, [{ id: a.id, name: "" }, { id: b.id, name: "" }]), snap(1120, [{ id: a.id, name: "" }, { id: b.id, name: "" }, { id: c.id, name: "" }])]);
    const sum = summarizeTimeline(r.timeline, data);
    expect(sum.firstItemAt).toBe(600);
    expect(sum.coreDoneAt).toBe(1120);
    expect(sum.timings[0].boots).toBe(true);
    expect(sum.timings[3].spike).toBe(true);
    expect(sum.timings.map((x) => x.legendaryNo)).toEqual([undefined, 1, 2, 3]);
  });

  it("computes CS/min and KDA trends", () => {
    const r = run([snap(0), snap(60, [], { creepScore: 6 }), snap(120, [], { creepScore: 18, kills: 2, deaths: 1, assists: 1 })]);
    const sum = summarizeTimeline(r.timeline, data);
    expect(sum.csPerMin).toEqual([
      { t: 60, v: 6 },
      { t: 120, v: 9 },
    ]);
    expect(sum.kda.map((k) => k.v)).toEqual([0, 3]);
  });

  it("validates stored timelines (older entries have none)", () => {
    const r = run([snap(0), snap(600, [item("Infinity Edge")])]);
    expect(normalizeTimeline(JSON.parse(JSON.stringify(r.timeline)))).toEqual(r.timeline);
    expect(normalizeTimeline(undefined)).toBeUndefined();
    expect(normalizeTimeline({ samples: "x" })).toBeUndefined();
    expect(normalizeTimeline({ samples: [{ t: 1 }], items: [{ t: -1, itemId: 3 }] })).toBeUndefined();
  });
});

describe("stepTimeline — upgrades and stored data", () => {
  it("keeps a purchase that's upgraded into another completed item right away (boots tier 2 → tier 3)", () => {
    const zerks = findItem(data, "Berserker's Greaves")!;
    const tier3 = { ...zerks, id: 3172, name: "Gunmetal Greaves", cost: zerks.cost + 500, from: [zerks.id], into: [] };
    const d = { ...data, items: new Map(data.items).set(tier3.id, tier3) };
    let rec: TimelineRecorder | null = null;
    for (const s of [snap(10), snap(900, [{ id: zerks.id, name: zerks.name }]), snap(910, [{ id: tier3.id, name: tier3.name }])]) rec = stepTimeline(rec, s, d);
    expect(ids(rec!)).toEqual([
      [900, zerks.id],
      [910, tier3.id],
    ]);
  });

  it("normalizeTimeline orders samples by time", () => {
    const s = (t: number) => ({ t, level: 1, cs: 0, kills: 0, deaths: 0, assists: 0, itemGold: t, teamItemGold: 0, enemyItemGold: 0 });
    expect(normalizeTimeline({ samples: [s(60), s(0), s(30)], items: [], levels: [] })?.samples.map((x) => x.t)).toEqual([0, 30, 60]);
  });
});

import { isCompletedItem as isDone } from "./timeline";
import type { Item } from "./types";
describe("transforming items", () => {
  const mk = (id: number, cost: number, into: number[], completed = false) => ({ id, name: String(id), cost, into, from: [], tags: [], completed }) as unknown as Item;
  const tear = mk(3070, 400, [3004]);
  const manamune = mk(3004, 2900, [3042]);
  const items = new Map<number, Item>([[3070, tear], [3004, manamune]]);
  it("counts a legendary that only transforms into a non-store item", () => {
    expect(isDone(manamune, items)).toBe(true);
    expect(isDone(tear, items)).toBe(false);
    expect(isDone(manamune)).toBe(false);
  });
});
