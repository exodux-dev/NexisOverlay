import { useState } from "react";
import { useId, type MouseEvent } from "react";
import { MODE_LABEL, actions, getState, useApp, type Derived, type GameModeKind } from "../app/store";
import { openUrl, startDrag } from "../bridge";
import type { Playstyle } from "../engine/types";
import { Kbd, Segmented } from "./controls";
import { ARCHETYPE_LABEL, PLAYSTYLES, clock, gold } from "./format";
import { GameIcon } from "./GameIcon";
import { Icon } from "./icons";
import { WindowMenu, toggleCompact } from "./WindowControls";

const MODE: Record<Derived["mode"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "mode-live" },
  demo: { label: "Demo", cls: "mode-demo" },
  champselect: { label: "Champ select", cls: "mode-cs" },
  explore: { label: "Explore", cls: "mode-explore" },
};

/** Drag the top bar to move the window; double-click toggles Compact ⇄ Standard. */
function onDrag(e: MouseEvent<HTMLElement>) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest("button, input, select, a, label, [role=radiogroup], [role=dialog]")) return;
  if (getState().settings.windowLocked) return;
  if (e.detail === 2) return toggleCompact();
  void startDrag();
}

/** The Nexis hexagon mark (gradient ids are unique per instance). */
export function LogoMark({ size = 20 }: { size?: number }) {
  const id = `nx-g${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" fill={`url(#${id})`} opacity="0.18" />
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7z" fill="none" stroke={`url(#${id})`} strokeWidth="1.6" />
      <path d="M8.5 16V8l7 8V8" fill="none" stroke="#5eead4" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo" aria-label="Nexis">
      <LogoMark />
      <span className="logo-word">NEXIS</span>
    </span>
  );
}

/** Game mode: follows your queue automatically, or can be forced. */
function ModeSelect({ d }: { d: Derived }) {
  const pref = useApp((s) => s.settings.mode);
  const label = MODE_LABEL[d.gameMode];
  return (
    <label className="mode-select" title={pref === "auto" ? (d.gameModeDetected ? "Detected from your queue" : "Last detected mode — follows your queue automatically") : "Forced in this menu"}>
      <span className="mode-select-text">
        {label}
        <span className="dim">{pref === "auto" ? (d.gameModeDetected ? " · auto" : " · last") : ""}</span>
      </span>
      <Icon name="chevronDown" size={13} className="dim" />
      <select
        aria-label="Game mode"
        value={pref}
        onChange={(e) => void actions.setMode(e.target.value as "auto" | GameModeKind)}
      >
        <option value="auto">Auto-detect from queue</option>
        <option value="mayhem">ARAM: Mayhem</option>
        <option value="aram">ARAM</option>
        <option value="arena">Arena (2v2v2v2)</option>
        <option value="sr">Summoner's Rift (Normal / Ranked)</option>
      </select>
    </label>
  );
}

/** Shown when a newer build exists on GitHub: what changed, and where to download it. */
function UpdatePill() {
  const update = useApp((s) => s.update);
  const [open, setOpen] = useState(false);
  if (!update) return null;
  return (
    <span className="update-wrap">
      <button type="button" className="update-pill" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="A newer Nexis build is available">
        <span className="update-dot" />
        Update
      </button>
      {open && (
        <div className="update-panel" role="dialog" aria-label="Update available">
          <strong>New Nexis build</strong>
          {update.changes.length > 0 ? (
            <ul>
              {update.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="dim small">{update.message}</p>
          )}
          <p className="dim small">
            {update.kind === "release"
              ? "Download the zip, close Nexis and replace Nexis Overlay.exe. Your data folder stays as it is."
              : "On the build page, download NexisOverlay-portable under Artifacts (sign in to GitHub), close Nexis and replace Nexis Overlay.exe. Your data folder stays as it is."}
          </p>
          <div className="update-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
              Later
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void openUrl(update.url)}>
              {update.kind === "release" ? "Download" : "Open download page"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

export function TopBar({ derived }: { derived: Derived | null }) {
  const settings = useApp((s) => s.settings);
  const mode = derived?.mode;
  const game = derived?.game;
  const champ = derived?.baseChampion;
  const styled = derived?.champion;
  const inGame = mode === "live" || mode === "demo";

  return (
    <header className={`topbar ${settings.windowLocked ? "locked" : ""}`} onMouseDown={onDrag}>
      <Logo />
      {mode && (
        <span className={`mode-chip ${MODE[mode].cls}`}>
          <span className="mode-dot" />
          {MODE[mode].label}
        </span>
      )}
      {derived && <ModeSelect d={derived} />}
      {champ && (
        <div className="tb-champ">
          <GameIcon src={champ.icon} name={champ.name} size={30} round />
          <div className="tb-champ-text">
            <span className="tb-champ-name">{champ.name}</span>
            <span className="tb-champ-arch">
              {derived && derived.variants.length > 1 && derived.variant ? derived.variant.label : ARCHETYPE_LABEL[(styled ?? champ).archetype]}
            </span>
          </div>
        </div>
      )}
      {inGame && game && (
        <div className="tb-stats">
          <span className="tb-stat" title="Game time">
            <Icon name="history" size={14} />
            {clock(game.gameTime)}
          </span>
          <span className="tb-stat tb-gold" title="Current gold">
            <Icon name="coin" size={14} />
            {gold(game.gold)}
          </span>
        </div>
      )}
      <div className="tb-spacer" />
      {derived && (
        <Segmented<Playstyle>
          size="sm"
          label="Playstyle"
          options={PLAYSTYLES}
          value={settings.playstyle}
          onChange={(playstyle) => void actions.updateSettings({ playstyle })}
        />
      )}
      <UpdatePill />
      <WindowMenu />
      <span className="tb-hint" title="Show / hide the overlay">
        <Kbd>{settings.hotkeyToggle}</Kbd>
      </span>
      <button type="button" className="icon-btn tb-close" onClick={actions.hide} title="Hide overlay" aria-label="Hide overlay">
        <Icon name="close" size={16} />
      </button>
    </header>
  );
}
