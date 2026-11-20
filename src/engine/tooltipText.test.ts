import { describe, expect, it } from "vitest";
import {
  abilityBody,
  abilityCost,
  abilityRange,
  abilityValues,
  cleanGameText,
  countUnknown,
  formatRanks,
  parseBurn,
  parseRichText,
  resolveExpression,
  resolvePlaceholders,
  segmentsToText,
} from "./tooltipText";

// Real Data Dragon strings (patch 16.x) used as fixtures.
const AHRI_Q = {
  description: "Ahri sends out and pulls back her orb, dealing magic damage on the way out and true damage on the way back. ",
  tooltip:
    "Ahri throws then pulls back her orb, dealing <magicDamage>{{ totaldamage }} magic damage</magicDamage> on the way out and <trueDamage>{{ totaldamage }} true damage</trueDamage> on the way back.{{ spellmodifierdescriptionappend }}",
  cooldown: [7, 7, 7, 7, 7],
  cooldownBurn: "7",
  cost: [55, 65, 75, 85, 95],
  costBurn: "55/65/75/85/95",
  costType: " {{ abilityresourcename }}",
  resource: "{{ cost }} {{ abilityresourcename }}",
  range: [970, 970, 970, 970, 970],
  rangeBurn: "970",
  effectBurn: [null, "0", "0"],
  datavalues: {},
  vars: [],
};
const ELECTROCUTE_LONG =
  "Hitting a champion with 3 <b>separate</b> attacks or abilities within 3s deals bonus <lol-uikit-tooltipped-keyword key='LinkTooltip_Description_AdaptiveDmg'><font color='#48C4B7'>adaptive damage</font></lol-uikit-tooltipped-keyword>.<br><br>Damage: 70 - 240 (+0.1 bonus AD, +0.05 AP) damage.<br>Cooldown: 20s<br><br><i>'We called them the Thunderlords, for to speak of their lightning was to invite disaster.'</i>";

describe("cleanGameText", () => {
  it("strips Data Dragon tags and keeps line breaks", () => {
    expect(cleanGameText(ELECTROCUTE_LONG)).toBe(
      "Hitting a champion with 3 separate attacks or abilities within 3s deals bonus adaptive damage.\n\nDamage: 70 - 240 (+0.1 bonus AD, +0.05 AP) damage.\nCooldown: 20s\n\n'We called them the Thunderlords, for to speak of their lightning was to invite disaster.'",
    );
  });
  it("decodes entities and collapses whitespace", () => {
    expect(cleanGameText("  Gain&nbsp;<speed>30%   Move Speed</speed> &amp; more  ")).toBe("Gain 30% Move Speed & more");
  });
  it("caps blank lines and trims leading / trailing breaks", () => {
    expect(cleanGameText("<br><br>One<br><br><br><br>Two<br>")).toBe("One\n\nTwo");
  });
  it("treats block tags as line breaks", () => {
    expect(cleanGameText("<mainText><stats>+40 AP</stats><li>First</li><li>Second</li></mainText>")).toBe("+40 AP\nFirst\nSecond");
  });
  it("leaves stray < and @ characters alone", () => {
    expect(cleanGameText("Below < 50% Health, deal 2x @ range")).toBe("Below < 50% Health, deal 2x @ range");
  });
});

describe("parseRichText", () => {
  it("maps damage tags to styled kinds", () => {
    const segs = parseRichText("Deals <magicDamage>80 magic damage</magicDamage> and <physicalDamage>40 physical</physicalDamage>.");
    expect(segs).toEqual([
      { t: "Deals " },
      { t: "80 magic damage", k: "magic" },
      { t: " and " },
      { t: "40 physical", k: "physical" },
      { t: "." },
    ]);
  });
  it("nests font/span inside a styled tag without losing the outer kind", () => {
    const segs = parseRichText("<status>Stun <font color='#fff'>1s</font> more</status> end");
    expect(segs.filter((s) => s.k === "status").map((s) => s.t).join("")).toBe("Stun 1s more");
    expect(segs[segs.length - 1]).toEqual({ t: " end" });
  });
  it("styles scale tags and flavour text", () => {
    const segs = parseRichText("(<scaleAP>+60% AP</scaleAP>) <i>'quote'</i>");
    expect(segs.find((s) => s.k === "scale")?.t).toBe("+60% AP");
    expect(segs.find((s) => s.k === "flavor")?.t).toBe("'quote'");
  });
});

describe("placeholders", () => {
  it("resolves known values and shows ? for unpublished ones", () => {
    const segs = parseRichText(AHRI_Q.tooltip, abilityValues(AHRI_Q, "Mana"));
    expect(segmentsToText(segs)).toBe("Ahri throws then pulls back her orb, dealing ? magic damage on the way out and ? true damage on the way back.");
    expect(countUnknown(segs)).toBe(2);
    expect(segs.find((s) => s.k === "unknown")).toEqual({ t: "?", k: "unknown" });
  });
  it("drops spellmodifierdescriptionappend", () => {
    expect(resolvePlaceholders("Text.{{ spellmodifierdescriptionappend }}")).toBe("Text.");
  });
  it("resolves effectBurn, per-rank arrays, multipliers and spell-prefixed names", () => {
    const vals = { e1: "60/90/120", cost: [50, 60, 70], slowamount: 0.3, briarcost: 0.04 };
    expect(resolvePlaceholders("Deals {{ e1 }} damage for {{ cost }} Mana", vals)).toBe("Deals 60/90/120 damage for 50/60/70 Mana");
    expect(resolvePlaceholders("Slows by {{ slowamount*100 }}%", vals)).toBe("Slows by 30%");
    expect(resolvePlaceholders("Costs {{ spell.briarp:briarcost*100 }}% Health", vals)).toBe("Costs 4% Health");
    expect(resolvePlaceholders("Reduced by {{ slowamount*-100 }}%", vals)).toBe("Reduced by -30%");
  });
  it("is case-insensitive about names and tolerant of spacing", () => {
    expect(resolvePlaceholders("{{cost}} / {{ COST }}", { cost: 5 })).toBe("5 / 5");
  });
  it("handles rune @placeholders@", () => {
    expect(resolvePlaceholders("Heal for @HealAmount@ (@f3@)", { healamount: 40 })).toBe("Heal for 40 (?)");
  });
  it("resolveExpression returns undefined for unknown / malformed values", () => {
    expect(resolveExpression("totaldamage", {})).toBeUndefined();
    expect(resolveExpression("a + b", { a: 1 })).toBeUndefined();
    expect(resolveExpression("x*2", { x: "10/20" })).toBe("20/40");
    expect(resolveExpression("x*2", { x: "Mana" })).toBeUndefined();
  });
  it("never resolves Object.prototype members", () => {
    expect(resolveExpression("constructor", {})).toBeUndefined();
    expect(resolveExpression("__proto__*2", {})).toBeUndefined();
    expect(resolvePlaceholders("Deals {{ constructor }} damage")).toBe("Deals ? damage");
  });
  it("turns vars with links into scaling text", () => {
    const vals = abilityValues({ vars: [{ key: "a1", coeff: 0.6, link: "spelldamage" }, { key: "a2", coeff: [0.1, 0.2], link: "weird" }] });
    expect(vals.a1).toBe("60% AP");
    expect(vals.a2).toBe("0.1/0.2");
  });
});

describe("ability helpers", () => {
  it("formats ranks, collapsing identical values", () => {
    expect(formatRanks([7, 7, 7])).toBe("7");
    expect(formatRanks([9, 8, 7.5])).toBe("9/8/7.5");
    expect(formatRanks([0.1 + 0.2])).toBe("0.3");
    expect(formatRanks([])).toBe("?");
  });
  it("parses burn strings", () => {
    expect(parseBurn("9/8/7/6/5")).toEqual([9, 8, 7, 6, 5]);
    expect(parseBurn("7")).toEqual([7]);
    expect(parseBurn("n/a")).toEqual([]);
    expect(parseBurn(undefined)).toEqual([]);
  });
  it("builds the cost line from resource + champion resource name", () => {
    expect(abilityCost(AHRI_Q, "Mana")).toBe("55/65/75/85/95 Mana");
    expect(abilityCost({ resource: "No Cost", costBurn: "0" })).toBeUndefined();
    expect(abilityCost({ resource: "{{ cost }} {{ abilityresourcename }}", cost: [0, 0], costBurn: "0" }, "Mana")).toBeUndefined();
    expect(abilityCost({ resource: "{{ hpcost*100 }}% of current Health ({{ healthcosttooltip }})" })).toBe("?% of current Health (?)");
    expect(abilityCost({ resource: "{{ cost }} Mana per Second", cost: [5, 10] })).toBe("5/10 Mana per Second");
  });
  it("formats range", () => {
    expect(abilityRange({ rangeBurn: "970" })).toBe("970");
    expect(abilityRange({ rangeBurn: "25000" })).toBe("Global");
    expect(abilityRange({ rangeBurn: "self" })).toBe("Self");
    expect(abilityRange({ rangeBurn: "0" })).toBeUndefined();
  });
  it("prefers the tooltip only when every value resolves", () => {
    expect(segmentsToText(abilityBody(AHRI_Q, "Mana"))).toBe(AHRI_Q.description.trim());
    const resolved = { ...AHRI_Q, tooltip: "Deals <magicDamage>{{ e1 }} magic damage</magicDamage>.", effectBurn: [null, "40/60/80"] };
    expect(abilityBody(resolved, "Mana")).toEqual([{ t: "Deals " }, { t: "40/60/80 magic damage", k: "magic" }, { t: "." }]);
    expect(segmentsToText(abilityBody({ tooltip: "Only {{ x }}" }))).toBe("Only ?");
  });
});
