import { describe, expect, it } from "vitest";
import type { Champion, PlayerState } from "../engine/types";
import { damageSplit, nextSkill, pendingPoints, powerOf, shopOf } from "./hudLogic";
import { HUD_DEFAULTS, HUD_WIDGETS, dragToFrac, fracToPx, hudFrac, moveWidget, normalizeHud, normalizeOrder, presetFrac } from "./hudSettings";

const SCREEN = { width: 1920, height: 1080 };
const M = 14;

describe("hud settings migration", () => {
  it("fills a v1 object (preset position only) with defaults and keeps its values", () => {
    const h = normalizeHud({ position: "bottom-left", scale: 1.2, opacity: 0.7, showNextItem: false, showThreats: true, showSkillOrder: false, showBuildPath: true, compact: true });
    expect(h.position).toBe("bottom-left");
    expect(h.x).toBeNull();
    expect(h.y).toBeNull();
    expect(h.scale).toBe(1.2);
    expect(h.showNextItem).toBe(false);
    expect(h.showAugments).toBe(true);
    expect(h.showHint).toBe(true);
    expect(h.showPower).toBe(false); // opt-in widget
    expect(h.order).toEqual(HUD_WIDGETS);
    expect(h.collapsed).toBe(false);
    // falls back to the preset's free position
    expect(hudFrac(h)).toEqual(presetFrac("bottom-left"));
  });

  it("clamps / rejects invalid values", () => {
    const h = normalizeHud({ x: 3, y: -1, scale: 9, opacity: 0, position: "middle" });
    expect(h.x).toBe(1);
    expect(h.y).toBe(0);
    expect(h.scale).toBe(1.6);
    expect(h.opacity).toBe(0.4);
    expect(h.position).toBe(HUD_DEFAULTS.position);
    expect(normalizeHud({ x: 0.5 }).x).toBeNull(); // both or neither
    expect(normalizeHud(null)).toEqual(HUD_DEFAULTS);
  });

  it("uses a saved free position over the preset", () => {
    expect(hudFrac(normalizeHud({ position: "top-left", x: 0.3, y: 0.8 }))).toEqual({ x: 0.3, y: 0.8 });
  });

  it("normalizes and reorders widgets", () => {
    expect(normalizeOrder(["skill", "bogus", "skill", "shop"])).toEqual(["skill", "shop", "path", "threats", "augments", "power"]);
    expect(moveWidget(["shop", "path", "skill"], "path", -1)).toEqual(["path", "shop", "skill"]);
    expect(moveWidget(["shop", "path"], "shop", -1)).toEqual(["shop", "path"]);
    expect(moveWidget(["shop", "path"], "path", 1)).toEqual(["shop", "path"]);
  });
});

describe("hud drag math", () => {
  const size = { width: 300, height: 200 };
  it("round-trips pixels <-> free-space fractions", () => {
    const r = dragToFrac({ left: 700, top: 300, ...size }, SCREEN, M, 0);
    const px = fracToPx(r, size, SCREEN, M);
    expect(px.left).toBeCloseTo(700, 0);
    expect(px.top).toBeCloseTo(300, 0);
  });

  it("snaps to edges and center", () => {
    const right = dragToFrac({ left: SCREEN.width - M - size.width - 10, top: 500, ...size }, SCREEN, M, 18);
    expect(right.x).toBe(1);
    expect(right.snapX).toBe("end");
    const left = dragToFrac({ left: M + 5, top: M + 3, ...size }, SCREEN, M, 18);
    expect(left).toMatchObject({ x: 0, y: 0, snapX: "start", snapY: "start" });
    const center = dragToFrac({ left: (SCREEN.width - size.width) / 2 + 7, top: 100, ...size }, SCREEN, M, 18);
    expect(center.x).toBe(0.5);
    expect(center.snapX).toBe("center");
  });

  it("keeps the panel on screen when dragged past the edges", () => {
    const r = dragToFrac({ left: -500, top: 5000, ...size }, SCREEN, M, 0);
    expect(r.x).toBe(0);
    expect(r.y).toBe(1);
  });

  it("handles a panel larger than the screen", () => {
    expect(dragToFrac({ left: 0, top: 0, width: 4000, height: 100 }, SCREEN, M, 18).x).toBe(0.5);
  });
});

describe("next skill", () => {
  // Q max, then W, R at 6/11/16
  const order = ["Q", "W", "E", "Q", "Q", "R", "Q", "W", "Q", "W", "R", "W", "W", "E", "E", "R", "E", "E"] as const;
  it("follows the plan from the points actually spent", () => {
    expect(nextSkill([...order], { Q: 1, W: 1, E: 0, R: 0 }, 3)).toBe("E");
    expect(nextSkill([...order], { Q: 3, W: 1, E: 1, R: 0 }, 6)).toBe("R");
  });
  it("adapts when the player deviated", () => {
    // Took E early instead of Q: next planned Q point still due.
    expect(nextSkill([...order], { Q: 1, W: 1, E: 2, R: 0 }, 5)).toBe("Q");
  });
  it("respects rank caps", () => {
    // Level 2 can't put a second point in Q yet (cap ceil(2/2) = 1).
    expect(nextSkill(["Q", "Q", "W"], { Q: 1, W: 0, E: 0, R: 0 }, 2)).toBe("W");
  });
  it("returns nothing when no point is available", () => {
    expect(nextSkill([...order], { Q: 1, W: 1, E: 1, R: 0 }, 3)).toBeUndefined();
    expect(pendingPoints({ Q: 1, W: 1, E: 0, R: 0 }, 3)).toBe(1);
    expect(pendingPoints(undefined, 3)).toBe(0);
  });
});

describe("damage split", () => {
  const champ = (id: string, damage: Champion["damage"], archetype = "mage_burst"): PlayerState => ({
    championName: id,
    champion: { id, key: 1, name: id, tags: [], archetype: archetype as Champion["archetype"], damage, ranged: true, traits: { heal: 0, shield: 0, cc: 0 }, icon: "" },
    riotId: id,
    team: "CHAOS",
    level: 1,
    items: [],
    kills: 0,
    deaths: 0,
    assists: 0,
    isMe: false,
  });
  it("is undefined with no known enemies", () => {
    expect(damageSplit([])).toBeUndefined();
  });
  it("sums to 1 and counts true damage", () => {
    const s = damageSplit([champ("Lux", "ap"), champ("Vayne", "ad", "adc_onhit"), champ("Garen", "ad", "bruiser")])!;
    expect(s.ad + s.ap + s.tru).toBeCloseTo(1);
    expect(s.tru).toBeGreaterThan(0.1);
    expect(s.ad).toBeGreaterThan(s.ap);
  });
});

describe("shop contract", () => {
  it("reads derived.shop defensively", () => {
    expect(shopOf(undefined)).toBeUndefined();
    expect(shopOf({})).toBeUndefined();
    expect(shopOf({ shop: { buyNow: "nope" } })).toBeUndefined();
    expect(shopOf({ shop: { phase: "mid", phaseLabel: "Mid game", buyNow: [], tips: [] } })?.phaseLabel).toBe("Mid game");
  });
});

describe("hud power line", () => {
  it("reads team and lane diffs from derived.power and hides when empty", () => {
    expect(powerOf({})).toBeUndefined();
    expect(powerOf({ power: { teamsComparable: false, ally: {}, enemy: {}, diff: { itemGold: 900 } } })).toBeUndefined();
    const p = powerOf({
      power: { teamsComparable: true, ally: {}, enemy: {}, diff: { itemGold: -2100 }, myLane: { lane: "MIDDLE", itemGold: 450, enemy: { championName: "Zed" } } },
    });
    expect(p).toEqual({ team: -2100, lane: { label: "Mid", diff: 450, vs: "Zed" } });
  });
  it("adds the spike line: your next item and enemies close to finishing one", () => {
    const p = powerOf({
      shop: { phase: "mid", phaseLabel: "Mid", buyNow: [], tips: [], saveFor: { itemId: "3089", name: "Rabadon's Deathcap", need: 900 } },
      power: {
        teamsComparable: true,
        ally: { itemGold: 5000 },
        enemy: { itemGold: 5200 },
        diff: { itemGold: -200 },
        builds: [
          { championName: "Zed", toward: { missing: 400 } },
          { championName: "Lux", toward: { missing: 1600 } },
          { championName: "Sona" },
        ],
      },
    });
    expect(p?.spike).toEqual({ next: { name: "Rabadon's Deathcap", need: 900 }, enemyClose: ["Zed"] });
  });
});

describe("HUD presets", () => {
  it("Minimal keeps only the next buy + skill order as icons, Full restores defaults", async () => {
    const { HUD_DEFAULTS, activeHudPreset, hudPreset, normalizeHud } = await import("./hudSettings");
    const custom = normalizeHud({ x: 0.3, y: 0.7, scale: 1.2, showPower: true });
    const min = normalizeHud({ ...custom, ...hudPreset("minimal") });
    expect(min).toMatchObject({ showNextItem: true, showSkillOrder: true, showBuildPath: false, showThreats: false, showAugments: false, showPower: false, showHint: false, compact: true });
    // Position and size are kept.
    expect(min).toMatchObject({ x: 0.3, y: 0.7, scale: 1.2 });
    expect(activeHudPreset(min)).toBe("minimal");
    const full = normalizeHud({ ...min, ...hudPreset("full") });
    expect(activeHudPreset(full)).toBe("full");
    expect(full.showBuildPath).toBe(HUD_DEFAULTS.showBuildPath);
    expect(full.scale).toBe(1.2);
    expect(activeHudPreset(custom)).toBeUndefined();
    expect(activeHudPreset(HUD_DEFAULTS)).toBe("full");
  });
});

describe("death shop view", () => {
  it("expands the HUD with the shop first and on", async () => {
    const { deathView, normalizeHud } = await import("./hudSettings");
    const minimal = normalizeHud({ collapsed: true, compact: true, showNextItem: false, order: ["path", "skill", "shop", "threats", "augments", "power"] });
    const d = deathView(minimal);
    expect(d).toMatchObject({ collapsed: false, compact: false, showNextItem: true });
    expect(d.order[0]).toBe("shop");
    expect(d.order).toHaveLength(6);
    expect(normalizeHud({}).deathShop).toBe(true);
  });
});

describe("HUD fade during play", () => {
  it("wakes for death, augments, a skill point, gold for the next item and the opening", async () => {
    const { hudWakeReason } = await import("./hudLogic");
    const mid = { gameTime: 600 };
    expect(hudWakeReason(mid)).toBeUndefined();
    expect(hudWakeReason({ ...mid, dead: true })).toBe("dead");
    expect(hudWakeReason({ ...mid, augmentCards: true })).toBe("augments");
    expect(hudWakeReason({ ...mid, pendingSkill: 1 })).toBe("skill");
    expect(hudWakeReason({ ...mid, canBuy: true })).toBe("buy");
    expect(hudWakeReason({ gameTime: 30 })).toBe("start");
  });
  it("is on by default", async () => {
    const { normalizeHud } = await import("./hudSettings");
    expect(normalizeHud({})).toMatchObject({ idleDim: true, idleOpacity: 0.2 });
    expect(normalizeHud({ idleDim: false, idleOpacity: 9 })).toMatchObject({ idleDim: false, idleOpacity: 0.6 });
  });
});
