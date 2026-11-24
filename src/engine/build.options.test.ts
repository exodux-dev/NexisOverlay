// u.gg-style options on the build plan: top core builds (auto pick first), starters and boots with
// their numbers, and the user's pick (index) driving the build order, starter, boots and item set.

import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { recommendBuild, type BuildContext } from "./build";
import { buildItemSetBlocks } from "./importLeague";
import { mergeChoice } from "./options";
import { findChampion } from "./staticData";
import { analyzeEnemies } from "./threat";
import type { ChampionStats } from "./types";

const data = makeFixtureStaticData();
const ahri = findChampion(data, "Ahri")!;
const threat = analyzeEnemies([]);
const MAL = 3118, SF = 4645, ZH = 3157, CAP = 3089, LICH = 3100, LUD = 6655;
const SORC = 3020, IONIAN = 3158, MERC = 3111;
const TOME = 1052, CHAPTER = 3802;

const stats = (extra: Partial<ChampionStats> = {}): ChampionStats => ({
  games: 10000,
  wins: 5100,
  items: {},
  source: "opgg",
  builds: [
    { items: [MAL, SF, ZH], games: 1300, wins: 690, pickRate: 0.13 }, // most played
    { items: [MAL, SF, CAP], games: 650, wins: 345, pickRate: 0.065 },
    { items: [MAL, LICH, CAP], games: 400, wins: 230, pickRate: 0.04 }, // best WR (57.5%)
    { items: [MAL, SF, ZH], games: 300, wins: 150 }, // duplicate items
    { items: [LUD, SF, CAP], games: 60, wins: 50 }, // < 1%: noise
  ],
  starters: [
    { items: [TOME], games: 9000, wins: 4600, pickRate: 0.9 },
    { items: [CHAPTER], games: 600, wins: 320, pickRate: 0.06 },
    { items: [TOME], games: 50, wins: 25 },
  ],
  boots: {
    [SORC]: { games: 5600, wins: 2900, pickRate: 0.56 },
    [IONIAN]: { games: 3000, wins: 1590, pickRate: 0.3 },
    [MERC]: { games: 1100, wins: 545, pickRate: 0.11 },
    1001: { games: 4000, wins: 2000 }, // tier-1 boots are never an option
  },
  ...extra,
});
const plan = (ctx: Partial<BuildContext> = {}) => recommendBuild({ data, champion: ahri, threat, mode: "sr", startGold: 500, stats: stats(), ...ctx });
const ids = (xs: Array<{ id: number }>) => xs.map((x) => x.id);

describe("core build options", () => {
  it("lists the most played (auto, like the stats sites) first, then the best WR, deduplicated, max 3", () => {
    const p = plan();
    expect(p.coreOptions.map((o) => ids(o.items))).toEqual([
      [MAL, SF, ZH],
      [MAL, LICH, CAP],
      [MAL, SF, CAP],
    ]);
    expect(p.coreOptions.map((o) => o.tag)).toEqual(["popular", "best", undefined]);
    expect(p.coreOptions[0].stat).toEqual({ games: 1300, wins: 690, pickRate: 0.13 });
    expect(p.coreIndex).toBe(0);
    expect(ids(p.order.filter((r) => r.kind === "core").map((r) => r.item))).toEqual([MAL, SF, ZH]);
    expect(p.sourceLabel).toMatch(/^OP\.GG most played build · 53\.1% over 1300 games/);
  });

  it("bases the build order and the item set on the picked core build", () => {
    const p = plan({ choice: { core: `${MAL},${LICH},${CAP}` } });
    expect(p.coreIndex).toBe(1);
    expect(ids(p.order.filter((r) => r.kind === "core").map((r) => r.item))).toEqual([MAL, LICH, CAP]);
    expect(p.sourceLabel).toMatch(/^Your core build pick · 57\.5% over 400 games/);
    const core = buildItemSetBlocks(p).find((b) => b.type === "Core build")!;
    expect(core.items.map((i) => Number(i.id)).filter((id) => [MAL, LICH, CAP].includes(id))).toEqual([MAL, LICH, CAP]);
  });

  it("labels an explicit pick as the user's even when it is the first (untagged) option", () => {
    // No build has 3% of games: no "best" auto pick, options are the most played.
    const thin = stats({
      builds: [
        { items: [MAL, SF, ZH], games: 250, wins: 130 },
        { items: [MAL, LICH, CAP], games: 200, wins: 110 },
      ],
    });
    const p = plan({ stats: thin, choice: { core: `${MAL},${SF},${ZH}` } });
    expect(p.coreOptions[0].tag).toBe("popular");
    expect(p.coreIndex).toBe(0);
    expect(p.sourceLabel).toMatch(/^Your core build pick/);
  });

  it("ignores a stale pick and has no options without stats builds or for another build style", () => {
    expect(plan({ choice: { core: `${LUD},${SF},${CAP}` } }).coreIndex).toBe(0); // not an option (noise) → auto
    expect(plan({ choice: { core: 7 } }).coreIndex).toBe(0);
    const none = plan({ stats: undefined });
    expect(none.coreOptions).toEqual([]);
    expect(none.coreIndex).toBe(-1);
    expect(none.source).toBe("template");
    expect(plan({ variantIsDefault: false }).coreOptions).toEqual([]);
    // One well-played build: a single option (the UI shows no picker).
    const one = plan({ stats: stats({ builds: [{ items: [MAL, SF, ZH], games: 1300, wins: 690 }] }) });
    expect(one.coreOptions).toHaveLength(1);
    expect(one.coreIndex).toBe(0);
  });
});

describe("starter options", () => {
  it("defaults to the most-played start when it fits the start gold, and takes the pick", () => {
    const p = plan();
    expect(p.starterOptions.map((o) => ids(o.items))).toEqual([[TOME], [CHAPTER]]);
    expect(p.starterIndex).toBe(0);
    expect(ids(p.starter)).toEqual([TOME]);
    expect(p.starterSource).toBe("stats");

    const picked = plan({ choice: { starter: String(CHAPTER) } });
    expect(ids(picked.starter)).toEqual([CHAPTER]);
    expect(picked.starterIndex).toBe(1);
    expect(buildItemSetBlocks(picked).find((b) => b.type === "Starting items")!.items).toEqual([{ id: String(CHAPTER), count: 1 }]);
  });

  it("reports the automatic starter and whether the shown one is a pick; clearing the pick goes back to auto", () => {
    const auto = plan();
    expect(auto.starterPicked).toBe(false);
    expect(auto.starterAutoIndex).toBe(0);

    const picked = plan({ choice: { starter: String(CHAPTER) } });
    expect(picked.starterPicked).toBe(true);
    expect(picked.starterIndex).toBe(1);
    expect(picked.starterAutoIndex).toBe(0); // what "Back to auto" restores

    // Picking the auto option explicitly is still a pick.
    const pickedAuto = plan({ choice: { starter: String(TOME) } });
    expect(pickedAuto.starterPicked).toBe(true);
    expect(pickedAuto.starterIndex).toBe(0);

    // Back to auto = the starter part cleared from the stored choice.
    const back = plan({ choice: mergeChoice({ starter: String(CHAPTER), core: "x" }, { starter: undefined }) });
    expect(back.starterPicked).toBe(false);
    expect(back.starterIndex).toBe(0);
    expect(ids(back.starter)).toEqual([TOME]);

    // A stale pick doesn't count as one.
    expect(plan({ choice: { starter: "999999" } }).starterPicked).toBe(false);
  });

  it("keeps the gold-based starter when the stats have no fitting start", () => {
    const p = plan({ stats: stats({ starters: [{ items: [CHAPTER], games: 900, wins: 450, pickRate: 0.9 }] }), startGold: 500 });
    expect(p.starterIndex).toBe(-1);
    expect(p.starterAutoIndex).toBe(-1);
    expect(p.starterSource).toBe("gold");
    // A pick still applies; going back to auto means the gold-based components again.
    const picked = plan({ stats: stats({ starters: [{ items: [CHAPTER], games: 900, wins: 450, pickRate: 0.9 }] }), startGold: 500, choice: { starter: String(CHAPTER) } });
    expect(picked.starterPicked).toBe(true);
    expect(picked.starterAutoIndex).toBe(-1);
    expect(plan({ stats: stats({ starters: [] }) }).starterSource).toBe("gold");
  });
});

describe("boots options", () => {
  it("lists completed boots by games and lets a pick override the automatic boots", () => {
    const auto = plan();
    expect(ids(auto.bootsOptions.map((o) => o.item))).toEqual([SORC, IONIAN, MERC]);
    expect(auto.bootsIndex).toBe(-1);

    const p = plan({ choice: { boots: String(MERC) } });
    expect(p.bootsIndex).toBe(2);
    expect(p.boots?.item.id).toBe(MERC);
    expect(p.boots?.reasons[0]).toMatch(/^Your pick · 49\.5% WR/);
    expect(p.order.some((r) => r.item.id === MERC)).toBe(true);
    // The automatic pick stays available as the first alternative.
    expect(p.bootsAlternatives[0].item.id).toBe(auto.boots!.item.id);
    expect(p.bootsAlternatives[0].reason).toMatch(/^Auto: /);
    expect(buildItemSetBlocks(p).find((b) => b.type === "Boots")!.items[0].id).toBe(String(MERC));
  });

  it("has no options without boots stats", () => {
    const p = plan({ stats: undefined, choice: { boots: String(MERC) } });
    expect(p.bootsOptions).toEqual([]);
    expect(p.bootsIndex).toBe(-1);
    expect(p.boots).toBeDefined();
  });
});

describe("core options with small samples", () => {
  it("offers the most played builds without changing the automatic build", () => {
    // No build reaches 3% of games: the source's top build stays the auto pick.
    const small = stats({
      games: 40000,
      bestBuild: [MAL, SF, ZH],
      builds: [
        { items: [MAL, SF, ZH], games: 600, wins: 300 },
        { items: [LUD, SF, CAP], games: 500, wins: 300 },
      ],
    });
    const auto = plan({ stats: small });
    expect(auto.coreOptions.map((o) => o.tag)).toEqual(["popular", undefined]);
    expect(auto.coreIndex).toBe(0); // matches the source's top build
    expect(auto.sourceLabel).toMatch(/^OP\.GG most played build/);
    const picked = plan({ stats: small, choice: { core: `${LUD},${SF},${CAP}` } });
    expect(ids(picked.order.filter((r) => r.kind === "core").map((r) => r.item))).toEqual([LUD, SF, CAP]);
  });
});

describe("picks follow the option, not its position", () => {
  it("keeps the picked core build / boots when a stats refresh reorders them", () => {
    const pick = { core: `${MAL},${SF},${CAP}`, boots: String(MERC) };
    const before = plan({ choice: pick });
    expect(before.coreIndex).toBe(2);
    // Refresh: that build is now the most played, Mercury's the most played boots.
    const refreshed = stats({
      builds: [
        { items: [MAL, SF, CAP], games: 2000, wins: 1000 },
        { items: [MAL, SF, ZH], games: 1300, wins: 690 },
        { items: [MAL, LICH, CAP], games: 400, wins: 230 },
      ],
      boots: { [MERC]: { games: 6000, wins: 3000 }, [SORC]: { games: 3000, wins: 1500 } },
    });
    const after = plan({ stats: refreshed, choice: pick });
    expect(ids(after.coreOptions[after.coreIndex].items)).toEqual([MAL, SF, CAP]);
    expect(ids(after.order.filter((r) => r.kind === "core").map((r) => r.item))).toEqual([MAL, SF, CAP]);
    expect(after.bootsIndex).toBe(0);
    expect(after.boots?.item.id).toBe(MERC);
  });

  it("exposes each option's key and still honours a legacy index", () => {
    const p = plan();
    expect(p.coreOptions.map((o) => o.key)).toEqual([`${MAL},${SF},${ZH}`, `${MAL},${LICH},${CAP}`, `${MAL},${SF},${CAP}`]);
    expect(p.starterOptions.map((o) => o.key)).toEqual([String(TOME), String(CHAPTER)]);
    expect(p.bootsOptions.map((o) => o.key)).toEqual([String(SORC), String(IONIAN), String(MERC)]);
    expect(plan({ choice: { core: 1 } }).coreIndex).toBe(1);
  });
});
