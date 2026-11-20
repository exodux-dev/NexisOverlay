// Game-mode attribution for data that doesn't come from the live game: match-history records
// and the Riot API stats dataset. Keeps one mode's numbers (e.g. Mayhem items/augments) from
// feeding another mode's recommendations.
import type { MatchRecord, StatsDataset } from "./types";

/** Game modes Nexis supports. Augments exist in ARAM: Mayhem and Arena. */
export type GameModeKind = "mayhem" | "aram" | "sr" | "arena";

/** Map Riot's gameMode string (Live Client / League client) to a mode we support. */
export function modeFromGameMode(gm?: string | null): GameModeKind | undefined {
  switch ((gm ?? "").toUpperCase()) {
    case "KIWI":
      return "mayhem";
    case "ARAM":
      return "aram";
    case "CHERRY": // Arena (2v2v2v2)
      return "arena";
    case "CLASSIC":
      return "sr";
    default:
      return undefined;
  }
}

/**
 * Mode a recorded match belongs to. Records carry Riot's `gameMode` (recordMatch); imported or
 * older records may have it empty/"UNKNOWN". Those count as Mayhem only when they have augments
 * (Nexis started out Mayhem-only, and Arena records always carry "CHERRY"); without augments their
 * mode can't be told, so they're left out of every mode's stats.
 */
export function matchMode(m: Pick<MatchRecord, "gameMode" | "augments">): GameModeKind | undefined {
  return modeFromGameMode(m.gameMode) ?? (m.augments.length ? "mayhem" : undefined);
}

/** History entries that belong to `mode` (see `matchMode`). */
export function historyForMode(history: MatchRecord[], mode: GameModeKind): MatchRecord[] {
  return history.filter((m) => matchMode(m) === mode);
}

/** Riot queue id → mode (Match-V5 `queueId`). */
export function modeFromQueue(queueId?: number): GameModeKind | undefined {
  switch (queueId) {
    case 2400:
      return "mayhem";
    case 450:
    case 100: // ARAM (Butcher's Bridge)
      return "aram";
    case 1700:
    case 1710:
      return "arena";
    case 400:
    case 420:
    case 430:
    case 440:
    case 490:
      return "sr";
    default:
      return undefined;
  }
}

/**
 * Mode a stats dataset (scripts/aggregate-stats.ts) is for, from its `queueId`. The aggregator
 * defaults to queue 2400 (ARAM Mayhem); a dataset without a recognisable queue is treated as
 * Mayhem, which is what it was built for.
 */
export function datasetMode(ds: Pick<StatsDataset, "queueId">): GameModeKind {
  return modeFromQueue(ds.queueId) ?? "mayhem";
}
