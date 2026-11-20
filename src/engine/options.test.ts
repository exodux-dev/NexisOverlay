import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { buildRunePage } from "./importLeague";
import {
  choiceIndex,
  chosenRunePage,
  itemsKey,
  mergeChoice,
  migrateChoice,
  needsMigration,
  resolveChoice,
  resolveRuneChoice,
  runeBaseKey,
  runeKey,
  runeOptions,
  spellKey,
  spellOptions,
  starterKey,
  topOptions,
} from "./options";
import { opggToChampionStats, parseOpggChampionPage } from "./sources/opgg";
import { findChampion } from "./staticData";
import type { ChampionStats } from "./types";

type Rune = NonNullable<ChampionStats["runes"]>[number];
const page = (keystone: number, sub: number, games: number, wins = Math.round(games / 2), extra: Partial<Rune> = {}): Rune => ({
  primary: 8100,
  sub,
  perks: [keystone, 8139, 8140, 8106, 8226, 8210],
  games,
  wins,
  ...extra,
});
const stats = (extra: Partial<ChampionStats>): ChampionStats => ({ games: 10000, wins: 5100, items: {}, ...extra });

describe("topOptions", () => {
  const rows = [
    { k: "a", games: 50, wins: 20 },
    { k: "b", games: 900, wins: 500 },
    { k: "b", games: 300, wins: 150 },
    { k: "c", games: 10, wins: 9 }, // < 2% of the top row: noise
    { k: "d", games: 400, wins: 200 },
  ];
  it("sorts by games, dedupes, drops noise and caps the list", () => {
    expect(topOptions(rows, (r) => r.k).map((r) => r.k)).toEqual(["b", "d", "a"]);
    expect(topOptions(rows, (r) => r.k, 2).map((r) => r.k)).toEqual(["b", "d"]);
    expect(topOptions(undefined, () => "")).toEqual([]);
    // A single tiny row is still an option.
    expect(topOptions([{ games: 3, wins: 1 }], () => "x")).toHaveLength(1);
  });
});

describe("rune / spell options", () => {
  it("keeps up to three complete pages, most played first, without duplicates", () => {
    const s = stats({
      runes: [page(8128, 8000, 1200), page(8112, 8200, 11303), page(8112, 8200, 50), page(8112, 8300, 835), page(8112, 8400, 918), { ...page(8112, 8000, 5000), perks: [8112] }],
    });
    const opts = runeOptions(s);
    expect(opts.map((p) => p.games)).toEqual([11303, 1200, 918]);
    expect(runeOptions(stats({ runes: [] }))).toEqual([]);
    expect(runeOptions(undefined)).toEqual([]);
  });

  it("has no rune pages in Arena", () => {
    expect(runeOptions(stats({ mode: "arena", runes: [page(8112, 8200, 100)] }))).toEqual([]);
  });

  it("dedupes spell pairs regardless of order", () => {
    const s = stats({
      spells: [
        { ids: [4, 14], games: 10294, wins: 5300, pickRate: 0.68 },
        { ids: [14, 4], games: 200, wins: 100 },
        { ids: [4, 12], games: 4532, wins: 2300, pickRate: 0.3 },
        { ids: [4, 0] as [number, number], games: 3000, wins: 1500 },
      ],
    });
    expect(spellOptions(s).map((p) => p.ids)).toEqual([[4, 14], [4, 12]]);
  });
});

describe("stable option keys", () => {
  it("identifies options by content, not position", () => {
    expect(runeKey(page(8112, 8200, 1))).toBe("8112:8200:8112.8139.8140.8106.8226.8210:");
    expect(runeKey(page(8112, 8200, 1, 0, { shards: [5008, 5008, 5011] }))).toBe("8112:8200:8112.8139.8140.8106.8226.8210:5008.5008.5011");
    expect(spellKey({ ids: [14, 4] })).toBe("4+14");
    expect(spellKey({ ids: [4, 14] })).toBe("4+14");
    expect(itemsKey([3118, 4645, 3157])).toBe("3118,4645,3157");
    expect(starterKey([2003, 1056])).toBe(starterKey([1056, 2003]));
  });
});

describe("choice resolution", () => {
  const keys = ["a", "b", "c"];
  it("resolves stored keys against the current options and falls back to the default", () => {
    expect(resolveChoice(keys, "c")).toBe(2);
    expect(resolveChoice(keys, "gone")).toBe(-1);
    expect(resolveChoice(keys, undefined)).toBe(-1);
    expect(choiceIndex(keys, "b")).toBe(1);
    expect(choiceIndex(keys, "gone")).toBe(0);
    expect(choiceIndex(keys, undefined)).toBe(0);
    expect(choiceIndex([], "a")).toBe(-1);
  });

  it("still reads legacy indices while they are in range", () => {
    expect(resolveChoice(keys, 2)).toBe(2);
    expect(resolveChoice(keys, 5)).toBe(-1);
    expect(resolveChoice(keys, -1)).toBe(-1);
    expect(resolveChoice(keys, 1.5)).toBe(-1);
    expect(choiceIndex(keys, 7)).toBe(0);
  });

  it("follows the picked option when a stats refresh reorders the list", () => {
    const before = stats({ runes: [page(8112, 8200, 11303), page(8128, 8000, 1200)] });
    const pick = runeKey(runeOptions(before)[1]);
    const after = stats({ runes: [page(8128, 8000, 20000), page(8112, 8200, 11303)] });
    expect(chosenRunePage(after, pick)?.perks[0]).toBe(8128);
    expect(runeOptions(after)[0].perks[0]).toBe(8128); // now first, still the pick
    expect(chosenRunePage(stats({ runes: [page(8112, 8200, 11303)] }), pick)?.perks[0]).toBe(8112); // gone → default
  });

  it("merges and clears picks", () => {
    expect(mergeChoice(undefined, { rune: "x" })).toEqual({ rune: "x" });
    expect(mergeChoice({ rune: "x" }, { core: "1,2,3" })).toEqual({ rune: "x", core: "1,2,3" });
    expect(mergeChoice({ rune: "x", core: "1,2" }, { rune: undefined })).toEqual({ core: "1,2" });
    expect(mergeChoice({ rune: "x" }, { rune: undefined })).toBeUndefined();
    expect(mergeChoice({}, { boots: -1, starter: "" })).toBeUndefined();
  });

  it("picks the chosen rune page, else the most played", () => {
    const s = stats({ runes: [page(8128, 8000, 1200), page(8112, 8200, 11303)] });
    expect(chosenRunePage(s)?.perks[0]).toBe(8112);
    expect(chosenRunePage(s, runeKey(page(8128, 8000, 0)))?.perks[0]).toBe(8128);
    expect(chosenRunePage(s, "nope")?.perks[0]).toBe(8112);
    expect(chosenRunePage(undefined, "x")).toBeUndefined();
  });
});

describe("legacy index migration", () => {
  const keys = { rune: ["r0", "r1"], spells: ["s0"], core: ["c0", "c1", "c2"], boots: ["b0"] };
  it("turns resolvable indices into keys and drops the rest", () => {
    expect(migrateChoice({ rune: 1, spells: 3, core: 2, boots: "b0" }, keys)).toEqual({ rune: "r1", spells: undefined, core: "c2" });
    const migrated = mergeChoice({ rune: 1, spells: 3, core: 2, boots: "b0" }, migrateChoice({ rune: 1, spells: 3, core: 2, boots: "b0" }, keys)!);
    expect(migrated).toEqual({ rune: "r1", core: "c2", boots: "b0" });
    expect(migrateChoice(migrated, keys)).toBeUndefined(); // only once
  });

  it("leaves parts whose options aren't known yet, and does nothing without legacy values", () => {
    expect(migrateChoice({ starter: 1, rune: 0 }, keys)).toEqual({ rune: "r0" });
    expect(migrateChoice({ rune: "r1" }, keys)).toBeUndefined();
    expect(migrateChoice(undefined, keys)).toBeUndefined();
  });

  it("keeps a legacy pick while that part's option list is empty (partial stats load)", () => {
    expect(migrateChoice({ rune: 1, core: 0 }, { rune: [], core: ["c0"] })).toEqual({ core: "c0" });
  });
});

// OP.GG's runes page lists every keystone + tree combination (the build page only the top two).
describe("OP.GG rune pages → options → League import", () => {
  const raw = (id: number, primary: number, sub: number, play: number, win_rate: number, pick_rate: number, runes: number[], subRunes: number[]) => ({
    id,
    play,
    win_rate,
    pick_rate,
    builds: [{ id, primary_rune_ids: runes, secondary_rune_ids: subRunes, stat_mod_ids: [5008, 5008, 5001], play, win: Math.round(play * win_rate), primary_page_id: primary, secondary_page_id: sub }],
  });
  const json = JSON.stringify({
    data: {
      rune_pages: [
        raw(8112, 8100, 8200, 11303, 0.5155, 0.748, [8112, 8139, 8140, 8106], [8226, 8210]),
        raw(8992, 8200, 8100, 1361, 0.5312, 0.0901, [8992, 8226, 8210, 8237], [8139, 8106]),
        raw(8112, 8100, 8400, 918, 0.5054, 0.0608, [8112, 8139, 8140, 8106], [8473, 8242]),
        raw(8112, 8100, 8300, 835, 0.5293, 0.0553, [8112, 8139, 8140, 8106], [8345, 8347]),
      ],
    },
  });
  const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify(`9:${json}`)}])</script></body></html>`;

  it("keeps every page with its pick rate, win rate and games", () => {
    const parsed = parseOpggChampionPage(html)!;
    expect(parsed.runes.map((r) => [r.perks[0], r.sub, r.games, r.pickRate])).toEqual([
      [8112, 8200, 11303, 0.748],
      [8992, 8100, 1361, 0.0901],
      [8112, 8400, 918, 0.0608],
      [8112, 8300, 835, 0.0553],
    ]);
    const data = makeFixtureStaticData();
    const cs = opggToChampionStats(parsed, data);
    const opts = runeOptions(cs);
    expect(opts).toHaveLength(3);
    expect(opts[1]).toMatchObject({ primary: 8200, sub: 8100, games: 1361, pickRate: 0.0901 });
    expect(opts[1].wins / opts[1].games).toBeCloseTo(0.5312, 3);

    // Import to League writes the picked page.
    const ahri = findChampion(data, "Ahri")!;
    const imported = buildRunePage(ahri, cs, undefined, runeKey(opts[1]));
    expect(imported).toMatchObject({ primary: 8200, sub: 8100, perks: [8992, 8226, 8210, 8237, 8139, 8106, 5008, 5008, 5001] });
    expect(buildRunePage(ahri, cs)).toMatchObject({ primary: 8100, sub: 8200 });
    expect(buildRunePage(ahri, cs, undefined, "8000:8300:1.2.3.4.5.6")).toMatchObject({ primary: 8100, sub: 8200 }); // stale pick → default
    expect(buildRunePage(ahri, cs, undefined, 1)).toMatchObject({ primary: 8200, sub: 8100 }); // legacy index
  });
});

describe("rune pages with stat shards", () => {
  const AD = [5008, 5008, 5011];
  const AS = [5005, 5008, 5011];
  const shardPages = stats({
    runes: [
      page(8112, 8200, 900, 450, { shards: AS }),
      page(8112, 8200, 5000, 2600, { shards: AD }),
      page(8112, 8200, 300, 200, { shards: AD }), // identical to the 5000-game page → dropped
      page(8128, 8000, 1200),
    ],
  });

  it("keeps pages that differ only by shards apart, and dedupes identical ones keeping the most played", () => {
    const opts = runeOptions(shardPages);
    expect(opts.map((p) => [p.perks[0], p.shards, p.games])).toEqual([
      [8112, AD, 5000],
      [8128, undefined, 1200],
      [8112, AS, 900],
    ]);
    expect(opts[0].wins).toBe(2600); // stats of the higher-games duplicate
    expect(new Set(opts.map(runeKey)).size).toBe(3);
    expect(chosenRunePage(shardPages, runeKey(opts[2]))?.shards).toEqual(AS);
  });

  it("matches a legacy key (no shards) to the first option with the same runes", () => {
    const keys = runeOptions(shardPages).map(runeKey);
    const legacy = runeBaseKey(page(8112, 8200, 0));
    expect(resolveRuneChoice(keys, legacy)).toBe(0);
    expect(resolveRuneChoice(keys, runeBaseKey(page(8128, 8000, 0)))).toBe(1);
    expect(resolveRuneChoice(keys, keys[2])).toBe(2); // exact key wins
    expect(resolveRuneChoice(keys, "8000:8300:1.2.3.4.5.6")).toBe(-1);
    expect(resolveRuneChoice(keys, 1)).toBe(1); // legacy index
    expect(chosenRunePage(shardPages, legacy)?.shards).toEqual(AD);
    expect(chosenRunePage(shardPages, runeBaseKey(page(8128, 8000, 0)))?.perks[0]).toBe(8128);
  });

  it("upgrades a legacy rune key to the full key once", () => {
    const keys = { rune: runeOptions(shardPages).map(runeKey), core: ["c0"] };
    const legacy = runeBaseKey(page(8128, 8000, 0));
    expect(needsMigration({ rune: legacy })).toBe(true);
    const patch = migrateChoice({ rune: legacy, core: "c0" }, keys);
    expect(patch).toEqual({ rune: keys.rune[1] });
    const upgraded = mergeChoice({ rune: legacy, core: "c0" }, patch!);
    expect(needsMigration(upgraded)).toBe(false);
    expect(migrateChoice(upgraded, keys)).toBeUndefined();
    // No matching page (yet) / no options known: left alone.
    expect(migrateChoice({ rune: "8000:8300:1.2.3.4.5.6" }, keys)).toBeUndefined();
    expect(migrateChoice({ rune: legacy }, { rune: [] })).toBeUndefined();
    expect(needsMigration({ rune: keys.rune[0] })).toBe(false);
    expect(needsMigration({ spells: 1 })).toBe(true);
    expect(needsMigration(undefined)).toBe(false);
  });
});
