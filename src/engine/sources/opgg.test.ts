import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../../dev/fixture";
import { flattenHtml, mergeOpggChampion, opggChampionUrl, opggToChampionStats, parseOpggChampionPage } from "./opgg";

// Synthetic, trimmed fixtures reproducing the real op.gg page structure (Nov 2026, patch 16.23):
// server-rendered tables found by their <caption>, header rates in <em>/<span> + <b>, and the rune
// pages as JSON inside the Next.js RSC payload (`self.__next_f.push([1,"..."])`).

const IMG = "https://opgg-static.akamaized.net/meta/images/lol/16.23.1";
const img = (kind: string, id: string | number, alt = "x") =>
  `<div data-tooltip-id="opgg-dynamic-tooltip"><img alt="${alt}" loading="lazy" width="32" height="32" class="rounded" src="${IMG}/${kind}/${id}.png?image=q_auto:good,f_png,w_64,h_64&amp;v=1623"/></div>`;
const stats = (pick: string, games: string, win: string) =>
  `<td><div class="flex flex-col"><strong class="tabular-nums">${pick}</strong><span class="text-gray-500">${games}<!-- --> <!-- -->Games</span></div></td><td><strong class="flex justify-center">${win}</strong></td>`;
const table = (caption: string, head: string, rows: string[]) =>
  `<table class="w-full table-fixed"><caption>${caption}</caption><colgroup><col width="auto"/></colgroup><thead><tr><th scope="col" colSpan="3" align="left">${head}</th></tr></thead><tbody>${rows
    .map((r) => `<tr class="text-xs">${r}</tr>`)
    .join("")}</tbody></table>`;
const rsc = (...payloads: string[]) => payloads.map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`).join("");

const RUNE_PAGES = JSON.stringify({
  data: {
    rune_pages: [
      {
        id: 8112,
        play: 11303,
        pick_rate: 0.748,
        builds: [
          {
            id: 8112,
            primary_perk_style: { id: 8100, name: "Domination" },
            perk_sub_style: { id: 8200, name: "Sorcery" },
            main_runes: [
              [{ id: 8112, isActive: true }, { id: 8128, isActive: false }],
              [{ id: 8139, isActive: true }],
              [{ id: 8140, isActive: true }],
              [{ id: 8106, isActive: true }],
            ],
            sub_runes: [[{ id: 8226, isActive: true }], [{ id: 8210, isActive: true }]],
            shards: [[{ id: 5005, isActive: true }], [{ id: 5008, isActive: true }], [{ id: 5001, isActive: true }]],
          },
        ],
        win_rate: 0.5155268512784217,
        primary_perk_style: { id: 8100 },
        perk_sub_style: { id: 8200 },
        importClientData: { type: "CHAMPION_DETAIL_BUILD", championKey: "ahri", primaryStyleId: 8100, subStyleId: 8200, selectedPerkIds: [8112, 8139, 8140, 8106, 8210, 8226, 5005, 5008, 5001] },
      },
      {
        // ARAM / runes-page shape: concrete builds carry explicit id lists and their own stats.
        id: 8128,
        play: 1200,
        pick_rate: 0.398,
        win_rate: 0.5208,
        builds: [
          { id: 8128, primary_rune_ids: [8128, 8126, 8140, 8106], secondary_rune_ids: [8009, 8014], stat_mod_ids: [5008, 5008, 5001], play: 11, win: 7, primary_page_id: 8100, secondary_page_id: 8000 },
          { id: 8128, primary_rune_ids: [8128, 8139, 8140, 8106], secondary_rune_ids: [8009, 8014], stat_mod_ids: [5008, 5008, 5001], play: 1093, win: 553, primary_page_id: 8100, secondary_page_id: 8000 },
        ],
      },
    ],
  },
});

const SR_BUILD =
  `<html><body>` +
  // messages bundle also mentions rune_pages as a string — must not confuse the parser
  rsc(`8:{"Runes":{"rune_pages":"Rune pages"}}`, `5d:["$","$L65",null,{"positions":[{"name":"MID","percentage":"100%"}],"position":"mid"}]`) +
  `<h1><strong>Ahri</strong> <span>Build for Middle, Patch 16.23</span></h1><span class="mb-[4px] text-blue-500">1 Tier</span>` +
  `<ul><li><em class="text-gray-500">Win rate</em><b class="tabular-nums">51.68%<!-- --> <svg></svg></b></li>` +
  `<li><em class="text-gray-500">Pick rate</em><b class="tabular-nums">11.33%<!-- --> </b></li>` +
  `<li><em class="text-gray-500">Ban rate</em><b class="tabular-nums">3.73%<!-- --> </b></li></ul>` +
  table("SummonerSpells Table", "Summoner spells", [`<td>${img("spell", "SummonerFlash", "Flash")}${img("spell", "SummonerDot", "Ignite")}</td>${stats("68.11%", "10,294", "51.88%")}`]) +
  table("SummonerSpells Table", "Summoner spells", [`<td>${img("spell", "SummonerFlash")}${img("spell", "SummonerTeleport")}</td>${stats("29.99%", "4,532", "51.43%")}`]) +
  table("SkillOrder Table", "Skill order", [
    `<td>${img("spell", "AhriQ")}<strong translate="no">Q</strong>${img("spell", "AhriW")}<strong>W</strong>${img("spell", "AhriE")}<strong>E</strong>` +
      ["W", "Q", "E", "Q", "Q", "R", "Q", "W", "Q", "W", "R", "W", "W", "E", "E"].map((k) => `<span><strong>${k}</strong></span>`).join("") +
      `</td>${stats("65.38%", "5,655", "58.87%")}`,
  ]) +
  table("Items Table", "Starter items", [
    `<td>${img("item", 1056, "Doran&#x27;s Ring")}${img("item", 2003)}<div class="absolute">2</div></td>${stats("98.85%", "15,525", "51.54%")}`,
    `<td>${img("item", 1082)}${img("item", 2031)}</td>${stats("0.18%", "29", "48.28%")}`,
  ]) +
  table("Boots Table", "Boots", [`<td>${img("item", 3020, "Sorcerer&#x27;s Shoes")}</td>${stats("56.39%", "8,604", "51.99%")}`, `<td>${img("item", 3158)}</td>${stats("30.49%", "4,652", "53.07%")}`]) +
  table("Builds Table", "Core builds", [
    `<td>${img("item", 3118)}${img("item", 4645)}${img("item", 3157)}</td>${stats("13.58%", "1,258", "53.10%")}`,
    `<td>${img("item", 3118)}${img("item", 4645)}${img("item", 3089)}</td>${stats("7.02%", "650", "53.08%")}`,
  ]) +
  // "Nth item" tables have no win-rate column: ignored
  table("Depth 4 Items Table", "Fourth Item", [`<td>${img("item", 3089)}</td><td><strong>57.27%</strong><span>1,128<!-- --> Games</span></td>`]) +
  `<div class="text-xs text-gray-400">Weak against</div><ul><li><a href="/x">${img("champion", "Ziggs")}<strong>41.67%</strong><span></span><span><span>36</span><span>Games</span></span></a></li></ul>` +
  `<div class="text-xs text-gray-400">Strong against</div><ul><li><a href="/x">${img("champion", "Galio")}<strong>61.59%</strong><span></span><span><span>302</span><span>Games</span></span></a></li></ul>` +
  rsc(`97:["$","$L97",null,${RUNE_PAGES.slice(0, 200)}`, `${RUNE_PAGES.slice(200)}]`) +
  `</body></html>`;

const ARAM_BUILD =
  `<html><body><p class="order-2 text-xs text-gray-500">2 Tier</p>` +
  `<ul><li><span class="text-xs">Win rate</span><b class="text-sm">51.85%</b></li><li><span>Pick rate</span><b>11.13%</b></li></ul>` +
  table("aram Champions Table", "Champion", [`<td><div class="animate-pulse"></div></td>`]) +
  table("SummonerSpells Table", "Summoner spells", [`<td>${img("spell", "SummonerFlash")}${img("spell", "SummonerSnowball", "Mark")}</td><td><strong>-</strong><span>1,814<!-- --> Games</span></td><td><strong>51.93%</strong></td>`]) +
  table("Builds Table", "Core builds", [`<td>${img("item", 6655)}${img("item", 4646)}${img("item", 4645)}</td>${stats("13.81%", "319", "55.17%")}`]) +
  `</body></html>`;

// Items page: four "Core Items Table"s told apart by the section title before each.
const ITEMS_PAGE =
  `<html><body><div>Core builds</div>` +
  table("Core Items Table", "Pick rate", [`<td>${img("item", 3118)}${img("item", 4645)}${img("item", 3157)}</td>${stats("13.58%", "1,258", "53.10%")}`]) +
  `<div>ADVERTISEMENT</div><div>Boots</div>` +
  table("Core Items Table", "Pick rate", [`<td>${img("item", 3020)} Sorcerer's Shoes</td>${stats("56.39%", "8,604", "51.99%")}`, `<td>${img("item", 3111)} Mercury's Treads</td>${stats("11.04%", "1,685", "49.55%")}`, `<td>${img("item", 3158)}</td>${stats("30.49%", "4,652", "53.07%")}`]) +
  `<div>Starter items</div>` +
  table("Core Items Table", "Pick rate", [`<td>${img("item", 1056)}${img("item", 2003)} 2</td>${stats("98.85%", "15,525", "51.54%")}`]) +
  `<div>Remove ads</div><div>Items</div>` +
  table("Core Items Table", "Pick rate", [`<td>${img("item", 3118)} Malignance</td>${stats("63.84%", "9,317", "51.99%")}`, `<td>${img("item", 4645)} Shadowflame</td>${stats("46.97%", "6,855", "52.66%")}`]) +
  `</body></html>`;

describe("OP.GG parser", () => {
  it("builds champion URLs", () => {
    expect(opggChampionUrl("ranked", "Ahri")).toBe("https://op.gg/lol/champions/ahri/build");
    expect(opggChampionUrl("ranked", "MonkeyKing", "JUNGLE")).toBe("https://op.gg/lol/champions/monkeyking/build/jungle");
    expect(opggChampionUrl("ranked", "KogMaw", "bottom")).toBe("https://op.gg/lol/champions/kogmaw/build/adc");
    expect(opggChampionUrl("ranked", "Ahri", "UTILITY", "runes")).toBe("https://op.gg/lol/champions/ahri/runes/support");
    expect(opggChampionUrl("aram", "Nunu", "mid")).toBe("https://op.gg/lol/modes/aram/nunu/build");
    expect(opggChampionUrl("aram", "Ahri", undefined, "items")).toBe("https://op.gg/lol/modes/aram/ahri/items");
  });

  it("flattens HTML with meta-image tokens", () => {
    expect(flattenHtml(`<td>${img("item", 3020)}<b>Sorcerer&#x27;s</b></td>`)).toBe("{item:3020} Sorcerer's");
  });

  it("parses a Summoner's Rift build page", () => {
    const c = parseOpggChampionPage(SR_BUILD)!;
    expect(c).toMatchObject({ winRate: 0.5168, pickRate: 0.1133, banRate: 0.0373, tier: 1, position: "mid", positions: ["mid"] });
    expect(c.spells).toEqual([
      { keys: ["SummonerFlash", "SummonerDot"], ids: [4, 14], games: 10294, winRate: 0.5188, pickRate: 0.6811 },
      { keys: ["SummonerFlash", "SummonerTeleport"], ids: [4, 12], games: 4532, winRate: 0.5143, pickRate: 0.2999 },
    ]);
    expect(c.skillOrder).toEqual([{ order: "QWE", games: 5655, winRate: 0.5887, pickRate: 0.6538 }]);
    expect(c.skillSequence).toEqual(["W", "Q", "E", "Q", "Q", "R", "Q", "W", "Q", "W", "R", "W", "W", "E", "E"]);
    expect(c.starters[0]).toEqual({ items: [1056, 2003], games: 15525, winRate: 0.5154, pickRate: 0.9885 });
    expect(c.boots.map((b) => b.id)).toEqual([3020, 3158]);
    expect(c.coreBuilds[0]).toEqual({ items: [3118, 4645, 3157], games: 1258, winRate: 0.531, pickRate: 0.1358 });
    expect(c.coreBuilds).toHaveLength(2); // depth tables ignored
    expect(c.counters).toEqual([
      { championKey: "Ziggs", winRate: 0.4167, games: 36, kind: "weak" },
      { championKey: "Galio", winRate: 0.6159, games: 302, kind: "strong" },
    ]);
    expect(c.games).toBe(Math.round(10294 / 0.6811));

    expect(c.runes).toHaveLength(2);
    expect(c.runes[0]).toEqual({ primary: 8100, sub: 8200, perks: [8112, 8139, 8140, 8106, 8226, 8210], shards: [5005, 5008, 5001], games: 11303, winRate: 0.5155268512784217, pickRate: 0.748 });
    // most-played concrete build is used for the perks; group numbers for the stats
    expect(c.runes[1]).toMatchObject({ primary: 8100, sub: 8000, perks: [8128, 8139, 8140, 8106, 8009, 8014], shards: [5008, 5008, 5001], games: 1200 });
  });

  it("takes the group's shards when the concrete rune build omits them", () => {
    const pages = JSON.parse(RUNE_PAGES);
    delete pages.data.rune_pages[0].builds[0].shards;
    const c = parseOpggChampionPage(`<html>${rsc(`97:["$","$L97",null,${JSON.stringify(pages)}]`)}</html>`)!;
    expect(c.runes[0]).toMatchObject({ perks: [8112, 8139, 8140, 8106, 8226, 8210], shards: [5005, 5008, 5001] });
  });

  it("parses an ARAM build page (no pick rate on spells, tier list skeleton ignored)", () => {
    const c = parseOpggChampionPage(ARAM_BUILD)!;
    expect(c).toMatchObject({ winRate: 0.5185, pickRate: 0.1113, tier: 2 });
    expect(c.position).toBeUndefined();
    expect(c.spells).toEqual([{ keys: ["SummonerFlash", "SummonerSnowball"], ids: [4, 32], games: 1814, winRate: 0.5193 }]);
    expect(c.coreBuilds[0].items).toEqual([6655, 4646, 4645]);
  });

  it("parses the items page into builds, boots, starters and per-item stats", () => {
    const c = parseOpggChampionPage(ITEMS_PAGE)!;
    expect(c.coreBuilds).toHaveLength(1);
    expect(c.boots.map((b) => b.id)).toEqual([3020, 3111, 3158]);
    expect(c.starters[0].items).toEqual([1056, 2003]);
    expect(c.items).toEqual([
      { id: 3118, games: 9317, winRate: 0.5199, pickRate: 0.6384 },
      { id: 4645, games: 6855, winRate: 0.5266, pickRate: 0.4697 },
    ]);
  });

  it("returns undefined for pages without data", () => {
    expect(parseOpggChampionPage("<html>Not found</html>")).toBeUndefined();
    expect(parseOpggChampionPage(`<html>${table("aram Champions Table", "Champion", ["<td></td>"])}</html>`)).toBeUndefined();
  });

  it("converts to engine ChampionStats", () => {
    const data = makeFixtureStaticData();
    const merged = mergeOpggChampion(parseOpggChampionPage(SR_BUILD), parseOpggChampionPage(ITEMS_PAGE))!;
    expect(merged.boots).toHaveLength(3); // longer list wins
    const s = opggToChampionStats(merged, data);
    expect(s.source).toBe("opgg");
    expect(s.games).toBe(Math.round(10294 / 0.6811));
    expect(s.wins).toBe(Math.round(s.games * 0.5168));
    expect(s.bestBuild).toEqual([3118, 4645, 3157]);
    expect(s.builds?.[0]).toMatchObject({ items: [3118, 4645, 3157], games: 1258, wins: Math.round(1258 * 0.531) });
    expect(s.items["3118"]).toEqual({ games: 9317, wins: Math.round(9317 * 0.5199), pickRate: 0.6384 });
    expect(s.boots?.["3020"]?.games).toBe(8604);
    expect(s.starters?.[0].items).toEqual([1056, 2003]);
    expect(s.spells?.[0]).toMatchObject({ ids: [4, 14], games: 10294 });
    expect(s.runes?.[0]).toMatchObject({ primary: 8100, sub: 8200, games: 11303 });
    expect(s.skillOrders?.[0]).toMatchObject({ order: "QWE", games: 5655 });
    expect(s.skillSequence?.length).toBe(15);
    expect(s.counters?.[0]).toEqual({ championKey: "Ziggs", games: 36, winRate: 0.4167 });

    // build page alone: per-item stats are approximated from the core builds
    const solo = opggToChampionStats(parseOpggChampionPage(SR_BUILD)!, data);
    expect(solo.items["3118"].games).toBe(1258 + 650);
  });
});
