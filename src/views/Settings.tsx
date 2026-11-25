import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { t as tx } from "../i18n";
import { LANGUAGES, t as tr, type Lang } from "../i18n";
import {
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  KNOWN_HOTKEY_CONFLICTS,
  MODE_LABEL,
  THEME_PRESETS,
  effectiveMode,
  actions,
  getState,
  useApp,
  type Settings,
  type ThemePreset,
  type ThemeSettings,
} from "../app/store";
import type { Playstyle } from "../engine/types";
import { getAppInfo, getAutostart, isTauri, type AppInfo, openUrl, setAutostart, setHudEdit, setHudPreview } from "../bridge";
import { Card, Kbd, Pill, Segmented, Toggle } from "../ui/controls";
import { showOnboarding } from "../ui/Onboarding";
import { toast } from "../ui/Toasts";
import { WindowSettings } from "../ui/WindowControls";
import { LogoMark } from "../ui/TopBar";
import { PLAYSTYLES, displayPatch, gold } from "../ui/format";
import { Icon, type IconName } from "../ui/icons";
import { HudCard, hudHasContent, sampleHudModel, useHudModel } from "./MiniHud";
import { useLeagueClientConnected } from "../ui/ImportToLeague";
import { DiagnosticsSection } from "./Diagnostics";
import { BAR, HUD_DEFAULTS, HUD_HOVER_OPACITY, HUD_IDLE_OPACITY, HUD_OPACITY, HUD_POSITIONS, HUD_SCALE, WIDGET_FLAG, activeHudPreset, hudFrac, hudOf, hudPreset, moveWidget, presetFrac, type HudPosition, type HudPreset, type HudSettings, type HudWidget } from "./hudSettings";

const update = (patch: Partial<Settings>) => void actions.updateSettings(patch);
const updateTheme = (patch: Partial<ThemeSettings>) => void actions.updateTheme(patch);

/** Local value that commits shortly after the user stops changing it (every save re-registers hotkeys). */
function useDebounced<T>(value: T, commit: (v: T) => void, ms = 200): [T, (v: T) => void] {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (v: T) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commitRef.current(v), ms);
  };
  return [local, change];
}

const setVar = (k: string, v: string) => document.documentElement.style.setProperty(k, v);

// ------------------------------------------------------------------ keybinds

type HotkeyField = "hotkeyToggle" | "hotkeyScan" | "hotkeyHud" | "hotkeyHudEdit";

const CODE_NAMES: Record<string, string> = {
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
  PrintScreen: "PrintScreen",
  Pause: "Pause",
  NumpadAdd: "NumAdd",
  NumpadSubtract: "NumSubtract",
  NumpadMultiply: "NumMultiply",
  NumpadDivide: "NumDivide",
  NumpadDecimal: "NumDecimal",
  NumpadEnter: "NumEnter",
};

/** Turn a keydown into a Tauri accelerator string ("Ctrl+Shift+Space"). */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`;
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return CODE_NAMES[code] ?? null;
}

type RecordResult = { combo: string } | { error: string } | null;

function recordCombo(e: KeyboardEvent): RecordResult {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"].includes(e.key)) return null;
  const key = keyName(e.code);
  if (!key) return { error: `“${e.key}” can't be used in a shortcut` };
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter((m): m is string => !!m);
  if (!mods.length && !/^F\d+$/.test(key)) return { error: "Add Ctrl, Alt or Shift (F-keys work alone)" };
  return { combo: [...mods, key].join("+") };
}

function KeybindRow({ field, label, hint, value, others }: { field: HotkeyField; label: string; hint: string; value: string; others: string[] }) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const btn = useRef<HTMLButtonElement>(null);

  const start = () => {
    if (recording) return;
    setRecording(true);
    setPreview("");
    setError("");
    void actions.suspendHotkeys(true);
  };
  const stop = async (combo?: string) => {
    if (!recording) return;
    setRecording(false);
    setPreview("");
    const changed = combo !== undefined && combo !== value;
    if (changed) await actions.updateSettings({ [field]: combo });
    await actions.suspendHotkeys(false);
    btn.current?.blur();
    if (changed) announceHotkey(label, combo, others);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) return void stop();
    if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.shiftKey) return void stop("");
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean).join("+");
    const r = recordCombo(e);
    if (!r) {
      setPreview(mods ? `${mods}+…` : "");
      return;
    }
    if ("error" in r) {
      setError(r.error);
      return;
    }
    void stop(r.combo);
  };

  const conflict = value ? KNOWN_HOTKEY_CONFLICTS[value] : undefined;
  const dup = value && others.includes(value);

  return (
    <div className="kb-row">
      <div className="field-text">
        <span className="field-label">{label}</span>
        <span className="field-hint">{hint}</span>
        {recording && error && <span className="field-hint warn-text">{error}</span>}
        {!recording && dup && <span className="field-hint err">{tx("Same shortcut as another action")}</span>}
        {!recording && conflict && <span className="field-hint warn-text">May clash with {conflict}</span>}
      </div>
      <button
        ref={btn}
        type="button"
        className={`kb-btn ${recording ? "recording" : ""} ${dup ? "kb-dup" : conflict ? "kb-warn" : ""}`}
        onClick={start}
        onKeyDown={onKeyDown}
        onBlur={() => void stop()}
        aria-label={`${label}: ${value || "not set"}. Click to change.`}
      >
        {recording ? <span className="kb-rec">{preview || "Press keys…"}</span> : <Kbd>{value}</Kbd>}
      </button>
    </div>
  );
}

/** Feedback after a shortcut changes: saved, disabled, or a (possible) conflict. */
function announceHotkey(label: string, combo: string, others: string[]) {
  const id = "hotkey";
  if (!combo) return void toast(`${label}: shortcut disabled`, "info", { id });
  const errors = getState().hotkeyErrors;
  if (errors.length) return void toast(`Couldn't register ${combo}`, "bad", { id, detail: errors[0] });
  if (others.includes(combo)) return void toast(`${combo} is already used by another action`, "warn", { id, detail: "Pick a different combination so both keep working." });
  const clash = KNOWN_HOTKEY_CONFLICTS[combo];
  if (clash) return void toast(`Saved, but ${combo} may clash with ${clash}`, "warn", { id });
  toast(`${label}: ${combo}`, "good", { id, detail: "Shortcut saved" });
}

function ConflictsCard() {
  const s = useApp((st) => st.settings);
  const mine = new Set([s.hotkeyToggle, s.hotkeyScan, s.hotkeyHud, s.hotkeyHudEdit]);
  return (
    <Card title="Shortcuts to avoid" icon="warning">
      <ul className="ref conflicts">
        {Object.entries(KNOWN_HOTKEY_CONFLICTS).map(([combo, what]) => (
          <li key={combo} className={mine.has(combo) ? "is-hit" : ""}>
            <Kbd>{combo}</Kbd>
            <span className="dim small">{what}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HotkeysSection() {
  const s = useApp((st) => st.settings);
  const errors = useApp((st) => st.hotkeyErrors);
  const all: Record<HotkeyField, string> = { hotkeyToggle: s.hotkeyToggle, hotkeyScan: s.hotkeyScan, hotkeyHud: s.hotkeyHud, hotkeyHudEdit: s.hotkeyHudEdit };
  const others = (f: HotkeyField) => (Object.keys(all) as HotkeyField[]).filter((k) => k !== f).map((k) => all[k]);
  const isDefault = (Object.keys(all) as HotkeyField[]).every((k) => all[k] === DEFAULT_SETTINGS[k]);
  return (
    <Card
      title="Keybinds"
      icon="settings"
      extra={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isDefault}
          onClick={() =>
            void actions
              .updateSettings({
                hotkeyToggle: DEFAULT_SETTINGS.hotkeyToggle,
                hotkeyScan: DEFAULT_SETTINGS.hotkeyScan,
                hotkeyHud: DEFAULT_SETTINGS.hotkeyHud,
                hotkeyHudEdit: DEFAULT_SETTINGS.hotkeyHudEdit,
              })
              .then(() => {
                const errors = getState().hotkeyErrors;
                if (errors.length) toast("Couldn't register the default shortcuts", "bad", { id: "hotkey", detail: errors[0] });
                else toast("Shortcuts reset to defaults", "good", { id: "hotkey" });
              })
          }
        >
          Reset to defaults
        </button>
      }
    >
      <KeybindRow field="hotkeyToggle" label="Show / hide overlay" hint="Opens this window over the game" value={s.hotkeyToggle} others={others("hotkeyToggle")} />
      <KeybindRow field="hotkeyScan" label="Scan augments" hint="Reads the augment cards on screen" value={s.hotkeyScan} others={others("hotkeyScan")} />
      <KeybindRow field="hotkeyHud" label="Toggle in-game HUD" hint="Shows / hides the passive layer" value={s.hotkeyHud} others={others("hotkeyHud")} />
      <KeybindRow
        field="hotkeyHudEdit"
        label="Edit HUD layout"
        hint="Drag / resize the mini HUD in game · Esc finishes"
        value={s.hotkeyHudEdit}
        others={others("hotkeyHudEdit")}
      />
      {errors.length > 0 && (
        <div className="warn">
          <Icon name="warning" size={16} />
          <div>
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        </div>
      )}
      <p className="dim small no-margin kb-help">
        Click a shortcut and press the new combination. <Kbd>Esc</Kbd> cancels, <Kbd>Backspace</Kbd> disables it. Shortcuts are global, so avoid
        League binds (Alt+Q/W/E, Ctrl+Q/W/E/R) and other overlays.
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ inputs

function TextSetting({ value, placeholder, onCommit, mono }: { value: string; placeholder: string; onCommit: (v: string) => void; mono?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft.trim() !== value && onCommit(draft.trim());
  return (
    <input
      className={`input ${mono ? "mono" : ""}`}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="slider">
      <span className="slider-top">
        <span className="field-label">{tr(label)}</span>
        <span className="slider-val tnum">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      {hint && <span className="field-hint">{tr(hint)}</span>}
    </label>
  );
}

const pct0 = (v: number) => `${Math.round(v * 100)}%`;

// ------------------------------------------------------------------ appearance

function ThemeSwatch({ id, active, onPick }: { id: ThemePreset; active: boolean; onPick: () => void }) {
  const p = THEME_PRESETS[id];
  const style = {
    "--sw-bg": `rgb(${p.bg})`,
    "--sw-panel": `rgb(${p.panel})`,
    "--sw-text": p.text,
    "--sw-muted": p.muted,
    "--sw-accent": p.accent,
    "--sw-accent2": p.accent2,
  } as CSSProperties;
  return (
    <button type="button" className={`swatch ${active ? "active" : ""}`} onClick={onPick} aria-pressed={active} style={style}>
      <span className="sw-preview">
        <span className="sw-top">
          <i className="sw-dot" />
          <i className="sw-line" />
        </span>
        <span className="sw-body">
          <span className="sw-nav">
            <i />
            <i />
            <i />
          </span>
          <span className="sw-cards">
            <span className="sw-card">
              <i className="sw-accent" />
              <i className="sw-text" />
              <i className="sw-text short" />
            </span>
            <span className="sw-card">
              <i className="sw-accent2" />
              <i className="sw-text" />
            </span>
          </span>
        </span>
      </span>
      <span className="sw-label">
        {p.label}
        {active && <Icon name="check" size={13} strokeWidth={2.6} />}
      </span>
    </button>
  );
}

function AppearanceSection() {
  const s = useApp((st) => st.settings);
  const t = s.theme;
  const preset = THEME_PRESETS[t.preset];
  const [scale, setScale] = useDebounced(t.scale, (v) => updateTheme({ scale: v }));
  const [radius, setRadius] = useDebounced(t.radius, (v) => updateTheme({ radius: v }));
  const [opacity, setOpacity] = useDebounced(s.opacity, (v) => update({ opacity: v }));
  const [accent, setAccent] = useDebounced(t.accent || preset.accent, (v) => updateTheme({ accent: v.toLowerCase() === preset.accent.toLowerCase() ? "" : v }), 150);

  return (
    <>
      <Card title="Theme" icon="spark">
        <div className="swatches">
          {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((id) => (
            <ThemeSwatch key={id} id={id} active={t.preset === id} onPick={() => updateTheme({ preset: id })} />
          ))}
        </div>
        <div className="accent-row">
          <div className="field-text">
            <span className="field-label">{tr("Accent color")}</span>
            <span className="field-hint">{t.accent ? "Custom accent" : `${preset.label} default`}</span>
          </div>
          <div className="accent-controls">
            <label className="color-pick" style={{ background: accent }}>
              <input
                type="color"
                value={accent}
                onChange={(e) => {
                  setVar("--accent", e.target.value);
                  setAccent(e.target.value);
                }}
                aria-label="Accent color"
              />
            </label>
            <code className="tnum">{accent.toUpperCase()}</code>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!t.accent} onClick={() => updateTheme({ accent: "" })}>
              Reset to preset
            </button>
          </div>
        </div>
      </Card>
      <Card title="Layout" icon="build">
        <Slider
          label="UI scale"
          value={scale}
          min={0.85}
          max={1.25}
          step={0.05}
          format={pct0}
          onChange={(v) => {
            setVar("--ui-scale", String(v));
            setScale(v);
          }}
        />
        <div className="field-row">
          <div className="field-text">
            <span className="field-label">{tr("Density")}</span>
            <span className="field-hint">{tr("Compact fits more on screen")}</span>
          </div>
          <Segmented<ThemeSettings["density"]>
            size="sm"
            label="Density"
            value={t.density}
            onChange={(density) => updateTheme({ density })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </div>
        <Slider
          label="Corner radius"
          value={radius}
          min={6}
          max={20}
          step={1}
          format={(v) => `${v}px`}
          onChange={(v) => {
            setVar("--radius", `${v}px`);
            setRadius(v);
          }}
        />
        <Toggle
          checked={s.seeThroughWindow}
          onChange={(v) => {
            void update({ seeThroughWindow: v });
            toast("Restart Nexis to apply", "info", { detail: v ? "The window will be see-through (uses more GPU; the mouse can feel less smooth over it)." : "The window will be solid (smoothest)." });
          }}
          label="See-through window"
          sub="Lets the game show through the overlay. Uses more GPU, and on some PCs the mouse feels less smooth over it. Applies after a restart."
        />
        {s.seeThroughWindow && (
        <Slider
          label="Background opacity"
          value={opacity}
          min={0.6}
          max={1}
          step={0.01}
          format={pct0}
          hint="Lower values let the game show through the glass."
          onChange={(v) => {
            setVar("--opacity", String(v));
            setOpacity(v);
          }}
        />
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm reset-look"
          onClick={() => {
            void actions.updateSettings({ theme: { ...DEFAULT_THEME, badgeScale: t.badgeScale }, opacity: DEFAULT_SETTINGS.opacity });
            toast("Appearance reset to defaults", "good", { id: "appearance", detail: `${THEME_PRESETS[DEFAULT_THEME.preset].label} theme, 100% scale` });
          }}
        >
          Reset appearance
        </button>
      </Card>
      <Card title="Window" icon="window">
        <WindowSettings />
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ in-game overlay

function ScanRegion({ region }: { region: Settings["scanRegion"] }) {
  const [r, setR] = useDebounced(region, (scanRegion) => update({ scanRegion }));
  const set = (k: keyof Settings["scanRegion"], v: number) => {
    const next = { ...r, [k]: v };
    next.w = Math.min(next.w, 1 - next.x);
    next.h = Math.min(next.h, 1 - next.y);
    setR(next);
  };
  return (
    <Card title="Augment scan region" icon="scan" className="span-2">
      <div className="region">
        <div className="region-sliders">
          <Slider label="Left" value={r.x} min={0} max={0.9} step={0.01} format={pct0} onChange={(v) => set("x", v)} />
          <Slider label="Top" value={r.y} min={0} max={0.9} step={0.01} format={pct0} onChange={(v) => set("y", v)} />
          <Slider label="Width" value={r.w} min={0.1} max={1} step={0.01} format={pct0} onChange={(v) => set("w", v)} />
          <Slider label="Height" value={r.h} min={0.1} max={1} step={0.01} format={pct0} onChange={(v) => set("h", v)} />
        </div>
        <div className="region-preview" aria-label="Scan region preview">
          <div className="screen">
            <div className="screen-cards">
              <span />
              <span />
              <span />
            </div>
            <div className="screen-rect" style={{ left: pct0(r.x), top: pct0(r.y), width: pct0(r.w), height: pct0(r.h) }} />
          </div>
          <span className="dim small">{tx("Part of your screen captured when scanning. The three cards mark where augments appear.")}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ scanRegion: DEFAULT_SETTINGS.scanRegion })}>
            Reset region
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Saves `settings.hud` (merged onto the latest stored value). */
const updateHud = (patch: Partial<HudSettings>) => void actions.updateSettings({ hud: { ...hudOf(getState().settings), ...patch } });

const HUD_WIDGET_INFO: Record<HudWidget, { label: string; sub: string }> = {
  shop: { label: "Shop", sub: "What to buy on your next back and what you're saving for (falls back to the next build item)" },
  path: { label: "Core build", sub: "Your six core items, owned ones checked off, the next one highlighted" },
  skill: { label: "Skill order", sub: "Max order — and the next ability to level when a skill point is free" },
  threats: { label: "Enemy damage & threats", sub: "AD / AP / true damage split, plus flags like healing, tanks or heavy CC" },
  augments: { label: "Augments", sub: "The augments you've taken this game (ARAM: Mayhem / Arena)" },
  farm: { label: "Farming (CS/min)", sub: "Your CS per minute — green at 7+ for lanes, 6+ for jungle on Summoner's Rift" },
  power: { label: "Team power", sub: "Team item-gold difference and your lane's (Summoner's Rift), from the scoreboard" },
};

/** Approximate on-screen width of the HUD (% of a 16:9 screen) for the position sketch. */
const hudWidthPct = (h: HudSettings) => (h.collapsed ? 5.5 : h.compact ? 9.5 : 14) * h.scale;

function HudLayoutCard() {
  const s = useApp((st) => st.settings);
  const data = useApp((st) => st.data);
  const hud = hudOf(s);
  const live = useHudModel();
  const [scale, setScale] = useDebounced(hud.scale, (v) => updateHud({ scale: v }), 150);
  const [opacity, setOpacity] = useDebounced(hud.opacity, (v) => updateHud({ opacity: v }), 150);
  const [hoverOpacity, setHoverOpacity] = useDebounced(hud.hoverOpacity, (v) => updateHud({ hoverOpacity: v }), 150);
  const [idleOpacity, setIdleOpacity] = useDebounced(hud.idleOpacity, (v) => updateHud({ idleOpacity: v }), 150);
  const [barX, setBarX] = useDebounced(hud.barX, (v) => updateHud({ barX: v }), 120);
  const [barY, setBarY] = useDebounced(hud.barY, (v) => updateHud({ barY: v }), 120);
  const [barGap, setBarGap] = useDebounced(hud.barGap, (v) => updateHud({ barGap: v }), 120);
  const view: HudSettings = { ...hud, scale, opacity };
  const usingLive = hudHasContent({ ...hud, collapsed: false }, live) && (live.path.length > 0 || !!live.next || !!live.shop);
  const model = usingLive ? live : sampleHudModel(data);
  const anyWidget = hud.order.some((w) => hud[WIDGET_FLAG[w]]);
  const frac = hudFrac(hud);
  const custom = hud.x !== null;
  const pick = (position: HudPosition) => updateHud({ position, x: null, y: null });
  const edit = () => {
    void setHudEdit(true, true);
    if (!isTauri) toast("Layout editing runs in the desktop app", "info", { detail: "Open the HUD view (?view=hud) to try it in a browser." });
  };

  return (
    <Card title="Mini HUD" icon="build" className="span-2">
      <div className={`hudset ${s.hudEnabled ? "" : "is-off"}`}>
        <div className="hudset-col">
          <div className="hudset-screen" aria-label="HUD position on screen">
            <span className="hudset-game g-score" />
            <span className="hudset-game g-chat" />
            <span className="hudset-game g-bar" />
            <span className="hudset-game g-map" />
            {HUD_POSITIONS.map((p) => {
              const f = presetFrac(p.value);
              const here = Math.abs(f.x - frac.x) < 0.02 && Math.abs(f.y - frac.y) < 0.02;
              if (here) return null;
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-label={`Move the HUD: ${p.label}`}
                  title={p.label}
                  className="hudset-spot hudset-preset"
                  style={{ "--fx": String(f.x), "--fy": String(f.y), width: `${hudWidthPct(view)}%` } as CSSProperties}
                  onClick={() => pick(p.value)}
                >
                  <span>{p.label}</span>
                </button>
              );
            })}
            <span
              className={`hudset-spot active ${hud.collapsed ? "is-pill" : ""}`}
              style={{ "--fx": String(frac.x), "--fy": String(frac.y), width: `${hudWidthPct(view)}%`, "--hud-a": String(opacity) } as CSSProperties}
              title={custom ? "Your custom position" : HUD_POSITIONS.find((p) => p.value === hud.position)?.label}
            >
              <span className="hudset-skel">
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
          </div>
          <div className="hudset-edit">
            <button type="button" className="btn btn-primary btn-sm" onClick={edit}>
              <Icon name="spark" size={14} />
              Edit layout in game
            </button>
            <span className="dim small">
              Or press <Kbd>{s.hotkeyHudEdit || "—"}</Kbd> in game: drag the HUD anywhere, resize it from the corner, <Kbd>Esc</Kbd> when done.
            </span>
          </div>
          <div className="field-row">
            <div className="field-text">
              <span className="field-label">{tr("Look")}</span>
              <span className="field-hint">{tr("Standard: next buy, skills and augments. Minimal: the same as small icons, without augments. Full: every widget and tips.")}</span>
            </div>
            <Segmented<HudPreset | "custom">
              size="sm"
              label="HUD preset"
              value={activeHudPreset(hud) ?? "custom"}
              onChange={(p) => p !== "custom" && updateHud(hudPreset(p))}
              options={[
                { value: "minimal", label: "Minimal" },
                { value: "standard", label: "Standard" },
                { value: "full", label: "Full" },
                ...(activeHudPreset(hud) ? [] : [{ value: "custom" as const, label: "Custom" }]),
              ]}
            />
          </div>
          <Slider label="HUD size" value={scale} min={HUD_SCALE.min} max={HUD_SCALE.max} step={0.05} format={pct0} onChange={setScale} />
          <Slider
            label="Panel opacity"
            value={opacity}
            min={HUD_OPACITY.min}
            max={HUD_OPACITY.max}
            step={0.01}
            format={pct0}
            hint="Only the panel fades — text and icons stay fully readable."
            onChange={setOpacity}
          />
          <div className="field">
            <Segmented<HudSettings["hoverMode"]>
              size="sm"
              label="When your mouse is over it"
              value={hud.hoverMode}
              onChange={(hoverMode) => updateHud({ hoverMode })}
              options={[
                { value: "off", label: "Keep" },
                { value: "fade", label: "Fade" },
                { value: "hide", label: "Hide" },
              ]}
            />
            <span className="field-hint">
              {hud.hoverMode === "off"
                ? "The panel stays as it is when you mouse over it."
                : hud.hoverMode === "fade"
                  ? "The panel turns see-through while your mouse is over it, so you can see the game behind it."
                  : "The panel disappears while your mouse is over it and comes back when you move away."}
            </span>
          </div>
          {hud.hoverMode === "fade" && (
            <Slider
              label="Opacity on hover"
              value={hoverOpacity}
              min={HUD_HOVER_OPACITY.min}
              max={HUD_HOVER_OPACITY.max}
              step={0.05}
              format={pct0}
              onChange={setHoverOpacity}
            />
          )}
          <Toggle
            checked={s.hudPerMode}
            onChange={(v) => void actions.updateSettings({ hudPerMode: v, ...(v ? {} : { hudByMode: {} }) })}
            label="Separate layout per mode"
            sub={s.hudPerMode ? `Mayhem, ARAM, Arena and Rift each keep their own HUD. You're editing the ${MODE_LABEL[effectiveMode(getState())]} layout.` : "Give Mayhem, ARAM, Arena and Rift their own HUD position and widgets"}
          />
          <Toggle
            checked={hud.idleDim}
            onChange={(v) => updateHud({ idleDim: v })}
            label="Fade during play"
            sub="Mostly see-through while you play; fully visible when you're dead, have gold for your next item, have a skill point, see augments, in the first 90 s, or hover it"
          />
          {hud.idleDim && <Slider label="Opacity while faded" value={idleOpacity} min={HUD_IDLE_OPACITY.min} max={HUD_IDLE_OPACITY.max} step={0.05} format={pct0} onChange={setIdleOpacity} />}
          <Toggle
            checked={hud.levelArrows}
            onChange={(v) => updateHud({ levelArrows: v })}
            label="Level-up arrow on League's ability bar"
            sub="When you have a skill point, a glowing arrow appears over the ability your build levels next, on the game's own bottom bar"
          />
          {hud.levelArrows && (
            <div className="field-stack">
              <Slider label="Ability bar: left / right" value={barX} min={BAR.x.min} max={BAR.x.max} step={0.001} format={(v) => `${(v * 100).toFixed(1)}%`} onChange={setBarX} />
              <Slider label="Ability bar: up / down" value={barY} min={BAR.y.min} max={BAR.y.max} step={0.001} format={(v) => `${(v * 100).toFixed(1)}%`} onChange={setBarY} />
              <Slider label="Ability bar: spacing" value={barGap} min={BAR.gap.min} max={BAR.gap.max} step={0.001} format={(v) => `${(v * 100).toFixed(1)}%`} onChange={setBarGap} hint="Match League's HUD scale (Settings → Interface)." />
              {isTauri && (
                <button type="button" className="btn btn-sm" onClick={() => void setHudPreview(true)}>
                  {tr("Line up on the game screen")}
                </button>
              )}
            </div>
          )}
          <Toggle checked={hud.showTips} onChange={(v) => updateHud({ showTips: v })} label="Show tips" sub="Shop tips, why each item is suggested and the game phase on the HUD" />
          <Toggle checked={hud.collapsed} onChange={(v) => updateHud({ collapsed: v })} label="Collapse to a pill" sub="Just the next buy (and a skill point reminder) in a tiny pill" />
          <Toggle checked={hud.compact} onChange={(v) => updateHud({ compact: v })} label="Compact" sub="Icons only — a narrow strip with no labels" />
          <Toggle
            checked={hud.deathShop}
            onChange={(v) => updateHud({ deathShop: v })}
            label="Shop view while dead"
            sub="While you're dead the HUD opens up with the shop first (and your respawn time), then goes back to your layout"
          />
          <Toggle
            checked={hud.pickReminder}
            onChange={(v) => updateHud({ pickReminder: v })}
            label="Augment pick reminder"
            sub="When augment cards are detected, a reminder to mark your pick in Nexis shows for ~8 seconds"
          />
          <Toggle
            checked={hud.showHint}
            onChange={(v) => updateHud({ showHint: v })}
            label="Full-view hint"
            sub={
              <>
                A small <Kbd>{s.hotkeyToggle}</Kbd> reminder at the bottom of the HUD
              </>
            }
          />
        </div>
        <div className="hudset-col">
          <div className="hudset-stage nl-tokens" aria-label="HUD preview">
            <span className="hudset-stage-tag">{usingLive ? "Preview · your current game" : "Preview · sample build"}</span>
            {anyWidget || hud.collapsed ? (
              <HudCard hud={view} model={model} hotkey={s.hotkeyToggle} inline />
            ) : (
              <span className="hudset-empty">{tx("All widgets are off \u2014 turn one on below to show the HUD in game.")}</span>
            )}
          </div>
          <div className="hudset-mods" role="list" aria-label="HUD widgets (top to bottom)">
            {hud.order.map((w, i) => (
              <div key={w} className="hudset-mod" role="listitem">
                <Toggle checked={hud[WIDGET_FLAG[w]]} onChange={(v) => updateHud({ [WIDGET_FLAG[w]]: v })} label={HUD_WIDGET_INFO[w].label} sub={HUD_WIDGET_INFO[w].sub} />
                <span className="hudset-order">
                  <button type="button" className="btn btn-ghost btn-xs" disabled={i === 0} aria-label={`Move ${HUD_WIDGET_INFO[w].label} up`} onClick={() => updateHud({ order: moveWidget(hud.order, w, -1) })}>
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    disabled={i === hud.order.length - 1}
                    aria-label={`Move ${HUD_WIDGET_INFO[w].label} down`}
                    onClick={() => updateHud({ order: moveWidget(hud.order, w, 1) })}
                  >
                    ▼
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="hudset-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void actions.updateSettings({ hud: { ...HUD_DEFAULTS, order: [...HUD_DEFAULTS.order] } })}>
              Reset HUD to defaults
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function OverlaySection() {
  const s = useApp((st) => st.settings);
  const [offset, setOffset] = useDebounced(s.badgeOffset, (v) => update({ badgeOffset: v }));
  const [badge, setBadge] = useDebounced(s.theme.badgeScale, (v) => updateTheme({ badgeScale: v }));
  return (
    <>
      <Card title="In-game layer" icon="spark">
        <Toggle
          checked={s.hudEnabled}
          onChange={(v) => update({ hudEnabled: v })}
          label="In-game HUD"
          sub={
            <>
              Shop advice, core build, skill order and enemy threats, drawn passively over the game · <Kbd>{s.hotkeyHud}</Kbd>
            </>
          }
        />
        <Toggle
          checked={s.autoDetectAugments}
          onChange={(v) => update({ autoDetectAugments: v })}
          label="Auto-detect augments"
          sub="Shows tier badges on the augment cards automatically"
        />
        <Toggle
          checked={s.detectPicks}
          onChange={(v) => update({ detectPicks: v })}
          label="Detect your pick"
          sub="Marks the augment you choose when only that card is left on screen (reads the screen only, never your mouse)"
        />
      </Card>
      <Card title="Tier badges" icon="augments">
        <div className="field-row">
          <div className="field-text">
            <span className="field-label">{tr("Badge position")}</span>
            <span className="field-hint">{tr("Above keeps the reroll buttons under the cards clear")}</span>
          </div>
          <Segmented<"above" | "below">
            size="sm"
            label="Badge position"
            value={s.badgePlacement}
            onChange={(badgePlacement) => update({ badgePlacement })}
            options={[
              { value: "above", label: "Above cards" },
              { value: "below", label: "Below cards" },
            ]}
          />
        </div>
        <Slider label="Badge size" value={badge} min={0.75} max={1.5} step={0.05} format={pct0} onChange={setBadge} />
        <Slider
          label="Badge vertical offset"
          value={offset}
          min={-0.1}
          max={0.1}
          step={0.005}
          format={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`}
          hint="Nudge the badges if they overlap the cards at your resolution."
          onChange={setOffset}
        />
      </Card>
      <HudLayoutCard />
      <ScanRegion region={s.scanRegion} />
    </>
  );
}

// ------------------------------------------------------------------ general / data / about

function AutostartToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void getAutostart().then(setOn, () => setOn(null));
  }, []);
  if (on === null) return null; // browser preview / not available
  return (
    <Toggle
      checked={on}
      onChange={(v) =>
        void setAutostart(v).then(setOn, (e) => toast(`Couldn't change Launch with Windows: ${String(e)}`, "warn"))
      }
      label="Launch with Windows"
      sub="Adds Nexis to your Windows startup apps (removed again when you turn this off)"
    />
  );
}

function GeneralSection() {
  const s = useApp((st) => st.settings);
  const [startGold, setStartGold] = useDebounced(s.startGold, (v) => update({ startGold: v }));
  return (
    <>
      <Card title="Overlay behavior" icon="spark">
        <div className="field">
          <Segmented<"off" | "compact" | "full">
            size="sm"
            label="In champ select"
            value={!s.autoShowChampSelect ? "off" : s.champSelectFull ? "full" : "compact"}
            onChange={(v) => update({ autoShowChampSelect: v !== "off", champSelectFull: v === "full" })}
            options={[
              { value: "compact", label: "Compact" },
              { value: "full", label: "Full overlay" },
              { value: "off", label: "Don't open" },
            ]}
          />
          <span className="field-hint">
            {tr(
              !s.autoShowChampSelect
                ? "Nothing opens in champ select; use the hotkey when you want it."
                : s.champSelectFull
                  ? "Opens the full overlay with the pick helper and your build."
                  : "A small window at the side with your build and skill order — it doesn't cover champ select. Expand (or the hotkey) opens the full overlay.",
            )}
          </span>
        </div>
        <Toggle
          checked={s.startHidden}
          onChange={(v) => update({ startHidden: v })}
          label="Start hidden in the tray"
          sub="Launch quietly; open with the hotkey, the tray icon or champ select"
        />
        <AutostartToggle />
        <Toggle
          checked={s.autoHideInGame}
          onChange={(v) => update({ autoHideInGame: v })}
          label="Hide when the game starts"
          sub={
            <>
              Never covers your screen at spawn — reopen any time with <Kbd>{s.hotkeyToggle}</Kbd>
            </>
          }
        />
        <Toggle checked={s.showPostGame} onChange={(v) => update({ showPostGame: v })} label="Post-game summary" sub="Opens a short recap of your game when it ends" />
        <div className="field-row">
          <div className="field-text">
            <span className="field-label">{tr("Language")}</span>
            <span className="field-hint">{tr("Menus, cards and settings. Champion, item and augment names stay in English.")}</span>
          </div>
          <select className="mode-select" aria-label="Language" value={s.language} onChange={(e) => update({ language: e.target.value as Lang })}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <Toggle
          checked={s.alwaysOnTop}
          onChange={(v) => update({ alwaysOnTop: v })}
          label="Keep Nexis on top"
          sub="Keeps the Nexis window above all other windows. Off: it behaves like a normal window and goes behind whatever you click (the in-game HUD always stays over the game)."
        />
        <Toggle checked={s.streamerMode} onChange={(v) => update({ streamerMode: v })} label="Streamer mode" sub="Hides every player name and Riot ID (players show as their champion), so Nexis is safe to show on stream" />
      </Card>
      <Card title="Builds" icon="build">
        <div className="field-stack">
          <span className="field-label">{tr("Default playstyle")}</span>
          <Segmented<Playstyle> size="sm" label="Default playstyle" options={PLAYSTYLES} value={s.playstyle} onChange={(playstyle) => update({ playstyle })} />
          <span className="field-hint">{tr(PLAYSTYLES.find((p) => p.value === s.playstyle)?.hint ?? "")}. {tr("Also switchable from the top bar.")}</span>
        </div>
        <Slider
          label="Starting gold"
          value={startGold}
          min={500}
          max={3000}
          step={50}
          format={(v) => `${gold(v)}g`}
          hint="ARAM Mayhem starting gold — used for the starting items suggestion."
          onChange={setStartGold}
        />
      </Card>
      <LeagueClientCard />
      <Card title="Quick reference" icon="info">
        <ul className="ref">
          <li>
            <span>{tx("Show / hide overlay")}</span>
            <Kbd>{s.hotkeyToggle}</Kbd>
          </li>
          <li>
            <span>{tx("Scan augments")}</span>
            <Kbd>{s.hotkeyScan}</Kbd>
          </li>
          <li>
            <span>{tx("Toggle in-game HUD")}</span>
            <Kbd>{s.hotkeyHud}</Kbd>
          </li>
        </ul>
        <p className="dim small no-margin">{tx("The overlay opens automatically when a game starts; it never sends inputs to the game.")}</p>
      </Card>
      <DiscordCard />
    </>
  );
}

/** Optional Discord status. Needs the user's own (free) Discord application ID. */
function DiscordCard() {
  const d = useApp((st) => st.settings.discord);
  const [id, setId] = useState(d.appId);
  const valid = /^\d{15,22}$/.test(id.trim());
  return (
    <Card title="Discord status" icon="user">
      <Toggle
        checked={d.enabled}
        onChange={(v) => update({ discord: { ...d, enabled: v } })}
        label="Show on Discord"
        sub="Your Discord profile shows “Playing Ahri · ARAM: Mayhem” during games and champ select. Off by default; only talks to the Discord app on this PC."
      />
      <div className="field">
        <span className="field-label">{tr("Discord application ID")}</span>
        <div className="discord-id-row">
          <input
            className="input"
            value={id}
            onChange={(e) => setId(e.target.value)}
            onBlur={() => update({ discord: { ...d, appId: id.trim() } })}
            placeholder="e.g. 1234567890123456789"
            aria-label="Discord application ID"
            inputMode="numeric"
            spellCheck={false}
          />
        </div>
        <span className={`field-hint ${id && !valid ? "err" : ""}`}>
          {id && !valid
            ? tr("That doesn't look like an application ID (15–22 digits).")
            : tr("One-time setup: open discord.com/developers/applications, click New Application, name it “Nexis Overlay”, then copy its Application ID here.")}
        </span>
      </div>
    </Card>
  );
}

/** Opt-in "Import to League" — the only feature that writes anything, and only to the League client. */
function LeagueClientCard() {
  const li = useApp((st) => st.settings.leagueImport);
  const connected = useLeagueClientConnected();
  const set = (patch: Partial<Settings["leagueImport"]>) => update({ leagueImport: { ...li, ...patch } });
  const anyOn = li.runes || li.itemSets;
  return (
    <Card
      title="League client"
      icon="external"
      className="league-client-card"
      extra={
        <Pill tone={connected ? "green" : "muted"} dot title={connected ? "The League client is running" : "The League client isn't running (or not detected yet)"}>
          {connected ? "Client connected" : "Client not detected"}
        </Pill>
      }
    >
      <div className="league-client-note">
        <Icon name="info" size={15} />
        <div>
          <p>
            <b>Import to League</b> is the only Nexis feature that writes anything — and only to the <b>League client</b> (rune pages and item
            sets), never to the game. It uses Riot&apos;s own client endpoints, the same ones companion apps like Blitz or U.GG use.
          </p>
          <p className="dim">Off by default. Nexis only replaces rune pages and item sets whose name starts with &quot;Nexis:&quot;.</p>
        </div>
      </div>
      <Toggle checked={li.runes} onChange={(v) => set({ runes: v })} label="Import rune pages" sub={'Creates "Nexis: <champion>" with the recommended runes and shards'} />
      <Toggle
        checked={li.itemSets}
        onChange={(v) => set({ itemSets: v })}
        label="Import item sets"
        sub="Starting items, core build, boots and situational counters in the in-game shop"
      />
      <Toggle
        checked={li.auto}
        onChange={(v) => set({ auto: v })}
        label="Import automatically in champ select"
        sub={
          anyOn
            ? "Once per champion, a moment after you lock it in (otherwise use the Import to League button on the Build tab)"
            : "Turn on rune pages and/or item sets above first"
        }
      />
    </Card>
  );
}

function WebStatsCard() {
  const s = useApp((st) => st.settings);
  const web = useApp((st) => st.web);
  const gameVersion = useApp((st) => st.data?.version);
  const pill = !s.webStats ? (
    <Pill dot>Off</Pill>
  ) : web.status === "ok" ? (
    <Pill tone="green" dot>
      Live
    </Pill>
  ) : web.status === "loading" ? (
    <Pill tone="gold" dot>
      Loading…
    </Pill>
  ) : web.status === "error" ? (
    <Pill tone="red" dot>
      Unavailable
    </Pill>
  ) : (
    <Pill dot>Idle</Pill>
  );
  const loaded = Object.values(web.champions).filter((c) => typeof c === "object").length;
  const refresh = () => {
    const id = toast("Refreshing live stats…", "info", { id: "refresh", duration: 0 });
    actions.refreshData().then(
      () => {
        const w = getState().web;
        if (w.status === "error") toast("Couldn't refresh stats", "bad", { id, detail: w.error ? w.error.replace(/^Error:\s*/, "") : "The stats sites didn't respond. Using cached data." });
        else toast("Stats refreshed", "good", { id, detail: w.patch ? `Patch ${displayPatch(w.patch)} · ${w.totalAugments} augments` : undefined });
      },
      (e: unknown) => toast("Couldn't refresh stats", "bad", { id, detail: e instanceof Error ? e.message : String(e) }),
    );
  };
  return (
    <Card title="Live ARAM: Mayhem stats" icon="spark" extra={pill}>
      <Toggle
        checked={s.webStats}
        onChange={(v) => update({ webStats: v })}
        label="Use live web stats"
        sub="ARAM: Mayhem from HexMayhem; ARAM and Summoner's Rift from OP.GG — per-champion win & pick rates, builds, items, runes, skill orders, summoner spells and augments. Refreshed every 3 h. No API key needed."
      />
      {s.webStats && web.status === "ok" && (
        <span className="field-hint">
          Mayhem patch {displayPatch(web.patch) ?? "?"}
          {web.dataDate ? ` · data from ${web.dataDate}` : ""} · {web.totalAugments} augments · {loaded} champion page{loaded === 1 ? "" : "s"} loaded
          {web.fetchedAt ? ` · checked ${new Date(web.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          {gameVersion && web.patch && !gameVersion.startsWith(web.patch) ? ` · game is on ${displayPatch(gameVersion)}, stats catch up shortly after a patch` : ""}
        </span>
      )}
      {s.webStats && (
        <div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={web.status === "loading"} onClick={refresh}>
            <Icon name="history" size={14} />
            {web.status === "loading" ? "Refreshing…" : "Refresh stats now"}
          </button>
        </div>
      )}
      {s.webStats && web.status === "error" && <span className="field-hint err">{web.error} — falling back to your other data sources.</span>}
      <span className="field-hint">{tr("Reads public pages on hexmayhem.com and op.gg (not affiliated with Nexis). If a site changes or is down, Nexis falls back to the Riot dataset, your own games and baseline builds.")}</span>
    </Card>
  );
}

function DataSection() {
  const s = useApp((st) => st.settings);
  const stats = useApp((st) => st.stats);
  const statsStatus = useApp((st) => st.statsStatus);
  const statsError = useApp((st) => st.statsError);
  const statusPill =
    statsStatus === "ok" ? (
      <Pill tone="green" dot>
        Connected
      </Pill>
    ) : statsStatus === "loading" ? (
      <Pill tone="gold" dot>
        Loading…
      </Pill>
    ) : statsStatus === "error" ? (
      <Pill tone="red" dot>
        Unavailable
      </Pill>
    ) : (
      <Pill dot>Not set</Pill>
    );
  return (
    <>
      <WebStatsCard />
      <Card title="Win-rate stats (Riot API dataset)" icon="history" extra={statusPill}>
        <div className="field-stack">
          <span className="field-label">{tr("Stats source URL")}</span>
          <TextSetting value={s.statsUrl} placeholder="https://…/stats.json" onCommit={(v) => update({ statsUrl: v })} mono />
          {statsStatus === "ok" && stats && (
            <span className="field-hint">
              Patch {displayPatch(stats.patch)} · {gold(stats.totalGames)} games · generated {new Date(stats.generatedAt).toLocaleDateString()}
            </span>
          )}
          {statsStatus === "error" && <span className="field-hint err">{statsError}</span>}
          <span className="field-hint">
            Optional dataset built from the official Riot API — see <code>docs/STATS.md</code>. Without it, Nexis uses curated baselines and your own games.
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm reset-look"
          disabled={s.statsUrl === DEFAULT_SETTINGS.statsUrl}
          onClick={() => update({ statsUrl: DEFAULT_SETTINGS.statsUrl })}
        >
          Use default source
        </button>
      </Card>
      <Card title="League of Legends" icon="settings">
        <div className="field-stack">
          <span className="field-label">{tr("Install path")}</span>
          <TextSetting value={s.leaguePath} placeholder="C:\Riot Games\League of Legends" onCommit={(v) => update({ leaguePath: v })} mono />
          <span className="field-hint">{tr("Leave empty to detect automatically.")}</span>
        </div>
      </Card>
    </>
  );
}

const REPO_URL = "https://github.com/exodux-dev/NexisOverlay";
const KOFI_URL = "https://ko-fi.com/exoduxdev";

const CREDITS: Array<{ name: string; what: string; url: string }> = [
  { name: "HexMayhem", what: "ARAM: Mayhem augment & champion stats", url: "https://hexmayhem.com" },
  { name: "OP.GG", what: "ARAM & Summoner's Rift stats, player profiles", url: "https://op.gg" },
  { name: "Riot Data Dragon", what: "Champion, item & rune data and icons", url: "https://developer.riotgames.com/docs/lol#data-dragon" },
];

/** External link. The desktop webview can't open a browser on its own, so there it copies the URL instead. */
function ExtLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      className={`ext-link ${className}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!isTauri) return;
        e.preventDefault();
        void openUrl(href).catch(() =>
          navigator.clipboard
            ?.writeText(href)
            .then(() => toast("Link copied", "info", { id: "link", detail: `${href} · paste it in your browser` })),
        );
      }}
    >
      {children}
      <Icon name="external" size={12} className="ext-icon" />
    </a>
  );
}

function useAppInfo() {
  const [info, setInfo] = useState<AppInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getAppInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

function StorageInfo({ info }: { info: AppInfo | null | undefined }) {
  if (!info) {
    return (
      <div className="about-storage">
        <span className="field-label">
          <Icon name="folder" size={14} /> Storage
        </span>
        <span className="field-hint">{tr("Running in a browser: settings are kept in this browser's local storage.")}</span>
      </div>
    );
  }
  return (
    <div className="about-storage">
      <span className="field-label">
        <Icon name="folder" size={14} /> {info.portable ? "Portable storage" : "Fallback storage"}
      </span>
      <span className="field-hint">
        {info.portable
          ? "Everything (settings, match history, caches) is stored in the data folder next to the app. Delete the folder to remove Nexis completely."
          : "Nexis couldn't write next to its exe (e.g. it's in Program Files), so data is in your user profile. Move the Nexis folder somewhere writable to keep everything in one place."}
      </span>
      <code className="about-path mono">{info.dataDir}</code>
    </div>
  );
}

/** "Your data & safety": what Nexis writes, where, and how settings are protected. */
function DataSafetyCard({ info }: { info: AppInfo | null | undefined }) {
  const items = [
    "Settings, match history and caches live only in Nexis's data folder (shown under App). No registry, no cloud, no account.",
    "Saves are atomic, and settings.json / history.json keep a backup of the last good version (*.bak.json).",
    "If a file can't be read, a copy is kept (*.corrupt-<date>.json) and it's never overwritten until you change something. Updates only add new settings, never reset yours.",
    "Nexis never writes League's game files or config. It only reads them (e.g. to check Borderless mode).",
    "The only thing Nexis can change in League is opt-in: Import to League creates or replaces just the rune page and item set named “Nexis: …” in the League client.",
  ];
  return (
    <Card title="Your data & safety" icon="shield" className="about-card">
      {info?.settingsNotice && (
        <div className="settings-notice" role="status">
          <Icon name="warning" size={15} />
          <span>{info.settingsNotice}</span>
        </div>
      )}
      <ul className="safety-list">
        {items.map((t) => (
          <li key={t}>
            <Icon name="check" size={14} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Settings → About: manual update check. */
function UpdateCheck() {
  const [st, setSt] = useState<"idle" | "checking" | "latest" | "available" | "error" | "dev">("idle");
  const update = useApp((x) => x.update);
  const label = { idle: "", checking: "Checking…", latest: "You're on the newest build.", available: "A newer build is available: see Update in the top bar.", error: "Couldn't reach GitHub. Try again later.", dev: "Development build: updates aren't checked." }[st];
  return (
    <div className="field-row">
      <div className="field-text">
        <span className="field-label">{tr("Updates")}</span>
        <span className="field-hint">{label || (update ? tr("A newer build is available: see Update in the top bar.") : tr("Nexis checks GitHub for a newer build every few hours."))}</span>
      </div>
      <button
        type="button"
        className="btn btn-sm"
        disabled={st === "checking"}
        onClick={() => {
          setSt("checking");
          void actions.checkForUpdates().then(setSt);
        }}
      >
        {tr("Check for updates")}
      </button>
    </div>
  );
}

function AboutSection() {
  const s = useApp((st) => st.settings);
  const patch = useApp((st) => st.data?.version);
  const info = useAppInfo();
  const appVersion = info?.version ? `v${info.version}` : info === undefined ? "…" : "Dev build";
  return (
    <>
      <Card className="about-hero span-2">
        <div className="about-brand">
          <span className="about-mark">
            <LogoMark size={40} />
          </span>
          <div className="about-id">
            <span className="about-name">Nexis Overlay</span>
            <span className="about-tag">{tx("Free, open-source League of Legends companion")}</span>
            <span className="about-meta">
              <Pill tone="teal">{appVersion}</Pill>
              {patch && <Pill>Game data {displayPatch(patch)}</Pill>}
              <Pill>MIT license</Pill>
            </span>
          </div>
          <div className="about-hero-actions">
            <button type="button" className="btn btn-sm" onClick={showOnboarding}>
              <Icon name="play" size={13} />
              Show welcome tour
            </button>
            <ExtLink href={REPO_URL} className="btn btn-ghost btn-sm">
              GitHub
            </ExtLink>
            <ExtLink href={KOFI_URL} className="btn btn-ghost btn-sm about-kofi">
              <Icon name="heart" size={13} />
              {tx("Support on Ko-fi")}
            </ExtLink>
          </div>
        </div>
        <UpdateCheck />
      </Card>
      <Card title="Fair play" icon="shield" className="about-card">
        <ul className="fair">
          <li>
            <Icon name="check" size={14} /> Read-only: uses Riot's official Live Client Data API.
          </li>
          <li>
            <Icon name="check" size={14} /> Augment detection takes passive screenshots of your own screen.
          </li>
          <li>
            <Icon name="check" size={14} /> No memory reading, injection or automation of any kind.
          </li>
        </ul>
        <p className="dim small no-margin">
          Nexis Overlay isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or
          managing League of Legends. League of Legends is a trademark of Riot Games, Inc.
        </p>
      </Card>
      <DataSafetyCard info={info} />
      <Card title="Keyboard shortcuts" icon="keyboard">
        <ul className="ref">
          <li>
            <span>{tx("Show / hide overlay")}</span>
            <Kbd>{s.hotkeyToggle}</Kbd>
          </li>
          <li>
            <span>{tx("Scan augments")}</span>
            <Kbd>{s.hotkeyScan}</Kbd>
          </li>
          <li>
            <span>{tx("Toggle in-game HUD")}</span>
            <Kbd>{s.hotkeyHud}</Kbd>
          </li>
          <li>
            <span>{tx("Close dialogs, or hide the overlay")}</span>
            <Kbd>Esc</Kbd>
          </li>
        </ul>
        <p className="dim small no-margin">{tx("Change them in the Hotkeys section.")}</p>
      </Card>
      <Card title="Data & credits" icon="heart">
        <ul className="credits">
          {CREDITS.map((c) => (
            <li key={c.name}>
              <ExtLink href={c.url}>{c.name}</ExtLink>
              <span className="dim small">{c.what}</span>
            </li>
          ))}
        </ul>
        <p className="dim small no-margin">{tx("Stats sites aren't affiliated with Nexis. Thanks for keeping the data public.")}</p>
      </Card>
      <Card title="App" icon="power">
        <p className="dim small no-margin">
          Hide the overlay with <Kbd>{s.hotkeyToggle}</Kbd> and Nexis keeps running in the tray. Quitting stops game detection and hotkeys.
        </p>
        <StorageInfo info={info} />
        <div>
          <button type="button" className="btn btn-danger" onClick={actions.quit}>
            <Icon name="power" size={15} />
            Quit Nexis
          </button>
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ view

type Section = "general" | "hotkeys" | "appearance" | "overlay" | "data" | "diagnostics" | "about";

const SECTIONS: Array<{ id: Section; label: string; icon: IconName }> = [
  { id: "general", label: "General", icon: "build" },
  { id: "hotkeys", label: "Hotkeys", icon: "settings" },
  { id: "appearance", label: "Appearance", icon: "spark" },
  { id: "overlay", label: "In-game overlay", icon: "scan" },
  { id: "data", label: "Data", icon: "history" },
  { id: "diagnostics", label: "Diagnostics", icon: "shield" },
  { id: "about", label: "About", icon: "info" },
];

let lastSection: Section = "general";

export function SettingsView() {
  const [section, setSection] = useState<Section>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("settings");
    return SECTIONS.some((s) => s.id === fromUrl) ? (fromUrl as Section) : lastSection;
  });
  const errors = useApp((st) => st.hotkeyErrors.length);
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;
  const grid = useRef<HTMLDivElement>(null);
  const [noMatch, setNoMatch] = useState(false);
  const pick = (s: Section) => {
    lastSection = s;
    setSection(s);
    setQ("");
  };
  // Search: every section is shown and filtered by text — a card whose title matches stays whole,
  // otherwise only its matching rows stay. (The grid remounts per query, so styles start clean.)
  useEffect(() => {
    if (!searching || !grid.current) return setNoMatch(false);
    const needle = q.trim().toLowerCase();
    let any = false;
    for (const card of Array.from(grid.current.querySelectorAll<HTMLElement>(":scope > .card"))) {
      const title = card.querySelector(".card-title")?.textContent?.toLowerCase() ?? "";
      if (title.includes(needle)) {
        any = true;
        continue;
      }
      const rows = Array.from(card.querySelectorAll<HTMLElement>(".toggle-row, .field-row, .field, .kb-row, .hudset-mod"));
      let hit = false;
      for (const r of rows) {
        const ok = (r.textContent ?? "").toLowerCase().includes(needle);
        r.style.display = ok ? "" : "none";
        hit ||= ok;
      }
      card.style.display = hit ? "" : "none";
      any ||= hit;
    }
    setNoMatch(!any);
  }, [q, searching]);
  const body: Record<Section, ReactNode> = {
    general: <GeneralSection />,
    hotkeys: (
      <>
        <HotkeysSection />
        <ConflictsCard />
      </>
    ),
    appearance: <AppearanceSection />,
    overlay: <OverlaySection />,
    data: <DataSection />,
    diagnostics: <DiagnosticsSection />,
    about: <AboutSection />,
  };
  return (
    <div className="view view-settings">
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={!searching && section === s.id}
            className={`settings-tab ${!searching && section === s.id ? "active" : ""}`}
            onClick={() => pick(s.id)}
            data-section={s.id}
          >
            <Icon name={s.icon} size={15} />
            {tr(s.label)}
            {s.id === "hotkeys" && errors > 0 && <span className="tab-alert" />}
          </button>
        ))}
        <label className="search search-sm settings-search">
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search settings")} aria-label="Search settings" spellCheck={false} />
        </label>
      </div>
      {searching ? (
        <div className="settings-grid settings-search-results" key={`search-${q}`} ref={grid}>
          <GeneralSection />
          <HotkeysSection />
          <AppearanceSection />
          <OverlaySection />
          <DataSection />
          {noMatch && <p className="dim">{tr("No settings match")} “{q}”.</p>}
        </div>
      ) : (
        <div className={`settings-grid settings-${section}`} key={section}>
          {body[section]}
        </div>
      )}
    </div>
  );
}
