// Pure builders for the opt-in "Import to League" feature: turn the recommended runes and
// build into the payloads the League client's local API expects (see src-tauri/src/league_import.rs).

import { FAMILY, type Family } from "../data/itemKb";
import type { BuildPlan } from "./build";
import { chosenRunePage, type ChoiceValue } from "./options";
import type { Champion, ChampionStats, Item } from "./types";

/**
 * Current stat-shard rows (patch 14.1+, verified against CommunityDragon perkstyles.json):
 *   Offense: Adaptive Force 5008 · Attack Speed 5005 · Ability Haste 5007
 *   Flex:    Adaptive Force 5008 · Move Speed 5010 · Health Scaling 5001
 *   Defense: Health 5011 · Tenacity and Slow Resist 5013 · Health Scaling 5001
 * (Armor 5002 / Magic Resist 5003 were removed from the shard rows in 2024.)
 */
export const SHARD_ROWS: readonly [readonly number[], readonly number[], readonly number[]] = [
  [5008, 5005, 5007],
  [5008, 5010, 5001],
  [5011, 5013, 5001],
];

/** Sensible shards per item family when the stats source doesn't publish them. */
export const DEFAULT_SHARDS: Record<Family, [number, number, number]> = {
  ap: [5008, 5008, 5001],
  lethality: [5008, 5008, 5001],
  adc: [5005, 5008, 5001],
  bruiser: [5008, 5008, 5001],
  tank: [5007, 5001, 5011],
  enchanter: [5007, 5008, 5001],
};

export interface RunePagePayload {
  name: string;
  primary: number;
  sub: number;
  /** 9 ids: 4 primary-tree runes (keystone first), 2 secondary-tree runes, 3 shards. */
  perks: number[];
}

export interface ItemSetBlock {
  type: string;
  items: Array<{ id: string; count: number }>;
}

/** Keep valid shards row by row; fill missing / outdated ones from the family default. */
export function normalizeShards(shards: readonly number[] | undefined, family: Family): [number, number, number] {
  const def = DEFAULT_SHARDS[family] ?? DEFAULT_SHARDS.ap;
  return [0, 1, 2].map((i) => {
    const s = shards?.[i];
    return s !== undefined && SHARD_ROWS[i].includes(s) ? s : def[i];
  }) as [number, number, number];
}

/** The most-played rune page from the stats (same one the Runes card shows). */
export function topRunePage(stats: ChampionStats | undefined) {
  return [...(stats?.runes ?? [])].sort((a, b) => b.games - a.games)[0];
}

/**
 * Rune page for the League client, or an explanation of why there isn't one. `choice` is the rune
 * page picked on the Build view (its `runeKey`); the most-played page otherwise.
 */
export function buildRunePage(champion: Champion, stats: ChampionStats | undefined, family?: Family, choice?: ChoiceValue): RunePagePayload | { error: string } {
  const page = chosenRunePage(stats, choice) ?? topRunePage(stats);
  if (!page) return { error: `No rune data for ${champion.name} yet.` };
  const perks = page.perks.filter((p) => p > 0);
  if (perks.length < 6 || !page.primary || !page.sub) return { error: `The rune data for ${champion.name} is incomplete.` };
  // Some sources append the shards to `perks`.
  const shards = page.shards ?? (perks.length >= 9 ? perks.slice(6, 9) : undefined);
  return {
    name: `Nexis: ${champion.name}`,
    primary: page.primary,
    sub: page.sub,
    perks: [...perks.slice(0, 6), ...normalizeShards(shards, family ?? FAMILY[champion.archetype] ?? "ap")],
  };
}

function block(type: string, items: Array<Item | undefined>): ItemSetBlock | null {
  const out: ItemSetBlock["items"] = [];
  for (const it of items) {
    if (!it) continue;
    const id = String(it.id);
    const prev = out.find((x) => x.id === id);
    if (prev) prev.count++;
    else out.push({ id, count: 1 });
  }
  return out.length ? { type, items: out } : null;
}

/** Item-set blocks from a build plan: starter, core (in buy order), boots, situational. */
export function buildItemSetBlocks(plan: BuildPlan, opts: { enemiesKnown?: boolean } = {}): ItemSetBlock[] {
  const core = plan.order.map((r) => r.item);
  const coreIds = new Set(core.map((i) => i.id));
  const boots = [plan.boots?.item, ...plan.bootsAlternatives.map((b) => b.item)].filter((b, i, a) => b && a.findIndex((x) => x?.id === b.id) === i);
  const situational = plan.situational.map((r) => r.item).filter((i) => !coreIds.has(i.id));
  return [
    block("Starting items", plan.starter),
    block("Core build", core),
    block("Boots", boots),
    block(opts.enemiesKnown ? "Situational (vs this enemy comp)" : "Situational", situational),
  ].filter((b): b is ItemSetBlock => !!b);
}

export function itemSetTitle(champion: Champion, modeLabel?: string): string {
  return `Nexis: ${champion.name}${modeLabel ? ` (${modeLabel})` : ""}`;
}
