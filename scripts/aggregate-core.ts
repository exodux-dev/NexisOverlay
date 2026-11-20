// Pure aggregation of Riot match-v5 data into a StatsDataset.
// No network or filesystem access here: scripts/aggregate-stats.ts does the
// crawling and feeds raw match / timeline JSON into aggregateMatches().

import type { ChampionStats, StatsDataset, WinStat } from "../src/engine/types";

// ------------------------------------------------------------ Riot shapes
// Only the fields we read are typed; everything else is ignored.

export interface RiotPerkStyle {
  description?: string; // "primaryStyle" | "subStyle"
  style: number;
  selections: Array<{ perk: number }>;
}

export interface RiotParticipant {
  puuid: string;
  participantId?: number;
  championName: string; // already the Data Dragon id ("MonkeyKing")
  win: boolean;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6?: number; // trinket, ignored
  summoner1Id: number;
  summoner2Id: number;
  perks?: { styles?: RiotPerkStyle[] };
  playerAugment1?: number;
  playerAugment2?: number;
  playerAugment3?: number;
  playerAugment4?: number;
  playerAugment5?: number;
  playerAugment6?: number;
}

export interface RiotMatch {
  metadata: { matchId: string; participants: string[] };
  info: {
    queueId: number;
    gameVersion: string;
    gameCreation?: number;
    participants: RiotParticipant[];
  };
}

export interface RiotTimelineEvent {
  type: string;
  timestamp: number; // ms since game start
  participantId?: number;
  itemId?: number;
  beforeId?: number; // ITEM_UNDO
  skillSlot?: number; // SKILL_LEVEL_UP: 1=Q 2=W 3=E 4=R
  levelUpType?: string; // SKILL_LEVEL_UP: "NORMAL" | "EVOLVE"
  afterId?: number; // ITEM_UNDO
}

export interface RiotTimeline {
  metadata?: { matchId: string; participants?: string[] };
  info: {
    participants?: Array<{ participantId: number; puuid: string }>;
    frames: Array<{ events: RiotTimelineEvent[] }>;
  };
}

// ------------------------------------------------------------ options

export const DEFAULT_BOOTS_IDS: readonly number[] = [3006, 3009, 3020, 3047, 3111, 3117, 3158];

export interface AggregateOptions {
  queueId: number;
  /** Item ids treated as boots (stored in `boots`, excluded from `items`/`builds`). */
  bootsIds?: Iterable<number>;
  /** Returns false for components/consumables; defaults to "everything is completed". */
  isCompletedItem?: (id: number) => boolean;
  /** ISO timestamp; defaults to now. Injectable for deterministic tests. */
  generatedAt?: string;
  /** Purchases strictly before this game time count as starters. Default 60 000 ms. */
  starterWindowMs?: number;
  topBuilds?: number; // default 10
  topStarters?: number; // default 5
  topRunes?: number; // default 5
  topSpells?: number; // default 5
  topSkillOrders?: number; // default 3
}

// ------------------------------------------------------------ helpers

const ITEM_SLOTS = ["item0", "item1", "item2", "item3", "item4", "item5"] as const;
const AUGMENT_SLOTS = [
  "playerAugment1",
  "playerAugment2",
  "playerAugment3",
  "playerAugment4",
  "playerAugment5",
  "playerAugment6",
] as const;

function bump(rec: Record<string, WinStat>, key: string, win: boolean): void {
  const s = (rec[key] ??= { games: 0, wins: 0 });
  s.games++;
  if (win) s.wins++;
}

/** Counter for list-shaped stats (builds, runes, ...) keyed by a string. */
class ListCounter<T extends object> {
  private map = new Map<string, WinStat & T>();
  add(key: string, make: () => T, win: boolean): void {
    let s = this.map.get(key);
    if (!s) {
      s = { games: 0, wins: 0, ...make() };
      this.map.set(key, s);
    }
    s.games++;
    if (win) s.wins++;
  }
  top(n: number): Array<WinStat & T> {
    // Stable tie-break by key so output is deterministic.
    return [...this.map.entries()]
      .sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins || (a[0] < b[0] ? -1 : 1))
      .slice(0, n)
      .map(([, v]) => v);
  }
}

interface ChampAcc {
  games: number;
  wins: number;
  items: Record<string, WinStat>;
  boots: Record<string, WinStat>;
  augments: Record<string, WinStat>;
  builds: ListCounter<{ items: number[] }>;
  starters: ListCounter<{ items: number[] }>;
  skillOrders: ListCounter<{ order: string }>;
  runes: ListCounter<{ primary: number; sub: number; perks: number[] }>;
  spells: ListCounter<{ ids: [number, number] }>;
}

function newAcc(): ChampAcc {
  return {
    games: 0,
    wins: 0,
    items: {},
    boots: {},
    augments: {},
    builds: new ListCounter(),
    starters: new ListCounter(),
    skillOrders: new ListCounter(),
    runes: new ListCounter(),
    spells: new ListCounter(),
  };
}

/** "15.20.715.1234" -> "15.20" */
export function patchOf(gameVersion: string): string {
  return gameVersion.split(".").slice(0, 2).join(".");
}

export function augmentName(id: number, names: Map<number, string> | Record<string, string>): string {
  const n = names instanceof Map ? names.get(id) : names[String(id)];
  return n ?? `#${id}`;
}

export interface Purchase {
  itemId: number;
  ts: number;
  /** Set when a later ITEM_SOLD removed this copy from the inventory. */
  sold?: boolean;
}

/**
 * Purchase history per participantId from a timeline. ITEM_UNDO removes the
 * most recent purchase of `beforeId`; ITEM_SOLD marks the most recent unsold
 * purchase of that item as sold (best effort: component merges into a
 * completed item are not modelled).
 */
export function purchasesByParticipant(timeline: RiotTimeline): Map<number, Purchase[]> {
  const out = new Map<number, Purchase[]>();
  const events = timeline.info.frames.flatMap((f) => f.events ?? []);
  events.sort((a, b) => a.timestamp - b.timestamp);
  const lastIndex = (list: Purchase[], itemId: number, unsoldOnly: boolean) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].itemId === itemId && !(unsoldOnly && list[i].sold)) return i;
    }
    return -1;
  };
  for (const e of events) {
    if (e.participantId == null) continue;
    let list = out.get(e.participantId);
    if (!list) out.set(e.participantId, (list = []));
    if (e.type === "ITEM_PURCHASED" && e.itemId) {
      list.push({ itemId: e.itemId, ts: e.timestamp });
    } else if (e.type === "ITEM_UNDO") {
      // Undoing a purchase: beforeId = item, afterId = 0.
      if (e.beforeId) {
        const i = lastIndex(list, e.beforeId, false);
        if (i >= 0) list.splice(i, 1);
      }
    } else if (e.type === "ITEM_SOLD" && e.itemId) {
      const i = lastIndex(list, e.itemId, true);
      if (i >= 0) list[i].sold = true;
    }
  }
  return out;
}

const SKILL_KEYS: Record<number, string> = { 1: "Q", 2: "W", 3: "E" };

/**
 * Max order of the basic abilities per participantId, e.g. "QEW", from
 * NORMAL SKILL_LEVEL_UP events (R and EVOLVE level-ups ignored). Abilities are
 * ranked by points (desc), then by the time they reached their final point
 * count (asc) - so maxed abilities sort by when they hit 5 points, and games
 * that ended early fall back to points then first time at that count.
 */
export function skillOrdersByParticipant(timeline: RiotTimeline): Map<number, string> {
  const state = new Map<number, Map<string, { points: number; ts: number }>>();
  const events = timeline.info.frames.flatMap((f) => f.events ?? []);
  events.sort((a, b) => a.timestamp - b.timestamp);
  for (const e of events) {
    if (e.type !== "SKILL_LEVEL_UP" || e.participantId == null) continue;
    if (e.levelUpType && e.levelUpType !== "NORMAL") continue;
    const key = SKILL_KEYS[e.skillSlot ?? 0];
    if (!key) continue;
    let skills = state.get(e.participantId);
    if (!skills) state.set(e.participantId, (skills = new Map()));
    const s = skills.get(key) ?? { points: 0, ts: Infinity };
    skills.set(key, { points: s.points + 1, ts: e.timestamp });
  }
  const out = new Map<number, string>();
  for (const [pid, skills] of state) {
    const order = ["Q", "W", "E"]
      .map((k) => ({ k, ...(skills.get(k) ?? { points: 0, ts: Infinity }) }))
      .sort((a, b) => b.points - a.points || a.ts - b.ts || (a.k < b.k ? -1 : 1))
      .map((x) => x.k)
      .join("");
    out.set(pid, order);
  }
  return out;
}

// ------------------------------------------------------------ main entry

/**
 * Aggregate raw match-v5 matches into a StatsDataset.
 *
 * - Matches whose `info.queueId` differs from `opts.queueId` are skipped.
 * - `totalGames` is the number of accepted matches; `pickRate` = champion
 *   games / totalGames (fraction of matches the champion appeared in).
 * - `builds`: with a timeline, the first three distinct non-boot completed
 *   items in purchase order that are still in the final inventory. Without a
 *   timeline this is approximated by the first three non-boot completed items
 *   in final inventory slot order (item0..item5). Only full 3-item paths count.
 * - `starters`: items bought before `starterWindowMs`; timelines only.
 * - `skillOrders`: Q/W/E max order (see skillOrdersByParticipant); timelines only.
 */
export function aggregateMatches(
  matches: Iterable<RiotMatch>,
  timelinesById: Map<string, RiotTimeline> | Record<string, RiotTimeline>,
  augmentNames: Map<number, string> | Record<string, string>,
  opts: AggregateOptions,
): StatsDataset {
  const boots = new Set<number>(opts.bootsIds ?? DEFAULT_BOOTS_IDS);
  const isCompleted = opts.isCompletedItem ?? (() => true);
  const starterWindow = opts.starterWindowMs ?? 60_000;
  const getTimeline = (id: string): RiotTimeline | undefined =>
    timelinesById instanceof Map ? timelinesById.get(id) : timelinesById[id];

  const accs = new Map<string, ChampAcc>();
  const patchVotes = new Map<string, number>();
  const seen = new Set<string>();
  let totalGames = 0;

  for (const m of matches) {
    if (!m?.info || m.info.queueId !== opts.queueId) continue;
    if (seen.has(m.metadata.matchId)) continue;
    seen.add(m.metadata.matchId);
    totalGames++;
    const patch = patchOf(m.info.gameVersion ?? "");
    patchVotes.set(patch, (patchVotes.get(patch) ?? 0) + 1);

    const timeline = getTimeline(m.metadata.matchId);
    const purchases = timeline ? purchasesByParticipant(timeline) : undefined;
    const skillOrders = timeline ? skillOrdersByParticipant(timeline) : undefined;
    // Map puuid -> timeline participantId (falls back to match participantId / index).
    const tlIdByPuuid = new Map<string, number>();
    for (const tp of timeline?.info.participants ?? []) tlIdByPuuid.set(tp.puuid, tp.participantId);

    m.info.participants.forEach((p, idx) => {
      const champ = p.championName;
      if (!champ) return;
      const win = !!p.win;
      let acc = accs.get(champ);
      if (!acc) accs.set(champ, (acc = newAcc()));
      acc.games++;
      if (win) acc.wins++;

      // ---- final inventory
      const finalItems = ITEM_SLOTS.map((k) => p[k] ?? 0).filter((id) => id > 0);
      const finalSet = new Set(finalItems);
      const coreFinal: number[] = []; // non-boot completed, slot order, distinct
      for (const id of finalSet) {
        if (boots.has(id)) bump(acc.boots, String(id), win);
        else if (isCompleted(id)) {
          bump(acc.items, String(id), win);
          coreFinal.push(id);
        }
      }

      // ---- builds / starters
      const pid = tlIdByPuuid.get(p.puuid) ?? p.participantId ?? idx + 1;
      const hist = purchases?.get(pid);
      let path: number[];
      if (hist) {
        const ordered: number[] = [];
        for (const { itemId, sold } of hist) {
          if (sold) continue;
          if (coreFinal.includes(itemId) && !ordered.includes(itemId)) ordered.push(itemId);
        }
        // Items in the final inventory never seen as purchases (e.g. granted
        // or upgraded items) are appended in slot order.
        for (const id of coreFinal) if (!ordered.includes(id)) ordered.push(id);
        path = ordered.slice(0, 3);

        const starter = hist.filter((h) => h.ts < starterWindow).map((h) => h.itemId);
        if (starter.length) {
          starter.sort((a, b) => a - b);
          acc.starters.add(starter.join(","), () => ({ items: starter }), win);
        }
      } else {
        path = coreFinal.slice(0, 3);
      }
      const skillOrder = skillOrders?.get(pid);
      if (skillOrder) acc.skillOrders.add(skillOrder, () => ({ order: skillOrder }), win);

      if (path.length === 3) acc.builds.add(path.join(","), () => ({ items: path }), win);

      // ---- augments (dedupe per player)
      const augIds = new Set(AUGMENT_SLOTS.map((k) => p[k] ?? 0).filter((id) => id > 0));
      for (const id of augIds) bump(acc.augments, augmentName(id, augmentNames), win);

      // ---- runes
      const styles = p.perks?.styles ?? [];
      const prim = styles.find((s) => s.description === "primaryStyle") ?? styles[0];
      const sub = styles.find((s) => s.description === "subStyle") ?? styles[1];
      if (prim && sub) {
        const perks = [...prim.selections, ...sub.selections].map((s) => s.perk);
        const page = { primary: prim.style, sub: sub.style, perks };
        acc.runes.add(`${page.primary}/${page.sub}/${perks.join(",")}`, () => page, win);
      }

      // ---- summoner spells (sorted pair)
      if (p.summoner1Id && p.summoner2Id) {
        const ids = [p.summoner1Id, p.summoner2Id].sort((a, b) => a - b) as [number, number];
        acc.spells.add(ids.join(","), () => ({ ids }), win);
      }
    });
  }

  const champions: Record<string, ChampionStats> = {};
  for (const champ of [...accs.keys()].sort()) {
    const a = accs.get(champ)!;
    const stats: ChampionStats = {
      games: a.games,
      wins: a.wins,
      pickRate: totalGames ? a.games / totalGames : 0,
      items: a.items,
      builds: a.builds.top(opts.topBuilds ?? 10),
      boots: a.boots,
      augments: a.augments,
      runes: a.runes.top(opts.topRunes ?? 5),
      spells: a.spells.top(opts.topSpells ?? 5),
    };
    const starters = a.starters.top(opts.topStarters ?? 5);
    if (starters.length) stats.starters = starters;
    const skillOrders = a.skillOrders.top(opts.topSkillOrders ?? 3);
    if (skillOrders.length) stats.skillOrders = skillOrders;
    champions[champ] = stats;
  }

  let patch = "";
  let best = -1;
  for (const [p, n] of patchVotes) {
    if (n > best || (n === best && p.localeCompare(patch, undefined, { numeric: true }) > 0)) {
      patch = p;
      best = n;
    }
  }

  return {
    patch,
    queueId: opts.queueId,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    totalGames,
    champions,
  };
}
