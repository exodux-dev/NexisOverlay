// Arena wording. OP.GG's Arena "win rate" is the share of top-4 finishes (2v2v2v2: 8 teams, 4
// places), so the UI says "Top 4" there instead of "win" / "WR", and shows the average place and
// 1st-place rate next to it where a champion's numbers are summarised.

import type { ChampionStats } from "../engine/types";
import "./arena-text.css";

/** Short label for a rate column / suffix: "Top 4" in Arena, else `fallback` ("Win", "WR", …). */
export function rateLabel(mode: string | undefined, fallback = "Win"): string {
  return mode === "arena" ? "Top 4" : fallback;
}

/** Long label: "Top-4 rate" in Arena, else "Win rate" (or `fallback`). */
export function rateName(mode: string | undefined, fallback = "Win rate"): string {
  return mode === "arena" ? "Top-4 rate" : fallback;
}

/** Arena summary numbers for a champion, when the stats carry them. */
export function arenaSummary(stats: ChampionStats | undefined): { top4?: number; avgPlace?: number; firstRate?: number; games?: number } | undefined {
  if (!stats || stats.mode !== "arena") return undefined;
  const top4 = stats.games > 0 ? stats.wins / stats.games : undefined;
  if (top4 === undefined && stats.avgPlace === undefined && stats.firstRate === undefined) return undefined;
  return { top4, avgPlace: stats.avgPlace, firstRate: stats.firstRate, games: stats.games || undefined };
}

/** "Avg place 3.4 · 1st 19.2% · Top 4 52.9%" chips for an Arena champion header (null outside Arena). */
export function ArenaPlacement({ stats, className = "", showTop4 = true }: { stats?: ChampionStats; className?: string; showTop4?: boolean }) {
  const s = arenaSummary(stats);
  if (!s) return null;
  const parts: Array<[string, string, string]> = [];
  if (s.avgPlace !== undefined) parts.push(["Avg place", s.avgPlace.toFixed(2), "Average final placement (1 = first of 8 teams)"]);
  if (s.firstRate !== undefined) parts.push(["1st", `${(s.firstRate * 100).toFixed(1)}%`, "Share of games finished in 1st place"]);
  if (showTop4 && s.top4 !== undefined) parts.push(["Top 4", `${(s.top4 * 100).toFixed(1)}%`, "Share of games finished in the top 4 (OP.GG's Arena “win rate”)"]);
  if (!parts.length) return null;
  return (
    <span className={`arena-place ${className}`}>
      {parts.map(([k, v, title], i) => (
        <span key={k} title={title}>
          {i > 0 && <span className="dim"> · </span>}
          <span className="dim">{k} </span>
          <b className="tnum">{v}</b>
        </span>
      ))}
    </span>
  );
}
