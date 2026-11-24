// Parses Riot's Live Client Data API (`/liveclientdata/allgamedata`) into a GameSnapshot.

import type { GameSnapshot, PlayerState, StaticData } from "./types";
import { findChampion } from "./staticData";

interface LivePlayerRaw {
  championName: string;
  /** Locale-independent, e.g. "game_character_displayname_Ahri". */
  rawChampionName?: string;
  riotId?: string;
  riotIdGameName?: string;
  summonerName?: string;
  team: "ORDER" | "CHAOS";
  position?: string;
  level: number;
  items: Array<{ itemID: number; displayName: string }>;
  scores: { kills: number; deaths: number; assists: number; creepScore?: number };
  isDead?: boolean;
  /** Seconds until respawn (Live Client API), while dead. */
  respawnTimer?: number;
}

export const APHELIOS_WEAPONS = ["Calibrum", "Severum", "Gravitum", "Infernum", "Crescendum"] as const;
export type ApheliosWeapon = (typeof APHELIOS_WEAPONS)[number];

/** Aphelios' Q changes with the main-hand weapon; the Live Client API reports that Q (id / name). */
export function apheliosMain(q: { id?: string; displayName?: string; rawDisplayName?: string } | undefined): ApheliosWeapon | undefined {
  if (!q) return undefined;
  const text = `${q.id ?? ""} ${q.rawDisplayName ?? ""} ${q.displayName ?? ""}`.toLowerCase();
  if (!text.includes("aphelios") && !APHELIOS_WEAPONS.some((w) => text.includes(w.toLowerCase()))) return undefined;
  return APHELIOS_WEAPONS.find((w) => text.includes(w.toLowerCase()));
}

export interface AllGameDataRaw {
  activePlayer?: {
    riotId?: string;
    riotIdGameName?: string;
    summonerName?: string;
    currentGold?: number;
    level?: number;
    championStats?: Record<string, unknown>;
    /** Your ability ranks, e.g. { Q: { abilityLevel: 3 } } (Passive has none). */
    abilities?: Record<string, { abilityLevel?: number; id?: string; displayName?: string; rawDisplayName?: string } | undefined>;
  };
  allPlayers?: LivePlayerRaw[];
  gameData?: { gameMode?: string; gameTime?: number };
  events?: { Events?: Array<{ EventName: string; Result?: string; EventTime?: number }> };
}

function championFromRaw(data: StaticData, raw?: string) {
  const id = raw?.replace(/^game_character_displayname_/, "");
  return id && id !== raw ? data.championsById.get(id) ?? findChampion(data, id) : undefined;
}

function idOf(p: { riotId?: string; riotIdGameName?: string; summonerName?: string }): string {
  return (p.riotId || p.riotIdGameName || p.summonerName || "").toLowerCase();
}

/** Mode copies of regular items (Arena: id + 220000) → the regular id, so ownership and invested gold match. */
function regularItemId(id: number, data: StaticData | null): number {
  if (data && id >= 220000 && id < 230000 && !data.items.has(id) && data.items.has(id - 220000)) return id - 220000;
  return id;
}

/**
 * @param meHint champion id/name you were on in champ select — identifies you during the loading
 *               screen, when the API may not have an active player yet.
 */
export function parseLiveGame(raw: AllGameDataRaw, data: StaticData | null, meHint?: string): GameSnapshot | null {
  const players = raw.allPlayers ?? [];
  if (!players.length) return null;
  const active = raw.activePlayer ?? {};
  const meId = idOf(active);
  const meName = (active.riotIdGameName || "").toLowerCase();
  let myRespawn: number | undefined;
  const mapped: PlayerState[] = players.map((p) => {
    const pid = idOf(p);
    const isMe = (!!meId && pid === meId) || (!!meName && (p.riotIdGameName || "").toLowerCase() === meName);
    if (isMe && p.isDead) myRespawn = typeof p.respawnTimer === "number" ? p.respawnTimer : 0;
    return {
      championName: p.championName,
      // championName is localized (e.g. "아리" on a Korean client) — prefer the raw id.
      champion: data ? (championFromRaw(data, p.rawChampionName) ?? findChampion(data, p.championName)) : undefined,
      riotId: p.riotId || p.summonerName || p.championName,
      team: p.team,
      level: p.level,
      items: (p.items ?? []).map((i) => ({ id: regularItemId(i.itemID, data), name: i.displayName })),
      kills: p.scores?.kills ?? 0,
      deaths: p.scores?.deaths ?? 0,
      assists: p.scores?.assists ?? 0,
      isMe,
      position: p.position || undefined,
      ...(typeof p.scores?.creepScore === "number" ? { creepScore: p.scores.creepScore } : {}),
      ...(isMe && p.isDead ? { dead: true } : {}),
    };
  });
  const hint = meHint && data ? (findChampion(data, meHint)?.name ?? meHint) : meHint;
  const me =
    mapped.find((p) => p.isMe) ??
    (hint ? mapped.find((p) => p.championName.toLowerCase() === hint.toLowerCase()) : undefined) ??
    mapped[0];
  mapped.forEach((p) => (p.isMe = p === me));
  const end = raw.events?.Events?.find((e) => e.EventName === "GameEnd");
  const tower = raw.events?.Events?.find((e) => e.EventName === "TurretKilled" && typeof e.EventTime === "number");
  const ab = active.abilities;
  const rank = (k: string) => {
    const v = ab?.[k]?.abilityLevel;
    return typeof v === "number" && v >= 0 ? v : undefined;
  };
  const ranks = { Q: rank("Q"), W: rank("W"), E: rank("E"), R: rank("R") };
  return {
    source: "live",
    gameMode: raw.gameData?.gameMode ?? "UNKNOWN",
    gameTime: raw.gameData?.gameTime ?? 0,
    gold: active.currentGold ?? 0,
    me,
    allies: mapped.filter((p) => p !== me && p.team === me.team),
    enemies: mapped.filter((p) => p.team !== me.team),
    ended: end?.Result === "Win" || end?.Result === "Lose" ? { result: end.Result } : undefined,
    loading: !active.championStats || (raw.gameData?.gameTime ?? 0) <= 1,
    ...(tower ? { firstTowerAt: tower.EventTime } : {}),
    ...(me.dead && myRespawn !== undefined ? { respawnIn: Math.max(0, Math.ceil(myRespawn)) } : {}),
    ...(Object.values(ranks).every((v) => v !== undefined) ? { skills: ranks as Record<"Q" | "W" | "E" | "R", number> } : {}),
    ...(apheliosMain(ab?.Q) ? { apheliosMain: apheliosMain(ab?.Q) } : {}),
  };
}
