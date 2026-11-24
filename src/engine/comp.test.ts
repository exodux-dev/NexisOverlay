import { describe, expect, it } from "vitest";
import { CHAMPION_KB } from "../data/championKb";
import { AP_ARCHETYPES } from "./staticData";
import { analyzeComp, compAxes, compareComps, pickImpact, type CompChampion } from "./comp";

const c = (id: string): CompChampion => {
  const kb = CHAMPION_KB[id];
  if (!kb) throw new Error(`unknown champion ${id}`);
  return {
    id,
    name: id,
    archetype: kb.a,
    damage: kb.d ?? (AP_ARCHETYPES.includes(kb.a) ? "ap" : "ad"),
    traits: { heal: kb.heal ?? 0, shield: kb.shield ?? 0, cc: kb.cc ?? 0, suppress: kb.sup },
  };
};
const team = (...ids: string[]) => ids.map(c);
const keys = (notes: { key: string }[]) => notes.map((n) => n.key);

describe("analyzeComp", () => {
  it("returns an empty, neutral profile for no champions", () => {
    const p = analyzeComp([], "aram");
    expect(p.count).toBe(0);
    expect(p.damage).toEqual({ ad: 0, ap: 0, true: 0 });
    expect(p.warnings).toEqual([]);
    expect(Object.values(p.scores).every((v) => v === 0)).toBe(true);
  });

  it("keeps every score in 0..1 and damage shares summing to 1", () => {
    for (const t of [team("Malphite", "Amumu", "Leona", "Nautilus", "Sejuani"), team("Ziggs", "Xerath", "Lux", "Velkoz", "Jayce"), team("Jinx")]) {
      const p = analyzeComp(t, "sr");
      for (const v of Object.values(p.scores)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(p.damage.ad + p.damage.ap + p.damage.true).toBeCloseTo(1, 5);
    }
  });

  it("flags an all-physical comp", () => {
    const p = analyzeComp(team("Draven", "Zed", "Talon", "Graves", "Jinx"), "sr");
    expect(p.damage.ad).toBeGreaterThan(0.9);
    expect(p.warnings.find((w) => w.key === "dmg-ad")?.text).toMatch(/All physical damage/);
    expect(keys(p.warnings)).toContain("frontline");
  });

  it("flags an all-magic comp", () => {
    const p = analyzeComp(team("Lux", "Ziggs", "Xerath", "Syndra", "Brand"), "aram");
    expect(p.warnings.find((w) => w.key === "dmg-ap")?.text).toMatch(/magic resist/);
  });

  it("recognizes a heavy poke comp and its waveclear", () => {
    const p = analyzeComp(team("Ziggs", "Xerath", "Jayce", "Ezreal", "Lux"), "aram");
    expect(p.scores.poke).toBeGreaterThan(0.9);
    expect(keys(p.strengths)).toContain("poke");
    expect(keys(p.strengths)).toContain("waveclear");
    expect(keys(p.warnings)).toContain("frontline");
  });

  it("rates a tank/engage comp", () => {
    const p = analyzeComp(team("Malphite", "Amumu", "Leona", "Jinx", "Orianna"), "sr");
    expect(p.scores.frontline).toBeGreaterThan(0.75);
    expect(p.scores.engage).toBeGreaterThan(0.7);
    expect(keys(p.strengths)).toEqual(expect.arrayContaining(["frontline", "engage", "cc"]));
    expect(keys(p.warnings)).not.toContain("frontline");
    expect(p.sources.engage).toEqual(expect.arrayContaining(["Malphite", "Amumu", "Leona"]));
  });

  it("separates early and late comps", () => {
    const early = analyzeComp(team("Renekton", "LeeSin", "Pantheon", "Draven", "Leona"), "sr");
    const late = analyzeComp(team("Kayle", "Kassadin", "Vayne", "Nasus", "Sona"), "sr");
    expect(early.curve.early).toBeGreaterThan(late.curve.early);
    expect(late.curve.late).toBeGreaterThan(early.curve.late);
    expect(keys(early.warnings)).toContain("late");
    expect(keys(late.warnings)).toContain("early");
    expect(keys(late.strengths)).toContain("late");
  });

  it("does not warn about missing pieces while the team is mostly unknown", () => {
    const p = analyzeComp(team("Jinx", "Lux"), "sr");
    expect(keys(p.warnings)).not.toContain("frontline");
    expect(keys(p.warnings)).not.toContain("engage");
  });

  it("uses mode-specific axes and team size", () => {
    expect(compAxes("sr")).toContain("splitpush");
    expect(compAxes("aram")).not.toContain("splitpush");
    expect(compAxes("arena")).not.toContain("waveclear");
    // One tank fills an Arena duo's frontline but not a 5v5 one.
    expect(analyzeComp(team("Malphite", "Jinx"), "arena").scores.frontline).toBe(1);
    expect(analyzeComp(team("Malphite", "Jinx"), "sr").scores.frontline).toBeLessThan(0.6);
  });

  it("counts true damage", () => {
    const p = analyzeComp(team("Vayne", "Fiora", "Camille", "Lux", "Leona"), "sr");
    expect(p.damage.true).toBeGreaterThan(0.12);
    expect(keys(p.strengths)).toContain("dmg-true");
  });
});

describe("compareComps", () => {
  it("is empty until both teams are known", () => {
    const a = analyzeComp(team("Jinx", "Leona", "Lux", "Darius", "Amumu"), "aram");
    expect(compareComps(a, analyzeComp([], "aram"))).toEqual([]);
  });

  it("reports scaling, engage and damage differences", () => {
    const ally = analyzeComp(team("Renekton", "LeeSin", "Pantheon", "Draven", "Janna"), "sr");
    const enemy = analyzeComp(team("Kayle", "Malphite", "Kassadin", "Vayne", "Leona"), "sr");
    const notes = compareComps(ally, enemy);
    const k = keys(notes);
    expect(k).toContain("vs-late");
    expect(notes.find((n) => n.key === "vs-late")?.tone).toBe("warn");
    expect(k).toContain("vs-early");
    expect(notes.find((n) => n.key === "vs-early")?.tone).toBe("good");
    expect(k).toContain("vs-engage");
    expect(notes.find((n) => n.key === "vs-engage")?.text).toMatch(/Enemy has more engage/);
    // No timers or real-time commands.
    for (const n of notes) expect(n.text).not.toMatch(/\d+:\d\d|seconds|in \d+ ?s/);
  });

  it("calls out heavy enemy poke against low sustain", () => {
    const ally = analyzeComp(team("Zed", "Talon", "Draven", "Darius", "Graves"), "aram");
    const enemy = analyzeComp(team("Ziggs", "Xerath", "Jayce", "Ezreal", "Lux"), "aram");
    expect(compareComps(ally, enemy).find((n) => n.key === "vs-poke")?.text).toMatch(/consider sustain/);
  });
});

describe("pickImpact", () => {
  it("shows what a tank adds to a squishy team", () => {
    const t = team("Jinx", "Lux", "Ziggs", "Ahri", "Zed");
    const imp = pickImpact(t, c("Zed"), c("Malphite"), "aram");
    expect(imp.deltas[0].delta).toBeGreaterThan(0);
    expect(imp.summary).toMatch(/\+Frontline/);
    expect(imp.summary).toMatch(/\+Engage/);
    expect(keys(imp.fixes)).toContain("frontline");
  });

  it("notes when a pick fixes a one-sided damage profile", () => {
    const t = team("Draven", "Zed", "Talon", "Graves", "Jinx");
    const imp = pickImpact(t, c("Talon"), c("Syndra"), "sr");
    expect(imp.summary).toMatch(/adds magic damage/);
  });

  it("treats a teammate trade as no change", () => {
    const t = team("Jinx", "Lux", "Malphite", "Ahri", "Zed");
    const imp = pickImpact(t, c("Zed"), c("Malphite"), "aram");
    expect(imp.deltas).toEqual([]);
    expect(imp.summary).toBe("");
  });

  it("adds the candidate when you have no champion yet", () => {
    const imp = pickImpact(team("Jinx", "Lux"), undefined, c("Leona"), "sr");
    expect(imp.summary).toMatch(/\+Frontline|\+Engage/);
  });
});
