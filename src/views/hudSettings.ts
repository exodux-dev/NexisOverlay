// In-game mini HUD layout options (settings.hud). Read defensively so older settings files
// (and a store that doesn't type `hud` yet) still get a complete, valid object.

export type HudPosition = "top-right" | "top-left" | "right-middle" | "bottom-left";

/** HUD widgets, drawn top to bottom in `order`. */
export type HudWidget = "shop" | "path" | "skill" | "threats" | "augments" | "power";

export interface HudSettings {
  /** Preset anchor (v1). Used when no free position (`x`/`y`) has been saved yet. */
  position: HudPosition;
  /**
   * Free position from the layout editor, as fractions (0..1) of the *free space* around the
   * panel: 0 = flush with the left/top margin, 1 = flush with the right/bottom margin. So a panel
   * docked right stays docked right whatever its size or the screen resolution. null = use `position`.
   */
  x: number | null;
  y: number | null;
  /** Size multiplier, 0.7..1.6. */
  scale: number;
  /** Panel background opacity, 0.4..1 (text stays fully opaque). */
  opacity: number;
  /** Widget toggles (key names kept from v1 so stored settings keep working). */
  showNextItem: boolean;
  showThreats: boolean;
  showSkillOrder: boolean;
  showBuildPath: boolean;
  showAugments: boolean;
  /** Team power line (team item-gold diff + your lane). Off by default. */
  showPower: boolean;
  /** "Ctrl+Shift+Space for full view" footer. */
  showHint: boolean;
  /** Mostly see-through during normal play; fully visible when it matters (see hudWakeReason). */
  idleDim: boolean;
  /** Panel opacity while faded, 0.05..0.6. */
  idleOpacity: number;
  /** Glowing arrow over League's own ability bar on the ability to level next. */
  levelArrows: boolean;
  /** Where League's Q W E R sit: horizontal center (fraction of width), vertical center (fraction
   *  of height) and the distance between two abilities (fraction of height; League's HUD scales with height). */
  barX: number;
  barY: number;
  barGap: number;
  /** Extra text: shop tips, why an item is suggested, the game phase label. Off by default. */
  showTips: boolean;
  /** While you're dead: expand the HUD with the shop first ("shop now"). */
  deathShop: boolean;
  /** ~8 s reminder to mark your augment pick in Nexis when an offer is detected. */
  pickReminder: boolean;
  /** Draw order of the widgets. */
  order: HudWidget[];
  /** Icons only, no labels. */
  compact: boolean;
  /** Collapsed to a tiny pill (next buy only). */
  collapsed: boolean;
  /** When the mouse is over the panel in game: keep it, fade it, or hide it. */
  hoverMode: HudHoverMode;
  /** Panel opacity while the mouse is over it ("fade"), 0.05..0.9. */
  hoverOpacity: number;
}

export type HudHoverMode = "off" | "fade" | "hide";
export const HUD_HOVER_OPACITY = { min: 0.05, max: 0.9 } as const;
export const HUD_IDLE_OPACITY = { min: 0.05, max: 0.6 } as const;
export const BAR = { x: { min: 0.3, max: 0.7 }, y: { min: 0.75, max: 0.995 }, gap: { min: 0.025, max: 0.09 } } as const;

/** Screen position (px) of League's Q / W / E / R from the calibration (`barX` / `barY` / `barGap`). */
export function abilitySlot(h: Pick<HudSettings, "barX" | "barY" | "barGap">, key: "Q" | "W" | "E" | "R", width: number, height: number): { x: number; y: number; size: number } {
  const i = ["Q", "W", "E", "R"].indexOf(key);
  const gap = h.barGap * height;
  return { x: h.barX * width + (i - 1.5) * gap, y: h.barY * height, size: gap * 0.85 };
}

export const HUD_WIDGETS: HudWidget[] = ["shop", "path", "skill", "threats", "augments", "power"];

export const HUD_DEFAULTS: HudSettings = {
  position: "top-right",
  x: null,
  y: null,
  scale: 1,
  opacity: 0.92,
  showNextItem: true,
  showThreats: false,
  showSkillOrder: true,
  showBuildPath: false,
  showAugments: true,
  showPower: false,
  showHint: false,
  pickReminder: true,
  deathShop: true,
  showTips: false,
  levelArrows: true,
  barX: 0.497,
  barY: 0.935,
  barGap: 0.05,
  idleDim: true,
  idleOpacity: 0.2,
  order: [...HUD_WIDGETS],
  compact: false,
  collapsed: false,
  hoverMode: "off",
  hoverOpacity: 0.25,
};

export const HUD_SCALE = { min: 0.7, max: 1.6 } as const;
export const HUD_OPACITY = { min: 0.4, max: 1 } as const;

export const HUD_POSITIONS: Array<{ value: HudPosition; label: string }> = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "right-middle", label: "Right middle" },
  { value: "bottom-left", label: "Bottom left" },
];

/** The settings toggle that switches a widget on. */
export const WIDGET_FLAG: Record<HudWidget, keyof Pick<HudSettings, "showNextItem" | "showBuildPath" | "showSkillOrder" | "showThreats" | "showAugments" | "showPower">> = {
  shop: "showNextItem",
  path: "showBuildPath",
  skill: "showSkillOrder",
  threats: "showThreats",
  augments: "showAugments",
  power: "showPower",
};

/** The HUD while you're dead: full size, shop first and on (other widgets as you set them). */
export function deathView(h: HudSettings): HudSettings {
  return { ...h, collapsed: false, compact: false, showNextItem: true, order: ["shop", ...h.order.filter((w) => w !== "shop")] };
}

export type HudPreset = "minimal" | "standard" | "full";

/** The widget set the HUD used to show by default (before the leaner "standard"). */
export const HUD_FULL_WIDGETS = { showNextItem: true, showSkillOrder: true, showBuildPath: true, showThreats: true, showAugments: true, showPower: false, showHint: true } as const;

/**
 * Widget / look settings a preset sets (position, size, opacity and hover mode are kept).
 * Minimal: next buy + skills as icons. Standard (default): next buy, skills, augments — only what's
 * worth a glance. Full: every widget, tips and the hint line.
 */
export function hudPreset(p: HudPreset): Partial<HudSettings> {
  if (p === "minimal")
    return { showNextItem: true, showSkillOrder: true, showBuildPath: false, showThreats: false, showAugments: false, showPower: false, showHint: false, showTips: false, compact: true, collapsed: false };
  if (p === "standard")
    return { showNextItem: true, showSkillOrder: true, showBuildPath: false, showThreats: false, showAugments: true, showPower: false, showHint: false, showTips: false, compact: false, collapsed: false };
  return { ...HUD_FULL_WIDGETS, showTips: true, compact: false, collapsed: false };
}

/** The preset the current settings match exactly, if any. */
export function activeHudPreset(h: HudSettings): HudPreset | undefined {
  const same = (p: HudPreset) => Object.entries(hudPreset(p)).every(([k, v]) => h[k as keyof HudSettings] === v);
  return same("minimal") ? "minimal" : same("standard") ? "standard" : same("full") ? "full" : undefined;
}

/**
 * Free-position equivalent of a v1 preset (keeps clear of League's own HUD: scoreboard/FPS at the
 * top right edge, team frames, chat lower left, minimap bottom right, ability bar bottom center).
 */
export function presetFrac(p: HudPosition): { x: number; y: number } {
  switch (p) {
    case "top-left":
      return { x: 0, y: 0.1 };
    case "right-middle":
      return { x: 1, y: 0.5 };
    case "bottom-left":
      return { x: 0, y: 0.6 };
    default:
      return { x: 1, y: 0.1 };
  }
}

/** Where the panel is drawn: the saved free position, else the preset's equivalent. */
export function hudFrac(h: Pick<HudSettings, "x" | "y" | "position">): { x: number; y: number } {
  if (h.x !== null && h.y !== null) return { x: h.x, y: h.y };
  return presetFrac(h.position);
}

const clampNum = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const fracOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

/** Valid, de-duplicated widget order; widgets missing from a stored order are appended. */
export function normalizeOrder(raw: unknown): HudWidget[] {
  const seen = new Set<HudWidget>();
  if (Array.isArray(raw)) for (const w of raw) if (HUD_WIDGETS.includes(w as HudWidget)) seen.add(w as HudWidget);
  for (const w of HUD_WIDGETS) seen.add(w);
  return [...seen];
}

/** Merge a stored (possibly partial / invalid / v1) `hud` object with the defaults. */
export function normalizeHud(raw: unknown): HudSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof HudSettings, unknown>>;
  const bool = (k: keyof HudSettings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : (HUD_DEFAULTS[k] as boolean));
  let x = fracOrNull(r.x);
  let y = fracOrNull(r.y);
  if (x === null || y === null) x = y = null;
  return {
    position: HUD_POSITIONS.some((p) => p.value === r.position) ? (r.position as HudPosition) : HUD_DEFAULTS.position,
    x,
    y,
    scale: clampNum(r.scale, HUD_SCALE.min, HUD_SCALE.max, HUD_DEFAULTS.scale),
    opacity: clampNum(r.opacity, HUD_OPACITY.min, HUD_OPACITY.max, HUD_DEFAULTS.opacity),
    showNextItem: bool("showNextItem"),
    showThreats: bool("showThreats"),
    showSkillOrder: bool("showSkillOrder"),
    showBuildPath: bool("showBuildPath"),
    showAugments: bool("showAugments"),
    showPower: bool("showPower"),
    showHint: bool("showHint"),
    pickReminder: bool("pickReminder"),
    deathShop: bool("deathShop"),
    showTips: bool("showTips"),
    levelArrows: bool("levelArrows"),
    barX: clampNum(r.barX, BAR.x.min, BAR.x.max, HUD_DEFAULTS.barX),
    barY: clampNum(r.barY, BAR.y.min, BAR.y.max, HUD_DEFAULTS.barY),
    barGap: clampNum(r.barGap, BAR.gap.min, BAR.gap.max, HUD_DEFAULTS.barGap),
    idleDim: bool("idleDim"),
    idleOpacity: clampNum(r.idleOpacity, HUD_IDLE_OPACITY.min, HUD_IDLE_OPACITY.max, HUD_DEFAULTS.idleOpacity),
    order: normalizeOrder(r.order),
    compact: bool("compact"),
    collapsed: bool("collapsed"),
    hoverMode: r.hoverMode === "fade" || r.hoverMode === "hide" ? r.hoverMode : "off",
    hoverOpacity: clampNum(r.hoverOpacity, HUD_HOVER_OPACITY.min, HUD_HOVER_OPACITY.max, HUD_DEFAULTS.hoverOpacity),
  };
}

/** `settings.hud` with defaults applied, for any settings object (typed or not). */
export function hudOf(settings: unknown): HudSettings {
  return normalizeHud((settings as { hud?: Partial<HudSettings> } | null)?.hud);
}

/** Move a widget one step up (-1) or down (+1) in the order. */
export function moveWidget(order: HudWidget[], w: HudWidget, dir: -1 | 1): HudWidget[] {
  const i = order.indexOf(w);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

// ------------------------------------------------------------------ position math (layout editor)

export interface DragResult {
  x: number;
  y: number;
  /** Which guide the panel snapped to on each axis (for drawing guide lines). */
  snapX?: "start" | "center" | "end";
  snapY?: "start" | "center" | "end";
}

/**
 * Converts a panel's dragged pixel rect into free-space fractions, snapping to the screen edges
 * (inside `margin`) and center lines when within `snap` px. The panel is kept fully on screen.
 */
export function dragToFrac(
  rect: { left: number; top: number; width: number; height: number },
  screen: { width: number; height: number },
  margin: number,
  snap: number,
): DragResult {
  const axis = (pos: number, size: number, total: number): { f: number; s?: "start" | "center" | "end" } => {
    const free = total - 2 * margin - size;
    if (free <= 0) return { f: 0.5, s: "center" };
    const f = Math.min(1, Math.max(0, (pos - margin) / free));
    const px = f * free; // distance from the start margin
    if (px <= snap) return { f: 0, s: "start" };
    if (free - px <= snap) return { f: 1, s: "end" };
    if (Math.abs(px - free / 2) <= snap) return { f: 0.5, s: "center" };
    return { f };
  };
  const ax = axis(rect.left, rect.width, screen.width);
  const ay = axis(rect.top, rect.height, screen.height);
  const out: DragResult = { x: round4(ax.f), y: round4(ay.f) };
  if (ax.s) out.snapX = ax.s;
  if (ay.s) out.snapY = ay.s;
  return out;
}

/** Top-left pixel position of a panel at free-space fractions (inverse of dragToFrac). */
export function fracToPx(frac: { x: number; y: number }, size: { width: number; height: number }, screen: { width: number; height: number }, margin: number) {
  return {
    left: margin + frac.x * Math.max(0, screen.width - 2 * margin - size.width),
    top: margin + frac.y * Math.max(0, screen.height - 2 * margin - size.height),
  };
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
