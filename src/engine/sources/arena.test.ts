import { describe, expect, it } from "vitest";
import { assembleStaticData, getItemMap, itemMapFor, onMap, setItemMap } from "../staticData";
import { makeFixtureRaw, makeFixtureStaticData } from "../../dev/fixture";
import {
  arenaAugmentTier,
  arenaChampionUrl,
  arenaItemId,
  arenaStatsProvider,
  arenaToChampionStats,
  deriveAugmentTier,
  mergeArenaChampion,
  opggAugmentRarity,
  parseArenaAugments,
  parseArenaCatalogue,
  parseArenaChampionPage,
} from "./arena";
import { parseTierList, tierListUrl } from "./tierlists";

// Synthetic, trimmed fixtures reproducing the real OP.GG Arena pages (Nov 2026, patch 16.23):
// augments as RSC JSON grouped by rarity (1 / 4 / 8), header stats as <span>label</span><b>value</b>,
// item tables as server-rendered rows "<item imgs> <avg place> <1st %> <pick %> <n> Games <win %>".

const data = makeFixtureStaticData();
const rsc = (...payloads: string[]) => payloads.map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`).join("");
const IMG = "https://opgg-static.akamaized.net/meta/images/lol/16.23.1";
const item = (id: number, name = "") => `<div><img alt="${name}" src="${IMG}/item/${id}.png?image=q_auto:good,f_png,w_64,h_64&amp;v=1623"/></div>${name ? `<span>${name}</span>` : ""}`;
const row = (cells: string, avg: string, first: string, pick: string, games: string, win: string) =>
  `<tr><td>${cells}</td><td>${avg}</td><td>${first}</td><td><strong>${pick}</strong><span>${games}<!-- --> <!-- -->Games</span></td><td><strong>${win}</strong></td></tr>`;
const section = (title: string, caption: string, rows: string[]) =>
  `<h3>${title}</h3><table><caption>${caption}</caption><thead><tr><th>${title}</th><th>Avg. place</th><th>1st place</th><th>Pick rate</th><th>Win rate</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
const HEADER = `<h1><strong>Jinx</strong><span>Arena Build &amp; Augments</span></h1><p>2 Tier</p>
<ul><li><span>Avg. place</span><b>3.39</b></li><li><span>1st place</span><b>19.21%</b></li><li><span>Ban rate</span><b>2.65%</b></li>
<li><span>Win rate</span><b>52.85%</b></li><li><span>Pick rate</span><b>15.02%</b></li></ul>`;

const aug = (id: number, name: string, rareity: number, pick: number, win: number, play: string, desc = "") => ({
  id,
  name,
  rareity,
  image_url: `https://opgg-static.akamaized.net/meta/images/lol/latest/augment/${name.toLowerCase().replace(/\W/g, "")}_large.png?v=1623`,
  pick_rate: pick,
  win_rate: win,
  play,
  desc,
});
const AUGS = {
  "1": [aug(22, "Deft", 1, 18, 56.13, "579", "Gain ?% Attack Speed."), aug(87, "Typhoon", 1, 8.36, 49.44, "269"), aug(305, "Leg Day", 1, 3, 44, "90")],
  "4": [aug(1328, "Critical Rhythm", 4, 20.6, 52.8, "956"), aug(1301, "Firebrand", 4, 10, 60.5, "480")],
  "8": [aug(1001, "Dual Wield", 8, 19.76, 58.9, "798"), aug(1002, "Glass Cannon", 8, 4, 51, "120")],
};
const AUGMENTS_PAGE =
  HEADER +
  rsc(`0:["$","div",null,{"children":"x"}]\n`, `67:["$","$L68",null,{"data":${JSON.stringify(AUGS)},"rarity":"all"}]\n`);

const BUILD_PAGE =
  HEADER +
  section("Augments", "Augments", []) +
  section("Core builds", "Core builds", [
    row(item(223006, "Berserker's Greaves"), "3.94", "10.64%", "91.53%", "1,297", "37.93%"),
    row(item(223009, "Boots of Swiftness"), "3.14", "26.09%", "4.87%", "69", "62.32%"),
  ]) +
  section("Prism items", "Prism items", [row(item(443090, "Reaper's Toll"), "3.23", "19.86%", "21.24%", "881", "57.09%")]) +
  section("Core builds", "Core builds", [
    row(item(223031) + item(223085) + item(223036), "3.18", "13.64%", "2.28%", "44", "56.82%"),
    row(item(223031) + item(223036) + item(223085), "2.86", "-", "1.09%", "21", "66.67%"),
  ]) +
  section("Starter items", "Starter items", []) +
  "<p>No data available.</p>";

const ITEMS_PAGE =
  HEADER +
  section("Final items", "Synergies", [
    row(item(223031, "Infinity Edge"), "3.19", "19.67%", "12.24%", "1,973", "57.88%"),
    row(item(222523, "Hexoptics C44"), "3.14", "18.98%", "1.34%", "216", "59.26%"),
  ]) +
  section("Boots", "Synergies", [
    row(item(223006, "Berserker's Greaves"), "3.94", "10.64%", "91.53%", "1,297", "37.93%"),
    row(item(223158, "Ionian Boots of Lucidity"), "4.73", "3.85%", "1.83%", "26", "23.08%"),
  ]);

describe("arena urls", () => {
  it("builds champion and tier list urls", () => {
    expect(arenaChampionUrl("MonkeyKing")).toBe("https://op.gg/lol/modes/arena/monkeyking/augments");
    expect(arenaChampionUrl("Jinx", "build")).toBe("https://op.gg/lol/modes/arena/jinx/build");
    expect(tierListUrl("arena")).toBe("https://op.gg/lol/modes/arena");
  });
  it("maps OP.GG rarities", () => {
    expect([1, 4, 8, "8", "Prism", "gold", 0].map(opggAugmentRarity)).toEqual(["silver", "gold", "prismatic", "prismatic", "prismatic", "gold", "silver"]);
  });
});

describe("parseArenaAugments", () => {
  it("reads the per-rarity augment rows", () => {
    const p = parseArenaChampionPage(AUGMENTS_PAGE)!;
    expect(p.augments).toHaveLength(7);
    expect(p.augments[0]).toMatchObject({ id: 22, name: "Deft", rarity: "silver", games: 579, winRate: 0.5613, pickRate: 0.18, desc: "Gain ?% Attack Speed." });
    expect(p.augments.find((a) => a.name === "Dual Wield")?.rarity).toBe("prismatic");
    expect(p.augments.find((a) => a.name === "Firebrand")?.rarity).toBe("gold");
  });
  it("accepts the Mayhem-style tier/performance shape", () => {
    const text = `{"augments":[{"id":1048,"tier":0,"performance":88.06,"popular":2.88,"name":"Jeweled Gauntlet","rarity":8},{"id":7,"tier":4,"performance":31,"popular":0.5,"name":"Deft","rarity":1}]}`;
    const a = parseArenaAugments(text);
    expect(a).toEqual([
      { id: 1048, name: "Jeweled Gauntlet", rarity: "prismatic", pickRate: 0.0288, tier: 0, performance: 88.06 },
      { id: 7, name: "Deft", rarity: "silver", pickRate: 0.005, tier: 4, performance: 31 },
    ]);
  });
  it("ignores unrelated id/name objects and duplicates", () => {
    const text = `{"id":3,"name":"Not an augment","image":"x"} {"id":22,"name":"Deft","rareity":1,"play":"5","win_rate":50} {"id":22,"name":"Deft","rareity":1,"play":"9","win_rate":60}`;
    expect(parseArenaAugments(text)).toEqual([{ id: 22, name: "Deft", rarity: "silver", games: 5, winRate: 0.5 }]);
  });
});

describe("parseArenaChampionPage", () => {
  it("reads header stats", () => {
    const p = parseArenaChampionPage(AUGMENTS_PAGE)!;
    expect(p).toMatchObject({ avgPlace: 3.39, firstRate: 0.1921, banRate: 0.0265, winRate: 0.5285, pickRate: 0.1502, tier: 2 });
  });
  it("reads boots, prism items and core builds from the build page", () => {
    const p = parseArenaChampionPage(BUILD_PAGE)!;
    expect(p.boots.map((b) => b.id)).toEqual([223006, 223009]);
    expect(p.boots[0]).toMatchObject({ games: 1297, winRate: 0.3793, pickRate: 0.9153, avgPlace: 3.94, firstRate: 0.1064 });
    expect(p.prismatic).toEqual([{ id: 443090, avgPlace: 3.23, firstRate: 0.1986, pickRate: 0.2124, games: 881, winRate: 0.5709 }]);
    expect(p.coreBuilds.map((b) => b.items)).toEqual([
      [223031, 223085, 223036],
      [223031, 223036, 223085],
    ]);
    expect(p.coreBuilds[1].firstRate).toBeUndefined();
    expect(p.starters).toEqual([]);
    expect(p.games).toBe(1417); // 1297 / 0.9153
  });
  it("reads final items and boots from the items page", () => {
    const p = parseArenaChampionPage(ITEMS_PAGE)!;
    expect(p.items.map((i) => [i.id, i.games])).toEqual([
      [223031, 1973],
      [222523, 216],
    ]);
    expect(p.boots.map((b) => b.id)).toEqual([223006, 223158]);
  });
  it("returns undefined for pages without data", () => {
    expect(parseArenaChampionPage("<html><body>404</body></html>")).toBeUndefined();
    expect(parseArenaChampionPage("")).toBeUndefined();
  });
});

describe("arenaToChampionStats", () => {
  const merged = mergeArenaChampion(parseArenaChampionPage(AUGMENTS_PAGE), parseArenaChampionPage(BUILD_PAGE), parseArenaChampionPage(ITEMS_PAGE))!;
  const cs = arenaToChampionStats(merged, data);

  it("merges pages and keeps the boots-based sample estimate", () => {
    expect(merged.augments).toHaveLength(7);
    expect(merged.items).toHaveLength(2);
    expect(merged.games).toBe(1417);
  });
  it("produces Arena ChampionStats with augments, tiers and regular item ids", () => {
    expect(cs).toMatchObject({ mode: "arena", source: "opgg", games: 1417, wins: Math.round(1417 * 0.5285), avgPlace: 3.39, firstRate: 0.1921 });
    expect(cs.augments!.Deft).toEqual({ games: 579, wins: 325, pickRate: 0.18 });
    expect(cs.bestBuild).toEqual([3031, 3085, 3036]);
    expect(Object.keys(cs.boots!)).toEqual(["3006", "3009"]); // most-populated boots table, mapped to regular ids
    expect(cs.items["3031"].games).toBe(1973);
    expect(cs.items["443090"].games).toBe(881); // Prismatic ids kept
    expect(cs.augmentTiers!.Firebrand).toBeLessThanOrEqual(1);
    expect(cs.augmentTiers!["Leg Day"]).toBe(5);
    expect(cs.augmentTiers!.Typhoon).toBeGreaterThanOrEqual(4);
  });
  it("maps Arena copies to regular ids only when the regular item exists", () => {
    expect(arenaItemId(223031, data)).toBe(3031);
    expect(arenaItemId(443090, data)).toBe(443090);
    expect(arenaItemId(229999, data)).toBe(229999);
    expect(arenaItemId(3031, data)).toBe(3031);
  });
});

describe("deriveAugmentTier", () => {
  it("keeps a published tier and derives one from win rate lift otherwise", () => {
    expect(deriveAugmentTier({ name: "x", rarity: "gold", tier: 3.2 })).toBe(3);
    expect(deriveAugmentTier({ name: "x", rarity: "gold", games: 2000, winRate: 0.6 }, 0.5)).toBe(0);
    expect(deriveAugmentTier({ name: "x", rarity: "gold", games: 2000, winRate: 0.5 }, 0.5)).toBe(3);
    expect(deriveAugmentTier({ name: "x", rarity: "gold", games: 2000, winRate: 0.4 }, 0.5)).toBe(5);
    // Small samples are pulled toward the average.
    expect(deriveAugmentTier({ name: "x", rarity: "gold", games: 10, winRate: 0.9 }, 0.5)).toBe(1);
    expect(deriveAugmentTier({ name: "x", rarity: "gold" })).toBeUndefined();
  });
});

describe("parseArenaCatalogue", () => {
  it("reads CommunityDragon augments, skipping special and nameless entries", () => {
    const json = {
      augments: [
        { id: 93, apiName: "WarmupRoutine", name: "Warmup Routine", rarity: 0, desc: "Damage up to @MaxStacks@%.", iconLarge: "assets/ux/cherry/augments/icons/warmuproutine_large.png" },
        { id: 89, name: "Vanish", rarity: 1, desc: "Invisible." },
        { id: 323, name: "Cerberus", rarity: 2, desc: "" },
        { id: 340, name: "Gain a Prismatic Stat Anvil", rarity: 4, desc: "" },
        { id: 1, name: "", rarity: 0 },
        { id: 2, name: "Vanish", rarity: 1 },
      ],
    };
    expect(parseArenaCatalogue(json)).toEqual([
      { id: 93, name: "Warmup Routine", rarity: "silver", desc: "Damage up to @MaxStacks@%.", icon: "https://raw.communitydragon.org/latest/game/assets/ux/cherry/augments/icons/warmuproutine_large.png" },
      { id: 89, name: "Vanish", rarity: "gold", desc: "Invisible." },
      { id: 323, name: "Cerberus", rarity: "prismatic", desc: "" },
    ]);
    expect(parseArenaCatalogue(null)).toEqual([]);
    expect(parseArenaCatalogue({ augments: "nope" })).toEqual([]);
  });
});

describe("arenaStatsProvider", () => {
  it("fetches the three pages + catalogue, registers augments and remembers tiers", async () => {
    const pages: Record<string, string> = {
      "https://op.gg/lol/modes/arena/jinx/augments": AUGMENTS_PAGE,
      "https://op.gg/lol/modes/arena/jinx/build": BUILD_PAGE,
      "https://op.gg/lol/modes/arena/jinx/items": ITEMS_PAGE,
    };
    const registered: string[] = [];
    let jsonCalls = 0;
    const provider = arenaStatsProvider(
      async (url) => {
        if (!pages[url]) throw new Error("404");
        return pages[url];
      },
      async <T,>() => {
        jsonCalls++;
        return { augments: [{ id: 89, name: "Vanish", rarity: 1, desc: "x" }] } as T;
      },
      (list) => {
        registered.push(...list.map((a) => a.name));
        return list.length;
      },
    );
    const cs = await provider("Jinx", data, 3);
    expect(cs?.mode).toBe("arena");
    expect(registered).toContain("Vanish");
    expect(registered).toContain("Dual Wield");
    expect(arenaAugmentTier("Leg Day", "Jinx")).toBe(5);
    expect(arenaAugmentTier("leg day")).toBe(5);
    expect(arenaAugmentTier("Unknown")).toBeUndefined();
    await provider("Jinx", data, 3);
    expect(jsonCalls).toBe(1); // catalogue loaded once
    expect(await provider("Nobody", data, 3)).toBeUndefined();
  });
});

describe("arena tier list", () => {
  it("parses the OP.GG Arena champion list like ARAM's", () => {
    const rows = [
      { key: "jinx", name: "Jinx", image_url: "x", id: 222, is_rotation: false, is_rip: false, win_rate: 0.5285, pick_rate: 0.1502, tier: 2, rank: 20 },
      { key: "monkeyking", name: "Wukong", image_url: "x", id: 62, win_rate: 0.56, pick_rate: 0.08, tier: 1, rank: 3 },
    ];
    const html = rsc(`5:["$","$L58",null,{"champions":${JSON.stringify(rows)},"region":"global"}]`);
    const out = parseTierList("arena", html, data);
    expect(out.map((r) => [r.championKey, r.tier, r.winRate])).toEqual([
      ["Jinx", "A", 0.5285],
      ["MonkeyKing", "S", 0.56],
    ]);
  });
});

describe("Arena item pool", () => {
  const raw = makeFixtureRaw();
  raw.items["443090"] = {
    name: "Reaper's Toll",
    gold: { base: 2750, total: 2750, sell: 2750, purchasable: true },
    tags: ["Damage"],
    maps: { "11": false, "12": false, "30": true },
    image: { full: "443090.png" },
  };
  raw.items["220007"] = { name: "Prismatic Item", gold: { base: 4000, total: 4000, sell: 4000, purchasable: true }, tags: [], maps: { "30": true }, image: { full: "220007.png" } };
  const d = assembleStaticData(raw.version, raw.champions, raw.items, raw.runes, raw.spells);

  it("flags items with an Arena copy and keeps Prismatic items arena-only", () => {
    expect(d.items.get(3031)?.arena).toBe(true); // 223031 copy
    expect(d.items.get(443090)).toMatchObject({ arena: true, aram: false, sr: false, completed: true });
    expect(d.items.has(220007)).toBe(false);
    expect(d.items.has(223031)).toBe(false);
  });
  it("onMap follows the active map", () => {
    const prev = getItemMap();
    try {
      setItemMap(itemMapFor("arena"));
      expect(onMap(d.items.get(443090))).toBe(true);
      expect(onMap(d.items.get(3031))).toBe(true);
      setItemMap(itemMapFor("mayhem"));
      expect(onMap(d.items.get(443090))).toBe(false);
      expect(itemMapFor("sr")).toBe("sr");
      expect(itemMapFor("aram")).toBe("aram");
    } finally {
      setItemMap(prev);
    }
  });
});
