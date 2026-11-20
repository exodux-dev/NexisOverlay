// u.gg-style choices on the Build view: the stats sources publish several rune pages, summoner
// spell pairs, core builds, starters and boots. These pure helpers turn them into short option
// lists (most-played first, duplicates and noise dropped) and resolve the stored choice.
//
// A choice is stored as the option's stable identity (see the *Key helpers), so a stats refresh
// that reorders the list keeps the same pick. `undefined`, or a key that isn't among the current
// options, means "auto" — the default the app picked before options existed. Early builds stored
// list indices (numbers): those are still read once and migrated (see migrateChoice).

import type { ChampionStats, WinStat } from "./types";

/** Stored per champion + mode (+ SR position) — see `webKey` in app/store. */
export interface BuildChoice {
  rune?: ChoiceValue;
  spells?: ChoiceValue;
  core?: ChoiceValue;
  starter?: ChoiceValue;
  boots?: ChoiceValue;
}
/** An option key (string); a number is a legacy list index awaiting migration. */
export type ChoiceValue = string | number;
export type ChoicePart = keyof BuildChoice;

export const MAX_OPTIONS = 3;
export const CHOICE_PARTS: ReadonlyArray<ChoicePart> = ["rune", "spells", "core", "starter", "boots"];

export type RuneOption = NonNullable<ChampionStats["runes"]>[number];
export type SpellOption = NonNullable<ChampionStats["spells"]>[number];

export const winRateOf = (s: WinStat) => (s.games ? s.wins / s.games : 0);

/**
 * Keep rows people actually play: at least `minShare` of the most-played row's games (and 5 games),
 * deduplicated by `key`, most-played first, at most `max`.
 */
export function topOptions<T extends WinStat>(rows: readonly T[] | undefined, key: (r: T) => string, max = MAX_OPTIONS, minShare = 0.02): T[] {
  const sorted = [...(rows ?? [])].filter((r) => r && r.games > 0).sort((a, b) => b.games - a.games);
  if (!sorted.length) return [];
  const floor = Math.max(5, sorted[0].games * minShare);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of sorted) {
    if (out.length >= max) break;
    if (out.length && r.games < floor) break;
    const k = key(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------- stable option keys

/** Rune page identity without the stat shards ("8112:8200:8112.8139…") — the format saved before shards were part of the key. */
export const runeBaseKey = (r: { sub: number; perks: number[] }) => `${r.perks[0]}:${r.sub}:${r.perks.slice(0, 6).join(".")}`;
/**
 * Rune page identity: keystone, secondary tree, the six rune ids and the stat shards
 * ("8112:8200:8112.8139…:5008.5008.5011"), so pages that differ only by shards stay separate options.
 */
export const runeKey = (r: { sub: number; perks: number[]; shards?: readonly number[] }) => `${runeBaseKey(r)}:${(r.shards ?? []).join(".")}`;
/** A saved rune key from before shards were part of it (keystone:secondary:runes, no shard part). */
export const isLegacyRuneKey = (v: unknown): v is string => typeof v === "string" && v.split(":").length === 3;

/**
 * `resolveChoice` for rune pages, tolerant of legacy keys: an exact key match wins; a legacy key
 * without shards names the first (most played) option with the same runes.
 */
export function resolveRuneChoice(keys: readonly string[], choice: ChoiceValue | undefined): number {
  const i = resolveChoice(keys, choice);
  if (i >= 0 || !isLegacyRuneKey(choice)) return i;
  return keys.findIndex((k) => k.startsWith(`${choice}:`));
}
/** Spell pair identity: the sorted pair of spell ids ("4+14"). */
export const spellKey = (s: { ids: readonly number[] }) => [...s.ids].sort((a, b) => a - b).join("+");
/** Item list identity in buy order ("3118,4645,3157") — core builds, boots ("3020"). */
export const itemsKey = (ids: readonly number[]) => ids.join(",");
/** Starting items identity: order doesn't matter ("1056,2003"). */
export const starterKey = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(",");

/** Complete rune pages (6 runes + both trees), most-played first. Identical pages (shards included) collapse into the most-played one. */
export function runeOptions(stats: ChampionStats | undefined, max = MAX_OPTIONS): RuneOption[] {
  if (stats?.mode === "arena") return []; // Arena has no rune pages
  const complete = (stats?.runes ?? []).filter((r) => r.primary > 0 && r.sub > 0 && r.perks.filter((p) => p > 0).length >= 6);
  return topOptions(complete, runeKey, max);
}

/** Summoner spell pairs, most-played first (pair order doesn't matter). */
export function spellOptions(stats: ChampionStats | undefined, max = MAX_OPTIONS): SpellOption[] {
  const valid = (stats?.spells ?? []).filter((s) => s.ids?.length === 2 && s.ids[0] > 0 && s.ids[1] > 0);
  return topOptions(valid, spellKey, max);
}

/**
 * Index of the option a stored choice names in `keys` (the current options' keys), or -1 when it
 * names none (unset, stale key, or a legacy index out of range).
 */
export function resolveChoice(keys: readonly string[], choice: ChoiceValue | undefined): number {
  if (typeof choice === "string") return keys.indexOf(choice);
  if (typeof choice === "number" && Number.isInteger(choice) && choice >= 0 && choice < keys.length) return choice;
  return -1;
}

/** The index to show: the stored pick when it resolves, else the default (0), or -1 with no options. */
export function choiceIndex(keys: readonly string[], choice: ChoiceValue | undefined): number {
  const i = resolveChoice(keys, choice);
  return i >= 0 ? i : keys.length ? 0 : -1;
}

/** The rune page to show / import: the chosen one, else the most played. */
export function chosenRunePage(stats: ChampionStats | undefined, choice?: ChoiceValue): RuneOption | undefined {
  const opts = runeOptions(stats);
  const i = resolveRuneChoice(opts.map(runeKey), choice);
  return opts[i >= 0 ? i : 0];
}

const validValue = (v: unknown): v is ChoiceValue =>
  (typeof v === "string" && v.length > 0 && v.length <= 200) || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 20);

/** Merge a choice patch; `undefined` (or invalid) values clear that part. Undefined when nothing is left. */
export function mergeChoice(prev: BuildChoice | undefined, patch: Partial<BuildChoice>): BuildChoice | undefined {
  const next: BuildChoice = { ...(prev ?? {}) };
  for (const k of CHOICE_PARTS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (validValue(v)) next[k] = v;
    else delete next[k];
  }
  return Object.keys(next).length ? next : undefined;
}

/** True when a stored choice still holds a legacy value `migrateChoice` may upgrade (an index, or a rune key without shards). */
export const needsMigration = (choice: BuildChoice | undefined) =>
  !!choice && (Object.values(choice).some((v) => typeof v === "number") || isLegacyRuneKey(choice.rune));

/**
 * One-time migration of legacy index picks (and rune keys saved without shards): given the current options' keys per part, returns the
 * patch that turns each numeric pick into its option key, or clears it when it no longer resolves.
 * Parts whose options aren't known yet (`keys[part]` undefined or empty) are left alone. Undefined = nothing to do.
 */
export function migrateChoice(choice: BuildChoice | undefined, keys: Partial<Record<ChoicePart, readonly string[]>>): Partial<BuildChoice> | undefined {
  if (!choice) return undefined;
  const patch: Partial<BuildChoice> = {};
  for (const part of CHOICE_PARTS) {
    const v = choice[part];
    const list = keys[part];
    // Rune keys saved before shards were part of them: upgrade to the full key of the first page
    // with the same runes. One that matches no current page is left alone (it may come back on refresh).
    if (part === "rune" && isLegacyRuneKey(v) && list?.length) {
      const i = resolveRuneChoice(list, v);
      if (i >= 0) patch.rune = list[i];
      continue;
    }
    // An empty list (e.g. a partial stats load) can't confirm the pick is gone: wait for real options.
    if (typeof v !== "number" || !list?.length) continue;
    const i = resolveChoice(list, v);
    patch[part] = i >= 0 ? list[i] : undefined;
  }
  return Object.keys(patch).length ? patch : undefined;
}
