// Central app state. A tiny external store (no state library) + React hooks.
// The UI reads state with `useApp(selector)` and derived recommendations with `useDerived()`.

import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import * as bridge from "../bridge";
import { AUGMENTS, findAugment, rankAugments, registerArenaAugments, registerAugments, setAugmentPool, type AugmentScore, type GlobalAugmentStat } from "../engine/augments";
import { AUGMENTS_URL, championUrl, parseAugmentTable, parseChampionPage, toChampionStats } from "../engine/sources/hexmayhem";
import { mergeOpggChampion, opggChampionUrl, opggRunePages, opggToChampionStats, parseOpggChampionPage, withOpggRunes, type OpggMode } from "../engine/sources/opgg";
import { loadProfile, opggRegionFromPlatform, type PlayerProfile } from "../engine/sources/opggProfile";
import { itemMapFor, setItemMap } from "../engine/staticData";
import { arenaStatsProvider } from "../engine/sources/arena";
import { COMBOS_URL, parseCombos, type AugmentCombo } from "../engine/sources/combos";
import { appendIntel, buildChanges, diffSnapshots, type IntelEvent } from "../engine/intel";
import { scoreboardPower, type TeamPower } from "../engine/power";
import { toast } from "../ui/Toasts";
import { HUD_DEFAULTS, normalizeHud, type HudSettings } from "../views/hudSettings";
import { parseTierList, tierListPatch, tierListUrl, type ChampionTierRow, type TierPosition } from "../engine/sources/tierlists";
import { recordTierSnapshot } from "./tierHistory";
import { recommendBuild, type BuildPlan } from "../engine/build";
import { buildItemSetBlocks, buildRunePage, itemSetTitle } from "../engine/importLeague";
import { mergeChoice, migrateChoice, needsMigration, runeKey, runeOptions, spellKey, spellOptions, type BuildChoice, type ChoiceValue } from "../engine/options";
import { personalChampionStats } from "../engine/history";
import { stepTimeline, type TimelineRecorder } from "../engine/timeline";
import { datasetMode, historyForMode, modeFromGameMode, type GameModeKind } from "../engine/mode";
import { activeRoles, applyRoles, assignRole, NO_OVERRIDES, playerKey, roleGameKey, type RoleOverrides } from "../engine/roles";
import type { Lane } from "../engine/power";
import { NEW_TRACKER, stepPick, type PickTracker } from "../engine/pickDetect";
import { decodeBuild } from "../engine/shareCode";
import { defaultWebSource, fallbackNotice, resolveSource, selectedSource, sourcesForMode, type DataSourceId, type SourceResolution } from "../engine/dataSource";
import { parseLiveGame, type AllGameDataRaw } from "../engine/live";
import { stabilizeSnapshot } from "../engine/liveStable";
import { matchAugments, type OcrLine, type OcrMatch } from "../engine/ocrMatch";
import { findChampion, loadStaticData } from "../engine/staticData";
import { analyzeEnemies, type ThreatReport } from "../engine/threat";
import { applyVariant, pickVariant, variantsFor, type BuildVariant } from "../engine/variants";
import { guideFor, levelSequence, matchupAdvice, skillPlanFor, type ChampionGuide, type CoachAdvice, type SkillKey, type SkillPlan } from "../engine/guide";
import { loadChampionSpells } from "../engine/staticData";
import { shopAdvice, type ShopAdvice } from "../engine/phase";
import type { ChampionSpell } from "../engine/types";
import { useEffect, useState } from "react";
import type { Champion, ChampionStats, GameSnapshot, MatchRecord, PlayerState, Playstyle, StaticData, StatsDataset } from "../engine/types";

export type Tab = "home" | "build" | "augments" | "guide" | "tiers" | "enemies" | "history" | "settings";

export type { GameModeKind } from "../engine/mode";
export { modeFromGameMode } from "../engine/mode";
export const MODE_LABEL: Record<GameModeKind, string> = { mayhem: "ARAM: Mayhem", aram: "ARAM", sr: "Summoner's Rift", arena: "Arena" };

export const BUILD = { sha: typeof __BUILD_SHA__ === "string" ? __BUILD_SHA__ : "dev", date: typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "" };
export const REPO_URL = "https://github.com/exodux-dev/NexisOverlay";

export interface TierListState {
  rows?: ChampionTierRow[];
  status: "loading" | "ok" | "error";
  error?: string;
  patch?: string;
  fetchedAt?: number;
}

export interface UpdateInfo {
  sha: string;
  date: string;
  message: string;
  url: string; // where to download the new build
}

export interface ClientInfo {
  phase?: string | null;
  gameMode?: string | null;
  queueId?: number | null;
  region?: string | null;
  platformId?: string | null;
}

export type ThemePreset = "nexis" | "league" | "midnight" | "hextech" | "void" | "crimson" | "frost" | "light";

export interface ThemeSettings {
  preset: ThemePreset;
  accent: string; // hex; "" = preset default
  scale: number; // UI scale 0.85..1.25
  density: "comfortable" | "compact";
  badgeScale: number; // in-game augment badge size 0.75..1.5
  radius: number; // corner radius px 6..20
}

export const THEME_PRESETS: Record<ThemePreset, { label: string; bg: string; panel: string; text: string; muted: string; accent: string; accent2: string; light?: boolean }> = {
  // Default: neutral graphite with a violet accent and teal highlights.
  nexis: { label: "Nexis", bg: "12,13,17", panel: "22,24,31", text: "#eceef3", muted: "#8a90a2", accent: "#8b7cff", accent2: "#2dd4bf" },
  // "Classic": matches the League client (hextech black/navy, gold frames, cyan accents).
  league: { label: "Classic", bg: "1,10,19", panel: "9,20,40", text: "#f0e6d2", muted: "#a09b8c", accent: "#c8aa6e", accent2: "#0ac8b9" },
  midnight: { label: "Midnight", bg: "10,13,22", panel: "19,24,38", text: "#e8ecf4", muted: "#8b95a8", accent: "#2dd4bf", accent2: "#facc15" },
  hextech: { label: "Hextech", bg: "8,14,22", panel: "14,26,36", text: "#f0e6d2", muted: "#a09b8c", accent: "#c8aa6e", accent2: "#0ac8b9" },
  void: { label: "Void", bg: "14,8,26", panel: "26,16,44", text: "#ece6ff", muted: "#9d93b8", accent: "#a855f7", accent2: "#f472b6" },
  crimson: { label: "Crimson", bg: "20,8,10", panel: "34,14,18", text: "#fde8e8", muted: "#b39595", accent: "#f43f5e", accent2: "#fb923c" },
  frost: { label: "Frost", bg: "8,16,28", panel: "14,28,46", text: "#e6f4ff", muted: "#8fa9c2", accent: "#38bdf8", accent2: "#a5f3fc" },
  light: { label: "Daylight", bg: "244,246,250", panel: "255,255,255", text: "#141824", muted: "#5d6678", accent: "#0d9488", accent2: "#d97706", light: true },
};

export const DEFAULT_THEME: ThemeSettings = { preset: "nexis", accent: "", scale: 1, density: "comfortable", badgeScale: 1, radius: 2 };

/** Hotkeys that clash with common software or League's own binds. */
export const KNOWN_HOTKEY_CONFLICTS: Record<string, string> = {
  "Alt+Z": "NVIDIA GeForce overlay",
  "Alt+F1": "NVIDIA instant replay",
  "Alt+F9": "NVIDIA recording",
  "Alt+F10": "NVIDIA instant replay save",
  "Alt+R": "AMD Radeon overlay / League self-cast",
  "Super+G": "Xbox Game Bar",
  "Super+Alt+R": "Xbox Game Bar recording",
  "Shift+Tab": "Steam overlay",
  "Shift+`": "Discord overlay",
  "Alt+Q": "League self-cast Q",
  "Alt+W": "League self-cast W",
  "Alt+E": "League self-cast E",
  "Alt+D": "League self-cast summoner",
  "Alt+F": "League self-cast summoner",
  "Ctrl+Q": "League level-up Q",
  "Ctrl+W": "League level-up W",
  "Ctrl+E": "League level-up E",
  "Ctrl+R": "League level-up R",
};

export interface Settings {
  hotkeyToggle: string;
  hotkeyScan: string;
  hotkeyHud: string;
  /** Toggles the in-game HUD layout editor (drag / resize the mini HUD). */
  hotkeyHudEdit: string;
  hudEnabled: boolean;
  playstyle: Playstyle;
  statsUrl: string;
  /** Use public HexMayhem stats (win/pick rates, builds, skill orders, augment tiers). */
  webStats: boolean;
  /** Last champion auto-detected in champ select / a live game (used when no game is running). */
  lastChampion: string;
  /** In-game mini HUD layout + modules. */
  hud: HudSettings;
  /** Open the overlay automatically when champ select starts. */
  autoShowChampSelect: boolean;
  /** Champ select opens the full overlay instead of the compact side view. */
  champSelectFull: boolean;
  /** Launch to the tray without opening the window (it still opens in champ select / by hotkey). */
  startHidden: boolean;
  /** Hide the overlay when the game starts (so it's never over your screen at spawn). */
  autoHideInGame: boolean;
  /** Show a post-game summary after each game. */
  showPostGame: boolean;
  /** "auto" follows the queue you're in; otherwise forced. */
  mode: "auto" | GameModeKind;
  /** Last auto-detected mode (used when not in a lobby/game). */
  lastMode: GameModeKind;
  leaguePath: string;
  scanRegion: { x: number; y: number; w: number; h: number };
  startGold: number;
  opacity: number; // 0.6..1 overlay background opacity (see-through window only)
  /** Transparent main window (the game shows through). Off = solid window: much cheaper to draw,
   *  so the mouse stays smooth over it. Takes effect after a restart. */
  seeThroughWindow: boolean;
  autoDetectAugments: boolean; // OCR the augment cards automatically while in game
  badgeOffset: number; // extra vertical offset (fraction of screen) for the in-game tier badges
  /** Tier badges above the augment cards (default: clear of the reroll buttons) or below them. */
  badgePlacement: "above" | "below";
  /** Each mode keeps its own in-game HUD layout (`hud` is the active one, see hudSwap). */
  hudPerMode: boolean;
  /** Stored HUD layouts of the modes not currently active. */
  hudByMode: Partial<Record<GameModeKind, HudSettings>>;
  /** Keep the main window above every other window (the in-game HUD is always on top). */
  alwaysOnTop: boolean;
  /** Summoner's Rift role picked on the Build tab ("" = auto: champ select, else the main role). */
  srRole: string;
  /** Hide player names / Riot IDs everywhere (safe to show on stream). */
  streamerMode: boolean;
  /** Mark your augment pick automatically when only the chosen card is left on screen. */
  detectPicks: boolean;
  theme: ThemeSettings;
  /** Chosen build style per champion id (see engine/variants.ts). */
  buildStyles: Record<string, string>;
  /** Opt-in "Import to League" (the only feature that writes to the League *client*). All off by default. */
  leagueImport: LeagueImportSettings;
  /** Main window can't be moved / resized by dragging (size presets still work). */
  windowLocked: boolean;
  /** Starred champions (Data Dragon ids), shown on Home. */
  favorites: string[];
  /** Picked rune page / spells / core / starter / boots option per champion + mode (key: webKey). */
  buildChoices: Record<string, BuildChoice>;
  /** Picked recommendation data source per mode ("auto" when missing). */
  dataSources: Partial<Record<GameModeKind, DataSourceId>>;
  /** Summoner's Rift role fixes for the current game only (ignored once another game starts). */
  roleOverrides: RoleOverrides | null;
}

export interface LeagueImportSettings {
  /** Write the recommended rune page ("Nexis: <champion>") into the League client. */
  runes: boolean;
  /** Write the recommended build as an Item Set ("Nexis: <champion>") into the League client. */
  itemSets: boolean;
  /** Import automatically once per champion when champ select locks one. */
  auto: boolean;
}

export const DEFAULT_LEAGUE_IMPORT: LeagueImportSettings = { runes: false, itemSets: false, auto: false };

export const DEFAULT_SETTINGS: Settings = {
  hotkeyToggle: "Ctrl+Shift+Space",
  hotkeyScan: "Ctrl+Shift+X",
  hotkeyHud: "Ctrl+Shift+H",
  hotkeyHudEdit: "Ctrl+Shift+L",
  hudEnabled: true,
  playstyle: "auto",
  statsUrl: "https://raw.githubusercontent.com/exodux-dev/NexisOverlay/main/data/stats/aram-mayhem.json",
  webStats: true,
  lastChampion: "",
  mode: "auto",
  lastMode: "mayhem",
  hud: HUD_DEFAULTS,
  autoShowChampSelect: true,
  startHidden: false,
  champSelectFull: false,
  autoHideInGame: true,
  showPostGame: true,
  leaguePath: "",
  scanRegion: { x: 0.14, y: 0.16, w: 0.72, h: 0.46 },
  startGold: 1400,
  opacity: 0.72,
  seeThroughWindow: false,
  autoDetectAugments: true,
  badgeOffset: 0,
  badgePlacement: "above",
  detectPicks: true,
  streamerMode: false,
  srRole: "",
  alwaysOnTop: false,
  hudPerMode: false,
  hudByMode: {},
  theme: DEFAULT_THEME,
  buildStyles: {},
  leagueImport: DEFAULT_LEAGUE_IMPORT,
  windowLocked: false,
  favorites: [],
  buildChoices: {},
  dataSources: {},
  roleOverrides: null,
};

/** Merge stored settings with defaults and migrate old values. */
export function normalizeSettings(raw: Partial<Settings> | Record<string, unknown>, migrate = false): Settings {
  const r = raw as Partial<Settings>;
  const s: Settings = { ...DEFAULT_SETTINGS, ...r, theme: { ...DEFAULT_THEME, ...(r.theme ?? {}) }, buildStyles: { ...(r.buildStyles ?? {}) }, hud: normalizeHud(r.hud) };
  // v0.1 defaults collided with the NVIDIA overlay (Alt+Z) — move stored *old defaults* off it,
  // once, at startup (a user who deliberately picks Alt+Z later keeps it).
  // The navy + gold "League" look stopped being the default: move it to the new default once
  // (it stays available as "Classic" in Appearance, and a later pick of it is kept).
  if (migrate && !(r as { themeV2?: boolean }).themeV2) {
    (s as Settings & { themeV2?: boolean }).themeV2 = true;
    if (s.theme.preset === "league") s.theme = { ...s.theme, preset: "nexis" };
  }
  if (migrate && !(r as { hotkeysMigrated?: boolean }).hotkeysMigrated) (s as Settings & { hotkeysMigrated?: boolean }).hotkeysMigrated = true;
  else return finishNormalize(s);
  if (s.hotkeyToggle === "Alt+Z") s.hotkeyToggle = DEFAULT_SETTINGS.hotkeyToggle;
  if (s.hotkeyScan === "Alt+X") s.hotkeyScan = DEFAULT_SETTINGS.hotkeyScan;
  if (s.hotkeyHud === "Alt+C") s.hotkeyHud = DEFAULT_SETTINGS.hotkeyHud;
  return finishNormalize(s);
}

function finishNormalize(s: Settings): Settings {
  if (!(s.theme.preset in THEME_PRESETS)) s.theme.preset = "nexis";
  s.leagueImport = { ...DEFAULT_LEAGUE_IMPORT, ...(s.leagueImport ?? {}) };
  // Additive: only fills the key in (bad entries are ignored when read, see engine/options).
  if (!s.buildChoices || typeof s.buildChoices !== "object" || Array.isArray(s.buildChoices)) s.buildChoices = {};
  // Additive: only fills the key in (unknown values are read as "auto", see engine/dataSource).
  if (!s.dataSources || typeof s.dataSources !== "object" || Array.isArray(s.dataSources)) s.dataSources = {};
  if (s.roleOverrides === undefined) s.roleOverrides = null;
  if (s.badgePlacement !== "above" && s.badgePlacement !== "below") s.badgePlacement = "above";
  if (typeof s.detectPicks !== "boolean") s.detectPicks = true;
  if (typeof s.streamerMode !== "boolean") s.streamerMode = false;
  if (typeof s.srRole !== "string") s.srRole = "";
  if (typeof s.alwaysOnTop !== "boolean") s.alwaysOnTop = false;
  if (typeof s.hudPerMode !== "boolean") s.hudPerMode = false;
  if (!s.hudByMode || typeof s.hudByMode !== "object" || Array.isArray(s.hudByMode)) s.hudByMode = {};
  if (!Array.isArray(s.favorites)) s.favorites = [];
  else if (s.favorites.some((f) => typeof f !== "string")) s.favorites = s.favorites.filter((f): f is string => typeof f === "string");
  // The project moved to exodux-dev: an untouched old default stats URL follows it (custom URLs are kept).
  if (s.statsUrl === "https://raw.githubusercontent.com/burtonexec/NexisOverlay/main/data/stats/aram-mayhem.json") s.statsUrl = DEFAULT_SETTINGS.statsUrl;
  return s;
}

/** CSS custom properties for a theme (applied on :root by both windows). */
export function themeVars(t: ThemeSettings, opacity: number): Record<string, string> {
  const p = THEME_PRESETS[t.preset] ?? THEME_PRESETS.nexis;
  return {
    "--bg-rgb": p.bg,
    "--panel-rgb": p.panel,
    "--text": p.text,
    "--muted": p.muted,
    "--accent": t.accent || p.accent,
    "--accent-2": p.accent2,
    "--opacity": String(opacity),
    "--ui-scale": String(t.scale),
    "--radius": `${t.radius}px`,
    "--density": t.density === "compact" ? "0.78" : "1",
    "--badge-scale": String(t.badgeScale),
    "color-scheme": p.light ? "light" : "dark",
    // Clean UI typography: Inter (bundled, works offline).
    "--font-display": `"Inter Variable", "Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`,
    "--font-body": `"Inter Variable", "Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`,
  };
}

export function applyTheme(s: Settings) {
  const root = document.documentElement;
  // The main window is solid unless "See-through window" is on: then the glass opacity applies.
  const solid = root.classList.contains("nx-main") && !s.seeThroughWindow;
  for (const [k, v] of Object.entries(themeVars(s.theme, solid ? 1 : s.opacity))) root.style.setProperty(k, v);
  root.classList.toggle("nx-solid", solid);
  root.dataset.theme = s.theme.preset;
  root.dataset.density = s.theme.density;
}

export interface ChampSelectState {
  /** Your assigned role on Summoner's Rift (top/jungle/middle/bottom/utility), if any. */
  position?: string;
  me?: Champion;
  team: Champion[];
  bench: Champion[];
  /** Your team in pick order, with Riot IDs when the client shows them. */
  mates?: Array<{ riotId?: string; champion?: Champion; position?: string; isMe: boolean }>;
}

export interface ScanState {
  status: "idle" | "scanning" | "done" | "error";
  error?: string;
  ms?: number;
  lines?: OcrLine[];
  matches?: OcrMatch[];
}

/** When no game is running the user can explore any matchup. */
export interface Explore {
  champion: string; // DDragon id
  enemies: string[]; // DDragon ids
  /** How `champion` was chosen: auto-detected from the League client/game, or picked by hand. */
  source: "detected" | "manual";
}

export interface WebStatsState {
  champions: Record<string, ChampionStats | "loading" | "error">;
  global: Record<string, GlobalAugmentStat> | null;
  globalAvgWr: number;
  patch?: string;
  totalAugments?: number;
  status: "idle" | "loading" | "ok" | "error";
  error?: string;
  version: number; // bumps when the augment catalogue/global stats change
  /** HexMayhem "God-Tier Combos" (champion + augment + core build). */
  combos?: AugmentCombo[];
  /** HexMayhem "data date" (YYYY-MM-DD) of the global table, if published. */
  dataDate?: string;
  /** When we last (re)loaded web stats. */
  fetchedAt?: number;
}

export interface State {
  status: "loading" | "ready" | "error";
  loadingMsg: string;
  error?: string;
  data: StaticData | null;
  settings: Settings;
  hotkeyErrors: string[];
  live: GameSnapshot | null; // real game from the Live Client API
  demo: boolean; // show a sample in-game state
  explore: Explore;
  champSelect: ChampSelectState | null;
  history: MatchRecord[];
  stats: StatsDataset | null;
  statsStatus: "none" | "loading" | "ok" | "error";
  web: WebStatsState;
  /** Queue / phase / region reported by the League client. */
  clientInfo: ClientInfo | null;
  /** OP.GG profiles of the players in your current game, keyed by Riot ID. */
  scout: { region?: string; profiles: Record<string, PlayerProfile | "loading" | "error" | "private">; gameKey?: string };
  /** Scoreboard intel for the current game (oldest → newest). */
  intel: IntelEvent[];
  /** The game that just ended (post-game summary), until dismissed. */
  postGame: MatchRecord | null;
  /** Newer build available on GitHub (checked at startup, every 6 h). */
  update: UpdateInfo | null;
  /** Champion tier lists per mode (HexMayhem / OP.GG). */
  tierLists: Partial<Record<GameModeKind, TierListState>>;
  /** Role shown on the Summoner's Rift tier list (defaults to your champ-select role). */
  tierPosition?: TierPosition;
  /** Last role from champ select (used to pick the right OP.GG build on Summoner's Rift). */
  lastPosition?: string;
  statsError?: string;
  myAugments: string[]; // augments taken this game
  offered: string[]; // augments currently offered (scan or manual)
  scan: ScanState;
  /** Augment cards currently detected on screen (auto-detect), for the in-game badges. */
  cards: OcrMatch[];
  /** Who filled `offered`: background detection may replace its own picks, never the user's. */
  offeredSource: "auto" | "manual";
  tab: Tab;
  /** Champions picked by hand to explore (newest first, persisted in localStorage), for Home. */
  recentPicks: RecentPick[];
}

export interface RecentPick {
  id: string;
  /** epoch ms */
  at: number;
}
const RECENT_PICKS_KEY = "nexis.recentPicks";
function loadRecentPicks(): RecentPick[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_PICKS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((p): p is RecentPick => typeof p?.id === "string" && typeof p?.at === "number").slice(0, 12) : [];
  } catch {
    return [];
  }
}
function rememberPick(id: string) {
  const recentPicks = [{ id, at: Date.now() }, ...state.recentPicks.filter((p) => p.id !== id)].slice(0, 12);
  set({ recentPicks });
  try {
    localStorage.setItem(RECENT_PICKS_KEY, JSON.stringify(recentPicks));
  } catch {
    /* storage unavailable */
  }
}

let state: State = {
  status: "loading",
  loadingMsg: "Starting…",
  data: null,
  settings: DEFAULT_SETTINGS,
  hotkeyErrors: [],
  live: null,
  demo: false,
  explore: { champion: "", enemies: [], source: "detected" },
  champSelect: null,
  history: [],
  stats: null,
  statsStatus: "none",
  web: { champions: {}, global: null, globalAvgWr: 0.5, status: "idle", version: 0 },
  clientInfo: null,
  scout: { profiles: {} },
  update: null,
  postGame: null,
  intel: [],
  tierLists: {},
  myAugments: [],
  offered: [],
  scan: { status: "idle" },
  cards: [],
  offeredSource: "manual",
  tab: "home",
  recentPicks: loadRecentPicks(),
};

const listeners = new Set<() => void>();
let lastAugmentFlag: boolean | undefined;
let lastSyncedAugs = "";
function syncAugmentsToHud() {
  if (currentView !== "main" || !started) return;
  const sig = state.myAugments.join("|");
  if (sig === lastSyncedAugs) return;
  lastSyncedAugs = sig;
  void bridge.broadcast("sync-augments", state.myAugments);
}

function syncAugmentMode() {
  const augMode = effectiveMode(state);
  setAugmentPool(augMode === "arena" ? "arena" : "default");
  const on = augMode === "mayhem" || augMode === "arena";
  if (on !== lastAugmentFlag && currentView === "main" && started) {
    lastAugmentFlag = on;
    void bridge.setAugmentMode(on);
  }
}
function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
  syncAugmentMode();
  syncAugmentsToHud();
  syncHudMode();
}

/**
 * Per-mode HUD layouts: on a mode change, park the active layout under the mode being left and
 * bring in the new mode's (a mode without one yet keeps the current layout as its start).
 */
export function hudSwap(s: Pick<Settings, "hud" | "hudByMode" | "hudPerMode">, from: GameModeKind, to: GameModeKind): Pick<Settings, "hud" | "hudByMode"> | undefined {
  if (!s.hudPerMode || from === to) return undefined;
  const byMode = { ...s.hudByMode, [from]: s.hud };
  const next = byMode[to] ? normalizeHud(byMode[to]) : s.hud;
  delete byMode[to];
  return { hud: next, hudByMode: byMode };
}

let lastHudMode: GameModeKind | undefined;
function syncHudMode() {
  // Main window only (it owns settings writes; the HUD window follows via settings-changed).
  if (currentView !== "main" || !started || state.status !== "ready") return;
  const mode = effectiveMode(state);
  const from = lastHudMode;
  lastHudMode = mode;
  if (!from || from === mode) return;
  const patch = hudSwap(state.settings, from, mode);
  if (patch) void actions.updateSettings(patch);
}
export function getState(): State {
  return state;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useApp<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ------------------------------------------------------------------ derived

/** The game being displayed: live game > demo > explore (built from chosen champions). */
/** The mode currently detected from the game or League client, if any. */
export function detectedMode(s: State): GameModeKind | undefined {
  return modeFromGameMode(s.live?.gameMode) ?? modeFromGameMode(s.clientInfo?.gameMode);
}

/** The mode used for data: forced in Settings, else detected, else the last detected one. */
export function effectiveMode(s: State): GameModeKind {
  if (s.settings.mode !== "auto") return s.settings.mode;
  return detectedMode(s) ?? s.settings.lastMode ?? "mayhem";
}

/** Key for per-mode champion stats in `state.web.champions`. */
export function webKey(mode: GameModeKind, championId: string, position?: string): string {
  return mode === "sr" ? `sr:${championId}:${position || "main"}` : `${mode}:${championId}`;
}

/** Your Summoner's Rift role for stats: picked on the Build tab, else champ select's assignment. */
export function rolePosition(s: State): string | undefined {
  return s.settings.srRole || s.lastPosition;
}

export function currentGame(s: State): GameSnapshot | null {
  if (s.live) return s.live;
  if (!s.data) return null;
  if (s.demo && demoFactory) return demoFactory(s.data);
  const champ = s.champSelect?.me ?? (s.explore.champion ? findChampion(s.data, s.explore.champion) : undefined);
  if (!champ) return null;
  const mk = (c: Champion, team: "ORDER" | "CHAOS", isMe = false): PlayerState => ({
    championName: c.name,
    champion: c,
    riotId: isMe ? "You" : c.name,
    team,
    level: 1,
    items: [],
    kills: 0,
    deaths: 0,
    assists: 0,
    isMe,
  });
  const enemies = s.champSelect
    ? [] // enemies unknown during ARAM champ select
    : s.explore.enemies.map((id) => findChampion(s.data!, id)).filter((c): c is Champion => !!c);
  return {
    source: "demo",
    gameMode: "EXPLORE",
    gameTime: 0,
    gold: effectiveMode(s) === "sr" ? 500 : s.settings.startGold,
    me: mk(champ, "ORDER", true),
    allies: (s.champSelect?.team ?? []).filter((c) => c.id !== champ.id).map((c) => mk(c, "ORDER")),
    enemies: enemies.map((c) => mk(c, "CHAOS")),
  };
}

let demoFactory: ((data: StaticData) => GameSnapshot) | null = null;
/** Registers the sample game used by demo mode (kept out of the main bundle path). */
export function registerDemo(factory: (data: StaticData) => GameSnapshot) {
  demoFactory = factory;
}

export interface DataSourceInfo extends SourceResolution {
  available: DataSourceId[];
  notice?: string;
}

export interface Derived {
  game: GameSnapshot | null;
  mode: "live" | "demo" | "champselect" | "explore";
  /** Your champion with the selected build style applied (archetype/damage may differ from base). */
  champion?: Champion;
  baseChampion?: Champion;
  variants: BuildVariant[];
  variant?: BuildVariant;
  threat: ThreatReport;
  plan?: BuildPlan;
  championStats?: ChampionStats;
  statsSource: "global" | "personal" | "none";
  /** Which provider the champion stats came from. */
  statsProvider: "riot" | "hexmayhem" | "opgg" | "personal" | "none";
  /** Picked data source, what's active, sources offered for the mode and any fallback notice. */
  source?: DataSourceInfo;
  /** Your Summoner's Rift role for stats (override → champ select), lowercase. */
  position?: string;
  /** Role editor: the game key overrides are stored under (SR live / demo game only). */
  roleGame?: string;
  roleOverridden: boolean;
  /** Mode used for data (see effectiveMode) and whether it was detected automatically. */
  gameMode: GameModeKind;
  gameModeDetected: boolean;
  offeredRanked: AugmentScore[];
  allRanked: AugmentScore[];
  skillPlan?: SkillPlan & { source: "stats" | "curated" | "generic" };
  /** 18 entries: which ability to level at each champion level. */
  levelOrder: SkillKey[];
  guide?: ChampionGuide;
  advice: CoachAdvice[];
  /** Gold-aware "what to buy now" for the current phase (see engine/phase.ts). */
  shop: ShopAdvice;
  /** Scoreboard team power: item gold / levels / kills per team, SR lanes, enemy builds (engine/power.ts). */
  power?: TeamPower;
  /** Settings key for this champion's option picks (webKey) and the picks themselves. */
  choiceKey?: string;
  choice?: BuildChoice;
}

// One computation per window: <DerivedProvider> runs the engine once and every component reads
// the shared result through useDerived(). Without a provider (tests, isolated mounts) it computes locally.
const DerivedContext = createContext<Derived | null>(null);

export function DerivedProvider({ children }: { children: ReactNode }) {
  const value = useDerivedCompute();
  return createElement(DerivedContext.Provider, { value }, children);
}

export function useDerived(): Derived {
  const shared = useContext(DerivedContext);
  // The provider (or its absence) never changes for a mounted component, so hook order is stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return shared ?? useDerivedCompute();
}

function useDerivedCompute(): Derived {
  const data = useApp((s) => s.data);
  const live = useApp((s) => s.live);
  const demo = useApp((s) => s.demo);
  const explore = useApp((s) => s.explore);
  const champSelect = useApp((s) => s.champSelect);
  const settings = useApp((s) => s.settings);
  const history = useApp((s) => s.history);
  const stats = useApp((s) => s.stats);
  const web = useApp((s) => s.web);
  const myAugments = useApp((s) => s.myAugments);
  const offered = useApp((s) => s.offered);

  // The mode picks the explore starting gold, so a mode switch must rebuild the stand-in game.
  const modeForGame = effectiveMode(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rawGame = useMemo(() => currentGame(state), [data, live, demo, explore, champSelect, settings.startGold, modeForGame]);
  // Summoner's Rift role overrides (Players tab / Build row) apply on top of the API's roles.
  const roleKey = modeForGame === "sr" && rawGame && (live || demo) ? roleGameKey(rawGame) : undefined;
  const roles = useMemo(() => activeRoles(settings.roleOverrides, roleKey), [settings.roleOverrides, roleKey]);
  const game = useMemo(() => applyRoles(rawGame, roles), [rawGame, roles]);
  const baseChampion = game?.me.champion;
  const variants = useMemo(() => (baseChampion ? variantsFor(baseChampion) : []), [baseChampion]);
  const chosenStyle = baseChampion ? settings.buildStyles[baseChampion.id] : undefined;
  const variant = useMemo(() => (baseChampion ? pickVariant(baseChampion, chosenStyle) : undefined), [baseChampion, chosenStyle]);
  const champion = useMemo(() => (baseChampion ? applyVariant(baseChampion, variant) : undefined), [baseChampion, variant]);
  const variantIsDefault = !variant || variants[0]?.id === variant.id;
  const enemiesKey = (game?.enemies ?? []).map((e) => `${e.champion?.id ?? e.championName}:${e.items.map((i) => i.id).join(".")}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const threat = useMemo(() => analyzeEnemies(game?.enemies ?? []), [enemiesKey]);

  const clientInfo = useApp((s) => s.clientInfo);
  const champSelectPosition = useApp((s) => rolePosition(s));
  // Your role: a manual override wins over champ select's assignment (SR stats are per role).
  const myOverride = game && roles !== NO_OVERRIDES ? roles[playerKey(game.me)] : undefined;
  const lastPosition = myOverride ? myOverride.toLowerCase() : champSelectPosition;
  const gameMode = useMemo(() => effectiveMode(state), [live, clientInfo, settings.mode, settings.lastMode]);
  const gameModeDetected = settings.mode === "auto" && !!detectedMode(state);
  const choiceKey = baseChampion ? webKey(gameMode, baseChampion.id, lastPosition) : undefined;
  const choice = choiceKey ? settings.buildChoices?.[choiceKey] : undefined;

  // Personal history and the Riot dataset only count for the mode they were recorded in, so e.g.
  // Mayhem games never drive Arena/ARAM/SR items or augment win rates.
  const modeHistory = useMemo(() => historyForMode(history, gameMode), [history, gameMode]);
  const modeDataset = stats && datasetMode(stats) === gameMode ? stats : undefined;

  const pickedSource = selectedSource(gameMode, settings.dataSources?.[gameMode], !!modeDataset);
  useEffect(() => {
    if (baseChampion && settings.webStats) void ensureChampionStats(gameMode, baseChampion.id, false, lastPosition);
  }, [baseChampion, settings.webStats, gameMode, lastPosition]);

  const source = useMemo((): DataSourceInfo | undefined => {
    if (!champion) return undefined;
    // One web provider per mode (HexMayhem for Mayhem, OP.GG otherwise), cached under webKey.
    const r = resolveSource(gameMode, pickedSource, {
      riot: modeDataset?.champions[champion.id],
      web: { [defaultWebSource(gameMode)]: web.champions[webKey(gameMode, champion.id, lastPosition)] },
      personal: personalChampionStats(modeHistory, champion.id),
      webEnabled: settings.webStats,
    });
    return { ...r, available: sourcesForMode(gameMode, !!modeDataset), notice: fallbackNotice(r, champion.name) };
  }, [champion, modeDataset, modeHistory, web, settings.webStats, gameMode, lastPosition, pickedSource]);
  const championStats = source?.stats;
  const statsSource = source?.statsSource ?? "none";
  const statsProvider = source?.active ?? "none";
  // "Baseline" is the plain template: no personal history either. HexMayhem's mode-wide augment
  // stats and combos only join when HexMayhem (or Auto) drives the recommendation.
  const sourceHistory = useMemo(() => (source?.active === "none" && source.selected === "baseline" ? [] : modeHistory), [source?.active, source?.selected, modeHistory]);
  const useHexGlobal = settings.webStats && gameMode !== "arena" && (pickedSource === "auto" || source?.active === "hexmayhem");

  const plan = useMemo(() => {
    if (!data || !champion || !game) return undefined;
    setItemMap(itemMapFor(gameMode));
    return recommendBuild({
      data,
      champion,
      threat,
      me: game.me,
      // Arena hands out gold per round: only a live game has a real value to compare against.
      gold: gameMode === "arena" && game.source !== "live" ? undefined : game.gold,
      playstyle: settings.playstyle,
      stats: statsSource === "global" ? championStats : undefined,
      history: sourceHistory,
      startGold: gameMode === "sr" ? 500 : settings.startGold,
      variant,
      variantIsDefault,
      mode: gameMode,
      choice,
    });
    // Only the parts of `game` it reads (live snapshots share unchanged parts, see liveStable.ts):
    // a poll where only the clock moved doesn't rebuild the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, champion, game?.me, game?.gold, game?.source, threat, settings.playstyle, settings.startGold, championStats, statsSource, sourceHistory, variant, variantIsDefault, gameMode, choice]);

  // Build-change intel: announce when the enemy team's items change your situational recommendations.
  useEffect(() => {
    if (!plan || !live || live.loading || !champion) return;
    const key = `${champion.id}|${variant?.id ?? ""}|${settings.playstyle}`;
    const sig = plan.situational.map((x) => `${x.item.id}:${x.owned ? 1 : 0}:${(x.urgency ?? 0).toFixed(2)}`).join(",");
    const prev = intelPlan;
    if (prev?.key === key && prev.sig === sig) return;
    intelPlan = { key, sig, plan };
    if (!prev || prev.key !== key) return;
    const ev = buildChanges(prev.plan, plan, { at: live.gameTime, recent: state.intel, data: state.data ?? undefined });
    if (!ev.length) return;
    set((s) => ({ intel: appendIntel(s.intel, ev) }));
    if (currentView !== "main") return;
    for (const e of ev) {
      if (toastedBuild.has(e.id)) continue;
      toastedBuild.add(e.id);
      toast(e.title, e.tone === "warn" ? "warn" : "info", { id: "intel-build", detail: e.detail, duration: 7000 });
    }
  }, [plan, live, champion, variant, settings.playstyle]);

  const ctx = useMemo(
    () => ({
      champion,
      threat,
      owned: myAugments,
      stats: statsSource === "global" ? championStats : undefined,
      history: sourceHistory,
      // HexMayhem's mode-wide augment stats and combos are Mayhem-only data.
      global: useHexGlobal ? (web.global ?? undefined) : undefined,
      globalAvgWr: web.globalAvgWr,
      combos: useHexGlobal ? web.combos : undefined,
      mode: gameMode === "arena" ? ("arena" as const) : undefined,
    }),
    [champion, threat, myAugments, championStats, statsSource, sourceHistory, web.global, web.globalAvgWr, web.combos, useHexGlobal, gameMode],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allRanked = useMemo(() => rankAugments([...AUGMENTS], ctx), [ctx, web.version]);
  const offeredRanked = useMemo(
    () => rankAugments(offered.map(findAugment).filter((a): a is NonNullable<typeof a> => !!a), ctx),
    [offered, ctx],
  );

  const skillPlan = useMemo(
    () => (baseChampion ? skillPlanFor(baseChampion, variant, variantIsDefault && statsSource === "global" ? championStats : undefined) : undefined),
    [baseChampion, variant, variantIsDefault, championStats, statsSource],
  );
  const levelOrder = useMemo(() => (skillPlan ? levelSequence(skillPlan) : []), [skillPlan]);
  const guide = useMemo(() => (baseChampion ? guideFor(baseChampion) : undefined), [baseChampion]);
  const advice = useMemo(() => (baseChampion ? matchupAdvice(baseChampion, game?.enemies ?? []) : []), [baseChampion, game?.enemies]);
  const shop = useMemo(
    () => (data ? shopAdvice({ data, plan, game, mode: gameMode, threat }) : { phase: "pregame" as const, phaseLabel: "Pre-game", buyNow: [], tips: [] }),
    [data, plan, game, gameMode, threat],
  );

  // Scoreboard only (players + mode), not the clock / gold.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const power = useMemo(() => scoreboardPower(game, data, { mode: gameMode, myChampion: champion }), [data, game?.me, game?.allies, game?.enemies, game?.gameMode, !game, gameMode, champion]);
  const mode: Derived["mode"] = live ? "live" : demo ? "demo" : champSelect ? "champselect" : "explore";
  return { game, mode, champion, baseChampion, variants, variant, threat, plan, championStats, statsSource, statsProvider, source, position: lastPosition, roleGame: roleKey, roleOverridden: roles !== NO_OVERRIDES, gameMode, gameModeDetected, offeredRanked, allRanked, skillPlan, levelOrder, guide, advice, shop, power, choiceKey, choice };
}

/** Passive + Q/W/E/R info (names, icons, descriptions) for a champion; [] while loading. */
export function useChampionSpells(championId: string | undefined): ChampionSpell[] {
  const version = useApp((s) => s.data?.version);
  const [spells, setSpells] = useState<ChampionSpell[]>([]);
  useEffect(() => {
    let alive = true;
    setSpells([]);
    if (version && championId) void loadChampionSpells(version, championId).then((s) => alive && setSpells(s));
    return () => {
      alive = false;
    };
  }, [version, championId]);
  return spells;
}

// ------------------------------------------------------------------ actions

export const actions = {
  setTab(tab: Tab) {
    set({ tab });
  },
  async updateSettings(patch: Partial<Settings>) {
    const settings = normalizeSettings({ ...state.settings, ...patch });
    applyTheme(settings);
    set({ settings });
    const errors = await bridge.saveSettingsRaw(settings);
    set({ hotkeyErrors: errors });
    if (patch.statsUrl !== undefined) void loadStats();
    if (patch.webStats) {
      void loadWebGlobal();
      void loadCombos();
    }
  },
  /** Re-download all live stats now, ignoring caches. */
  async refreshData() {
    set((s) => ({ web: { ...s.web, champions: {} } }));
    await Promise.all([loadWebGlobal(true), loadCombos(true)]);
    const g = currentGame(state);
    const c = g?.me.champion;
    if (!c) return;
    const mode = effectiveMode(state);
    const mine = mode === "sr" && (state.live || state.demo) ? activeRoles(state.settings.roleOverrides, roleGameKey(g))[playerKey(g.me)] : undefined;
    await ensureChampionStats(mode, c.id, true, mine ? mine.toLowerCase() : rolePosition(state));
  },
  /** Load (or refresh) the champion tier list for a mode. Cached 3 h. */
  async loadTierList(mode: GameModeKind, force = false) {
    if (!state.data || !state.settings.webStats) return;
    const cur = state.tierLists[mode];
    if (!force && cur && (cur.status === "loading" || (cur.status === "ok" && Date.now() - (cur.fetchedAt ?? 0) < STATS_MAX_AGE_H * 3600e3))) return;
    set((s) => ({ tierLists: { ...s.tierLists, [mode]: { ...cur, status: "loading" } } }));
    try {
      const html = await bridge.fetchText(tierListUrl(mode), `tierlist-${mode}.html`, force ? 0 : STATS_MAX_AGE_H);
      const rows = parseTierList(mode, html, state.data!);
      if (!rows.length) throw new Error("No tier data on the page (the site may have changed)");
      const patch = tierListPatch(html);
      set((s) => ({ tierLists: { ...s.tierLists, [mode]: { rows, status: "ok", patch, fetchedAt: Date.now() } } }));
      void recordTierSnapshot(mode, patch, rows); // Home's "Patch movers"
    } catch (e) {
      set((s) => ({ tierLists: { ...s.tierLists, [mode]: { ...s.tierLists[mode], status: "error", error: String(e) } } }));
    }
  },
  /** Star / unstar a champion (shown on Home). */
  toggleFavorite(id: string) {
    const favs = state.settings.favorites ?? [];
    return actions.updateSettings({ favorites: favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id] });
  },
  dismissPostGame() {
    set({ postGame: null });
  },
  setTierPosition(position: TierPosition) {
    set({ tierPosition: position });
  },
  setMode(mode: "auto" | GameModeKind) {
    return actions.updateSettings({ mode });
  },
  /** Pick a rune page / spells / core / starter / boots option (its stable key) for a champion + mode; undefined resets to auto. */
  setBuildChoice(key: string, patch: Partial<BuildChoice>) {
    const next = { ...state.settings.buildChoices };
    const merged = mergeChoice(next[key], patch);
    if (merged) next[key] = merged;
    else delete next[key];
    return actions.updateSettings({ buildChoices: next });
  },
  /** Pick your Summoner's Rift role ("" = auto). In a live game this sets your lane too. */
  setSrRole(role: string) {
    const lane = ({ top: "TOP", jungle: "JUNGLE", mid: "MIDDLE", adc: "BOTTOM", support: "UTILITY" } as Record<string, Lane>)[role];
    const g = currentGame(state);
    if (lane && g && state.live && effectiveMode(state) === "sr") void actions.setRole(roleGameKey(g), g.me, lane);
    return actions.updateSettings({ srRole: role });
  },
  /** Move a player to a lane in the current SR game (a teammate in that lane swaps). */
  setRole(gameKey: string, player: Pick<PlayerState, "team" | "championName">, lane: Lane) {
    // Compare against the API's roles: the raw snapshot, not the overridden one.
    const game = currentGame(state);
    if (!game || roleGameKey(game) !== gameKey) return;
    const raw = [game.me, ...game.allies, ...game.enemies].find((p) => playerKey(p) === playerKey(player));
    if (!raw) return;
    const roles = assignRole(game, activeRoles(state.settings.roleOverrides, gameKey), raw, lane);
    return actions.updateSettings({ roleOverrides: Object.keys(roles).length ? { game: gameKey, roles } : null });
  },
  resetRoles() {
    return actions.updateSettings({ roleOverrides: null });
  },
  /** Save a pasted share code's picks (and build style) for its champion + mode; shows that champion. */
  importBuildCode(text: string): { ok: true; champion: string; mode: GameModeKind } | { ok: false; error: string } {
    const b = decodeBuild(text);
    if (!b) return { ok: false, error: "That isn't a Nexis build code (it starts with NX1-)." };
    const champ = state.data ? findChampion(state.data, b.champion) : undefined;
    if (!champ) return { ok: false, error: `Unknown champion in the code: ${b.champion}` };
    const key = webKey(b.mode, champ.id, b.position);
    const patch: Partial<Settings> = { buildChoices: { ...state.settings.buildChoices, [key]: b.choice } };
    if (b.style) patch.buildStyles = { ...state.settings.buildStyles, [champ.id]: b.style };
    void actions.updateSettings(patch);
    if (!state.live) actions.setExploreChampion(champ.id);
    return { ok: true, champion: champ.name, mode: b.mode };
  },
  /** Pick the recommendation data source for a mode ("auto" removes the pick). */
  setDataSource(mode: GameModeKind, id: DataSourceId) {
    const next = { ...state.settings.dataSources };
    if (id === "auto") delete next[mode];
    else next[mode] = id;
    return actions.updateSettings({ dataSources: next });
  },
  setBuildStyle(championId: string, variantId: string) {
    return actions.updateSettings({ buildStyles: { ...state.settings.buildStyles, [championId]: variantId } });
  },
  updateTheme(patch: Partial<ThemeSettings>) {
    return actions.updateSettings({ theme: { ...state.settings.theme, ...patch } });
  },
  /** Release/restore global hotkeys while recording a new keybind. */
  async suspendHotkeys(suspended: boolean) {
    const errors = await bridge.suspendHotkeys(suspended);
    if (!suspended) set({ hotkeyErrors: errors });
  },
  setDemo(demo: boolean) {
    if (demo === state.demo) return;
    if (state.live) return set({ demo }); // never touch a real game's augments
    set({ demo, myAugments: demo ? ["Eureka"] : [], offered: demo ? ["Jeweled Gauntlet", "Infinite Recursion", "Draw Your Sword"] : [], offeredSource: "manual" });
  },
  setExploreChampion(id: string) {
    if (id) rememberPick(id);
    set((s) => (s.live ? { explore: { ...s.explore, champion: id, source: "manual" } } : { explore: { ...s.explore, champion: id, source: "manual" }, myAugments: [], offered: [] }));
  },
  setExploreEnemies(ids: string[]) {
    set((s) => ({ explore: { ...s.explore, enemies: ids.slice(0, 5) } }));
  },
  takeAugment(name: string) {
    set((s) => ({
      myAugments: s.myAugments.includes(name) ? s.myAugments : [...s.myAugments, name].slice(-6),
      offered: [],
      offeredSource: "manual",
      scan: { status: "idle" },
    }));
  },
  removeAugment(name: string) {
    set((s) => ({ myAugments: s.myAugments.filter((a) => a !== name) }));
  },
  toggleOffered(name: string) {
    set((s) => ({
      offeredSource: "manual",
      offered: s.offered.includes(name) ? s.offered.filter((a) => a !== name) : [...s.offered, name].slice(-4),
    }));
  },
  clearOffered() {
    set({ offered: [], scan: { status: "idle" } });
  },
  async scan() {
    if (!bridge.isTauri) {
      set({ scan: { status: "error", error: "Screen scanning needs the desktop app (Windows). Pick the offered augments below instead." } });
      return;
    }
    await bridge.requestScan();
  },
  async clearHistory() {
    set({ history: [] });
    await bridge.saveHistory([]);
  },
  async importHistory(records: MatchRecord[]) {
    const merged = [...state.history];
    for (const r of records) if (!merged.some((m) => m.id === r.id)) merged.push(r);
    merged.sort((a, b) => a.date.localeCompare(b.date));
    set({ history: merged });
    await bridge.saveHistory(merged);
  },
  /**
   * Opt-in "Import to League": write the recommended rune page and/or item set into the League
   * client (whichever is enabled in Settings). Uses the current champion's recommendations unless
   * `input` is given. Shows a toast and returns a per-part summary.
   */
  importToLeague(input?: LeagueImportInput, opts: { auto?: boolean } = {}): Promise<LeagueImportResult> {
    return runLeagueImport(input ?? leagueImportInput, opts.auto ?? false);
  },
  hide() {
    void bridge.hideOverlay();
  },
  quit() {
    void bridge.quitApp();
  },
};

// ------------------------------------------------------------------ Import to League (opt-in)

/** What gets imported: the champion (build style applied) plus its recommendations. */
export interface LeagueImportInput {
  champion: Champion;
  stats?: ChampionStats;
  plan?: BuildPlan;
  /** Enemy team known (live game / explore) → label the situational block accordingly. */
  enemiesKnown?: boolean;
  modeLabel?: string;
  /** Game mode the recommendations are for (Arena has no rune pages). */
  mode?: GameModeKind;
  /** Rune page picked on the Build view (its runeKey); most played otherwise. */
  runeChoice?: ChoiceValue;
}

export interface LeagueImportPart {
  status: "ok" | "skipped" | "error";
  message: string;
}

export interface LeagueImportResult {
  ok: boolean;
  runes: LeagueImportPart;
  itemSet: LeagueImportPart;
}

/** Latest recommendations of the main window (kept fresh by useLeagueAutoImport). */
let leagueImportInput: LeagueImportInput | undefined;
let leagueImportBusy = false;
/**
 * Champion last auto-imported during the current champ select. Only one "Nexis:" page / set exists
 * at a time (each import replaces the previous one), so swapping A → B → A (ARAM bench, trades)
 * must import A again; staying on the same champion must not write again on every poll.
 */
let lastAutoImported: string | undefined;

/** Should auto-import write for `meId` now? (pure, exported for tests) */
export function autoImportDue(lastImported: string | undefined, meId: string | undefined): boolean {
  return !!meId && lastImported !== meId;
}

function importInputFrom(d: Derived): LeagueImportInput | undefined {
  if (!d.champion) return undefined;
  return { champion: d.champion, stats: d.championStats, plan: d.plan, enemiesKnown: (d.game?.enemies.length ?? 0) > 0, modeLabel: MODE_LABEL[d.gameMode], mode: d.gameMode, runeChoice: d.choice?.rune };
}

async function runLeagueImport(input: LeagueImportInput | undefined, auto: boolean): Promise<LeagueImportResult> {
  const li = state.settings.leagueImport;
  const skipped = (message: string): LeagueImportPart => ({ status: "skipped", message });
  const result: LeagueImportResult = { ok: false, runes: skipped("Rune import is off"), itemSet: skipped("Item set import is off") };
  if (!li.runes && !li.itemSets) {
    if (!auto) toast("Import to League is off", "warn", { id: "league-import", detail: "Turn it on in Settings → League client." });
    return result;
  }
  if (!input) {
    if (!auto) toast("Pick a champion first", "warn", { id: "league-import" });
    return { ...result, runes: skipped("No champion"), itemSet: skipped("No champion") };
  }
  if (leagueImportBusy) return { ...result, runes: skipped("Already importing"), itemSet: skipped("Already importing") };
  leagueImportBusy = true;
  const err = (e: unknown): LeagueImportPart => ({ status: "error", message: String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, "") });
  try {
    const { champion } = input;
    if (li.runes && input.mode === "arena") {
      result.runes = skipped("Arena has no rune pages");
    } else if (li.runes) {
      const page = buildRunePage(champion, input.stats, undefined, input.runeChoice);
      if ("error" in page) result.runes = { status: "error", message: page.error };
      else
        result.runes = await bridge
          .lcuApplyRunes(page.name, page.primary, page.sub, page.perks)
          .then((): LeagueImportPart => ({ status: "ok", message: `Rune page "${page.name}"` }), err);
    }
    if (li.itemSets) {
      const blocks = input.plan ? buildItemSetBlocks(input.plan, { enemiesKnown: input.enemiesKnown }) : [];
      const title = itemSetTitle(champion, input.modeLabel);
      if (!blocks.length) result.itemSet = { status: "error", message: `No build for ${champion.name} yet.` };
      else
        result.itemSet = await bridge
          .lcuApplyItemSet(champion.key, title, JSON.stringify(blocks))
          .then((): LeagueImportPart => ({ status: "ok", message: `Item set "${title}"` }), err);
    }
  } finally {
    leagueImportBusy = false;
  }
  const parts = [result.runes, result.itemSet].filter((p) => p.status !== "skipped");
  const failed = parts.filter((p) => p.status === "error");
  result.ok = parts.length > 0 && failed.length === 0;
  const done = parts.filter((p) => p.status === "ok").map((p) => p.message);
  if (!parts.length) {
    if (!auto) toast("Nothing to import", "warn", { id: "league-import", detail: [result.runes, result.itemSet].map((p) => p.message).join(" · ") });
  } else if (result.ok) toast(`Imported to League${auto ? " (auto)" : ""}`, "good", { id: "league-import", detail: done.join(" · ") });
  else if (done.length) toast("Imported to League (partly)", "warn", { id: "league-import", detail: [...done, ...failed.map((f) => f.message)].join(" · ") });
  else toast("Couldn't import to League", "bad", { id: "league-import", detail: failed.map((f) => f.message).join(" · ") });
  return result;
}

/**
 * Mount once in the main window (App). One-time migration of legacy index-based option picks
 * (settings.buildChoices) to stable option keys, once this champion's stats-based options are known:
 * indices that still name an option become its key, the rest are dropped. Rune keys saved before
 * stat shards were part of the key are upgraded to the full key of the first page with the same runes.
 */
export function useMigrateBuildChoice(d: Derived) {
  const { choiceKey, choice, championStats, statsSource, plan } = d;
  const variantIsDefault = !d.variant || d.variants[0]?.id === d.variant.id;
  useEffect(() => {
    if (currentView !== "main" || !choiceKey || !choice || statsSource !== "global" || !plan) return;
    if (!needsMigration(choice)) return; // nothing legacy: no index picks, no rune key without shards
    const patch = migrateChoice(choice, {
      rune: runeOptions(championStats).map(runeKey),
      spells: spellOptions(championStats).map(spellKey),
      // Core / starter options only exist for the champion's default build style: leave them until then.
      ...(variantIsDefault ? { core: plan.coreOptions.map((o) => o.key), starter: plan.starterOptions.map((o) => o.key) } : {}),
      boots: plan.bootsOptions.map((o) => o.key),
    });
    if (patch) void actions.setBuildChoice(choiceKey, patch);
  }, [choiceKey, choice, championStats, statsSource, plan, variantIsDefault]);
}

/**
 * Mount once in the main window (App). Keeps the import input current for the "Import to League"
 * button and, when auto-import is on, imports once per champion locked in champ select (debounced,
 * after that champion's stats finished loading).
 */
export function useLeagueAutoImport(d: Derived) {
  const champSelect = useApp((s) => s.champSelect);
  const li = useApp((s) => s.settings.leagueImport);
  const statsEntry = useApp((s) => (d.champion ? s.web.champions[webKey(d.gameMode, d.champion.id, d.position)] : undefined));
  const input = useMemo(() => importInputFrom(d), [d.champion, d.championStats, d.plan, d.game, d.gameMode, d.choice]);
  useEffect(() => {
    leagueImportInput = input;
  }, [input]);

  const meId = champSelect?.me?.id;
  const inChampSelect = !!champSelect;
  const statsLoading = state.settings.webStats && statsEntry === "loading";
  useEffect(() => {
    if (!inChampSelect) lastAutoImported = undefined; // next champ select imports again
  }, [inChampSelect]);
  useEffect(() => {
    if (!li.auto || !(li.runes || li.itemSets) || !meId || currentView !== "main" || statsLoading) return;
    if (!autoImportDue(lastAutoImported, meId) || input?.champion.id !== meId || !input.plan) return;
    const t = setTimeout(() => {
      if (!autoImportDue(lastAutoImported, meId) || leagueImportInput?.champion.id !== meId) return;
      lastAutoImported = meId;
      void runLeagueImport(leagueImportInput, true);
    }, 1500);
    return () => clearTimeout(t);
  }, [li.auto, li.runes, li.itemSets, meId, statsLoading, input?.champion.id, !!input?.plan]);
}

// ------------------------------------------------------------------ backend wiring

interface ChampSelectRaw {
  localPlayerCellId?: number;
  myTeam?: Array<{ cellId: number; championId: number; assignedPosition?: string; gameName?: string; tagLine?: string; nameVisibilityType?: string }>;
  benchChampions?: Array<{ championId: number }>;
  benchEnabled?: boolean;
}

function parseChampSelect(raw: ChampSelectRaw | null, data: StaticData): ChampSelectState | null {
  if (!raw || !raw.myTeam) return null;
  const byKey = (k: number) => data.championsByKey.get(k);
  const meCell = raw.myTeam.find((p) => p.cellId === raw.localPlayerCellId);
  return {
    position: meCell?.assignedPosition || undefined,
    me: meCell ? byKey(meCell.championId) : undefined,
    team: raw.myTeam.map((p) => byKey(p.championId)).filter((c): c is Champion => !!c),
    // Riot IDs only when the client shows them (hidden in ranked solo / duo champ select).
    mates: raw.myTeam.map((p) => ({
      ...(p.gameName && p.tagLine && p.nameVisibilityType !== "HIDDEN" ? { riotId: `${p.gameName}#${p.tagLine}` } : {}),
      champion: byKey(p.championId),
      position: p.assignedPosition || undefined,
      isMe: p.cellId === raw.localPlayerCellId,
    })),
    bench: (raw.benchChampions ?? []).map((b) => byKey(b.championId)).filter((c): c is Champion => !!c),
  };
}

let lastGameKey = "";
let tabSwitchedFor = "";
let intelPrev: GameSnapshot | null = null;
let intelPlan: { key: string; sig: string; plan: BuildPlan } | null = null;
const toastedBuild = new Set<string>();
let recordedGame = "";
/** Post-game timeline of the current game (main window only). */
let timelineRec: TimelineRecorder | null = null;

/** Remember the auto-detected champion so the app stays on it after the game / outside champ select. */
function rememberChampion(id: string) {
  if (state.explore.champion !== id || state.explore.source !== "detected") set((s) => ({ explore: { ...s.explore, champion: id, source: "detected" } }));
  if (state.settings.lastChampion !== id && currentView === "main") {
    const settings = { ...state.settings, lastChampion: id };
    set({ settings });
    void bridge.saveSettingsRaw(settings, true);
  }
}

function rememberMode(mode: GameModeKind | undefined) {
  if (!mode || mode === state.settings.lastMode || currentView !== "main") return;
  const settings = { ...state.settings, lastMode: mode };
  set({ settings });
  void bridge.saveSettingsRaw(settings, true);
}

function onLiveGame(raw: AllGameDataRaw) {
  const parsed = parseLiveGame(raw, state.data, state.champSelect?.me?.id || state.explore.champion || state.settings.lastChampion);
  if (!parsed) return;
  // Reuse unchanged parts of the previous snapshot (an identical poll keeps the same object).
  const snap = stabilizeSnapshot(state.live, parsed);
  // New game → reset per-game augment state.
  const key = `${snap.me.championName}|${snap.enemies.map((e) => e.championName).join(",")}`;
  if (key !== lastGameKey) {
    lastGameKey = key;
    intelPrev = null;
    intelPlan = null;
    timelineRec = null;
    pickTracker = NEW_TRACKER;
    toastedBuild.clear();
    set({ myAugments: [], offered: [], scan: { status: "idle" }, demo: false, intel: [] });
  }
  if (snap !== state.live || state.champSelect) set({ live: snap, champSelect: null });
  // Scoreboard intel: what changed since the last snapshot (items completed, levels, fights).
  if (intelPrev && state.data && !snap.loading) {
    const ev = diffSnapshots(intelPrev, snap, state.data);
    if (ev.length) set((s) => ({ intel: appendIntel(s.intel, ev) }));
  }
  if (!snap.loading) intelPrev = snap;
  if (currentView === "main" && state.data) timelineRec = stepTimeline(timelineRec, snap, state.data);
  // Open the scouting view once per game while loading (only matters if the overlay is open).
  if (snap.loading && tabSwitchedFor !== key && currentView === "main") {
    tabSwitchedFor = key;
    set({ tab: "enemies" });
  }
  void scoutPlayers(snap, key);
  if (snap.me.champion) rememberChampion(snap.me.champion.id);
  rememberMode(modeFromGameMode(snap.gameMode));
  // Only the main window records history (the HUD window has no augment picks), and never
  // spectated games (no active player).
  if (snap.ended && recordedGame !== key && currentView === "main" && (raw.activePlayer?.riotId || raw.activePlayer?.summonerName)) {
    recordedGame = key;
    void recordMatch(snap);
  }
}

async function recordMatch(snap: GameSnapshot) {
  const champ = snap.me.champion;
  if (!champ || !snap.ended) return;
  const rec: MatchRecord = {
    id: `${Date.now()}-${champ.id}`,
    date: new Date().toISOString(),
    champion: champ.id,
    result: snap.ended.result,
    kills: snap.me.kills,
    deaths: snap.me.deaths,
    assists: snap.me.assists,
    durationSec: Math.round(snap.gameTime),
    items: snap.me.items.map((i) => i.id),
    augments: [...state.myAugments],
    enemies: snap.enemies.map((e) => e.champion?.id ?? e.championName),
    gameMode: snap.gameMode,
    ...(timelineRec?.timeline.samples.length ? { timeline: timelineRec.timeline } : {}),
  };
  const history = [...state.history, rec];
  set({ history, postGame: state.settings.showPostGame ? rec : null });
  await bridge.saveHistory(history);
  if (state.settings.showPostGame) void bridge.showOverlay();
}

let missedScans = 0;
let pendingCards = "";
let pickTracker: PickTracker = NEW_TRACKER;

/**
 * Whether a background scan's cards should show right away. Three recognized augment names at once
 * is an offer (stray fight text never matches three); with only two, wait for the same pair in the
 * next scan (~0.6 s later) so random text can't flash badges.
 */
export function offerConfirmed(count: number, sig: string, pending: string): boolean {
  return count >= 3 || sig === pending;
}

function onScan(payload: { ok: boolean; auto?: boolean; error?: string; scan?: { lines: OcrLine[]; millis: number } }) {
  if (payload.auto) {
    // Background detection: update the in-game badges quietly.
    const matches = payload.ok && payload.scan ? matchAugments(payload.scan.lines, AUGMENTS) : [];
    // Pick detection from the scans alone (the card left on screen after you choose).
    const step = stepPick(pickTracker, matches.map((m) => m.augment.name));
    pickTracker = step.tracker;
    if (step.picked && currentView === "main" && state.settings.detectPicks && !state.myAugments.includes(step.picked)) actions.takeAugment(step.picked);
    if (matches.length >= 2) {
      missedScans = 0;
      const names = matches.map((m) => m.augment.name);
      const sig = names.join("|");
      const confirmed = offerConfirmed(matches.length, sig, pendingCards);
      pendingCards = sig;
      const changed = sig !== state.cards.map((c) => c.augment.name).join("|");
      if (confirmed && changed) {
        const keepManual = state.offeredSource === "manual" && state.offered.length > 0;
        set({ cards: matches, ...(keepManual ? {} : { offered: names, offeredSource: "auto" as const }) });
      }
    } else {
      pendingCards = "";
      if (state.cards.length && ++missedScans >= 2) set({ cards: [] });
    }
    return;
  }
  if (!payload.ok || !payload.scan) {
    set({ scan: { status: "error", error: payload.error ?? "Scan failed" }, tab: "augments" });
    return;
  }
  const matches = matchAugments(payload.scan.lines, AUGMENTS);
  set({
    tab: "augments",
    scan: {
      status: matches.length ? "done" : "error",
      error: matches.length ? undefined : "No augment names recognized. Press the scan hotkey while the augment cards are on screen, or adjust the scan region in Settings.",
      ms: payload.scan.millis,
      lines: payload.scan.lines,
      matches,
    },
    offered: matches.map((m) => m.augment.name),
    offeredSource: "auto",
  });
}

// ------------------------------------------------------------------ HexMayhem web stats

async function loadCombos(force = false) {
  if (!state.settings.webStats) return;
  try {
    const html = await bridge.fetchText(COMBOS_URL, "hexmayhem-combos.html", force ? 0 : STATS_MAX_AGE_H);
    const combos = parseCombos(html);
    if (combos.length) set((s) => ({ web: { ...s.web, combos, version: s.web.version + 1 } }));
  } catch {
    /* optional data: the app works without combos */
  }
}

async function loadWebGlobal(force = false) {
  if (!state.settings.webStats || state.web.status === "loading") return;
  set((s) => ({ web: { ...s.web, status: "loading", error: undefined } }));
  try {
    const html = await bridge.fetchText(AUGMENTS_URL, "hexmayhem-augments.html", force ? 0 : STATS_MAX_AGE_H);
    const { patch, rows } = parseAugmentTable(html);
    const dataDate = /Data date[^0-9]{0,80}(\d{4}-\d{2}-\d{2})/.exec(html.replace(/<[^>]+>/g, " "))?.[1];
    if (!rows.length) throw new Error("No augment data found on the page (site layout may have changed)");
    registerAugments(rows);
    const global: Record<string, GlobalAugmentStat> = {};
    let n = 0;
    let wins = 0;
    for (const r of rows) {
      global[r.name] = { wr: r.wr / 100, pr: r.pr / 100, n: r.n, tier: r.tier };
      n += r.n;
      wins += (r.n * r.wr) / 100;
    }
    set((s) => ({
      web: { ...s.web, global, globalAvgWr: n ? wins / n : 0.5, patch, dataDate, totalAugments: rows.length, status: "ok", version: s.web.version + 1, fetchedAt: Date.now() },
    }));
  } catch (e) {
    set((s) => ({ web: { ...s.web, status: "error", error: String(e) } }));
  }
}

/** Loads per-champion stats for a mode. Providers register per mode (HexMayhem for Mayhem, OP.GG for ARAM / SR). */
export type ChampionStatsProvider = (championId: string, data: StaticData, maxAgeHours: number, position?: string) => Promise<ChampionStats | undefined>;
const providers: Partial<Record<GameModeKind, ChampionStatsProvider>> = {
  mayhem: async (id, data, maxAge) => {
    // HexMayhem publishes no runes: OP.GG's Mayhem runes page fills them in (failure = no runes).
    const runes = bridge
      .fetchText(opggChampionUrl("aram-mayhem", id, undefined, "runes"), `opgg-aram-mayhem-${id.toLowerCase()}-main-runes.html`, maxAge)
      .then(opggRunePages)
      .catch(() => undefined);
    const html = await bridge.fetchText(championUrl(id), `hexmayhem-${id.toLowerCase()}.html`, maxAge);
    const parsed = parseChampionPage(html);
    if (!parsed) return undefined;
    registerAugments(parsed.augments);
    return withOpggRunes(toChampionStats(parsed, data), await runes);
  },
};
const opggProvider =
  (mode: OpggMode): ChampionStatsProvider =>
  async (id, data, maxAge, pos) => {
    const position = mode === "ranked" ? pos : undefined;
    const get = (page: "build" | "items" | "runes") =>
      bridge
        .fetchText(opggChampionUrl(mode, id, position, page), `opgg-${mode}-${id.toLowerCase()}-${position ?? "main"}-${page}.html`, maxAge)
        .then(parseOpggChampionPage)
        .catch(() => undefined);
    const merged = mergeOpggChampion(...(await Promise.all([get("build"), get("items"), get("runes")])));
    return merged ? opggToChampionStats(merged, data) : undefined;
  };
providers.aram = opggProvider("aram");
providers.sr = opggProvider("ranked");
providers.arena = arenaStatsProvider(bridge.fetchText, bridge.fetchJson, registerArenaAugments);

export function registerStatsProvider(mode: GameModeKind, provider: ChampionStatsProvider) {
  providers[mode] = provider;
}

/** Stats are refreshed at most this often (hours) unless the user forces a refresh. */
const STATS_MAX_AGE_H = 3;

async function ensureChampionStats(mode: GameModeKind, id: string, force = false, position = rolePosition(state)) {
  const key = webKey(mode, id, position);
  const prev = state.web.champions[key];
  // 10: failed fetches are retried after 2 minutes instead of never.
  const retryable = prev === "error" && Date.now() - (webErrorAt.get(key) ?? 0) > 120_000;
  if (!state.data || (!force && prev && !retryable)) return;
  const provider = providers[mode];
  if (!provider) return;
  set((s) => ({ web: { ...s.web, champions: { ...s.web.champions, [key]: "loading" } } }));
  try {
    const cs = await provider(id, state.data!, force ? 0 : STATS_MAX_AGE_H, position);
    if (!cs) throw new Error("No stats on page");
    set((s) => ({ web: { ...s.web, champions: { ...s.web.champions, [key]: cs }, version: s.web.version + 1, fetchedAt: Date.now() } }));
  } catch {
    webErrorAt.set(key, Date.now());
    set((s) => ({ web: { ...s.web, champions: { ...s.web.champions, [key]: "error" } } }));
  }
}
const webErrorAt = new Map<string, number>();

// ------------------------------------------------------------------ OP.GG player scouting

/** FNV-1a 32-bit hash → hex, for collision-free cache file names. */
function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + str.length.toString(16);
}

/** Fetch OP.GG profiles for everyone in the game, 3 at a time, cached ~1 h. Runs once per game. */
async function scoutPlayers(snap: GameSnapshot, gameKey: string) {
  await scoutRiotIds([snap.me, ...snap.allies, ...snap.enemies].map((p) => p.riotId), gameKey);
}

/** Fetch OP.GG profiles for these Riot IDs (game or champ select), 3 at a time, cached ~1 h. */
async function scoutRiotIds(ids: string[], gameKey: string) {
  if (currentView !== "main" || !state.settings.webStats || state.scout.gameKey === gameKey) return;
  const region = opggRegionFromPlatform(state.clientInfo?.platformId || state.clientInfo?.region || "");
  if (!region) return; // need the League client's region first; retried on the next snapshot
  const players = ids.filter((id) => /#/.test(id)); // skip hidden / streamer-mode names
  set({ scout: { region, gameKey, profiles: Object.fromEntries(players.map((id) => [id, "loading" as const])) } });
  const get = (url: string) => bridge.fetchText(url, `opgg-profile-${region}-${hashString(url)}`, 1);
  const queue = [...players];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      let result: PlayerProfile | "error" = "error";
      try {
        result = (await loadProfile(id, region, get)) ?? "error";
      } catch {
        /* unknown / private account */
      }
      if (state.scout.gameKey !== gameKey) return; // a new game started
      set((s) => ({ scout: { ...s.scout, profiles: { ...s.scout.profiles, [id]: result } } }));
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// ------------------------------------------------------------------ update check

/** Compares this build's commit with the latest commit on main (GitHub API, public repos only). */
async function checkForUpdate() {
  if (currentView !== "main" || BUILD.sha === "dev") return;
  try {
    const c = await bridge.fetchJson<{ sha: string; commit: { message: string; committer: { date: string } } }>(
      "https://api.github.com/repos/exodux-dev/NexisOverlay/commits/main",
      "update-check.json",
      6,
    );
    if (c?.sha && c.sha !== BUILD.sha && c.commit.committer.date > BUILD.date)
      set({ update: { sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split("\n")[0], url: `${REPO_URL}/actions/workflows/build.yml?query=branch%3Amain` } });
  } catch {
    /* offline or private repo: no update notice */
  }
}

async function loadStats() {
  const url = state.settings.statsUrl.trim();
  if (!url) {
    set({ stats: null, statsStatus: "none", statsError: undefined });
    return;
  }
  set({ statsStatus: "loading" });
  try {
    const ds = await bridge.fetchJson<StatsDataset>(url, `stats-${url}`, 6);
    if (!ds || typeof ds !== "object" || !ds.champions) throw new Error("Not a Nexis stats dataset");
    set({ stats: ds, statsStatus: "ok", statsError: undefined });
  } catch (e) {
    const msg = String(e);
    set({
      stats: null,
      statsStatus: "error",
      statsError: /404/.test(msg)
        ? "No dataset published at this URL yet — run the stats aggregator (see docs/STATS.md). Using your own match history + baseline builds meanwhile."
        : msg,
    });
  }
}

let started = false;
let currentView: "main" | "hud" = "main";
export async function init(view: "main" | "hud" = "main") {
  if (started) return;
  started = true;
  currentView = view;
  try {
    const raw = await bridge.getSettingsRaw();
    const settings = normalizeSettings(raw, view === "main");
    applyTheme(settings);
    set((s) => ({ settings, explore: { ...s.explore, champion: settings.lastChampion || "", source: "detected" } }));
    // Listen right away (not after the static data loads, nor never when that fails): the hud
    // window saves settings too (layout editor), and must never write back a stale copy that
    // predates a save made by the main window (migrations, a setting changed meanwhile).
    await bridge.on("settings-changed", async () => {
      const settings = normalizeSettings(await bridge.getSettingsRaw());
      applyTheme(settings);
      set({ settings });
    });
    // Persist migrations (e.g. moved hotkeys) so the backend re-registers them.
    if (JSON.stringify(raw) !== JSON.stringify(settings) && view === "main") set({ hotkeyErrors: await bridge.saveSettingsRaw(settings, true) });
    set({ history: await bridge.loadHistory() });
    const data = await loadStaticData((m) => set({ loadingMsg: m }));
    set({ data, status: "ready" });
  } catch (e) {
    set({ status: "error", error: `Couldn't load game data: ${e}. Check your internet connection — data is cached after the first run.` });
    return;
  }
  void loadStats();
  void loadWebGlobal();
  void loadCombos();
  void checkForUpdate();

  await bridge.on<AllGameDataRaw>("live-game", onLiveGame);
  await bridge.on("live-game-ended", () => {
    lastGameKey = "";
    recordedGame = "";
    tabSwitchedFor = "";
    pendingCards = "";
    set({ live: null, cards: [] });
  });
  await bridge.on<ClientInfo>("client-info", (info) => {
    set({ clientInfo: info });
    rememberMode(modeFromGameMode(info?.gameMode));
  });
  await bridge.on<ChampSelectRaw | null>("champ-select", (raw) => {
    const cs = state.data ? parseChampSelect(raw, state.data) : null;
    // A real champ select ends the demo game.
    set(cs && state.demo ? { champSelect: cs, demo: false } : { champSelect: cs });
    if (cs?.position && cs.position !== state.lastPosition) {
      set({ lastPosition: cs.position });
      // A new champ select assignment replaces a role picked by hand earlier.
      if (state.settings.srRole && currentView === "main") void actions.updateSettings({ srRole: "" });
    }
    if (cs?.me) {
      rememberChampion(cs.me.id);
      // Warm the stats cache now so augment ratings are instant once the game starts.
      if (state.settings.webStats) void ensureChampionStats(effectiveMode(state), cs.me.id);
    }
    // Scout your teammates (when their names are visible) while you pick.
    const ids = (cs?.mates ?? []).map((m) => m.riotId).filter((x): x is string => !!x);
    if (ids.length) void scoutRiotIds(ids, `cs:${[...ids].sort().join(",")}`);
    // Champ select helper needs this mode's tier list (bench / trade suggestions).
    if (cs && currentView === "main") void actions.loadTierList(effectiveMode(state));
  });
  await bridge.on("augment-scan", onScan);
  if (view === "hud") await bridge.on<string[]>("sync-augments", (augs) => set({ myAugments: augs }));
  if (view === "main") {
    await bridge.on("augment-scan-started", () => set({ scan: { status: "scanning" }, tab: "augments" }));
    await bridge.on<Tab>("navigate", (tab) => set({ tab }));
  }
}

/** Test/dev hook: feed a raw Live Client payload or scan result directly. */
export const devHooks = { onLiveGame, onScan, set };
