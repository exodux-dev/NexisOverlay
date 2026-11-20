// Game intel: what changed on the scoreboard between two live snapshots, item-value gold
// estimates per team, enemy power spikes and "your build adapted" notes.
//
// Everything here is derived from scoreboard information the game shows every player
// (items, levels, K/D/A) plus our own build advice — no timers, cooldowns or hidden state.

import { ENEMY_ITEM_SIGNALS } from "../data/itemKb";
import type { BuildPlan, ItemRec } from "./build";
import type { Counter } from "../data/itemKb";
import type { Champion, GameSnapshot, Item, PlayerState, StaticData } from "./types";

// ------------------------------------------------------------------ types

export type IntelKind = "enemy-item" | "ally-item" | "enemy-level" | "enemy-fed" | "fight" | "build";
export type IntelTone = "info" | "good" | "warn" | "bad";

export interface IntelEvent {
  /** Stable id: the same happening always yields the same id (used for dedupe). */
  id: string;
  /** Game time in seconds. */
  at: number;
  kind: IntelKind;
  title: string;
  detail?: string;
  tone: IntelTone;
  championId?: string;
  /** Display name of the champion (or "You"). */
  champion?: string;
  itemId?: number;
  /** Kill tally for `fight` events (merged across a short window by appendIntel). */
  kills?: { ally: number; enemy: number };
}

export interface PlayerValue {
  riotId: string;
  championName: string;
  champion?: Champion;
  side: "ally" | "enemy";
  isMe: boolean;
  /** Gold value of everything in the inventory (completed items and components). */
  value: number;
  legendaries: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface TeamGold {
  ally: number;
  enemy: number;
  /** ally − enemy */
  diff: number;
  /** Both teams, highest value first within each side (allies first). */
  perPlayer: PlayerValue[];
}

export type SpikeKind = "none" | "item" | "two-item" | "three-item" | "full";

export interface PowerSpike {
  riotId: string;
  championName: string;
  champion?: Champion;
  level: number;
  value: number;
  /** Completed non-boot items. */
  legendaries: number;
  items: Item[];
  /** Most recently completed item (from the intel log when known, else last slot). */
  newest?: Item;
  spike: SpikeKind;
  /** Owns a high-impact item (Rabadon's, Infinity Edge…). */
  big: Item[];
  label: string;
}

// ------------------------------------------------------------------ item helpers

/** High-impact items that mark a big jump in damage on their own. */
const BIG_ITEMS = new Set(["Rabadon's Deathcap", "Infinity Edge", "Heartsteel", "Nashor's Tooth", "Lord Dominik's Regards", "Void Staff", "Blade of The Ruined King"]);

function full(data: StaticData, id: number): Item | undefined {
  return data.items.get(id);
}

function isValued(it: Item | undefined): it is Item {
  return !!it && !it.tags.includes("Consumable") && !it.tags.includes("Trinket");
}

export function isLegendary(it: Item | undefined): boolean {
  return !!it && it.completed && !it.tags.includes("Boots");
}

export function isBigItem(it: Item | undefined): boolean {
  return !!it && isLegendary(it) && (BIG_ITEMS.has(it.name) || it.cost >= 3500);
}

export function inventoryValue(p: PlayerState, data: StaticData): number {
  let v = 0;
  for (const i of p.items) {
    const it = full(data, i.id);
    if (isValued(it)) v += it.cost;
  }
  return v;
}

function legendaryItems(p: PlayerState, data: StaticData): Item[] {
  return p.items.map((i) => full(data, i.id)).filter((it): it is Item => isLegendary(it));
}

function nameOf(p: PlayerState): string {
  return p.isMe ? "You" : (p.champion?.name ?? p.championName);
}

function ord(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

// ------------------------------------------------------------------ team gold

export function teamGold(snap: Pick<GameSnapshot, "me" | "allies" | "enemies">, data: StaticData): TeamGold {
  const row = (p: PlayerState, side: "ally" | "enemy"): PlayerValue => ({
    riotId: p.riotId,
    championName: p.champion?.name ?? p.championName,
    champion: p.champion,
    side,
    isMe: p.isMe,
    value: inventoryValue(p, data),
    legendaries: legendaryItems(p, data).length,
    level: p.level,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
  });
  const allies = [snap.me, ...snap.allies].map((p) => row(p, "ally")).sort((a, b) => b.value - a.value);
  const enemies = snap.enemies.map((p) => row(p, "enemy")).sort((a, b) => b.value - a.value);
  const ally = allies.reduce((s, p) => s + p.value, 0);
  const enemy = enemies.reduce((s, p) => s + p.value, 0);
  return { ally, enemy, diff: ally - enemy, perPlayer: [...allies, ...enemies] };
}

// ------------------------------------------------------------------ power spikes

const SPIKE_LABEL: Record<SpikeKind, string> = {
  none: "No items yet",
  item: "1 item",
  "two-item": "2-item spike",
  "three-item": "3-item spike",
  full: "Full build",
};

/**
 * Per-enemy item spikes. `recent` (the intel log, any order) lets "newest" reflect the real
 * purchase order; without it the last completed item in the inventory is used.
 */
export function powerSpikes(enemies: PlayerState[], data: StaticData, recent: IntelEvent[] = []): PowerSpike[] {
  return enemies.map((p) => {
    const items = legendaryItems(p, data);
    const n = items.length;
    const spike: SpikeKind = n >= 5 ? "full" : n >= 3 ? "three-item" : n === 2 ? "two-item" : n === 1 ? "item" : "none";
    const owned = new Set(items.map((i) => i.id));
    let newest: Item | undefined;
    let newestAt = -1;
    for (const e of recent) {
      if (e.kind === "enemy-item" && e.itemId && owned.has(e.itemId) && e.id.includes(`:${p.riotId}:`) && e.at > newestAt) {
        newestAt = e.at;
        newest = full(data, e.itemId);
      }
    }
    newest ??= items.at(-1);
    const big = items.filter(isBigItem);
    return {
      riotId: p.riotId,
      championName: p.champion?.name ?? p.championName,
      champion: p.champion,
      level: p.level,
      value: inventoryValue(p, data),
      legendaries: n,
      items,
      newest,
      spike,
      big,
      label: big.length && n < 3 ? `${SPIKE_LABEL[spike]} · big item` : SPIKE_LABEL[spike],
    };
  });
}

// ------------------------------------------------------------------ snapshot diff

const ULT_LEVELS: Record<number, string> = { 6: "Ultimate unlocked", 11: "Ultimate rank 2", 16: "Ultimate rank 3" };
const FED_AT = [5, 8, 12];

function key(p: PlayerState): string {
  return p.riotId || p.championName;
}

/** Item ids (with multiplicity) present in `next` but not in `prev`. */
function added(prev: PlayerState, next: PlayerState): number[] {
  const left = new Map<number, number>();
  for (const i of prev.items) left.set(i.id, (left.get(i.id) ?? 0) + 1);
  const out: number[] = [];
  for (const i of next.items) {
    const n = left.get(i.id) ?? 0;
    if (n > 0) left.set(i.id, n - 1);
    else out.push(i.id);
  }
  return out;
}

const sum = (ps: PlayerState[], f: (p: PlayerState) => number) => ps.reduce((s, p) => s + f(p), 0);

/**
 * Scoreboard events between two snapshots of the same game: completed items, enemy ultimate
 * level thresholds, fed enemies and kill swings. Returns [] when `next` looks like another game.
 */
export function diffSnapshots(prev: GameSnapshot, next: GameSnapshot, data: StaticData): IntelEvent[] {
  if (next.gameTime < prev.gameTime || next.loading) return [];
  const at = Math.round(next.gameTime);
  const out: IntelEvent[] = [];
  const before = new Map<string, PlayerState>();
  for (const p of [prev.me, ...prev.allies, ...prev.enemies]) before.set(key(p), p);
  const nextAllies = [next.me, ...next.allies];
  const levelUps: Record<number, PlayerState[]> = {};
  const enemyKeys = new Set(prev.enemies.map(key));
  // A different roster means a different game.
  if (next.enemies.some((e) => !enemyKeys.has(key(e)))) return [];

  for (const p of [...nextAllies, ...next.enemies]) {
    const was = before.get(key(p));
    if (!was) continue;
    const enemy = next.enemies.includes(p);
    const who = nameOf(p);
    const champId = p.champion?.id;
    const legNow = legendaryItems(p, data).length;
    const newOnes = added(was, p)
      .map((id) => full(data, id))
      .filter((it): it is Item => !!it && it.completed);
    for (const it of newOnes) {
      const boots = !isLegendary(it);
      if (!enemy && boots) continue; // ally boots are noise
      const big = isBigItem(it);
      const nth = legNow;
      let detail: string;
      let tone: IntelTone;
      if (boots) {
        detail = "Boots upgraded";
        tone = "info";
      } else if (enemy) {
        const spike = nth >= 3 ? `${ord(nth)} legendary — ${nth >= 5 ? "full build" : "3-item spike"}` : nth === 2 ? "2nd legendary — 2-item spike" : `${ord(nth)} legendary`;
        detail = big ? `${spike} · high-impact item` : spike;
        tone = big || nth >= 2 ? "bad" : "warn";
      } else {
        detail = `${ord(nth)} legendary${big ? " · high-impact item" : ""}`;
        tone = "good";
      }
      out.push({
        id: `${enemy ? "enemy-item" : "ally-item"}:${key(p)}:${it.id}:${at}`,
        at,
        kind: enemy ? "enemy-item" : "ally-item",
        title: `${who} completed ${it.name}`,
        detail,
        tone,
        championId: champId,
        champion: who,
        itemId: it.id,
      });
    }
    if (enemy) {
      for (const lvl of [6, 11, 16]) if (was.level < lvl && p.level >= lvl) (levelUps[lvl] ??= []).push(p);
      for (const k of FED_AT) {
        if (was.kills < k && p.kills >= k && p.kills >= 2 * p.deaths + 2) {
          out.push({
            id: `enemy-fed:${key(p)}:${k}`,
            at,
            kind: "enemy-fed",
            title: `${who} is ${p.kills}/${p.deaths}/${p.assists}`,
            detail: "Ahead on kills — expect more damage from them",
            tone: "bad",
            championId: champId,
            champion: who,
          });
        }
      }
    }
  }

  // Enemy ultimate thresholds (one event per threshold, grouped when several cross together).
  for (const lvl of [6, 11, 16]) {
    const ps = levelUps[lvl];
    if (!ps?.length) continue;
    const names = ps.map(nameOf);
    const who = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    out.push({
      id: `enemy-level:${ps.map(key).join(",")}:${lvl}`,
      at,
      kind: "enemy-level",
      title: `${who} reached level ${lvl}`,
      detail: ps.length > 1 ? `${ULT_LEVELS[lvl]} for ${ps.length} enemies` : ULT_LEVELS[lvl],
      tone: lvl === 6 ? "warn" : "info",
      championId: ps.length === 1 ? ps[0].champion?.id : undefined,
      champion: ps.length === 1 ? names[0] : undefined,
    });
  }

  // Kill swing: kills each team scored since the last snapshot.
  const allyKills = sum(nextAllies, (p) => p.kills) - sum([prev.me, ...prev.allies], (p) => p.kills);
  const enemyKills = sum(next.enemies, (p) => p.kills) - sum(prev.enemies, (p) => p.kills);
  if (allyKills > 0 || enemyKills > 0) out.push(fightEvent(at, Math.max(0, allyKills), Math.max(0, enemyKills)));
  return out;
}

function fightEvent(at: number, ally: number, enemy: number, id = `fight:${at}`): IntelEvent {
  const total = ally + enemy;
  const tone: IntelTone = ally > enemy ? "good" : enemy > ally ? "bad" : "info";
  const title =
    ally > enemy ? `Your team won a fight ${ally}–${enemy}` : enemy > ally ? `Enemy team won a fight ${enemy}–${ally}` : `Even trade ${ally}–${enemy}`;
  return { id, at, kind: "fight", title: total === 1 ? (ally ? "Your team took a kill" : "Enemy team took a kill") : title, detail: `${total} kill${total === 1 ? "" : "s"}`, tone, kills: { ally, enemy } };
}

/** Kills within this many seconds of the last one count as the same fight. */
export const FIGHT_WINDOW = 25;

/**
 * Appends events to the log: drops duplicate ids, merges kill swings within FIGHT_WINDOW into one
 * fight, keeps the newest `max` (log stays oldest → newest).
 */
export function appendIntel(log: IntelEvent[], add: IntelEvent[], max = 80): IntelEvent[] {
  if (!add.length) return log;
  const out = [...log];
  const ids = new Set(out.map((e) => e.id));
  for (const e of add) {
    if (ids.has(e.id)) continue;
    if (e.kind === "fight" && e.kills) {
      let i = out.length - 1;
      while (i >= 0 && out[i].kind !== "fight") i--;
      const last = out[i];
      if (last?.kills && e.at - last.at <= FIGHT_WINDOW) {
        out[i] = fightEvent(e.at, last.kills.ally + e.kills.ally, last.kills.enemy + e.kills.enemy, last.id);
        continue;
      }
    }
    ids.add(e.id);
    out.push(e);
  }
  return out.slice(-max);
}

/** Events worth showing: single-kill skirmishes are dropped (the scoreboard already shows them). */
export function visibleIntel(log: IntelEvent[], max = 30): IntelEvent[] {
  return log
    .filter((e) => e.kind !== "fight" || (e.kills && e.kills.ally + e.kills.enemy >= 2))
    .slice(-max)
    .reverse();
}

// ------------------------------------------------------------------ build changes

const URGENT = 0.55;

function urgencyLevel(u: number | undefined): 0 | 1 | 2 | 3 {
  const v = u ?? 0;
  return v >= 0.8 ? 3 : v >= URGENT ? 2 : v >= 0.3 ? 1 : 0;
}

/** Which enemy item signals / damage types explain each counter. */
const COUNTER_CAUSE: Partial<Record<Counter, { signals?: Array<"heal" | "shield" | "armor" | "mr" | "hp">; damage?: "ad" | "ap" }>> = {
  antiheal: { signals: ["heal"] },
  antishield: { signals: ["shield"] },
  // Pen answers the tankiness meter, which counts every defensive stat.
  armorpen: { signals: ["armor", "mr", "hp"] },
  magicpen: { signals: ["armor", "mr", "hp"] },
  antitank: { signals: ["armor", "mr", "hp"] },
  armor: { damage: "ad" },
  antiburst_ad: { damage: "ad" },
  anticrit: { damage: "ad" },
  antias: { damage: "ad" },
  mr: { damage: "ap" },
  antiburst_ap: { damage: "ap" },
};

function causeFor(rec: ItemRec, recent: IntelEvent[], data: StaticData | undefined, since: number): IntelEvent | undefined {
  const c = rec.counter ? COUNTER_CAUSE[rec.counter] : undefined;
  if (!c) return undefined;
  const items = recent.filter((e) => e.kind === "enemy-item" && e.itemId && e.at >= since);
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i];
    const it = data?.items.get(e.itemId!);
    const name = it?.name ?? e.title;
    const sig = ENEMY_ITEM_SIGNALS[name];
    if (c.signals && sig && c.signals.some((s) => (sig[s] ?? 0) > 0)) return e;
    if (c.damage && data && e.championId) {
      const champ = data.championsById.get(e.championId);
      if (champ && (champ.damage === c.damage || champ.damage === "mixed") && isLegendary(it)) return e;
    }
  }
  return undefined;
}

export interface BuildChangeContext {
  /** Game time of the new plan. */
  at: number;
  /** Intel log so far (to name the enemy purchase that caused the change). */
  recent?: IntelEvent[];
  data?: StaticData;
  /** How far back (seconds) an enemy purchase can explain a change. Default 60. */
  window?: number;
}

/**
 * "Build update" notes when the situational recommendations shift: a counter item becomes
 * urgent (≥0.55) that wasn't, or an urgent counter climbs a level (high → extreme).
 * Ids are `build:<itemId>:<level>` so the same recommendation is announced once per level.
 */
export function buildChanges(prevPlan: BuildPlan | undefined, nextPlan: BuildPlan | undefined, ctx: BuildChangeContext): IntelEvent[] {
  if (!prevPlan || !nextPlan || prevPlan.family !== nextPlan.family) return [];
  const before = new Map(prevPlan.situational.map((s) => [s.item.id, s]));
  const at = Math.round(ctx.at);
  const out: IntelEvent[] = [];
  for (const s of nextPlan.situational) {
    if (s.owned) continue;
    const lvl = urgencyLevel(s.urgency);
    if (lvl < 2) continue;
    const was = before.get(s.item.id);
    const wasLvl = was && !was.owned ? urgencyLevel(was.urgency) : 0;
    if (lvl <= wasLvl) continue;
    const cause = causeFor(s, ctx.recent ?? [], ctx.data, at - (ctx.window ?? 60));
    const reason = s.reasons[0];
    const fresh = wasLvl < 2;
    const verb = fresh ? "now recommended" : "now a priority";
    out.push({
      id: `build:${s.item.id}:${lvl}`,
      at,
      kind: "build",
      title: `Build update: ${s.item.name} ${verb}`,
      detail: [cause ? cause.title : undefined, reason].filter(Boolean).join(" · "),
      tone: lvl >= 3 ? "warn" : "info",
      itemId: s.item.id,
      championId: cause?.championId,
      champion: cause?.champion,
    });
  }
  return out;
}
