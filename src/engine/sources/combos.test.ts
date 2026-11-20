import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../../dev/fixture";
import { AUGMENTS, combosFor, comboBonus, findAugment, rankAugments, rerollAdvice, scoreAugment, synergiesFor, type AugmentScore } from "../augments";
import { COMBOS_URL, parseCombos, parseCombosPatch, type AugmentCombo } from "./combos";

/** Wrap RSC payload text the way Next.js embeds it in a page. */
function page(...payloads: string[]): string {
  return `<html><body>${payloads.map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`).join("")}</body></html>`;
}

// Shape copied from the real hexmayhem.com/must-play payload (trimmed, synthetic numbers).
const ROWS = [
  `{"cid":157,"aid":3048,"arch":"crit","items":[{"id":3046,"name":"Phantom Dancer","icon":"a.png"},{"id":123430,"name":"Rite of Ruin","icon":"b.png"},{"id":6333,"name":"Death's Dance","icon":"c.png"}],"n":3600,"wr":80.5,"lift":19.7,"cold":true,"rank":1,"champ":{"name":"Yasuo","slug":"yasuo"},"aug":{"name":"Bouncing Bees","icon":"x.png","rarity":"prismatic"}}`,
  `{"cid":11,"aid":1095,"arch":"crit","items":[{"id":2517,"name":"Endless Hunger","icon":"d.png"}],"n":7551,"wr":68.26,"lift":9.1,"cold":false,"rank":2,"champ":{"name":"Master Yi","slug":"masteryi"},"aug":{"name":"Weapon of Destiny","icon":"y.png","rarity":"gold"}}`,
  `{"broken":true}`,
  `{"aug":{"name":"Mystic Punch"},"wr":"bad","champ":{"slug":"yone"}}`,
].join(",");
const TABLE = `b:["$","$Lf",null,{"rows":[${ROWS}]}]`;
const HEAD = `["Patch"," ","16.22"," (","2026-11-15",") ·"]`;

describe("God-Tier Combos parser", () => {
  it("points at the combos page", () => {
    expect(COMBOS_URL).toBe("https://hexmayhem.com/must-play");
  });

  it("parses combo rows split across RSC chunks", () => {
    const html = page(HEAD, TABLE.slice(0, 200), TABLE.slice(200));
    const combos = parseCombos(html);
    expect(combos).toHaveLength(3);
    expect(combos[0]).toMatchObject({
      augments: ["Bouncing Bees"],
      items: [3046, 123430, 6333],
      champions: ["yasuo"],
      championNames: ["Yasuo"],
      winRate: 0.805,
      games: 3600,
      lift: 19.7,
      build: "crit",
      hidden: true,
      rank: 1,
    });
    expect(combos[0].note).toContain("Crit build");
    expect(combos[0].note).toContain("hidden gem");
    expect(combos[1].champions).toEqual(["masteryi"]);
    // A row with an unparsable win rate keeps its augment but drops the number.
    expect(combos[2]).toMatchObject({ augments: ["Mystic Punch"], champions: ["yone"] });
    expect(combos[2].winRate).toBeUndefined();
    expect(parseCombosPatch(html)).toBe("16.22");
  });

  it("returns [] when the layout changes", () => {
    expect(parseCombos("")).toEqual([]);
    expect(parseCombos("<html><body>nothing here</body></html>")).toEqual([]);
    expect(parseCombos(page(`{"rows":[{"foo":1}]}`))).toEqual([]);
    expect(parseCombos(page(`{"rows":"not an array"}`))).toEqual([]);
  });

  it("accepts multi-augment rows from other sources", () => {
    const html = page(`{"rows":[{"augs":[{"name":"Eureka"},"Mystic Punch"],"winRate":0.58,"games":900}]}`);
    expect(parseCombos(html)).toEqual([{ augments: ["Eureka", "Mystic Punch"], winRate: 0.58, games: 900 }]);
  });
});

describe("combo synergies + reroll advice", () => {
  const data = makeFixtureStaticData();
  const yasuo = data.championsById.get("Yasuo")!;
  const combos: AugmentCombo[] = [
    { augments: ["Bouncing Bees"], champions: ["yasuo"], championNames: ["Yasuo"], winRate: 0.8, games: 3600 },
    { augments: ["Eureka", "Mystic Punch"], winRate: 0.58, games: 2000 },
    { augments: ["Weapon of Destiny"], champions: ["masteryi"], winRate: 0.68 },
  ];

  it("bonus scales with win rate between +0.06 and +0.12", () => {
    expect(comboBonus(0.5)).toBeCloseTo(0.06);
    expect(comboBonus(0.65)).toBeCloseTo(0.09);
    expect(comboBonus(0.9)).toBeCloseTo(0.12);
    expect(comboBonus()).toBeCloseTo(0.06);
  });

  it("finds champion combos and combos completed by owned augments", () => {
    const champ = synergiesFor("Bouncing Bees", { combos, champion: yasuo });
    expect(champ[0]).toMatchObject({ kind: "champion", reason: "God-tier combo on Yasuo · 80% WR" });
    expect(synergiesFor("Weapon of Destiny", { combos, champion: yasuo })).toEqual([]);

    const owned = synergiesFor(findAugment("Mystic Punch")!, { combos, owned: ["Eureka"] });
    expect(owned[0]).toMatchObject({ kind: "owned", partners: ["Eureka"], reason: "Combo with Eureka · 58% WR" });
    expect(synergiesFor("Mystic Punch", { combos, owned: [] })).toEqual([]);
    expect(synergiesFor("Mystic Punch", { owned: ["Eureka"] })).toEqual([]);

    expect(combosFor({ combos, champion: yasuo, owned: ["Eureka"] }).map((c) => c.augments[0])).toEqual(["Bouncing Bees", "Eureka"]);
  });

  it("adds the combo bonus and reason to the score, without changing anything when absent", () => {
    const bees = findAugment("Bouncing Bees")!;
    const base = scoreAugment(bees, { champion: yasuo });
    const withCombo = scoreAugment(bees, { champion: yasuo, combos });
    expect(withCombo.score).toBeGreaterThan(base.score);
    expect(withCombo.score - base.score).toBeLessThanOrEqual(0.12 + 1e-9);
    expect(withCombo.reasons[0]).toBe("God-tier combo on Yasuo · 80% WR");
    expect(scoreAugment(bees, { champion: yasuo, combos: [] })).toEqual(base);
    // Already owned: no combo bonus for taking it twice.
    expect(scoreAugment(bees, { champion: yasuo, combos, owned: ["Bouncing Bees"] }).reasons[0]).not.toContain("combo");
  });

  it("recommends a reroll only for weak offers", () => {
    const ctx = { champion: yasuo };
    const all = rankAugments([...AUGMENTS], ctx);
    const byGrade = (g: AugmentScore["grade"]) => all.find((s) => s.grade === g)!;
    expect(rerollAdvice([])).toBeNull();
    expect(rerollAdvice([byGrade("D")])).toBeNull();
    expect(rerollAdvice([byGrade("C"), byGrade("D"), byGrade("D")])?.reroll).toBe(true);
    expect(rerollAdvice([byGrade("B"), byGrade("D"), byGrade("D")])?.reroll).toBe(true);
    expect(rerollAdvice([byGrade("B"), byGrade("C"), byGrade("D")])?.reroll).toBe(false);
    const keep = rerollAdvice([byGrade("S"), byGrade("D"), byGrade("D")])!;
    expect(keep.reroll).toBe(false);
    expect(keep.reason).toContain(byGrade("S").augment.name);
  });
});
