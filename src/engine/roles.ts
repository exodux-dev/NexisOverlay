// Summoner's Rift role overrides: players swap lanes (Vladimir listed top but goes mid). Overrides
// sit on top of the roles the Live Client API reports, are stored per game and are ignored once a
// different game starts. Pure functions only; the store persists them (settings.roleOverrides).
import type { GameSnapshot, PlayerState } from "./types";
import { LANES, type Lane } from "./power";

export interface RoleOverrides {
  /** Game the overrides belong to (see `roleGameKey`). */
  game: string;
  /** playerKey → lane. */
  roles: Record<string, Lane>;
}

export const NO_OVERRIDES: Record<string, Lane> = {};

/** Stable per-player key inside one game (champions are unique per team on the Rift). */
export function playerKey(p: Pick<PlayerState, "team" | "championName">): string {
  return `${p.team}:${p.championName}`;
}

/** Identifies one game: mode + both rosters (order-independent). */
export function roleGameKey(snap: Pick<GameSnapshot, "gameMode" | "me" | "allies" | "enemies">): string {
  const team = (ps: PlayerState[]) => ps.map((p) => p.championName).sort().join(",");
  return `${snap.gameMode}|${team([snap.me, ...snap.allies])}|${team(snap.enemies)}`;
}

export const isLane = (p?: string): p is Lane => !!p && (LANES as string[]).includes(p.toUpperCase());

/** Overrides that apply to this game ({} when stored for another game or malformed). */
export function activeRoles(stored: unknown, gameKey: string | undefined): Record<string, Lane> {
  const o = stored as Partial<RoleOverrides> | null | undefined;
  if (!gameKey || !o || typeof o !== "object" || o.game !== gameKey || !o.roles || typeof o.roles !== "object") return NO_OVERRIDES;
  const out: Record<string, Lane> = {};
  for (const [k, v] of Object.entries(o.roles)) if (typeof v === "string" && isLane(v)) out[k] = v.toUpperCase() as Lane;
  return Object.keys(out).length ? out : NO_OVERRIDES;
}

/** A player's role after overrides. */
export function effectiveLane(p: PlayerState, roles: Record<string, Lane>): Lane | undefined {
  const o = roles[playerKey(p)];
  if (o) return o;
  return isLane(p.position) ? (p.position.toUpperCase() as Lane) : undefined;
}

/**
 * Move `player` to `lane`. A teammate already in that lane takes the player's old lane, so a
 * swap is one action. Returns the new roles map (only entries that differ from the API remain).
 */
export function assignRole(snap: Pick<GameSnapshot, "me" | "allies" | "enemies">, roles: Record<string, Lane>, player: PlayerState, lane: Lane): Record<string, Lane> {
  const team = player.team === snap.me.team ? [snap.me, ...snap.allies] : snap.enemies;
  const key = playerKey(player);
  const eff = new Map(team.map((p) => [playerKey(p), effectiveLane(p, roles)]));
  const from = eff.get(key);
  for (const [k, l] of eff) if (k !== key && l === lane) eff.set(k, from);
  eff.set(key, lane);
  const next: Record<string, Lane> = { ...roles };
  for (const p of team) {
    const k = playerKey(p);
    const l = eff.get(k);
    const api = isLane(p.position) ? p.position.toUpperCase() : undefined;
    if (l && l !== api) next[k] = l;
    else delete next[k];
  }
  return next;
}

// Identity-preserving application: live polls reuse unchanged player objects (liveStable), so
// cache the overridden copies to keep memoized views from recomputing on every poll.
const playerCache = new WeakMap<PlayerState, Map<Lane, PlayerState>>();
const listCache = new WeakMap<PlayerState[], { sig: string; out: PlayerState[] }>();
const snapCache = new WeakMap<GameSnapshot, { sig: string; out: GameSnapshot }>();

function withLane(p: PlayerState, roles: Record<string, Lane>): PlayerState {
  const lane = roles[playerKey(p)];
  if (!lane || p.position === lane) return p;
  let m = playerCache.get(p);
  if (!m) playerCache.set(p, (m = new Map()));
  let out = m.get(lane);
  if (!out) m.set(lane, (out = { ...p, position: lane }));
  return out;
}

function withLanes(list: PlayerState[], roles: Record<string, Lane>, sig: string): PlayerState[] {
  const hit = listCache.get(list);
  if (hit && hit.sig === sig) return hit.out;
  const mapped = list.map((p) => withLane(p, roles));
  const out = mapped.every((p, i) => p === list[i]) ? list : mapped;
  listCache.set(list, { sig, out });
  return out;
}

/** The snapshot with overridden positions (same object when nothing changes). */
export function applyRoles<T extends GameSnapshot | null>(snap: T, roles: Record<string, Lane>): T {
  if (!snap || roles === NO_OVERRIDES || !Object.keys(roles).length) return snap;
  const s = snap as GameSnapshot;
  const sig = JSON.stringify(Object.entries(roles).sort());
  const hit = snapCache.get(s);
  if (hit && hit.sig === sig) return hit.out as T;
  const me = withLane(s.me, roles);
  const allies = withLanes(s.allies, roles, sig);
  const enemies = withLanes(s.enemies, roles, sig);
  const out = me === s.me && allies === s.allies && enemies === s.enemies ? s : { ...s, me, allies, enemies };
  snapCache.set(s, { sig, out });
  return out as T;
}
