import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureStaticData } from "../dev/fixture";
import { recommendBuild, type BuildPlan, type ItemRec } from "./build";
import { appendIntel, buildChanges, diffSnapshots, isBigItem, powerSpikes, teamGold, visibleIntel, type IntelEvent } from "./intel";
import { parseLiveGame } from "./live";
import { findItem } from "./staticData";
import { analyzeEnemies } from "./threat";
import type { GameSnapshot, PlayerState } from "./types";

const data = makeFixtureStaticData();

function demo(): GameSnapshot {
  const s = parseLiveGame(demoAllGameData(), data);
  if (!s) throw new Error("demo did not parse");
  return s;
}

const item = (name: string) => {
  const it = findItem(data, name);
  if (!it) throw new Error(`unknown item ${name}`);
  return { id: it.id, name: it.name };
};

/** Deep-ish copy with per-player edits (by champion id). */
function edit(s: GameSnapshot, gameTime: number, f: Record<string, (p: PlayerState) => Partial<PlayerState>> = {}): GameSnapshot {
  const m = (p: PlayerState): PlayerState => ({ ...p, items: [...p.items], ...(f[p.champion?.id ?? ""]?.(p) ?? {}) });
  return { ...s, gameTime, me: m(s.me), allies: s.allies.map(m), enemies: s.enemies.map(m) };
}

const noCompleted = (p: PlayerState) => ({ items: p.items.filter((i) => !data.items.get(i.id)?.completed) });

describe("teamGold", () => {
  it("sums item costs per player and per team", () => {
    const s = demo();
    const g = teamGold(s, data);
    expect(g.perPlayer).toHaveLength(10);
    const soraka = g.perPlayer.find((p) => p.champion?.id === "Soraka")!;
    const expected = [6617, 3158, 3114].reduce((t, id) => t + data.items.get(id)!.cost, 0);
    expect(soraka.value).toBe(expected);
    expect(soraka.side).toBe("enemy");
    expect(soraka.legendaries).toBe(1); // Ionian Boots are not a legendary
    expect(g.ally).toBe(g.perPlayer.filter((p) => p.side === "ally").reduce((t, p) => t + p.value, 0));
    expect(g.diff).toBe(g.ally - g.enemy);
    expect(g.perPlayer[0].side).toBe("ally");
    expect(g.perPlayer.find((p) => p.isMe)?.championName).toBe("Ahri");
  });

  it("ignores consumables and wards", () => {
    const s = edit(demo(), 800, { Ahri: (p) => ({ items: [...p.items, { id: 2003, name: "Health Potion" }, { id: 3340, name: "Stealth Ward" }] }) });
    expect(teamGold(s, data).ally).toBe(teamGold(demo(), data).ally);
  });
});

describe("powerSpikes", () => {
  it("counts legendaries and flags 2-item and big spikes", () => {
    const s = edit(demo(), 900, {
      Zed: (p) => ({ items: [...p.items, item("Infinity Edge")] }),
      Vladimir: (p) => ({ items: [...p.items, item("Rabadon's Deathcap")] }),
    });
    const sp = powerSpikes(s.enemies, data);
    const zed = sp.find((p) => p.champion?.id === "Zed")!;
    expect(zed.legendaries).toBe(2);
    expect(zed.spike).toBe("two-item");
    expect(zed.big.map((i) => i.name)).toContain("Infinity Edge");
    expect(zed.label).toContain("2-item spike");
    const vlad = sp.find((p) => p.champion?.id === "Vladimir")!;
    expect(vlad.newest?.name).toBe("Rabadon's Deathcap");
    expect(isBigItem(data.items.get(3089))).toBe(true);
    const malph = powerSpikes([{ ...s.enemies[4], items: [] }], data)[0];
    expect(malph.spike).toBe("none");
  });

  it("uses the intel log for the newest item", () => {
    const s = edit(demo(), 900, { Zed: (p) => ({ items: [item("Infinity Edge"), ...p.items] }) });
    const zed = s.enemies.find((p) => p.champion?.id === "Zed")!;
    const log: IntelEvent[] = [{ id: `enemy-item:${zed.riotId}:3031:880`, at: 880, kind: "enemy-item", title: "", tone: "bad", itemId: 3031 }];
    expect(powerSpikes([zed], data)[0].newest?.name).toBe("Youmuu's Ghostblade"); // last slot
    expect(powerSpikes([zed], data, log)[0].newest?.name).toBe("Infinity Edge");
  });
});

describe("diffSnapshots", () => {
  it("reports completed enemy and ally items, not components", () => {
    const prev = edit(demo(), 700, { Soraka: noCompleted, Jinx: noCompleted });
    const next = edit(demo(), 702);
    const ev = diffSnapshots(prev, next, data);
    const sor = ev.filter((e) => e.championId === "Soraka");
    expect(sor.map((e) => e.title).sort()).toEqual(["Soraka completed Ionian Boots of Lucidity", "Soraka completed Moonstone Renewer"]);
    expect(sor.every((e) => e.kind === "enemy-item")).toBe(true);
    expect(sor.find((e) => e.itemId === 6617)?.detail).toBe("1st legendary");
    const jinx = ev.filter((e) => e.championId === "Jinx");
    // Ally boots are skipped, the legendary is reported.
    expect(jinx).toHaveLength(1);
    expect(jinx[0]).toMatchObject({ kind: "ally-item", tone: "good", itemId: 3032 });
    expect(ev.every((e) => e.at === 702)).toBe(true);
    expect(diffSnapshots(next, next, data)).toEqual([]);
  });

  it("flags the 2nd legendary and big items as a spike", () => {
    const prev = demo();
    const next = edit(prev, 760, { Zed: (p) => ({ items: [...p.items.filter((i) => i.id !== 3134), item("Infinity Edge")] }) });
    const [e] = diffSnapshots(prev, next, data);
    expect(e).toMatchObject({ kind: "enemy-item", title: "Zed completed Infinity Edge", tone: "bad", itemId: 3031 });
    expect(e.detail).toContain("2-item spike");
    expect(e.detail).toContain("high-impact");
  });

  it("reports enemy level 6/11/16 thresholds once", () => {
    const prev = edit(demo(), 300, { Zed: () => ({ level: 5 }), Malphite: () => ({ level: 10 }) });
    const next = edit(demo(), 302, { Zed: () => ({ level: 6 }), Malphite: () => ({ level: 11 }) });
    const ev = diffSnapshots(prev, next, data).filter((e) => e.kind === "enemy-level");
    expect(ev.map((e) => [e.title, e.detail])).toEqual([
      ["Zed reached level 6", "Ultimate unlocked"],
      ["Malphite reached level 11", "Ultimate rank 2"],
    ]);
    expect(ev[0].championId).toBe("Zed");
    // Several enemies crossing together → one grouped event.
    const all = diffSnapshots(edit(demo(), 300, Object.fromEntries(["Soraka", "Zed", "Aatrox", "Vladimir"].map((c) => [c, () => ({ level: 5 })]))), edit(demo(), 302, Object.fromEntries(["Soraka", "Zed", "Aatrox", "Vladimir"].map((c) => [c, () => ({ level: 6 })]))), data);
    expect(all.map((e) => [e.title, e.detail])).toEqual([["Soraka, Aatrox +2 reached level 6", "Ultimate unlocked for 4 enemies"]]);
    expect(diffSnapshots(next, edit(next, 304), data).filter((e) => e.kind === "enemy-level")).toEqual([]);
    // Ally levels are not reported.
    const allyLvl = diffSnapshots(edit(demo(), 300, { Jinx: () => ({ level: 5 }) }), edit(demo(), 302, { Jinx: () => ({ level: 6 }) }), data);
    expect(allyLvl).toEqual([]);
  });

  it("reports kill swings and fed enemies; merges fights", () => {
    const prev = demo();
    const next = edit(prev, 750, { Zed: (p) => ({ kills: p.kills + 2 }), Jinx: (p) => ({ kills: p.kills + 1 }) });
    const ev = diffSnapshots(prev, next, data);
    const fight = ev.find((e) => e.kind === "fight")!;
    expect(fight.kills).toEqual({ ally: 1, enemy: 2 });
    expect(fight.tone).toBe("bad");
    const fed = ev.find((e) => e.kind === "enemy-fed")!;
    expect(fed.title).toBe("Zed is 8/3/2");
    // A follow-up kill 4 s later joins the same fight.
    const later = edit(next, 754, { Jinx: (p) => ({ kills: p.kills + 2 }) });
    let log = appendIntel([], ev);
    log = appendIntel(log, diffSnapshots(next, later, data));
    const fights = log.filter((e) => e.kind === "fight");
    expect(fights).toHaveLength(1);
    expect(fights[0].kills).toEqual({ ally: 3, enemy: 2 });
    expect(fights[0].title).toBe("Your team won a fight 3–2");
    // A lone kill much later is its own event but hidden from the feed.
    const lone = edit(later, 900, { Zed: (p) => ({ kills: p.kills + 1 }) });
    log = appendIntel(log, diffSnapshots(later, lone, data));
    expect(log.filter((e) => e.kind === "fight")).toHaveLength(2);
    expect(visibleIntel(log).filter((e) => e.kind === "fight")).toHaveLength(1);
    expect(visibleIntel(log)[0].at).toBeGreaterThanOrEqual(visibleIntel(log).at(-1)!.at); // newest first
  });

  it("ignores a different game or time going backwards", () => {
    const s = demo();
    expect(diffSnapshots(s, edit(s, 10, { Zed: () => ({ items: [item("Infinity Edge")] }) }), data)).toEqual([]);
    const other = { ...edit(s, 800), enemies: s.enemies.map((e, i) => (i === 0 ? { ...e, riotId: "Someone#ELSE" } : e)) };
    expect(diffSnapshots(s, other, data)).toEqual([]);
  });
});

describe("appendIntel", () => {
  it("dedupes by id and caps the log", () => {
    const e = (i: number): IntelEvent => ({ id: `x${i}`, at: i, kind: "enemy-level", title: `${i}`, tone: "info" });
    let log = appendIntel([], [e(1), e(2)]);
    log = appendIntel(log, [e(2), e(3)]);
    expect(log.map((x) => x.id)).toEqual(["x1", "x2", "x3"]);
    expect(appendIntel([], Array.from({ length: 100 }, (_, i) => e(i)), 30)).toHaveLength(30);
  });
});

describe("buildChanges", () => {
  const plan = (s: GameSnapshot): BuildPlan =>
    recommendBuild({ data, champion: s.me.champion!, threat: analyzeEnemies(s.enemies), me: s.me, gold: 1000 });

  it("announces counters that become urgent or climb a level, naming the enemy purchase", () => {
    const prev = edit(demo(), 700, { Soraka: noCompleted, Aatrox: noCompleted, Vladimir: noCompleted, Zed: noCompleted, Malphite: noCompleted });
    const next = edit(demo(), 702);
    const log = appendIntel([], diffSnapshots(prev, next, data));
    const ev = buildChanges(plan(prev), plan(next), { at: next.gameTime, recent: log, data });
    const titles = ev.map((e) => e.title);
    expect(titles).toContain("Build update: Void Staff now a priority"); // 0.71 → 0.88
    expect(titles).toContain("Build update: Liandry's Torment now recommended"); // 0.45 → 0.55
    const liandry = ev.find((e) => e.title.includes("Liandry"))!;
    expect(liandry.id).toBe(`build:${liandry.itemId}:2`);
    expect(liandry.detail).toMatch(/completed .+ · %-health damage vs/);
    expect(ev.every((e) => e.kind === "build")).toBe(true);
    // Same plan → nothing; no previous plan → nothing.
    expect(buildChanges(plan(next), plan(next), { at: 704 })).toEqual([]);
    expect(buildChanges(undefined, plan(next), { at: 704 })).toEqual([]);
  });

  it("explains an anti-heal counter with the healing item that triggered it", () => {
    const morello = data.items.get(3165)!;
    const rec = (u: number, owned = false): ItemRec => ({ item: morello, kind: "situational", reasons: ["Heavy healing: Soraka, Vladimir"], owned, invested: 0, urgency: u, counter: "antiheal" });
    const base = plan(demo());
    const p1 = { ...base, situational: [rec(0.4)] };
    const p2 = { ...base, situational: [rec(0.62)] };
    const recent: IntelEvent[] = [
      { id: "a", at: 600, kind: "enemy-item", title: "Zed completed Infinity Edge", tone: "bad", itemId: 3031, championId: "Zed" },
      { id: "b", at: 640, kind: "enemy-item", title: "Soraka completed Moonstone Renewer", tone: "warn", itemId: 6617, championId: "Soraka", champion: "Soraka" },
    ];
    const [e] = buildChanges(p1, p2, { at: 650, recent, data });
    expect(e.title).toBe("Build update: Morellonomicon now recommended");
    expect(e.detail).toBe("Soraka completed Moonstone Renewer · Heavy healing: Soraka, Vladimir");
    expect(e.championId).toBe("Soraka");
    expect(e.tone).toBe("info");
    // Too old to be the cause → only the reason.
    expect(buildChanges(p1, p2, { at: 900, recent, data })[0].detail).toBe("Heavy healing: Soraka, Vladimir");
    // Owned or already urgent at the same level → nothing.
    expect(buildChanges(p1, { ...base, situational: [rec(0.62, true)] }, { at: 650 })).toEqual([]);
    expect(buildChanges(p2, p2, { at: 650 })).toEqual([]);
    expect(buildChanges(p2, { ...base, situational: [rec(0.85)] }, { at: 660 })[0]).toMatchObject({ id: "build:3165:3", tone: "warn", title: "Build update: Morellonomicon now a priority" });
  });
});
