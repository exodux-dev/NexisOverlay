// Thin layer over the Tauri backend. In a plain browser (vite dev / tests) it
// falls back to direct fetch + localStorage so the UI can be developed anywhere.

import { trimHistory, withValidTimeline } from "./engine/history";
import type { MatchRecord } from "./engine/types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Unlisten = () => void;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function fetchJson<T = unknown>(url: string, cache: string, maxAgeHours = 24): Promise<T> {
  if (isTauri) return tauriInvoke<T>("fetch_json", { url, cache, maxAgeHours });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Fetch a public page as text (cached by the backend; only allow-listed hosts). */
export async function fetchText(url: string, cache: string, maxAgeHours = 6): Promise<string> {
  if (isTauri) return tauriInvoke<string>("fetch_text", { url, cache, maxAgeHours });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function loadStore<T>(name: string): Promise<T | null> {
  if (isTauri) return (await tauriInvoke<T | null>("load_store", { name })) ?? null;
  try {
    const raw = localStorage.getItem(`nexis:${name}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveStore(name: string, value: unknown): Promise<void> {
  if (isTauri) return tauriInvoke("save_store", { name, value });
  try {
    localStorage.setItem(`nexis:${name}`, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export async function getSettingsRaw(): Promise<Record<string, unknown>> {
  if (isTauri) return (await tauriInvoke<Record<string, unknown> | null>("get_settings")) ?? {};
  return (await loadStore<Record<string, unknown>>("settings.json")) ?? {};
}

/**
 * Persists settings; returns hotkey registration errors (if any).
 * `background` = not a user change (remembered champion, migrations): the backend then never
 * replaces a settings file it couldn't read at startup.
 */
export async function saveSettingsRaw(settings: unknown, background = false): Promise<string[]> {
  if (isTauri) return tauriInvoke<string[]>("save_settings", { settings, background });
  await saveStore("settings.json", settings);
  return [];
}

export async function loadHistory(): Promise<MatchRecord[]> {
  const raw = (await loadStore<MatchRecord[]>("history.json")) ?? [];
  return Array.isArray(raw) ? raw.map(withValidTimeline) : [];
}

export async function saveHistory(history: MatchRecord[]): Promise<void> {
  return saveStore("history.json", trimHistory(history));
}

export async function requestScan(): Promise<void> {
  if (isTauri) await tauriInvoke("scan_augments");
}

export async function suspendHotkeys(suspended: boolean): Promise<string[]> {
  if (isTauri) return tauriInvoke<string[]>("suspend_hotkeys", { suspended });
  return [];
}

export interface AppInfo {
  portable: boolean;
  dataDir: string;
  version: string;
  /** Set when settings.json couldn't be read at startup (what was recovered / where the copy is). */
  settingsNotice?: string | null;
}

export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri) return null;
  return tauriInvoke<AppInfo>("app_info");
}

export async function setAugmentMode(enabled: boolean): Promise<void> {
  if (isTauri) await tauriInvoke("set_augment_mode", { enabled });
}

/** Open an https link in the default browser (desktop) or a new tab (browser). */
export async function openUrl(url: string): Promise<void> {
  if (isTauri) return tauriInvoke("open_url", { url });
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------- League client (opt-in import)
// The ONLY writes Nexis makes: rune page + item set via the League *client* API (never the game).

export interface LcuStatus {
  connected: boolean;
}

/** Browser-only stand-in for the League client (dev / UI tests): `window.__NEXIS_LCU__`. */
interface LcuMock {
  status?: () => LcuStatus | Promise<LcuStatus>;
  applyRunes?: (args: { name: string; primary: number; sub: number; perks: number[] }) => void | Promise<void>;
  applyItemSet?: (args: { championKey: number; title: string; blocksJson: string }) => void | Promise<void>;
}
const lcuMock = (): LcuMock | undefined => (typeof window !== "undefined" ? (window as { __NEXIS_LCU__?: LcuMock }).__NEXIS_LCU__ : undefined);
const NEEDS_DESKTOP = "Importing to League needs the Nexis desktop app.";

export async function lcuStatus(): Promise<LcuStatus> {
  if (isTauri) return tauriInvoke<LcuStatus>("lcu_status");
  return (await lcuMock()?.status?.()) ?? { connected: false };
}

export async function lcuApplyRunes(name: string, primary: number, sub: number, perks: number[]): Promise<void> {
  if (isTauri) return tauriInvoke("lcu_apply_runes", { name, primary, sub, perks });
  const mock = lcuMock()?.applyRunes;
  if (!mock) throw new Error(NEEDS_DESKTOP);
  await mock({ name, primary, sub, perks });
}

export async function lcuApplyItemSet(championKey: number, title: string, blocksJson: string): Promise<void> {
  if (isTauri) return tauriInvoke("lcu_apply_item_set", { championKey, title, blocksJson });
  const mock = lcuMock()?.applyItemSet;
  if (!mock) throw new Error(NEEDS_DESKTOP);
  await mock({ championKey, title, blocksJson });
}

export async function showOverlay(): Promise<void> {
  if (isTauri) await tauriInvoke("show_overlay");
}

export async function hideOverlay(): Promise<void> {
  if (isTauri) await tauriInvoke("hide_overlay");
}

export async function quitApp(): Promise<void> {
  if (isTauri) await tauriInvoke("quit_app");
}

// ---------------------------------------------------------------- main window placement

export type WindowPreset = "compact" | "standard" | "large";
export const WINDOW_PRESETS: Array<{ id: WindowPreset; label: string; w: number; h: number }> = [
  { id: "compact", label: "Compact", w: 880, h: 600 },
  { id: "standard", label: "Standard", w: 1180, h: 760 },
  { id: "large", label: "Large", w: 1440, h: 900 },
];

/** The preset closest to the current window size (within a few px), if any. */
export function currentPreset(w = window.innerWidth, h = window.innerHeight): WindowPreset | null {
  return WINDOW_PRESETS.find((p) => Math.abs(p.w - w) <= 4 && Math.abs(p.h - h) <= 4)?.id ?? null;
}

/** Resize the overlay to a preset, keeping its center (saved automatically). */
export async function setWindowPreset(preset: WindowPreset): Promise<void> {
  if (isTauri) return tauriInvoke("set_window_preset", { preset });
}

/** Standard size, centered on League's monitor; forgets the saved spot. */
export async function resetWindow(): Promise<void> {
  if (isTauri) return tauriInvoke("reset_window");
}

export type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

/** Resize from an edge/corner (the window has no native frame). */
export async function startResize(direction: ResizeDirection): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startResizeDragging(direction);
}

export interface LeagueWindowMode {
  mode: "fullscreen" | "windowed" | "borderless" | "unknown" | null;
  source?: "client" | "game.cfg";
}

/** League's display mode, read-only (League client settings, else game.cfg). */
export async function leagueWindowMode(): Promise<LeagueWindowMode> {
  if (isTauri) return tauriInvoke<LeagueWindowMode>("league_window_mode");
  return { mode: null };
}

/** Compact champ-select view (small window at the side) on/off, and its current state. */
export async function setMiniMode(on: boolean): Promise<void> {
  if (isTauri) return tauriInvoke("set_mini_mode", { on });
  emitLocal("mini-mode", on);
}
export async function getMiniMode(): Promise<boolean> {
  return isTauri ? !!(await tauriInvoke<boolean>("get_mini_mode")) : false;
}

/** Main window above every other window (Settings → General → Keep Nexis on top). */
export async function setAlwaysOnTop(on: boolean): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setAlwaysOnTop(on);
}

export async function startDrag(): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export async function on<T>(event: string, cb: (payload: T) => void): Promise<Unlisten> {
  if (!isTauri) {
    const handler = (e: Event) => cb((e as CustomEvent<T>).detail);
    window.addEventListener(`nexis:${event}`, handler);
    return () => window.removeEventListener(`nexis:${event}`, handler);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => cb(e.payload));
}

/** Send an event to every window (e.g. main → HUD state sync). */
export async function broadcast<T>(event: string, payload: T): Promise<void> {
  if (!isTauri) return;
  const { emit } = await import("@tauri-apps/api/event");
  await emit(event, payload);
}

/** Browser-only helper to simulate backend events (used by demo mode & tests). */
export function emitLocal<T>(event: string, payload: T) {
  window.dispatchEvent(new CustomEvent(`nexis:${event}`, { detail: payload }));
}

// ---------------------------------------------------------------- in-game HUD layout editor

/**
 * Enter / leave the HUD layout editor. While it's on, the HUD window takes mouse input (so the
 * panel can be dragged); leaving always restores click-through. `fromSettings` hides the main
 * window while editing and brings it back afterwards.
 */
export async function setHudEdit(on: boolean, fromSettings = false): Promise<void> {
  if (isTauri) return tauriInvoke("set_hud_edit", { on, fromSettings });
  emitLocal("hud-edit", on);
}

/** Whether the HUD layout editor is open right now (the `hud-edit` event only reports changes). */
/** Cursor position relative to the HUD window (CSS px), or null when unknown (browser / non-Windows). */
export async function hudCursor(): Promise<[number, number] | null> {
  if (!isTauri) return null;
  return (await tauriInvoke<[number, number] | null>("hud_cursor")) ?? null;
}

export async function getHudEdit(): Promise<boolean> {
  if (isTauri) return !!(await tauriInvoke<boolean>("get_hud_edit"));
  return false;
}

// ---------------------------------------------------------------- diagnostics (Settings → Diagnostics)

export interface DiagLogEntry {
  /** epoch ms */
  t: number;
  level: "info" | "warn" | "error";
  area: string;
  msg: string;
}

export interface DiagHotkey {
  action: string;
  combo: string;
  registered: boolean;
  polled: boolean;
  error?: string | null;
}

export interface DiagFetch {
  okAt?: number | null;
  errAt?: number | null;
  error?: string | null;
  fromCache: boolean;
  cacheAgeSecs?: number | null;
  count: number;
}

/** Backend status snapshot (see src-tauri/src/diag.rs + the `diagnostics` command). */
export interface Diagnostics {
  log: DiagLogEntry[];
  live: { lastOk?: number | null; lastInGame?: number | null; reachable: boolean; inGame: boolean; lastError?: string | null };
  lcu: { connected: boolean; since?: number | null };
  hotkeys: DiagHotkey[];
  pollerFallback: boolean;
  scan: { lastAt?: number | null; lastAuto: boolean; lines: number; millis: number; count: number; lastError?: string | null; lastErrorAt?: number | null };
  fetch: Record<string, DiagFetch>;
  logFile?: string | null;
  hud: { visible: boolean; editing: boolean; clickThrough: boolean; enabled: boolean; preview: boolean };
  augment: { autoDetect: boolean; modeHasAugments: boolean; inGame: boolean; gameInFront: boolean; ocrAvailable: boolean };
  storage: { writable: boolean; portable: boolean };
  platform: string;
}

/** Browser-only stand-ins (dev / UI tests): `window.__NEXIS_DIAG__`, `window.__NEXIS_SCAN__`. */
type DiagMockWindow = { __NEXIS_DIAG__?: () => Diagnostics; __NEXIS_SCAN__?: () => ScanDebugPayload | Promise<ScanDebugPayload> };
const diagMock = (): DiagMockWindow => (typeof window !== "undefined" ? (window as DiagMockWindow) : {});

/** null in a plain browser (no backend). */
export async function getDiagnostics(): Promise<Diagnostics | null> {
  if (isTauri) return tauriInvoke<Diagnostics>("diagnostics");
  return diagMock().__NEXIS_DIAG__?.() ?? null;
}

export interface ScanDebugPayload {
  ok: boolean;
  error?: string;
  scan?: {
    lines: Array<{ text: string; x: number; y: number; w: number; h: number }>;
    width: number;
    height: number;
    millis: number;
    /** PNG data URL of the whole screen (downscaled). */
    preview?: string;
    /** Captured monitor size in px. */
    screen?: [number, number];
  };
}

/** One augment scan on explicit request, returning what was read plus a screenshot preview. */
export async function testAugmentScan(): Promise<ScanDebugPayload> {
  if (isTauri) return (await tauriInvoke<ScanDebugPayload | null>("scan_augments", { debug: true })) ?? { ok: false, error: "No result" };
  const mock = diagMock().__NEXIS_SCAN__;
  if (!mock) return { ok: false, error: "Augment detection needs the Nexis desktop app on Windows." };
  return mock();
}

/** Open Nexis's data folder in the file manager. */
export async function openDataDir(): Promise<void> {
  if (isTauri) return tauriInvoke("open_data_dir");
}

/** "Launch with Windows" (a per-user Run registry entry; desktop app only). */
export async function getAutostart(): Promise<boolean | null> {
  return isTauri ? tauriInvoke<boolean>("get_autostart") : null;
}
export async function setAutostart(on: boolean): Promise<boolean> {
  if (!isTauri) throw new Error("Launch with Windows needs the Nexis desktop app.");
  return tauriInvoke<boolean>("set_autostart", { on });
}

/** Discord status (Rich Presence) through the local Discord app; `null` clears it. */
export async function discordSetActivity(clientId: string, activity: { details?: string; state?: string; start?: number } | null): Promise<void> {
  if (!isTauri) return;
  await tauriInvoke("discord_set_activity", { clientId, activity });
}
export async function discordDisconnect(): Promise<void> {
  if (!isTauri) return;
  await tauriInvoke("discord_disconnect");
}

/** Show the scan region + sample tier badges on the in-game layer (click-through, auto-off after 3 min). */
/** Rectangle as fractions (0..1) of the screen. */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * HUD layer → backend: where the overlay is drawing, so augment scans black those spots out
 * instead of hiding our windows from capture (which makes GeForce Instant Replay switch off).
 */
export async function setCaptureMask(rects: ScreenRect[]): Promise<void> {
  if (isTauri) return tauriInvoke("set_capture_mask", { rects });
}

export async function setHudPreview(on: boolean): Promise<void> {
  if (isTauri) return tauriInvoke("set_hud_preview", { on });
  emitLocal("hud-preview", on);
}

export async function getHudPreview(): Promise<boolean> {
  if (isTauri) return !!(await tauriInvoke<boolean>("get_hud_preview"));
  return false;
}
