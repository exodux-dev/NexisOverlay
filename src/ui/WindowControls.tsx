// Main-window size & placement controls: size presets, lock, edge/corner resize grips,
// Esc-to-hide and the "use Borderless" hint. Placement itself is saved by the backend
// (src-tauri/src/window.rs) — nothing here touches settings.json except the lock toggle.

import { t as tx } from "../i18n";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { actions, useApp } from "../app/store";
import {
  WINDOW_PRESETS,
  currentPreset,
  isTauri,
  leagueWindowMode,
  resetWindow,
  setWindowPreset,
  startResize,
  type LeagueWindowMode,
  type ResizeDirection,
  type WindowPreset,
} from "../bridge";
import { Toggle } from "./controls";
import { Icon } from "./icons";
import "./window-controls.css";

// ------------------------------------------------------------------ window size (live)

const subscribeResize = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const sizeKey = () => `${window.innerWidth}x${window.innerHeight}`;

/** Current preset (re-renders on window resize). */
export function useWindowPreset(): WindowPreset | null {
  const key = useSyncExternalStore(subscribeResize, sizeKey, () => "0x0");
  const [w, h] = key.split("x").map(Number);
  return currentPreset(w, h);
}

/** Double-click on the top bar: Compact ⇄ Standard. */
export function toggleCompact() {
  void setWindowPreset(currentPreset() === "compact" ? "standard" : "compact");
}

function PresetButtons({ active }: { active: WindowPreset | null }) {
  return (
    <div className="win-presets" role="group" aria-label="Window size">
      {WINDOW_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`win-preset ${active === p.id ? "active" : ""}`}
          aria-pressed={active === p.id}
          onClick={() => void setWindowPreset(p.id)}
          disabled={!isTauri}
          title={isTauri ? `${p.w} × ${p.h}` : "Available in the desktop app"}
        >
          <span className={`win-preset-glyph win-glyph-${p.id}`} aria-hidden="true" />
          <span className="win-preset-label">{p.label}</span>
          <span className="win-preset-size tnum">
            {p.w}×{p.h}
          </span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ top bar popover

export function WindowMenu() {
  const [open, setOpen] = useState(false);
  const locked = useApp((s) => s.settings.windowLocked);
  const active = useWindowPreset();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // handled: don't also hide the overlay
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="tb-window" ref={ref}>
      <button
        type="button"
        className={`icon-btn tb-window-btn ${open ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Window size & position"
        aria-label="Window size & position"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Icon name={locked ? "lock" : "window"} size={15} />
      </button>
      {open && (
        <div className="win-pop" role="dialog" aria-label="Window size & position">
          <span className="win-pop-title">{tx("Window size")}</span>
          <PresetButtons active={active} />
          <Toggle checked={locked} onChange={(windowLocked) => void actions.updateSettings({ windowLocked })} label="Lock position" sub="No dragging or edge-resizing" />
          <div className="win-pop-foot">
            <span className="dim small">{tx("Drag the top bar to move \u00b7 edges to resize \u00b7 double-click the bar for Compact")}</span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!isTauri} onClick={() => void resetWindow()}>
              Re-center
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ resize grips

const GRIPS: Array<{ dir: ResizeDirection; cls: string }> = [
  { dir: "North", cls: "n" },
  { dir: "South", cls: "s" },
  { dir: "East", cls: "e" },
  { dir: "West", cls: "w" },
  { dir: "NorthEast", cls: "ne" },
  { dir: "NorthWest", cls: "nw" },
  { dir: "SouthEast", cls: "se" },
  { dir: "SouthWest", cls: "sw" },
];

/** Invisible edge/corner handles (the window has no native frame). */
export function ResizeGrips() {
  const locked = useApp((s) => s.settings.windowLocked);
  if (!isTauri || locked) return null;
  return (
    <div className="resize-grips" aria-hidden="true">
      {GRIPS.map((g) => (
        <div
          key={g.dir}
          className={`grip grip-${g.cls}`}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            void startResize(g.dir);
          }}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Esc hides the overlay

/** Esc hides the overlay (focus goes back to the game) unless something else uses it. */
export function useEscToHide() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      // Typing somewhere, a dialog / picker / palette open, or a key being recorded: leave it to them.
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], .kb-btn")) return;
      if (document.querySelector("[role=dialog], .modal, .cp")) return;
      actions.hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// ------------------------------------------------------------------ League display mode

let modeCache: LeagueWindowMode | null = null;

/** League's display mode, read-only (refreshed each time the card mounts). */
export function useLeagueWindowMode(): LeagueWindowMode | null {
  const [mode, setMode] = useState<LeagueWindowMode | null>(modeCache);
  useEffect(() => {
    let alive = true;
    leagueWindowMode()
      .then((m) => {
        modeCache = m;
        if (alive) setMode(m);
      })
      .catch(() => alive && setMode({ mode: null }));
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}

/** "League must run in Borderless or Windowed" — with the detected mode when we can read it. */
export function DisplayModeNote({ compact = false }: { compact?: boolean }) {
  const m = useLeagueWindowMode();
  const bad = m?.mode === "fullscreen";
  const good = m?.mode === "borderless" || m?.mode === "windowed";
  return (
    <div className={`display-note ${bad ? "bad" : good ? "good" : ""} ${compact ? "compact" : ""}`}>
      <Icon name={bad ? "warning" : good ? "check" : "info"} size={15} />
      <span>
        {bad ? (
          <>
            League is set to <b>Fullscreen</b> — overlays can't appear over it. In League: Settings → Video → Window Mode → <b>Borderless</b>.
          </>
        ) : good ? (
          <>
            League runs in <b>{m?.mode === "borderless" ? "Borderless" : "Windowed"}</b> mode — the overlay can appear over the game.
          </>
        ) : (
          <>
            Play League in <b>Borderless</b> (or Windowed) mode: Settings → Video → Window Mode. Exclusive Fullscreen can't show overlays.
          </>
        )}
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ Settings card body

export function WindowSettings() {
  const locked = useApp((s) => s.settings.windowLocked);
  const active = useWindowPreset();
  return (
    <>
      <PresetButtons active={active} />
      <Toggle
        checked={locked}
        onChange={(windowLocked) => void actions.updateSettings({ windowLocked })}
        label="Lock position"
        sub="Turns off dragging the top bar and resizing from the edges"
      />
      <div className="field-row">
        <div className="field-text">
          <span className="field-label">{tx("Position")}</span>
          <span className="field-hint">{tx("Size and position are remembered. Re-center to put it back on the game's monitor.")}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!isTauri} onClick={() => void resetWindow()}>
          Re-center
        </button>
      </div>
      <DisplayModeNote />
    </>
  );
}
