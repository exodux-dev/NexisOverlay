import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../../dev/fixture";
import {
  compareTierRows,
  findTierRow,
  letterTier,
  opggTier,
  parseTierList,
  resolveChampionId,
  rowsForPosition,
  tierListPatch,
  tierListUrl,
} from "./tierlists";

// Synthetic, trimmed fixtures reproducing the real page structure (Nov 2026): both sites are
// Next.js apps that embed their data as RSC payload chunks (`self.__next_f.push([1,"..."])`).

const data = makeFixtureStaticData();
const rsc = (...payloads: string[]) => `<html><body>${payloads.map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`).join("")}</body></html>`;
/** Split a payload across two chunks, like Next.js does for long pages. */
const split = (p: string) => rsc(p.slice(0, Math.floor(p.length / 2)), p.slice(Math.floor(p.length / 2)));

const HM = `2:["$","div",null,{"className":"wrap","children":["$","$L9",null,{"initialRows":${JSON.stringify([
  { id: 157, name: "the Unforgiven", title: "Yasuo", alias: "Yasuo", roles: ["Fighter"], tier: "S", rank: 1, wr: 59.51, pr: 11.54, n: 5018392, potential: { estimate: 58 } },
  { id: 62, name: "the Monkey King", title: "Wukong", alias: "MonkeyKing", tier: "B", rank: 70, wr: 50.1, pr: 3.2, n: 900000 },
  { id: 96, title: "Kog'Maw", alias: "KogMaw", tier: "D", rank: 170, wr: 44.2, pr: 1.1, n: 300000 },
  { id: 99999, title: "Newchamp", alias: "Newchamp", tier: "A", rank: 20, wr: 53, pr: 2, n: 1000 },
  { title: "Broken row" },
])},"patch":"16.22"}]}]`;

const ARAM = `5:["$","$L58",null,{"champions":${JSON.stringify([
  { key: "aatrox", name: "Aatrox", image_url: "x", id: 266, is_rotation: false, is_rip: false, win_rate: 0.455764, pick_rate: 0.0415475, tier: 4, rank: 156 },
  { key: "velkoz", name: "Vel'Koz", image_url: "x", id: 161, win_rate: 0.5385, pick_rate: 0.1079, tier: 1, rank: 1 },
  { key: "monkeyking", name: "Wukong", image_url: "x", id: 62, win_rate: 0.51, pick_rate: 0.03, tier: 2, rank: 40 },
  { key: "yorick", name: "Yorick", image_url: "x", id: 83, win_rate: 0.47, pick_rate: 0.01, tier: 5, rank: 170 },
])},"region":"global"}]`;

const SR_ROWS = [
  { key: "ahri", name: "Ahri", positionName: "MID", positionWinRate: 51.6465, positionPickRate: 11.3454, positionBanRate: 3.77073, positionTierData: { tier: 0, rank: 1 }, positionTier: 0, positionRank: 1, positionCounters: [] },
  { key: "malphite", name: "Malphite", positionName: "TOP", positionWinRate: 51.7611, positionPickRate: 6.78886, positionBanRate: 17.5719, positionTier: 1, positionRank: 1 },
  { key: "malphite", name: "Malphite", positionName: "MID", positionWinRate: 48.8992, positionPickRate: 0.5, positionBanRate: 17.5719, positionTier: 4, positionRank: 40 },
  { key: "kogmaw", name: "Kog'Maw", positionName: "ADC", positionWinRate: 54.1536, positionPickRate: 2.16473, positionBanRate: 0.771633, positionTier: 1, positionRank: 3 },
  { key: "monkeyking", name: "Wukong", positionName: "JUNGLE", positionWinRate: 52.2, positionPickRate: 6.95, positionBanRate: 6.07, positionTier: 2, positionRank: 4 },
  { key: "leona", name: "Leona", positionName: "SUPPORT", positionWinRate: 51.61, positionPickRate: 8.39, positionBanRate: 9.94, positionTier: 3, positionRank: 9 },
  { key: "zilean", name: "Zilean", positionName: "SUPPORT", positionWinRate: 48, positionPickRate: 1, positionBanRate: 0.2, positionTier: 5, positionRank: 47 },
];
// The champion picker list (also `"data":[...]`-adjacent) must not be mistaken for the tier rows.
const SR = `9:["$","$L12",null,{"data":[{"key":"aatrox","id":266,"name":"Aatrox","positions":["TOP"]}],"region":"global"}]
22:["$","$L2a",null,{"data":${JSON.stringify(SR_ROWS)},"meta":{"patch":"16.23"}}]`;

describe("tierListUrl", () => {
  it("builds the per-mode urls", () => {
    expect(tierListUrl("mayhem")).toBe("https://hexmayhem.com/champions");
    expect(tierListUrl("aram")).toBe("https://op.gg/lol/modes/aram");
    expect(tierListUrl("sr")).toBe("https://op.gg/lol/champions");
    expect(tierListUrl("sr", "UTILITY")).toBe("https://op.gg/lol/champions?position=support");
    expect(tierListUrl("sr", "bottom")).toBe("https://op.gg/lol/champions?position=adc");
    expect(tierListUrl("aram", "top")).toBe("https://op.gg/lol/modes/aram");
  });
});

describe("tier helpers", () => {
  it("maps site tiers to letters", () => {
    expect([0, 1, 2, 3, 4, 5].map(opggTier)).toEqual(["S", "S", "A", "B", "C", "D"]);
    expect(opggTier("OP")).toBe("S");
    expect(opggTier(undefined)).toBeUndefined();
    expect(["S+", "a", "B-", "C", "D", "F", "OP", "?"].map(letterTier)).toEqual(["S", "A", "B", "C", "D", "D", "S", undefined]);
  });
  it("resolves champion keys to Data Dragon ids", () => {
    expect(resolveChampionId(62, data)).toBe("MonkeyKing");
    expect(resolveChampionId("62", data)).toBe("MonkeyKing");
    expect(resolveChampionId("monkeyking", data)).toBe("MonkeyKing");
    expect(resolveChampionId("Wukong", data)).toBe("MonkeyKing");
    expect(resolveChampionId("Kog'Maw", data)).toBe("KogMaw");
    expect(resolveChampionId("chogath", data)).toBe("Chogath");
    expect(resolveChampionId("nope", data)).toBeUndefined();
    expect(resolveChampionId("", data)).toBeUndefined();
  });
});

describe("parseTierList", () => {
  it("parses the HexMayhem champion table (ARAM: Mayhem)", () => {
    const rows = parseTierList("mayhem", split(HM), data);
    expect(rows.map((r) => r.championKey)).toEqual(["Yasuo", "MonkeyKing", "KogMaw", "Newchamp"]);
    expect(rows[0]).toEqual({ championKey: "Yasuo", tier: "S", winRate: 0.5951, pickRate: 0.1154, games: 5018392, rank: 1 });
    expect(rows[2].tier).toBe("D");
    expect(tierListPatch(rsc(HM))).toBe("16.22");
  });

  it("parses the OP.GG ARAM table", () => {
    const rows = parseTierList("aram", rsc(ARAM), data);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.championKey === "Velkoz")).toEqual({ championKey: "Velkoz", tier: "S", winRate: 0.5385, pickRate: 0.1079, rank: 1 });
    expect(rows.find((r) => r.championKey === "Aatrox")).toMatchObject({ tier: "C", winRate: 0.4558, pickRate: 0.0415 });
    expect(rows.find((r) => r.championKey === "MonkeyKing")?.tier).toBe("A");
    expect(rows.find((r) => r.championKey === "Yorick")?.tier).toBe("D");
  });

  it("parses the OP.GG Summoner's Rift table with roles", () => {
    const rows = parseTierList("sr", split(SR), data);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toEqual({ championKey: "Ahri", tier: "S", winRate: 0.5165, position: "mid", pickRate: 0.1135, banRate: 0.0377, rank: 1 });
    expect(rowsForPosition(rows, "TOP").map((r) => r.championKey)).toEqual(["Malphite"]);
    expect(rowsForPosition(rows, "utility").map((r) => r.championKey)).toEqual(["Leona", "Zilean"]);
    expect(rowsForPosition(rows).length).toBe(7);
    expect(rows.find((r) => r.championKey === "MonkeyKing")).toMatchObject({ position: "jungle", tier: "A" });
    expect(tierListPatch(rsc(SR))).toBe("16.23");
  });

  it("finds a champion's row by role, falling back to its main role", () => {
    const rows = parseTierList("sr", rsc(SR), data);
    expect(findTierRow(rows, "Malphite", "middle")?.tier).toBe("C");
    expect(findTierRow(rows, "Malphite", "jungle")?.position).toBe("top");
    expect(findTierRow(rows, "Malphite")?.position).toBe("top");
    expect(findTierRow(rows, "Yasuo")).toBeUndefined();
    expect(findTierRow(undefined, "Ahri")).toBeUndefined();
  });

  it("sorts best-first", () => {
    const rows = parseTierList("aram", rsc(ARAM), data).sort(compareTierRows);
    expect(rows.map((r) => r.championKey)).toEqual(["Velkoz", "MonkeyKing", "Aatrox", "Yorick"]);
  });

  it("returns [] when the page changed or is the wrong page", () => {
    expect(parseTierList("aram", "<html>Not found</html>", data)).toEqual([]);
    expect(parseTierList("mayhem", rsc('1:{"initialRows":"$undefined"}'), data)).toEqual([]);
    expect(parseTierList("sr", rsc(ARAM), data)).toEqual([]);
    expect(parseTierList("aram", rsc(SR), data)).toEqual([]);
    expect(parseTierList("sr", rsc('2:{"data":[{"key":"ahri","positionName":"MID"}'), data)).toEqual([]);
  });
});
