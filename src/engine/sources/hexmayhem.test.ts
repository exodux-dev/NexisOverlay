import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../../dev/fixture";
import { rankAugments, findAugment, registerAugments } from "../augments";
import { recommendBuild } from "../build";
import { skillPlanFor } from "../guide";
import { analyzeEnemies } from "../threat";
import { decodeRsc, grabJson, parseAugmentTable, parseChampionPage, toChampionStats } from "./hexmayhem";

/** Wrap RSC payload text the way Next.js embeds it in a page. */
function page(...payloads: string[]): string {
  return `<html><body>${payloads
    .map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`)
    .join("")}</body></html>`;
}

// Shapes copied from the real hexmayhem.com page structure (trimmed, synthetic numbers).
const CHAMP_PAYLOAD = [
  `19:["$","section",null,{"id":"augments","className":"dsec","children":["$","$L21",null,{"champId":103,"all":[`,
  `{"id":1388,"name":"Infinite Recursion","rarity":"prismatic","icon":"x.png","wr":56.4,"pr":6.2,"n":113120,"lift":4.07},`,
  `{"id":1048,"name":"Jeweled Gauntlet","rarity":"prismatic","icon":"x.png","wr":52.05,"pr":10.51,"n":191557,"lift":-0.31},`,
  `{"id":1134,"name":"Draw Your Sword","rarity":"prismatic","icon":"x.png","wr":44.1,"pr":0.4,"n":9000,"lift":-8.9},`,
  `{"id":9999,"name":"Brand New Augment","rarity":"gold","icon":"x.png","wr":53,"pr":1,"n":5000,"lift":0.2}]}]}]`,
].join("");
const SUMMARY = `["$","div",null,{"className":"rec-h","children":[["$","span",null,{"children":"Best build"}],["$","em",null,{"children":"AP"}]]}],["$","div",null,{"className":"rec-v","children":["$","$L14",null,{"ids":[6655,3089,4645],"map":{"1001":{"name":"Boots","icon":"b.png"}}}]}]`;
const STATS = `1b:["$","section",null,{"id":"items","className":"dsec","children":["$","$L26",null,{"champId":103,"stats":{"unfiltered":{"n":2672859,"wr":52.97,"all":[[3089,1643954,52.62,61.49],[3020,1239782,51.98,46.37],[3008,273307,54.78,10.22],[3165,400000,54.1,15.0]]},"filtered":{"n":1,"wr":50,"all":[]}}}]}]`;
const PLAY = [
  `["$","h3",null,{"children":"Skill order"}],["$","tbody",null,{"children":[`,
  `["$","tr","Q>W>E",{"children":[["$","td",null,{"children":["$","b",null,{"children":["$","$L20",null,{"order":"Q>W>E"}]}]}],["$","td",null,{"className":"num","children":[53.39,"%"]}],["$","td",null,{"className":"num","children":[67.11,"%"]}],["$","td",null,{"className":"num","children":["$","$L1f",null,{"v":1.03}]}]]}],`,
  `["$","tr","Q>E>W",{"children":[["$","td",null,{"children":["$","b",null,{"children":["$","$L20",null,{"order":"Q>E>W"}]}]}],["$","td",null,{"className":"num","children":[52.43,"%"]}],["$","td",null,{"className":"num","children":[29.54,"%"]}],["$","td",null,{"className":"num","children":["$","$L1f",null,{"v":0.07}]}]]}]]}],`,
  `["$","h3",null,{"children":"Summoner spells"}],["$","tbody",null,{"children":[`,
  `["$","tr","0",{"children":[["$","td",null,{"children":[["$","img","4",{"className":"item-ico","alt":"Flash","title":"Flash"}],["$","img","6",{"className":"item-ico","alt":"Ghost","title":"Ghost"}]]}],["$","td",null,{"className":"num","children":[53.05,"%"]}],["$","td",null,{"className":"num","children":[43.37,"%"]}],["$","td",null,{"className":"num","children":["$","$L1f",null,{"v":0.69}]}]]}]]}]`,
].join("");

const CHAMP_HTML = page(CHAMP_PAYLOAD.slice(0, 120), CHAMP_PAYLOAD.slice(120), SUMMARY, STATS, PLAY);

describe("HexMayhem parser", () => {
  it("decodes RSC chunks split across scripts", () => {
    expect(decodeRsc(CHAMP_HTML)).toContain('"champId":103,"all":[');
    expect(grabJson<number[]>('x "ids":[1,2,3] y', '"ids":')).toEqual([1, 2, 3]);
    expect(grabJson('"a":{"s":"has ] and } inside","n":[1]}', '"a":')).toEqual({ s: "has ] and } inside", n: [1] });
  });

  it("parses a champion page", () => {
    const c = parseChampionPage(CHAMP_HTML)!;
    expect(c.games).toBe(2672859);
    expect(c.winRate).toBe(52.97);
    expect(c.items).toHaveLength(4);
    expect(c.augments.map((a) => a.name)).toContain("Infinite Recursion");
    expect(c.bestBuild).toEqual([6655, 3089, 4645]);
    expect(c.skillOrders.map((s) => s.order)).toEqual(["QWE", "QEW"]);
    expect(c.skillOrders[0]).toMatchObject({ wr: 53.39, pr: 67.11 });
    expect(c.spells[0]).toMatchObject({ names: ["Flash", "Ghost"], wr: 53.05, pr: 43.37 });
  });

  it("returns undefined for pages without data (site changed / 404 page)", () => {
    expect(parseChampionPage("<html>Not found</html>")).toBeUndefined();
    expect(parseAugmentTable("<html></html>").rows).toEqual([]);
  });

  it("parses the global augment table", () => {
    const html = page(
      `["$","$L9",null,{"initialRows":[{"id":1134,"name":"Draw Your Sword","rarity":"prismatic","icon":"d.png","desc":"Become melee.","tier":"S","rank":1,"wr":57.41,"pr":1.41,"n":3991531,"stages":{"1":{"wr":59.49}}},{"id":5,"name":"Blue Barrier","rarity":"silver","desc":"Shield.","tier":"S","wr":53.07,"pr":0.94,"n":2700000}]}]`,
    );
    const t = parseAugmentTable(html);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toMatchObject({ name: "Draw Your Sword", tier: "S", wr: 57.41, n: 3991531 });
  });

  it("feeds builds, boots, skill order and augments in the engine", () => {
    const data = makeFixtureStaticData();
    const stats = toChampionStats(parseChampionPage(CHAMP_HTML)!, data);
    expect(stats.source).toBe("hexmayhem");
    expect(stats.wins).toBe(Math.round(2672859 * 0.5297));
    expect(stats.boots?.["3020"]).toBeDefined(); // Sorcerer's Shoes split into boots
    expect(stats.items["3089"].pickRate).toBeCloseTo(0.6149);

    const ahri = data.championsById.get("Ahri")!;
    const threat = analyzeEnemies([]);
    const plan = recommendBuild({ data, champion: ahri, threat, stats });
    expect(plan.source).toBe("stats");
    expect(plan.sourceLabel).toContain("HexMayhem");
    expect(plan.order[0].item.id).toBe(6655);

    expect(skillPlanFor(ahri, undefined, stats).max).toEqual(["Q", "W", "E"]);

    // New augments from the data source become known (OCR-matchable + rankable).
    registerAugments([{ name: "Brand New Augment", rarity: "gold", desc: "Gain Ability Power." }]);
    expect(findAugment("Brand New Augment")).toBeDefined();

    const ranked = rankAugments(
      ["Infinite Recursion", "Jeweled Gauntlet", "Draw Your Sword"].map((n) => findAugment(n)!),
      { champion: ahri, threat, stats },
    );
    expect(ranked[0].augment.name).toBe("Infinite Recursion");
    expect(ranked[0].winRate).toMatchObject({ source: "champion", games: 113120 });
    expect(ranked[0].winRate?.pickRate).toBeCloseTo(0.062);
    expect(ranked[ranked.length - 1].augment.name).toBe("Draw Your Sword");
  });
});
