// Which stats source drives the recommendations (build, options, runes, skill order, augments).
// "auto" keeps the built-in priority: your Riot dataset → public web stats → your games → baseline.
// A picked source that has no data (or failed / is still loading) falls back to Auto with a notice.
import type { ChampionStats } from "./types";
import type { GameModeKind } from "./mode";

export type DataSourceId = "auto" | "riot" | "hexmayhem" | "opgg" | "personal" | "baseline";
export type DataProvider = "riot" | "hexmayhem" | "opgg" | "personal" | "none";

export const DATA_SOURCE_LABEL: Record<DataSourceId, string> = {
  auto: "Auto",
  riot: "My dataset",
  hexmayhem: "HexMayhem",
  opgg: "OP.GG",
  personal: "My games",
  baseline: "Baseline",
};

/** Minimum of your own games on a champion before "My games" counts as data. */
export const PERSONAL_MIN_GAMES = 3;

/** Sources that exist for a mode ("riot" only when your stats dataset (settings.statsUrl) loaded for that mode). */
export function sourcesForMode(mode: GameModeKind, hasDataset: boolean): DataSourceId[] {
  const out: DataSourceId[] = ["auto"];
  // OP.GG's ARAM: Mayhem pages list builds without games / win rates, so Mayhem uses HexMayhem only.
  out.push(mode === "mayhem" ? "hexmayhem" : "opgg");
  if (hasDataset) out.push("riot");
  out.push("personal", "baseline");
  return out;
}

/** Public web source Auto uses for a mode. */
export function defaultWebSource(mode: GameModeKind): "hexmayhem" | "opgg" {
  return mode === "mayhem" ? "hexmayhem" : "opgg";
}

export type WebEntry = ChampionStats | "loading" | "error" | undefined;

export interface SourceCandidates {
  /** Your Riot API dataset entry for this champion (already filtered to the mode). */
  riot?: ChampionStats;
  /** Web stats per provider (undefined = not fetched). */
  web: Partial<Record<"hexmayhem" | "opgg", WebEntry>>;
  /** Your own games on this champion in this mode. */
  personal?: ChampionStats;
  /** Public web stats on (Settings → Use web stats). */
  webEnabled: boolean;
}

export interface SourceResolution {
  /** What the user picked (stored setting, sanitized to the mode). */
  selected: DataSourceId;
  /** What actually drives the recommendation. */
  active: DataProvider;
  stats?: ChampionStats;
  statsSource: "global" | "personal" | "none";
  /** Set when `selected` couldn't be used and Auto took over. */
  fallback?: { reason: "loading" | "error" | "nodata" | "disabled" };
}

const has = (s: WebEntry): s is ChampionStats => !!s && typeof s === "object" && s.games > 0;

/** Today's priority order: Riot dataset → web (mode default) → your games (≥3) → baseline. */
export function resolveAuto(mode: GameModeKind, c: SourceCandidates): Omit<SourceResolution, "selected"> {
  if (c.riot && c.riot.games > 0) return { active: "riot", stats: c.riot, statsSource: "global" };
  const w = c.webEnabled ? c.web[defaultWebSource(mode)] : undefined;
  if (has(w)) return { active: w.source === "opgg" ? "opgg" : "hexmayhem", stats: w, statsSource: "global" };
  if (c.personal && c.personal.games >= PERSONAL_MIN_GAMES) return { active: "personal", stats: c.personal, statsSource: "personal" };
  return { active: "none", statsSource: "none" };
}

/** Sanitize a stored choice: unknown / not offered for the mode → "auto". */
export function selectedSource(mode: GameModeKind, stored: unknown, hasDataset: boolean): DataSourceId {
  return typeof stored === "string" && (sourcesForMode(mode, hasDataset) as string[]).includes(stored) ? (stored as DataSourceId) : "auto";
}

export function resolveSource(mode: GameModeKind, selected: DataSourceId, c: SourceCandidates): SourceResolution {
  const auto = (reason?: NonNullable<SourceResolution["fallback"]>["reason"]): SourceResolution => ({ selected, ...resolveAuto(mode, c), ...(reason ? { fallback: { reason } } : {}) });
  switch (selected) {
    case "auto":
      return auto();
    case "baseline":
      return { selected, active: "none", statsSource: "none" };
    case "riot":
      return c.riot && c.riot.games > 0 ? { selected, active: "riot", stats: c.riot, statsSource: "global" } : auto("nodata");
    case "personal":
      return c.personal && c.personal.games >= PERSONAL_MIN_GAMES ? { selected, active: "personal", stats: c.personal, statsSource: "personal" } : auto("nodata");
    case "hexmayhem":
    case "opgg": {
      if (!c.webEnabled) return auto("disabled");
      const w = c.web[selected];
      if (has(w)) return { selected, active: selected, stats: w, statsSource: "global" };
      return auto(w === "loading" || w === undefined ? "loading" : w === "error" ? "error" : "nodata");
    }
  }
}

/** Short notice for a fallback ("OP.GG has no data for Ahri — using Auto"). */
export function fallbackNotice(r: SourceResolution, championName: string): string | undefined {
  if (!r.fallback) return undefined;
  const name = DATA_SOURCE_LABEL[r.selected];
  switch (r.fallback.reason) {
    case "loading":
      return `Loading ${name}… using Auto meanwhile`;
    case "error":
      return `${name} couldn't be loaded — using Auto`;
    case "disabled":
      return `Web stats are off (Settings) — using Auto`;
    default:
      return `${name} has no data for ${championName} — using Auto`;
  }
}

/**
 * A web source that answered with stats but no builds is a sign its page format changed (as when
 * OP.GG wrote "games" instead of "Games"): say so instead of silently showing template items.
 */
export function missingBuildsWarning(r: Pick<SourceResolution, "active" | "stats">): string | undefined {
  if ((r.active !== "opgg" && r.active !== "hexmayhem") || !r.stats || r.stats.games <= 0) return undefined;
  const hasBuilds = !!r.stats.builds?.length || !!r.stats.bestBuild?.length;
  if (hasBuilds) return undefined;
  const name = r.active === "opgg" ? "OP.GG" : "HexMayhem";
  return `${name} sent no builds for this champion (the site may have changed) — items are the baseline`;
}
