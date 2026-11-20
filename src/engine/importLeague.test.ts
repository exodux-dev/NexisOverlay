import { describe, expect, it } from "vitest";
import { demoAllGameData, makeFixtureStaticData } from "../dev/fixture";
import { recommendBuild } from "./build";
import { buildItemSetBlocks, buildRunePage, itemSetTitle, normalizeShards, SHARD_ROWS } from "./importLeague";
import { parseLiveGame } from "./live";
import { findChampion } from "./staticData";
import { analyzeEnemies } from "./threat";
import type { ChampionStats } from "./types";

const data = makeFixtureStaticData();
const ahri = findChampion(data, "Ahri")!;

const stats = (runes: ChampionStats["runes"]): ChampionStats => ({ games: 100, wins: 52, items: {}, runes });

describe("rune page payload", () => {
  it("uses the most-played page with its shards", () => {
    const page = buildRunePage(
      ahri,
      stats([
        { primary: 8000, sub: 8100, perks: [8005, 9111, 9104, 8014, 8139, 8135], games: 10, wins: 5 },
        { primary: 8100, sub: 8200, perks: [8112, 8139, 8138, 8135, 8226, 8210], shards: [5008, 5010, 5011], games: 90, wins: 50 },
      ]),
    );
    expect(page).toEqual({ name: "Nexis: Ahri", primary: 8100, sub: 8200, perks: [8112, 8139, 8138, 8135, 8226, 8210, 5008, 5010, 5011] });
  });

  it("fills missing or outdated shards by family", () => {
    const page = buildRunePage(ahri, stats([{ primary: 8100, sub: 8200, perks: [8112, 8139, 8138, 8135, 8226, 8210], games: 9, wins: 5 }]));
    expect("perks" in page && page.perks.slice(6)).toEqual([5008, 5008, 5001]);
    // Armor / MR shards (removed in 2024) are replaced row by row.
    expect(normalizeShards([5005, 5002, 5003], "adc")).toEqual([5005, 5008, 5001]);
    expect(normalizeShards(undefined, "tank")).toEqual([5007, 5001, 5011]);
    for (const fam of ["ap", "adc", "lethality", "bruiser", "tank", "enchanter"] as const)
      normalizeShards(undefined, fam).forEach((s, i) => expect(SHARD_ROWS[i]).toContain(s));
  });

  it("accepts shards appended to perks and reports missing data", () => {
    const page = buildRunePage(ahri, stats([{ primary: 8100, sub: 8200, perks: [8112, 8139, 8138, 8135, 8226, 8210, 5007, 5008, 5011], games: 9, wins: 5 }]));
    expect("perks" in page && page.perks).toEqual([8112, 8139, 8138, 8135, 8226, 8210, 5007, 5008, 5011]);
    expect(buildRunePage(ahri, undefined)).toHaveProperty("error");
    expect(buildRunePage(ahri, stats([{ primary: 8100, sub: 8200, perks: [8112], games: 1, wins: 1 }]))).toHaveProperty("error");
  });
});

describe("item set blocks", () => {
  it("builds starter / core / boots / situational with string ids", () => {
    const snap = parseLiveGame(demoAllGameData(), data)!;
    const plan = recommendBuild({ data, champion: snap.me.champion!, threat: analyzeEnemies(snap.enemies), me: snap.me, gold: snap.gold });
    const blocks = buildItemSetBlocks(plan, { enemiesKnown: true });
    const types = blocks.map((b) => b.type);
    expect(types).toContain("Core build");
    expect(types).toContain("Boots");
    expect(blocks.find((b) => b.type === "Core build")!.items.map((i) => i.id)).toEqual(plan.order.map((r) => String(r.item.id)));
    for (const b of blocks) for (const it of b.items) expect(it.id).toMatch(/^\d+$/);
    const boots = blocks.find((b) => b.type === "Boots")!;
    expect(boots.items[0].id).toBe(String(plan.boots!.item.id));
    expect(new Set(boots.items.map((i) => i.id)).size).toBe(boots.items.length);
    const sit = blocks.find((b) => b.type.startsWith("Situational"));
    if (sit) {
      expect(sit.type).toBe("Situational (vs this enemy comp)");
      const core = new Set(plan.order.map((r) => String(r.item.id)));
      expect(sit.items.some((i) => core.has(i.id))).toBe(false);
    }
    expect(buildItemSetBlocks(plan).some((b) => b.type === "Situational (vs this enemy comp)")).toBe(false);
    expect(itemSetTitle(ahri, "ARAM")).toBe("Nexis: Ahri (ARAM)");
  });
});
