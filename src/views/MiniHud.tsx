// The persistent in-game mini HUD (drawn by the "hud" layer window) + its layout editor.
//
// Widgets (each toggleable / reorderable in Settings → In-game overlay): shop advice ("buy now" /
// "save for", falls back to the build plan's next item), core build progress, skill order (and the
// next skill to level when a point is available), enemy damage split + threat flags, and the
// augments taken this game. `HudCard` is also rendered inline by Settings as a live preview.
//
// Riot policy: build / shop / skill-order reference only — no timers, no hidden information, no
// real-time combat prompts. Skill advice only says which ability the build levels next.
//
// Layout editor (hotkey, default Ctrl+Shift+L, or Settings → "Edit layout"): the backend lets the
// window take mouse input, the panel gets a dashed outline + toolbar and can be dragged anywhere
// (snapping to edges / center) and resized. Positions are saved as free-space fractions
// (hudSettings.ts). Click-through always comes back: Done, the hotkey, Esc, a timeout, or a focus
// change all end edit mode (src-tauri/src/hud.rs), and this window has its own timeout too.

import { t as tx } from "../i18n";
import { t } from "../i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { actions, getState, useApp, useDerived } from "../app/store";
import * as bridge from "../bridge";
import { findAugment } from "../engine/augments";
import type { SkillKey } from "../engine/guide";
import { findItem } from "../engine/staticData";
import { nextStackGoal } from "../data/stackGoals";
import { APHELIOS_INFO } from "../data/aphelios";
import type { ApheliosWeapon } from "../engine/live";
import { AugmentTip, KeyAbilityTip } from "../ui/GameTips";
import { threatLevel, type ThreatKey } from "../engine/threat";
import type { AugmentRarity, Item, StaticData } from "../engine/types";
import { damageSplit, nextSkill, pendingPoints, powerOf, shopOf, type DamageSplit, type HudPower } from "./hudLogic";
import { HUD_DEFAULTS, HUD_SCALE, WIDGET_FLAG, deathView, dragToFrac, hudFrac, hudOf, type HudSettings, type HudWidget } from "./hudSettings";
import "./layer.css";
import "./minihud.css";

type Basic = "Q" | "W" | "E";

/** Screen margin the panel keeps (px) — matches `--hud-m` in minihud.css. */
const MARGIN = 14;
const SNAP = 18;
const EDIT_TIMEOUT_MS = 185_000;

// ------------------------------------------------------------------ model

export interface HudShopRow {
  name: string;
  icon: string;
  cost: number;
  reason?: string;
  affordable?: boolean;
}

/** Everything the HUD card draws, decoupled from the store so Settings can preview it. */
export interface HudModel {
  champion?: { name: string; icon: string };
  /** Game phase label from the shop engine ("Laning", "Mid game"…). */
  phaseLabel?: string;
  /** Current gold (live game only). */
  gold?: number;
  /** Shop advice from the phase engine (derived.shop). */
  shop?: { buyNow: HudShopRow[]; saveFor?: { name: string; icon: string; need: number }; tip?: string };
  /** `goldUnknown`: Arena outside a live game — gold comes per round, so no affordability. */
  next?: { item: Item; affordable: boolean; missingGold: number; component?: Item; goldUnknown?: boolean };
  path: Array<{ item: Item; owned: boolean; next: boolean }>;
  skill?: {
    max: Basic[];
    start: Basic[];
    /** Skill points available right now (live ability ranks known), and where to put the next one. */
    pending: number;
    levelUp?: SkillKey;
    /** Planned skill for the next champion level (static reference when ranks are unknown). */
    upcoming?: { level: number; key: SkillKey };
  };
  damage?: DamageSplit;
  threats: Array<{ key: ThreatKey; label: string; value: number }>;
  augments: Array<{ name: string; rarity?: AugmentRarity }>;
  /** Team item-gold diff and your lane diff (derived.power, scoreboard only). */
  power?: HudPower;
  /** Stacking champions: the next stack milestone to aim for by this game time (reference pace). */
  stack?: { name: string; stacks: number; unlock: string; by: number; late: boolean };
  /** Aphelios: current main-hand weapon (Live Client API) with reference pairings. */
  aphelios?: ApheliosWeapon;
}

/** HUD model from the current game / explore state (empty fields when nothing is known). */
export function useHudModel(): HudModel {
  const derived = useDerived();
  const { plan, threat, skillPlan, levelOrder, game, champion } = derived;
  const shopRaw = shopOf(derived);
  const power = useMemo(() => powerOf(derived), [derived.power, derived.shop]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = useApp((s) => s.data);
  const myAugments = useApp((s) => s.myAugments);
  const enemies = game?.enemies;
  const damage = useMemo(() => damageSplit(enemies ?? []), [enemies]);
  const level = game?.me.level ?? 0;
  const ranks = game?.skills;
  const gold = game?.source === "live" ? Math.floor(game.gold) : undefined;
  const gameMode = derived.gameMode;
  const minute = game?.source === "live" ? Math.floor((game.gameTime ?? 0) / 60) : 0;
  const baseId = derived.baseChampion?.id;
  const stack = useMemo(() => {
    if (!baseId) return undefined;
    const g = nextStackGoal(baseId, gameMode, minute);
    return g ? { name: g.name, stacks: g.stacks, unlock: g.unlock, by: g.by[gameMode] as number, late: g.late } : undefined;
  }, [baseId, gameMode, minute]);

  return useMemo(() => {
    const nextId = plan?.next?.rec.item.id;
    const itemIcon = (id: string, icon?: string) => icon || data?.items.get(Number(id))?.icon || "";
    const shop =
      shopRaw && (shopRaw.buyNow.length || shopRaw.saveFor)
        ? {
            buyNow: shopRaw.buyNow.slice(0, 2).map((b) => ({
              name: b.name,
              icon: itemIcon(b.itemId, b.icon),
              cost: b.cost,
              reason: b.reason,
              affordable: shopRaw.gold === undefined ? undefined : b.cost <= shopRaw.gold,
            })),
            saveFor: shopRaw.saveFor ? { name: shopRaw.saveFor.name, icon: itemIcon(shopRaw.saveFor.itemId, shopRaw.saveFor.icon), need: shopRaw.saveFor.need } : undefined,
            tip: shopRaw.tips?.[0],
          }
        : undefined;
    const pending = pendingPoints(ranks, level);
    return {
      champion: champion ? { name: champion.name, icon: champion.icon } : undefined,
      phaseLabel: shopRaw?.phaseLabel,
      gold: shopRaw?.gold ?? gold,
      shop,
      next: plan?.next
        ? {
            item: plan.next.rec.item,
            affordable: plan.next.affordable,
            missingGold: plan.next.missingGold,
            component: plan.next.component,
            ...(plan.next.goldUnknown ? { goldUnknown: true } : {}),
          }
        : undefined,
      path: (plan?.order ?? []).slice(0, 6).map((r) => ({ item: r.item, owned: r.owned, next: r.item.id === nextId && !r.owned })),
      skill: skillPlan
        ? {
            max: skillPlan.max as Basic[],
            start: skillPlan.start as Basic[],
            pending,
            levelUp: ranks && pending > 0 ? nextSkill(levelOrder, ranks, level) : undefined,
            upcoming: level > 0 && level < 18 && levelOrder[level] ? { level: level + 1, key: levelOrder[level]! } : undefined,
          }
        : undefined,
      damage,
      threats: [...threat.meters]
        .filter((m) => m.value >= 0.3)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((m) => ({ key: m.key, label: m.label, value: m.value })),
      augments: myAugments.map((name) => ({ name, rarity: findAugment(name)?.rarity })),
      power,
      stack,
      aphelios: game?.apheliosMain,
    };
  }, [plan, threat, skillPlan, levelOrder, shopRaw, data, myAugments, damage, level, ranks, gold, champion, power, stack, game?.apheliosMain]);
}

/** Representative content for the Settings preview / layout editor when no game is running. */
export function sampleHudModel(data: StaticData | null | undefined): HudModel {
  const fake = (name: string, cost: number): Item => ({ id: -cost, name, cost, icon: "", from: [], into: [], tags: [], stats: {}, aram: true, sr: true, completed: true, plaintext: "", statLines: [], effects: [] });
  const get = (name: string, cost = 3000) => (data && findItem(data, name)) || fake(name, cost);
  const names = ["Luden's Echo", "Sorcerer's Shoes", "Shadowflame", "Rabadon's Deathcap", "Void Staff", "Zhonya's Hourglass"];
  const path = names.map((n, i) => ({ item: get(n, 3000 + i), owned: i < 2, next: i === 2 }));
  const rod = get("Needlessly Large Rod", 1250);
  const lux = data?.championsById.get("Lux");
  return {
    champion: lux ? { name: lux.name, icon: lux.icon } : undefined,
    phaseLabel: "Mid game",
    gold: 1650,
    shop: {
      buyNow: [{ name: rod.name, icon: rod.icon, cost: rod.cost, reason: "Biggest step towards Shadowflame", affordable: true }],
      saveFor: { name: path[2]!.item.name, icon: path[2]!.item.icon, need: 650 },
      tip: "Enemy team heals a lot — pick up anti-heal next back",
    },
    next: { item: path[2]!.item, affordable: false, missingGold: 650, component: rod },
    path,
    skill: { max: ["Q", "E", "W"], start: ["Q", "E", "W"], pending: 1, levelUp: "Q", upcoming: { level: 10, key: "Q" } },
    damage: { ad: 0.58, ap: 0.34, tru: 0.08 },
    threats: [
      { key: "heal", label: "Healing", value: 0.82 },
      { key: "burst", label: "Burst", value: 0.6 },
      { key: "cc", label: "Crowd control", value: 0.42 },
    ],
    augments: [
      { name: "Eureka", rarity: "gold" },
      { name: "Jeweled Gauntlet", rarity: "prismatic" },
    ],
    power: { team: -2100, lane: { label: "Mid", diff: 450, vs: "Zed" } },
  };
}

/** True when `hud` + `model` would draw at least one widget. */
export function hudHasContent(hud: HudSettings, model: HudModel): boolean {
  return hud.order.some((w) => hud[WIDGET_FLAG[w]] && widgetHasContent(w, model));
}

function widgetHasContent(w: HudWidget, m: HudModel): boolean {
  switch (w) {
    case "shop":
      return !!(m.shop || m.next);
    case "path":
      return m.path.length > 0;
    case "skill":
      return !!m.skill || !!m.stack || !!m.aphelios;
    case "threats":
      return !!m.damage || m.threats.length > 0;
    case "augments":
      return m.augments.length > 0;
    case "power":
      return !!m.power;
  }
}

// ------------------------------------------------------------------ in-game host (hud window)

/** Mounted by Layer: the persistent HUD while in game, plus the layout editor. */
export function MiniHud() {
  const enabled = useApp((s) => s.settings.hudEnabled);
  const hotkey = useApp((s) => s.settings.hotkeyToggle);
  const editKey = useApp((s) => s.settings.hotkeyHudEdit);
  const hudKey = useApp((s) => s.settings.hotkeyHud);
  const settings = useApp((s) => s.settings);
  const data = useApp((s) => s.data);
  const hud = useMemo(() => hudOf(settings), [settings]);
  const live = useApp((s) => s.live);
  const demo = useApp((s) => s.demo);
  const model = useHudModel();
  const editing = useHudEditing();

  if (!editing) {
    if (!enabled || !(live || demo)) return null;
    // Dead: full HUD with the shop first, so the back / death timer is used for shopping.
    if (live?.me.dead && hud.deathShop) {
      const banner = (
        <div className="nl-dead" role="status">
          <span className="nl-dead-dot" />
          {t("Dead")}
          {live.respawnIn ? ` · ${live.respawnIn}s` : ""} · {t("shop now")}
        </div>
      );
      return <HoverFade hud={deathView(hud)} model={model} hotkey={hotkey} banner={banner} />;
    }
    return <HoverFade hud={hud} model={model} hotkey={hotkey} />;
  }
  // Editing: always show something to position, even outside a game or with the HUD toggled off.
  const view = hudHasContent(hud, model) ? model : sampleHudModel(data);
  return <HudEditor hud={hud} model={view} hotkey={hotkey} editKey={editKey} hidden={!enabled} hudKey={hudKey} sample={view !== model} />;
}

/**
 * The in-game panel with the optional "fade / hide while the mouse is over it" behavior. The HUD
 * is click-through, so it never gets hover events: poll the cursor (read-only) and compare it with
 * the panel's rect. Only polls while the option is on.
 */
function HoverFade({ hud, model, hotkey, banner }: { hud: HudSettings; model: HudModel; hotkey: string; banner?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (hud.hoverMode === "off") {
      setOver(false);
      return;
    }
    let alive = true;
    const tick = async () => {
      const c = await bridge.hudCursor().catch(() => null);
      const r = ref.current?.getBoundingClientRect();
      if (!alive) return;
      const pad = 6;
      setOver(!!c && !!r && r.width > 0 && c[0] >= r.left - pad && c[0] <= r.right + pad && c[1] >= r.top - pad && c[1] <= r.bottom + pad);
    };
    const id = window.setInterval(() => void tick(), 120);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [hud.hoverMode]);
  const opacity = !over ? 1 : hud.hoverMode === "hide" ? 0 : hud.hoverOpacity;
  return (
    <div className="nl-hover" style={{ opacity, transition: "opacity 160ms ease" }}>
      <HudCard hud={hud} model={model} hotkey={hotkey} panelRef={ref} banner={banner} />
    </div>
  );
}

/** Edit mode as reported by the backend (`hud-edit` events). */
function useHudEditing(): boolean {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    let heard = false;
    void bridge
      .on<boolean>("hud-edit", (on) => {
        heard = true;
        setEditing(!!on);
      })
      .then((u) => {
        if (!alive) return u();
        off = u;
        // Edit mode may already be on (this webview loaded / reloaded after it started): the
        // window is then taking the mouse, so the editor (and its Done button) must show.
        void bridge
          .getHudEdit()
          .then((on) => alive && !heard && setEditing(on))
          .catch(() => {});
      });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("nl-edit-on", editing);
    if (!editing) return;
    // This window's own safety net (the backend has one too).
    const t = window.setTimeout(() => void bridge.setHudEdit(false), EDIT_TIMEOUT_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && void bridge.setHudEdit(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [editing]);
  return editing;
}

const saveHud = (patch: Partial<HudSettings>) => void actions.updateSettings({ hud: { ...hudOf(getState().settings), ...patch } });

interface Local {
  x: number;
  y: number;
  scale: number;
  snapX?: string;
  snapY?: string;
}

interface DragState {
  kind: "move" | "resize";
  id: number;
  dx: number;
  dy: number;
  startX: number;
  startScale: number;
  width: number;
}

function HudEditor({ hud, model, hotkey, editKey, hidden, hudKey, sample }: { hud: HudSettings; model: HudModel; hotkey: string; editKey: string; hidden: boolean; hudKey: string; sample: boolean }) {
  // Tooltips (portaled to <body>) would pop up under the cursor while dragging the panel.
  useEffect(() => {
    document.body.classList.add("nl-editing");
    return () => document.body.classList.remove("nl-editing");
  }, []);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  // Local copy while dragging (saved once on release, so settings aren't written per frame).
  const [local, setLocalState] = useState<Local | null>(null);
  const localRef = useRef<Local | null>(null);
  const setLocal = (l: Local | null) => {
    localRef.current = l;
    setLocalState(l);
  };
  const frac = hudFrac(hud);
  const cur = local ?? { ...frac, scale: hud.scale };
  const view: HudSettings = { ...hud, x: cur.x, y: cur.y, scale: cur.scale };

  const onDown = (kind: DragState["kind"]) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || !panel.current) return;
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    const r = panel.current.getBoundingClientRect();
    drag.current = { kind, id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, startX: e.clientX, startScale: cur.scale, width: r.width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setLocal({ x: cur.x, y: cur.y, scale: cur.scale });
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !panel.current) return;
    const r = panel.current.getBoundingClientRect();
    const screen = { width: window.innerWidth, height: window.innerHeight };
    if (d.kind === "move") {
      const res = dragToFrac({ left: e.clientX - d.dx, top: e.clientY - d.dy, width: r.width, height: r.height }, screen, MARGIN, SNAP);
      setLocal({ x: res.x, y: res.y, scale: localRef.current?.scale ?? d.startScale, snapX: res.snapX, snapY: res.snapY });
    } else {
      const scale = Math.round(Math.min(HUD_SCALE.max, Math.max(HUD_SCALE.min, d.startScale * ((d.width + (e.clientX - d.startX)) / d.width))) * 100) / 100;
      const l = localRef.current;
      if (l) setLocal({ ...l, scale });
    }
  };
  const onUp = (e: ReactPointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      drag.current = null;
      const l = localRef.current;
      if (l) {
        setLocal({ x: l.x, y: l.y, scale: l.scale }); // keep it (sans guides) until the save lands
        saveHud(d.kind === "move" ? { x: l.x, y: l.y } : { scale: l.scale });
      }
  };
  // Settings round-trip done: drop the local copy only once the saved values arrive (no jump).
  useEffect(() => {
    if (!drag.current) setLocal(null);
  }, [hud.x, hud.y, hud.scale]);

  const step = (d: number) => saveHud({ scale: Math.round(Math.min(HUD_SCALE.max, Math.max(HUD_SCALE.min, hud.scale + d)) * 100) / 100 });
  const dragging = !!drag.current && drag.current.kind === "move";

  return (
    <div className="nl-edit">
      <div className="nl-edit-scrim" />
      {dragging && local?.snapX && <div className={`nl-guide nl-guide-v nl-g-${local.snapX}`} />}
      {dragging && local?.snapY && <div className={`nl-guide nl-guide-h nl-g-${local.snapY}`} />}
      <div className="nl-edit-banner">
        <strong>{tx("Edit HUD layout")}</strong>
        <span>{tx("Drag the panel anywhere \u00b7 drag the corner to resize \u00b7 it snaps to edges and center")}</span>
        <span className="nl-edit-keys">
          <span className="nl-kbd">Esc</span> or <span className="nl-kbd">{editKey || "Done"}</span> to finish
        </span>
        {hidden && (
          <span className="nl-edit-warn">
            The HUD is switched off — <span className="nl-kbd">{hudKey}</span> shows it in game
          </span>
        )}
        {sample && <span className="nl-edit-note">{tx("Sample content \u2014 your build shows here in game")}</span>}
      </div>
      <HudCard
        hud={view}
        model={model}
        hotkey={hotkey}
        editing
        panelRef={panel}
        onPointerDown={onDown("move")}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        toolbar={
          <div className="nl-toolbar" onPointerDown={(e) => e.stopPropagation()}>
            <span className="nl-grip" title="Drag to move" onPointerDown={onDown("move")}>
              <GripIcon />
              Move
            </span>
            <span className="nl-tb-group">
              <button type="button" onClick={() => step(-0.05)} aria-label="Smaller">
                −
              </button>
              <span className="nl-tb-val">{Math.round(cur.scale * 100)}%</span>
              <button type="button" onClick={() => step(0.05)} aria-label="Bigger">
                +
              </button>
            </span>
            <button type="button" onClick={() => saveHud({ collapsed: !hud.collapsed })}>
              {hud.collapsed ? "Expand" : "Collapse"}
            </button>
            <button type="button" onClick={() => saveHud({ x: null, y: null, position: HUD_DEFAULTS.position, scale: HUD_DEFAULTS.scale })}>
              Reset
            </button>
            <button type="button" className="nl-tb-done" onClick={() => void bridge.setHudEdit(false)}>
              Done
            </button>
          </div>
        }
        resizeHandle={<span className="nl-resize" onPointerDown={onDown("resize")} title="Drag to resize" />}
      />
    </div>
  );
}

// ------------------------------------------------------------------ the card

const SHORT_THREAT: Record<ThreatKey, string> = {
  heal: "Healing",
  shield: "Shields",
  tankiness: "Tanky",
  cc: "Heavy CC",
  burst: "Burst",
  crit: "Crit",
  attackSpeed: "Attack speed",
  poke: "Poke",
};

/** What each threat asks of your build (shop reference, not combat advice). */
const THREAT_ANSWER: Record<ThreatKey, string> = {
  heal: "anti-heal",
  shield: "anti-shield",
  tankiness: "penetration",
  cc: "tenacity",
  burst: "defensive item",
  crit: "armor",
  attackSpeed: "armor",
  poke: "sustain",
};

const WIDGET_LABEL: Record<HudWidget, string> = { shop: "Shop", path: "Build", skill: "Skills", threats: "Enemy", augments: "Augments", power: "Team power" };

interface CardProps {
  hud: HudSettings;
  model: HudModel;
  hotkey?: string;
  /** Settings preview: normal flow, fixed base size. */
  inline?: boolean;
  editing?: boolean;
  panelRef?: Ref<HTMLDivElement>;
  toolbar?: ReactNode;
  /** Shown at the top of the panel (e.g. "Dead · 12s · shop now"). */
  banner?: ReactNode;
  resizeHandle?: ReactNode;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  onPointerCancel?: (e: ReactPointerEvent) => void;
}

/** The mini HUD panel, positioned over the game by its free-space fractions (or inline). */
export function HudCard({ hud, model, hotkey, inline = false, editing = false, panelRef, toolbar, banner, resizeHandle, ...handlers }: CardProps) {
  if (!editing && !hudHasContent(hud, model)) return null;
  const c = hud.compact;
  const { x, y } = hudFrac(hud);
  const style = {
    "--hud-scale": String(hud.scale),
    "--hud-a": String(hud.opacity),
    "--fx": String(x),
    "--fy": String(y),
  } as CSSProperties;
  const cls = ["nl-hud", c && "nl-compact", hud.collapsed && "nl-collapsed", inline && "nl-hud-inline", editing && "nl-hud-editing", y < 0.3 && "nl-tb-under", x > 0.5 && "nl-tb-right"].filter(Boolean).join(" ");

  if (hud.collapsed)
    return (
      <div ref={panelRef} className={cls} style={style} {...handlers}>
        {toolbar}
        <Pill model={model} />
        {resizeHandle}
      </div>
    );

  const sections = hud.order
    .filter((w) => hud[WIDGET_FLAG[w]] && widgetHasContent(w, model))
    .map((w) => [w, renderWidget(w, model, c)] as const)
    .filter(([, el]) => el);

  return (
    <div ref={panelRef} className={cls} style={style} {...handlers}>
      {toolbar}
      {banner}
      {!c && <Head model={model} />}
      {sections.map(([key, el]) => (
        <section key={key} className={`nl-sec nl-sec-${key}`} aria-label={WIDGET_LABEL[key]}>
          {el}
        </section>
      ))}
      {hud.showHint && hotkey && !c && (
        <div className="nl-hint">
          <span className="nl-kbd">{hotkey}</span>
          <span>{t("full view")}</span>
        </div>
      )}
      {resizeHandle}
    </div>
  );
}

function renderWidget(w: HudWidget, m: HudModel, c: boolean): ReactNode {
  switch (w) {
    case "shop":
      return <ShopWidget m={m} c={c} />;
    case "path":
      return <PathWidget m={m} c={c} />;
    case "skill":
      return m.skill || m.stack || m.aphelios ? (
        <>
          {m.skill && <SkillWidget s={m.skill} c={c} />}
          {m.stack && <StackGoalRow s={m.stack} c={c} />}
          {m.aphelios && <ApheliosRow w={m.aphelios} c={c} />}
        </>
      ) : null;
    case "threats":
      return <ThreatWidget m={m} c={c} />;
    case "augments":
      return <AugmentWidget m={m} c={c} />;
    case "power":
      return m.power ? <PowerWidget p={m.power} c={c} /> : null;
  }
}

function Head({ model }: { model: HudModel }) {
  return (
    <div className="nl-hud-head">
      {model.champion ? <Icon src={model.champion.icon} name={model.champion.name} className="nl-champ" /> : <Diamond />}
      <span className="nl-brand">NEXIS</span>
      {model.phaseLabel && <span className="nl-phase">{model.phaseLabel}</span>}
      {model.gold !== undefined && (
        <span className="nl-head-gold">
          <Coin />
          {model.gold.toLocaleString("en-US")}
        </span>
      )}
    </div>
  );
}

function Pill({ model }: { model: HudModel }) {
  const buy = model.shop?.buyNow[0];
  const save = model.shop?.saveFor;
  const next = model.next;
  const icon = buy ? { src: buy.icon, name: buy.name } : save ? { src: save.icon, name: save.name } : next ? { src: next.item.icon, name: next.item.name } : undefined;
  const text = buy ? "Buy" : save ? `−${fmtGold(save.need)}` : next ? (next.affordable ? "Buy" : next.goldUnknown ? "Next" : `−${fmtGold(next.missingGold)}`) : "Nexis";
  const ok = buy ? buy.affordable !== false : !!next?.affordable && !save;
  const lvl = model.skill?.levelUp;
  return (
    <div className="nl-pill">
      <Diamond />
      {icon && <Icon src={icon.src} name={icon.name} className="nl-pill-icon" />}
      <span className={`nl-pill-text ${ok ? "nl-ok" : ""}`}>{text}</span>
      {lvl && <span className={`nl-key nl-key-sm nl-key-up`}>{lvl}</span>}
    </div>
  );
}

function ShopWidget({ m, c }: { m: HudModel; c: boolean }) {
  const shop = m.shop;
  if (shop) {
    const save = shop.saveFor;
    const haveGold = m.gold;
    const progress = save && haveGold !== undefined ? Math.min(1, Math.max(0, haveGold / (haveGold + save.need))) : undefined;
    if (c)
      return (
        <div className="nl-shop-c">
          {shop.buyNow.map((b, i) => (
            <div key={i} className="nl-icon-wrap" title={b.name}>
              <Icon src={b.icon} name={b.name} />
              <span className="nl-gold-pill nl-ok">{t("BUY")}</span>
            </div>
          ))}
          {save && (
            <div className="nl-icon-wrap" title={save.name}>
              <Icon src={save.icon} name={save.name} />
              <span className="nl-gold-pill">−{fmtGold(save.need)}</span>
            </div>
          )}
        </div>
      );
    return (
      <div className="nl-shop">
        {shop.buyNow.length > 0 && (
          <>
            <div className="nl-row-head">
              <span className="nl-label nl-label-ok">{t("BUY NOW")}</span>
            </div>
            {shop.buyNow.map((b, i) => (
              <div key={i} className="nl-buy">
                <Icon src={b.icon} name={b.name} />
                <div className="nl-buy-body">
                  <div className="nl-buy-top">
                    <span className="nl-buy-name">{b.name}</span>
                    <span className={`nl-cost ${b.affordable === false ? "" : "nl-ok"}`}>{b.cost.toLocaleString("en-US")}</span>
                  </div>
                  {b.reason && <div className="nl-reason-line">{b.reason}</div>}
                </div>
              </div>
            ))}
          </>
        )}
        {save && (
          <div className="nl-save">
            <Icon src={save.icon} name={save.name} className="nl-save-icon" />
            <div className="nl-buy-body">
              <div className="nl-buy-top">
                <span className="nl-save-label">
                  <span className="nl-label">{t("SAVE FOR")}</span> <span className="nl-buy-name">{save.name}</span>
                </span>
                <span className="nl-cost">{save.need.toLocaleString("en-US")} more</span>
              </div>
              {progress !== undefined && (
                <div className="nl-bar">
                  <i style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        )}
        {shop.tip && <div className="nl-tip">{shop.tip}</div>}
      </div>
    );
  }
  const next = m.next;
  if (!next) return null;
  if (c)
    return (
      <div className="nl-next">
        <div className="nl-icon-wrap">
          <Icon src={next.item.icon} name={next.item.name} />
        </div>
        <span className={`nl-gold-pill ${next.affordable ? "nl-ok" : ""}`}>{next.affordable ? t("BUY") : next.goldUnknown ? t("NEXT") : `−${fmtGold(next.missingGold)}`}</span>
      </div>
    );
  return (
    <div className="nl-next">
      <Icon src={next.item.icon} name={next.item.name} />
      <div className="nl-next-body">
        <div className={`nl-label ${next.affordable ? "nl-label-ok" : ""}`}>{next.affordable ? t("BUY NOW") : t("NEXT ITEM")}</div>
        <div className="nl-next-name">{next.item.name}</div>
        <div className={`nl-gold ${next.affordable ? "nl-ok" : ""}`}>
          {next.affordable
            ? `${next.item.cost.toLocaleString("en-US")}g · you can afford it`
            : next.goldUnknown
              ? "Next shop round"
              : `${next.missingGold.toLocaleString("en-US")}g missing${next.component ? ` · ${next.component.name} first` : ""}`}
        </div>
      </div>
    </div>
  );
}

function PathWidget({ m, c }: { m: HudModel; c: boolean }) {
  const owned = m.path.filter((p) => p.owned).length;
  return (
    <div className="nl-path-wrap">
      {!c && (
        <div className="nl-row-head">
          <span className="nl-label">{t("CORE BUILD")}</span>
          <span className="nl-count">
            {owned}/{m.path.length}
          </span>
        </div>
      )}
      <div className="nl-path">
        {m.path.map((p, i) => (
          <div key={`${p.item.id}-${i}`} className={`nl-slot ${p.owned ? "nl-owned" : ""} ${p.next ? "nl-is-next" : ""}`} title={p.item.name}>
            <Icon src={p.item.icon} name={p.item.name} />
            {p.owned && <Check />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApheliosRow({ w, c }: { w: ApheliosWeapon; c: boolean }) {
  const info = APHELIOS_INFO[w];
  return (
    <div className="nl-aph" title={`${w}: ${info.role}. Pairs well with ${info.pairs.join(" or ")} (reference). League only shares your main-hand weapon with apps.`}>
      {!c && <span className="nl-label">{t("MAIN")}</span>}
      <span className="nl-aph-gun" style={{ color: info.color }}>
        ● {w}
      </span>
      {!c && (
        <span className="nl-aph-pairs">
          pairs: {info.pairs.map((p) => (
            <span key={p} style={{ color: APHELIOS_INFO[p].color }}>
              {p}{" "}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function StackGoalRow({ s, c }: { s: NonNullable<HudModel["stack"]>; c: boolean }) {
  return (
    <div className="nl-stack" title={`${s.name}: ${s.stacks} stacks — ${s.unlock}. A rough pace; Nexis can't see your actual stacks.`}>
      {!c && <span className="nl-label">{t("STACKS")}</span>}
      <span className="nl-stack-goal">
        <b>{s.stacks}</b>
        {!c && <span className="nl-stack-by">{s.late ? `(was due ~${s.by}:00)` : `by ~${s.by}:00`}</span>}
      </span>
      {!c && <span className="nl-stack-unlock">{s.unlock}</span>}
    </div>
  );
}

function SkillWidget({ s, c }: { s: NonNullable<HudModel["skill"]>; c: boolean }) {
  return (
    <div className="nl-skill">
      {!c && <span className="nl-label">{t("MAX")}</span>}
      <span className="nl-keys">
        {s.max.map((k, i) => (
          <span key={k} className="nl-key-group">
            {i > 0 && <Chevron />}
            <KeyAbilityTip k={k}>
              <span className={`nl-key ${i === 0 ? "nl-key-first" : ""}`}>{k}</span>
            </KeyAbilityTip>
          </span>
        ))}
      </span>
      {s.levelUp ? (
        <span className="nl-levelup" title="A skill point is available — this is the ability the build levels next">
          {!c && <span className="nl-label nl-label-ok">{t("LEVEL UP")}</span>}
          <KeyAbilityTip k={s.levelUp}>
            <span className="nl-key nl-key-up">{s.levelUp}</span>
          </KeyAbilityTip>
          {s.pending > 1 && <span className="nl-pending">+{s.pending - 1}</span>}
        </span>
      ) : s.upcoming && !c ? (
        <span className="nl-upcoming">
          <span className="nl-label nl-label-dim">LV {s.upcoming.level}</span>
          <KeyAbilityTip k={s.upcoming.key}>
            <span className="nl-key nl-key-sm">{s.upcoming.key}</span>
          </KeyAbilityTip>
        </span>
      ) : !c && s.start.length > 0 ? (
        <span className="nl-upcoming">
          <span className="nl-label nl-label-dim">{t("START")}</span>
          <span className="nl-start-keys">{s.start.join(" ")}</span>
        </span>
      ) : null}
    </div>
  );
}

function ThreatWidget({ m, c }: { m: HudModel; c: boolean }) {
  const d = m.damage;
  return (
    <div className="nl-threats">
      {d && (
        <div className="nl-split">
          {!c && (
            <div className="nl-row-head">
              <span className="nl-label">{t("ENEMY DAMAGE")}</span>
              <span className="nl-split-legend">
                <span className="nl-ad">AD {pct(d.ad)}</span>
                <span className="nl-ap">AP {pct(d.ap)}</span>
                {d.tru >= 0.04 && <span className="nl-tru">TRUE {pct(d.tru)}</span>}
              </span>
            </div>
          )}
          <div className="nl-split-bar" title={`Physical ${pct(d.ad)} · Magic ${pct(d.ap)} · True ${pct(d.tru)}`}>
            <i className="nl-ad" style={{ flexGrow: d.ad }} />
            <i className="nl-ap" style={{ flexGrow: d.ap }} />
            {d.tru > 0 && <i className="nl-tru" style={{ flexGrow: d.tru }} />}
          </div>
        </div>
      )}
      {m.threats.length > 0 && (
        <div className="nl-flags">
          {m.threats.map((t) => (
            <span key={t.key} className={`nl-flag nl-t-${threatLevel(t.value)}`} title={`${t.label} — consider ${THREAT_ANSWER[t.key]}`}>
              <i />
              {SHORT_THREAT[t.key]}
              {!c && <small>{THREAT_ANSWER[t.key]}</small>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One line of scoreboard information: team item-gold diff and your lane's (no prompts). */
function PowerWidget({ p, c }: { p: HudPower; c: boolean }) {
  const tone = (d: number) => (Math.abs(d) < 300 ? "nl-pw-even" : d > 0 ? "nl-pw-up" : "nl-pw-down");
  const fmt = (d: number) => (Math.abs(d) < 300 ? "even" : `${d > 0 ? "+" : "−"}${fmtGold(Math.abs(Math.round(d)))}`);
  return (
    <div className="nl-power" title="Item gold difference from the scoreboard (your side − enemy side)">
      {!c && <span className="nl-label">{t("ITEM GOLD")}</span>}
      {p.team !== undefined && (
        <span className="nl-pw">
          <small>{tx("Team")}</small>
          <b className={tone(p.team)}>{fmt(p.team)}</b>
        </span>
      )}
      {p.lane && (
        <span className="nl-pw" title={`${p.lane.label} vs ${p.lane.vs}`}>
          <small>{p.lane.label}</small>
          <b className={tone(p.lane.diff)}>{fmt(p.lane.diff)}</b>
        </span>
      )}
      {p.spike && (
        <span className="nl-spike" title="Your next item and enemies close to finishing one (scoreboard items only)">
          {p.spike.next && (
            <span>
              <small>{t("Next spike")}</small> <b>{c ? fmtGold(p.spike.next.need) : `${p.spike.next.name} · ${fmtGold(p.spike.next.need)}`}</b>
            </span>
          )}
          {p.spike.enemyClose.length > 0 && (
            <span className="nl-spike-enemy">
              <small>{t("Enemy")}</small> <b>{c ? p.spike.enemyClose.length : `${p.spike.enemyClose.length} ${t(p.spike.enemyClose.length > 1 ? "items almost done" : "item almost done")}`}</b>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function AugmentWidget({ m, c }: { m: HudModel; c: boolean }) {
  return (
    <div className="nl-augs">
      {!c && <span className="nl-label">{t("AUGMENTS")}</span>}
      <div className="nl-aug-list">
        {m.augments.map((a) => (
          <AugmentTip key={a.name} name={a.name}>
            <span className={`nl-aug nl-r-${a.rarity ?? "silver"}`}>{c ? initialsOf(a.name) : a.name}</span>
          </AugmentTip>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ bits

const pct = (v: number) => `${Math.round(v * 100)}%`;

function fmtGold(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

function initialsOf(name: string): string {
  return (
    name
      .split(/[\s'-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

function Check() {
  return (
    <svg className="nl-check" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" />
      <path d="M4.6 8.3l2.2 2.2 4.6-4.8" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg className="nl-chev" viewBox="0 0 8 12" aria-hidden="true">
      <path d="M2 1.5L6.5 6 2 10.5" />
    </svg>
  );
}

function Diamond() {
  return (
    <svg className="nl-diamond" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 0.8L11.2 6 6 11.2 0.8 6z" />
      <path d="M6 3.4L8.6 6 6 8.6 3.4 6z" />
    </svg>
  );
}

function Coin() {
  return (
    <svg className="nl-coin" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" />
      <path d="M6 3.2v5.6M4.4 4.6h3.2" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="nl-grip-ico" viewBox="0 0 10 16" aria-hidden="true">
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <circle cx="2.5" cy={y} r="1.3" />
          <circle cx="7.5" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  );
}

function Icon({ src, name, className = "" }: { src: string; name: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <div className={`nl-icon nl-icon-fallback ${className}`}>{initialsOf(name)}</div>;
  return <img className={`nl-icon ${className}`} src={src} alt="" draggable={false} onError={() => setFailed(src)} />;
}
