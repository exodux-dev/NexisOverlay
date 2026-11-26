// Adaptive build engine.
//
//   core build  = aggregated stats (highest smoothed win rate)  →  champion override  →  archetype template
//   situational = enemy threat report × your family × playstyle (+ your performance in this game)
//   order       = core with urgent counters inserted, boots after the first item
//   next buy    = first unowned item, accounting for components you already hold

import { ARCHETYPE_BUILDS, CHAMPION_BUILDS, COUNTER_ITEMS, FAMILY, type BootsName, type Counter, type Family } from "../data/itemKb";
import { findItem, getItemMap, isArenaPrismaticId, itemMapFor, onMap, setItemMap } from "./staticData";
import { clamp, smoothedWinRate } from "./text";
import type { ThreatReport } from "./threat";
import type { BuildVariant } from "./variants";
import { itemsKey, resolveChoice, starterKey, topOptions, type BuildChoice } from "./options";
import type { Champion, ChampionStats, Item, MatchRecord, PlayerState, Playstyle, StaticData, WinStat } from "./types";

export interface WinInfo {
  rate: number;
  games: number;
  source: "global" | "personal";
  /** What `rate` measures: games won, or (Arena) top-4 finishes. Absent = win. */
  metric?: "win" | "top4";
}

export interface ItemRec {
  item: Item;
  kind: "core" | "situational" | "flex" | "boots";
  reasons: string[];
  owned: boolean;
  /** Gold already invested through components in your inventory. */
  invested: number;
  urgency?: number; // situational only, 0..1
  counter?: Counter;
  winRate?: WinInfo;
}

export interface NextBuy {
  rec: ItemRec;
  missingGold: number;
  affordable: boolean;
  /** When you can't afford the full item: best component to buy now. */
  component?: Item;
  /**
   * Arena outside a live game: there is no real gold yet (gold is handed out per round), so
   * affordability and components are not computed.
   */
  goldUnknown?: boolean;
}

/** One selectable core build (first completed items, in buy order) with its numbers. */
export interface CoreOption {
  /** Stable identity stored as the pick (item ids in buy order, see engine/options). */
  key: string;
  items: Item[];
  stat: WinStat;
  /** "popular" = most played (what OP.GG / HexMayhem list first) — the auto pick; "best" = highest (smoothed) win rate among well-played builds. */
  tag?: "best" | "popular";
}

/** One selectable starting item set or boots option with its numbers. */
export interface StarterOption {
  key: string;
  items: Item[];
  stat: WinStat;
}
export interface BootsOption {
  key: string;
  item: Item;
  stat: WinStat;
}

export interface BuildPlan {
  family: Family;
  source: "stats" | "personal" | "template";
  sourceLabel: string;
  order: ItemRec[]; // 6 entries: item, boots, items…
  boots: ItemRec | undefined;
  bootsAlternatives: Array<{ item: Item; reason: string }>;
  situational: ItemRec[];
  starter: Item[];
  /** Where `starter` came from: components that fit the start gold, or the source's most-played start (Arena). */
  starterSource?: "gold" | "stats";
  /** Arena: Prismatic items (from Prismatic anvils / augments, not the gold shop) ranked by top-4 rate. */
  prismatic: ItemRec[];
  next?: NextBuy;
  swaps: Array<{ sell: Item; buy: ItemRec }>;
  playstyle: Exclude<Playstyle, "auto">;
  playstyleReason: string;
  /** Core builds from the stats (auto pick first); empty without stats builds or for a non-default build style. */
  coreOptions: CoreOption[];
  /** Index into `coreOptions` the order is based on (-1 = none). */
  coreIndex: number;
  /** Most-played starting item sets from the stats. */
  starterOptions: StarterOption[];
  /** Index into `starterOptions` that `starter` is (-1 = gold-based components). */
  starterIndex: number;
  /** Index into `starterOptions` the automatic starter would be (-1 = gold-based components / none). */
  starterAutoIndex: number;
  /** True when `starterIndex` is the user's explicit pick (not the automatic starter). */
  starterPicked: boolean;
  /** Most-played boots from the stats. */
  bootsOptions: BootsOption[];
  /** Index into `bootsOptions` the user picked explicitly (-1 = automatic boots). */
  bootsIndex: number;
}

export interface BuildContext {
  data: StaticData;
  champion: Champion;
  threat: ThreatReport;
  me?: PlayerState;
  gold?: number;
  playstyle?: Playstyle;
  stats?: ChampionStats;
  history?: MatchRecord[];
  startGold?: number;
  /** Selected build style. `champion` should already have the variant applied (applyVariant). */
  variant?: BuildVariant;
  /** True when the variant is the champion's default style (stats/overrides apply). */
  variantIsDefault?: boolean;
  /**
   * Game mode ("arena", "sr", "aram", "mayhem"). When set, recommendations use that mode's item
   * pool (see itemMapFor) regardless of the globally active map. "arena" also switches to
   * top-4 wording, per-round gold and a separate Prismatic item list.
   */
  mode?: string;
  /** User's picks among the plan's rune / spells / core / starter / boots options (option keys; see engine/options). */
  choice?: BuildChoice;
}

const isArena = (ctx: BuildContext) => ctx.mode === "arena" || (ctx.mode === undefined && ctx.stats?.mode === "arena");
/** Prismatic items can't be bought with gold: never part of the core / flex / counter path. */
const isPrismatic = (it: Item) => isArenaPrismaticId(it.id);

const COUNTER_LABEL: Record<Counter, string> = {
  antiheal: "Grievous Wounds",
  antishield: "Shield break",
  armorpen: "Armor penetration",
  magicpen: "Magic penetration",
  antitank: "Tank shred",
  armor: "Armor",
  mr: "Magic resist",
  antiburst_ad: "Survive AD burst",
  antiburst_ap: "Survive AP burst",
  anticrit: "Anti-crit",
  antias: "Anti attack speed",
  cleanse: "Cleanse",
};
export { COUNTER_LABEL };

const DEFENSIVE: Counter[] = ["armor", "mr", "antiburst_ad", "antiburst_ap", "anticrit", "antias", "cleanse"];

function resolve(data: StaticData, names: string[]): Item[] {
  const out: Item[] = [];
  for (const n of names) {
    const it = findItem(data, n);
    if (it && !out.some((o) => o.id === it.id)) out.push(it);
  }
  return out;
}

function firstResolvable(data: StaticData, names: string[] | undefined): Item | undefined {
  for (const n of names ?? []) {
    const it = findItem(data, n);
    if (it && !isPrismatic(it)) return it;
  }
  return undefined;
}

function names(list: string[], n = 3): string {
  const uniq = [...new Set(list.map((s) => s.replace(/ \(.*\)$/, "")))];
  return uniq.slice(0, n).join(", ") + (uniq.length > n ? ` +${uniq.length - n}` : "");
}

/** Resolve "auto" playstyle using how this game is going. */
export function resolvePlaystyle(
  playstyle: Playstyle | undefined,
  me: PlayerState | undefined,
  champion: Champion,
): { style: Exclude<Playstyle, "auto">; reason: string } {
  if (playstyle && playstyle !== "auto") return { style: playstyle, reason: "You picked this style" };
  if (me) {
    const { kills, deaths, assists } = me;
    if (deaths >= 3 && deaths * 2 > kills + assists) return { style: "safe", reason: `You've died ${deaths} times, so defensive items come first` };
    if (kills + assists >= 6 && kills + assists >= 3 * (deaths + 1)) return { style: "aggressive", reason: "You're ahead, so the build leans into damage" };
  }
  if (champion.archetype === "tank") return { style: "frontline", reason: "Tanks build to protect the team" };
  return { style: "balanced", reason: "No clear trend yet: an even mix of damage and defense" };
}

function needs(threat: ThreatReport, champion: Champion): Record<Counter, { v: number; why: string }> {
  const src = (k: string) => threat.meters.find((m) => m.key === k)?.sources ?? [];
  const ad = champion.damage !== "ap";
  const ap = champion.damage !== "ad";
  const dmgShare = (s: number) => clamp((s - 0.45) * 2.2);
  return {
    antiheal: { v: threat.heal, why: `Heavy healing: ${names(src("heal"))}` },
    antishield: { v: threat.shield * 0.85, why: `Lots of shields: ${names(src("shield"))}` },
    armorpen: { v: ad ? threat.tankiness * 0.95 : 0, why: `Armor stacking frontline: ${names(src("tankiness"))}` },
    magicpen: { v: ap ? threat.tankiness * 0.95 : 0, why: `Tanky targets: ${names(src("tankiness"))}` },
    // Pen already answers tanks for most families; %-health shred is the secondary answer.
    antitank: { v: threat.tankiness * 0.6, why: `%-health damage vs ${names(src("tankiness"))}` },
    armor: { v: dmgShare(threat.adShare), why: `${Math.round(threat.adShare * 100)}% of their damage is physical` },
    mr: { v: dmgShare(threat.apShare), why: `${Math.round(threat.apShare * 100)}% of their damage is magic` },
    antiburst_ad: {
      v: threat.assassinsAd ? clamp(0.45 + 0.25 * threat.assassinsAd) : 0,
      why: `AD assassins will target you: ${names(src("burst").filter(() => true))}`,
    },
    antiburst_ap: {
      v: threat.assassinsAp ? clamp(0.45 + 0.25 * threat.assassinsAp) : 0,
      why: `AP burst threats: ${names(src("burst"))}`,
    },
    anticrit: { v: threat.crit, why: `Crit carries: ${names(src("crit"))}` },
    antias: { v: threat.attackSpeed, why: `Attack-speed carries: ${names(src("attackSpeed"))}` },
    cleanse: {
      v: threat.suppress.length ? 0.75 : clamp((threat.cc - 0.6) * 1.5),
      why: threat.suppress.length ? `Suppression: ${threat.suppress.join(", ")}` : "Chain crowd control",
    },
  };
}

function statFor(stats: ChampionStats | undefined, id: number): WinStat | undefined {
  return stats?.items?.[String(id)] ?? stats?.boots?.[String(id)];
}

function personalItemStat(history: MatchRecord[] | undefined, champion: string, id: number): WinStat | undefined {
  const games = history?.filter((m) => m.champion === champion && m.items.includes(id));
  if (!games?.length) return undefined;
  return { games: games.length, wins: games.filter((m) => m.result === "Win").length };
}

function winInfo(ctx: BuildContext, id: number): WinInfo | undefined {
  const g = statFor(ctx.stats, id);
  if (g && g.games >= 20) return { rate: g.wins / g.games, games: g.games, source: "global", ...(isArena(ctx) ? { metric: "top4" as const } : {}) };
  const p = personalItemStat(ctx.history, ctx.champion.id, id);
  if (p && p.games >= 3) return { rate: p.wins / p.games, games: p.games, source: "personal" };
  return undefined;
}

/** Gold already sunk into `item` via components currently in the inventory (each component used once). */
export function investedGold(data: StaticData, item: Item, inventory: number[]): number {
  const pool = [...inventory];
  const take = (id: number): number => {
    const idx = pool.indexOf(id);
    if (idx >= 0) {
      pool.splice(idx, 1);
      return data.items.get(id)?.cost ?? 0;
    }
    const it = data.items.get(id);
    if (!it) return 0;
    return it.from.reduce((s, c) => s + take(c), 0);
  };
  return item.from.reduce((s, c) => s + take(c), 0);
}

/** Cheapest-first greedy pick of components (recursively) that fit the budget. */
export function componentsWithin(data: StaticData, item: Item, budget: number, exclude: number[] = []): Item[] {
  const flat: Item[] = [];
  const walk = (id: number) => {
    const it = data.items.get(id);
    if (!it) return;
    flat.push(it);
    it.from.forEach(walk);
  };
  item.from.forEach(walk);
  const picked: Item[] = [];
  let left = budget;
  // Prefer the most expensive component that fits, then fill with what's left.
  // Only components sold on the active map (Arena's shop doesn't carry every component).
  for (const c of flat.filter((c) => !exclude.includes(c.id) && onMap(c)).sort((a, b) => b.cost - a.cost)) {
    if (c.cost <= left && !picked.some((p) => p.from.includes(c.id) || c.from.includes(p.id) || p.id === c.id)) {
      picked.push(c);
      left -= c.cost;
    }
  }
  return picked;
}

function chooseBoots(ctx: BuildContext, family: Family): { boots?: Item; reason: string; alternatives: Array<{ item: Item; reason: string }> } {
  const { threat, data } = ctx;
  const base: Record<Family, BootsName> = {
    ap: "Sorcerer's Shoes",
    adc: "Berserker's Greaves",
    lethality: "Ionian Boots of Lucidity",
    bruiser: threat.apShare > threat.adShare ? "Mercury's Treads" : "Plated Steelcaps",
    tank: threat.apShare > threat.adShare ? "Mercury's Treads" : "Plated Steelcaps",
    enchanter: "Ionian Boots of Lucidity",
  };
  let pick: BootsName = base[family];
  let reason = family === "bruiser" || family === "tank" ? `Their damage is mostly ${threat.apShare > threat.adShare ? "magic" : "physical"}` : "Default for your champion type";

  const squishy = family === "ap" || family === "adc" || family === "enchanter" || family === "lethality";
  if (squishy) {
    if (threat.cc >= 0.7 && threat.apShare >= 0.55) {
      pick = "Mercury's Treads";
      reason = "Heavy CC + magic damage — tenacity & MR";
    } else if (threat.assassinsAd >= 2 || (threat.adShare >= 0.75 && threat.crit + threat.attackSpeed > 0.8)) {
      pick = "Plated Steelcaps";
      reason = "Auto-attackers & AD divers on their team";
    }
  } else if (threat.cc >= 0.75) {
    pick = "Mercury's Treads";
    reason = "Lots of crowd control — tenacity";
  }

  // Data override unless the enemy team gives a clear reason (heavy AD or AP, lots of CC, AD
  // assassins): with an even or unknown comp, use the boots the champion's players actually win with.
  // (Before, bruisers got Steelcaps/Mercs from a 50/50 split — e.g. Steelcaps on Yasuo.)
  const strongSignal =
    Math.max(threat.apShare, threat.adShare) >= 0.65 || threat.cc >= 0.75 || threat.assassinsAd >= 2 || (squishy && !reason.startsWith("Default"));
  let dataBoots: Item | undefined;
  if (ctx.stats?.boots && (reason.startsWith("Default") || !strongSignal)) {
    let best: { id: number; wr: number } | undefined;
    const overall = ctx.stats.wins / Math.max(1, ctx.stats.games);
    // Only boots a real share of players buy (≥10% of games): a 2%-pick niche pair with a lucky
    // win rate shouldn't replace the boots almost everyone builds.
    const minGames = Math.max(30, ctx.stats.games * 0.1);
    for (const [id, s] of Object.entries(ctx.stats.boots)) {
      if (s.games < minGames) continue;
      const wr = smoothedWinRate(s.wins, s.games, overall, 200);
      if (!best || wr > best.wr) best = { id: Number(id), wr };
    }
    const it = best && data.items.get(best.id);
    if (onMap(it) && it.tags.includes("Boots")) {
      dataBoots = it;
      // Say "highest" only when it is: a rarely built pair can have a better raw rate but is
      // left out above (too few games), so then the honest reason is "most built".
      const rate = (s: { wins: number; games: number }) => s.wins / Math.max(1, s.games);
      const mine = ctx.stats.boots[String(best!.id)]!;
      const beaten = Object.entries(ctx.stats.boots).some(([id, s]) => Number(id) !== best!.id && s.games >= 30 && rate(s) > rate(mine) + 0.02);
      const what = isArena(ctx) ? "top-4 rate" : "win rate";
      reason = beaten ? `Most built boots for this champion (${Math.round(rate(mine) * 100)}% ${isArena(ctx) ? "top 4" : "WR"})` : `Highest ${what} boots for this champion`;
    }
  }

  const boots = dataBoots ?? findItem(data, pick);
  const alternatives: Array<{ item: Item; reason: string }> = [];
  const alt = (n: BootsName, r: string) => {
    const it = findItem(data, n);
    if (it && it.id !== boots?.id) alternatives.push({ item: it, reason: r });
  };
  alt("Plated Steelcaps", `vs. ${Math.round(threat.adShare * 100)}% physical damage`);
  alt("Mercury's Treads", `vs. ${Math.round(threat.apShare * 100)}% magic damage / CC`);
  if (family === "ap") alt("Sorcerer's Shoes", "Max damage");
  if (family === "adc") alt("Berserker's Greaves", "Max DPS");
  alt("Ionian Boots of Lucidity", "Ability haste");
  return { boots, reason, alternatives: alternatives.slice(0, 3) };
}

/**
 * Core-build options, like the stats sites list them: the most played build first (the auto pick,
 * tagged "popular"), then the highest smoothed win rate among builds with ≥3% of games (tagged
 * "best") when that's a different build, then the next most played.
 */
export function coreBuildOptions(ctx: BuildContext): CoreOption[] {
  const { data, stats } = ctx;
  if (!(ctx.variantIsDefault ?? true) || !stats?.builds?.length) return [];
  const overall = stats.wins / Math.max(1, stats.games);
  const resolveItems = (ids: number[]) =>
    ids.map((id) => data.items.get(id)).filter((x): x is Item => onMap(x) && !x.tags.includes("Boots") && !isPrismatic(x)).slice(0, 3);
  // Builds people actually play (≥1% of the champion's games, min 15), deduplicated by their items.
  const seen = new Set<string>();
  const played = stats.builds
    .filter((b) => b.games >= Math.max(15, stats.games * 0.01))
    .map((b) => ({ b, items: resolveItems(b.items) }))
    .filter((x) => x.items.length >= 2)
    .sort((a, b) => b.b.games - a.b.games)
    .filter((x) => {
      const k = x.items.map((i) => i.id).join(",");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // Only builds with ≥3% of games (min 15) can be the auto pick — a 118-game outlier with a high
  // win rate shouldn't beat the builds thousands of players use.
  const best = played
    .filter((x) => x.b.games >= Math.max(15, stats.games * 0.03))
    .map((x) => ({ x, wr: smoothedWinRate(x.b.wins, x.b.games, overall, 200) }))
    .sort((a, b) => b.wr - a.wr)[0]?.x;
  const mostPlayed = played[0];
  const toOpt = (x: (typeof played)[number], tag?: CoreOption["tag"]): CoreOption => ({
    key: itemsKey(x.items.map((i) => i.id)),
    items: x.items,
    stat: { games: x.b.games, wins: x.b.wins, ...(x.b.pickRate !== undefined ? { pickRate: x.b.pickRate } : {}) },
    ...(tag ? { tag } : {}),
  });
  if (!mostPlayed) return [];
  const rest = played.filter((x) => x !== mostPlayed && x !== best);
  return [mostPlayed, ...(best && best !== mostPlayed ? [best] : []), ...rest]
    .slice(0, 3)
    .map((x) => toOpt(x, x === mostPlayed ? "popular" : x === best ? "best" : undefined));
}

function baseBuild(ctx: BuildContext): { core: Item[]; flex: Item[]; source: BuildPlan["source"]; label: string; coreOptions: CoreOption[]; coreIndex: number } {
  const { data, champion, stats } = ctx;
  const tpl = ARCHETYPE_BUILDS[champion.archetype];
  const isDefault = ctx.variantIsDefault ?? true;
  const v = ctx.variant;
  const override = v?.core ? { core: v.core, flex: v.flex } : isDefault ? CHAMPION_BUILDS[champion.id] : undefined;
  let core = resolve(data, override?.core ?? tpl.core);
  if (core.length < 3) core = [...core, ...resolve(data, tpl.core).filter((i) => !core.some((c) => c.id === i.id))].slice(0, 3);
  let flex = resolve(data, [...(override?.flex ?? []), ...tpl.flex]);
  let source: BuildPlan["source"] = "template";
  const styleName = v && !isDefault ? `${v.label} ` : "";
  let label = override ? `${styleName}${champion.name} baseline build` : `${styleName}baseline build`;

  const overall = stats ? stats.wins / Math.max(1, stats.games) : 0.5;
  const arena = isArena(ctx);
  const coreOptions = coreBuildOptions(ctx);
  const pickedIndex = resolveChoice(coreOptions.map((o) => o.key), ctx.choice?.core);
  const picked = pickedIndex >= 0;
  // Auto = the source's most played build (first option), as the stats sites show it.
  let coreIndex = picked ? pickedIndex : coreOptions.length ? 0 : -1;
  const top = coreOptions[coreIndex];
  if (top) {
    core = top.items;
    source = "stats";
    const rate = `${((top.stat.wins / Math.max(1, top.stat.games)) * 100).toFixed(1)}%${arena ? " top 4" : ""} over ${top.stat.games} games`;
    const src = stats?.source === "hexmayhem" ? "HexMayhem" : stats?.source === "opgg" ? "OP.GG" : stats?.source === "riot" ? "Your dataset" : "Stats";
    label = picked ? `Your core build pick · ${rate}` : `${src} most played build · ${rate}`;
  } else if (isDefault && stats?.bestBuild && stats.bestBuild.length >= 2) {
    const items = stats.bestBuild.map((id) => data.items.get(id)).filter((x): x is Item => onMap(x) && !x.tags.includes("Boots") && !isPrismatic(x));
    if (items.length >= 2) {
      core = [...items, ...core.filter((c) => !items.some((i) => i.id === c.id))].slice(0, 3);
      source = "stats";
      const src = stats.source === "hexmayhem" ? "HexMayhem" : (stats.source as string) === "opgg" ? "OP.GG" : "Data";
      label = `${src} top build · ${champion.name} ${(overall * 100).toFixed(1)}% ${arena ? "top 4" : "WR"} over ${fmtCount(stats.games)} games`;
    }
  }

  // Re-rank flex options by item win rate (global or personal) when available.
  if (stats?.items && isDefault) {
    // Only items people actually build on this champion (>=1% of games) can join the flex pool.
    const minGames = Math.max(25, stats.games * 0.01);
    const extra = Object.entries(stats.items)
      .filter(([, s]) => s.games >= minGames)
      .map(([id]) => data.items.get(Number(id)))
      .filter((x): x is Item => onMap(x) && x.completed && !x.tags.includes("Boots") && !isPrismatic(x));
    for (const it of extra) if (!flex.some((f) => f.id === it.id)) flex.push(it);
    // Win rate plus a popularity nudge: a staple most players finish (Infinity Edge on Yasuo) beats a
    // niche pick with a slightly higher win rate. Items with no data on this champion go last — a
    // template guess must never outrank what players actually build.
    const score = (it: Item) => {
      const s = stats.items[String(it.id)];
      if (!s || s.games < minGames) return -1;
      const share = s.games / Math.max(1, stats.games);
      return smoothedWinRate(s.wins, s.games, overall, 200) + 0.12 * Math.min(1, share);
    };
    flex = flex.sort((a, b) => score(b) - score(a));
  } else if (ctx.history?.length) {
    const mine = ctx.history.filter((m) => m.champion === champion.id);
    if (mine.length >= 5) {
      const wr = (it: Item) => {
        const s = personalItemStat(mine, champion.id, it.id);
        return s ? smoothedWinRate(s.wins, s.games, 0.5, 5) : 0.5;
      };
      flex = [...flex].sort((a, b) => wr(b) - wr(a));
      if (source === "template") {
        source = "personal";
        label = `Tuned to your ${mine.length} games on ${champion.name}`;
      }
    }
  }
  flex = flex.filter((f) => !core.some((c) => c.id === f.id) && !isPrismatic(f));
  // Auto core that isn't an option's "best" pick: mark the option it matches, if any.
  if (coreIndex < 0) {
    const key = core.map((c) => c.id).join(",");
    coreIndex = coreOptions.findIndex((o) => o.items.map((i) => i.id).join(",") === key);
  }
  return { core, flex, source, label, coreOptions, coreIndex };
}

export function recommendBuild(ctx: BuildContext): BuildPlan {
  if (!ctx.mode) return planBuild(ctx);
  // Use the mode's item pool for this computation only (findItem / onMap read the active map).
  const prev = getItemMap();
  setItemMap(itemMapFor(ctx.mode));
  try {
    return planBuild(ctx);
  } finally {
    setItemMap(prev);
  }
}

/** Arena Prismatic items in the champion's stats, best top-4 rate first (min. 1% of games / 20). */
function prismaticPicks(ctx: BuildContext, mk: (item: Item) => ItemRec): ItemRec[] {
  const { stats, data } = ctx;
  if (!stats?.items || !isArena(ctx)) return [];
  const overall = stats.wins / Math.max(1, stats.games);
  const minGames = Math.max(20, stats.games * 0.01);
  return Object.entries(stats.items)
    .map(([id, s]) => ({ it: data.items.get(Number(id)), s }))
    .filter((x): x is { it: Item; s: WinStat } => onMap(x.it) && isPrismatic(x.it) && x.s.games >= minGames)
    .map((x) => ({ ...x, wr: smoothedWinRate(x.s.wins, x.s.games, overall, 200) }))
    .sort((a, b) => b.wr - a.wr)
    .slice(0, 6)
    .map((x) => mk(x.it));
}

function planBuild(ctx: BuildContext): BuildPlan {
  const { data, champion, threat, me } = ctx;
  const arena = isArena(ctx);
  const family = FAMILY[champion.archetype];
  const inventory = (me?.items ?? []).map((i) => i.id);
  const { style, reason: playstyleReason } = resolvePlaystyle(ctx.playstyle, me, champion);

  const defMult = { aggressive: 0.75, balanced: 1, safe: 1.3, frontline: 1.15 }[style];
  const offMult = { aggressive: 1.15, balanced: 1, safe: 0.9, frontline: 0.95 }[style];

  const { core, flex, source, label, coreOptions, coreIndex } = baseBuild(ctx);
  const mk = (item: Item, kind: ItemRec["kind"], reasons: string[]): ItemRec => ({
    item,
    kind,
    reasons,
    owned: inventory.includes(item.id),
    invested: inventory.includes(item.id) ? item.cost : investedGold(data, item, inventory),
    winRate: winInfo(ctx, item.id),
  });

  // ---- situational
  const need = needs(threat, champion);
  const byItem = new Map<number, ItemRec>();
  for (const counter of Object.keys(need) as Counter[]) {
    const { v, why } = need[counter];
    const urgency = clamp(v * (DEFENSIVE.includes(counter) ? defMult : offMult));
    if (urgency < 0.3) continue;
    const item = firstResolvable(data, COUNTER_ITEMS[counter][family]);
    if (!item) continue;
    const existing = byItem.get(item.id);
    if (existing) {
      existing.urgency = clamp(Math.max(existing.urgency!, urgency) + 0.15 * Math.min(existing.urgency!, urgency));
      existing.reasons.push(why);
      continue;
    }
    const rec = mk(item, "situational", [why]);
    rec.urgency = urgency;
    rec.counter = counter;
    byItem.set(item.id, rec);
  }
  const situational = [...byItem.values()].sort((a, b) => b.urgency! - a.urgency!);

  // ---- assemble order: core, urgent counters, then flex
  // Keep the core identity of the build: at most one counter jumps ahead of the 3rd core
  // item, and at most two counters take build slots (the rest stay as listed options).
  const chosen: ItemRec[] = core.map((it, i) => mk(it, "core", [i === 0 ? "First item — core power spike" : "Core item"]));
  let inserted = 0;
  for (const s of situational) {
    const inCore = chosen.find((c) => c.item.id === s.item.id);
    if (inCore) {
      inCore.reasons.push(`Also answers: ${s.reasons[0]}`);
      continue;
    }
    if (inserted >= 2 || s.urgency! < 0.55) continue;
    if (inserted === 0 && s.urgency! >= 0.8 && chosen.length >= 2) chosen.splice(2, 0, { ...s });
    else chosen.push({ ...s });
    inserted++;
  }
  for (const f of flex) {
    if (chosen.length >= 5) break;
    if (!chosen.some((c) => c.item.id === f.id)) chosen.push(mk(f, "flex", ["Strong late-game slot"]));
  }
  // Already-owned completed items that aren't in the plan stay where the player put them.
  const finalItems = chosen.slice(0, 5);

  // ---- boots
  const bootsOptions = bootsOptionsFor(ctx);
  const bootsIndex = resolveChoice(bootsOptions.map((o) => o.key), ctx.choice?.boots);
  const auto = chooseBoots(ctx, family);
  const chosenBoots = bootsOptions[bootsIndex];
  const bootsPick = chosenBoots
    ? {
        boots: chosenBoots.item,
        reason: `Your pick · ${pctText(chosenBoots.stat)} ${arena ? "top 4" : "WR"} over ${fmtCount(chosenBoots.stat.games)} games`,
        alternatives: [
          ...(auto.boots && auto.boots.id !== chosenBoots.item.id ? [{ item: auto.boots, reason: `Auto: ${auto.reason}` }] : []),
          ...auto.alternatives.filter((a) => a.item.id !== chosenBoots.item.id),
        ],
      }
    : auto;
  const ownedBoots = (me?.items ?? []).map((i) => data.items.get(i.id)).find((it) => it?.tags.includes("Boots") && it.cost > 300 && onMap(it));
  const bootsItem = ownedBoots ?? bootsPick.boots;
  const boots = bootsItem
    ? mk(bootsItem, "boots", [ownedBoots && ownedBoots.id !== bootsPick.boots?.id ? "Your current boots" : bootsPick.reason])
    : undefined;

  const order = boots ? [finalItems[0], boots, ...finalItems.slice(1)].filter(Boolean) : finalItems;

  // ---- next buy
  // Arena hands out gold per round: without a live gold value there's nothing to compare against.
  let next: NextBuy | undefined;
  const target = order.find((r) => !r.owned);
  if (target && arena && ctx.gold === undefined) {
    next = { rec: target, missingGold: Math.max(0, target.item.cost - target.invested), affordable: false, goldUnknown: true };
  } else if (target) {
    const missing = Math.max(0, target.item.cost - target.invested);
    const gold = ctx.gold ?? 0;
    const affordable = gold >= missing;
    next = { rec: target, missingGold: missing, affordable };
    if (!affordable) {
      const comp = componentsWithin(data, target.item, gold, inventory)[0];
      if (comp) next.component = comp;
    }
  }

  // ---- late-game swaps: inventory full of completed items, urgent counter not owned
  const swaps: BuildPlan["swaps"] = [];
  const ownedCompleted = inventory.map((id) => data.items.get(id)).filter((x): x is Item => !!x && x.completed && !x.tags.includes("Boots"));
  if (ownedCompleted.length >= 5) {
    const plannedIds = new Set(order.map((o) => o.item.id));
    const sellable = ownedCompleted.filter((i) => !plannedIds.has(i.id) || order.find((o) => o.item.id === i.id)?.kind === "flex");
    for (const s of situational.filter((s) => !s.owned && s.urgency! >= 0.6)) {
      const sell = sellable.shift();
      if (!sell) break;
      swaps.push({ sell, buy: s });
    }
  }

  // ---- starter
  // Arena has no fixed start gold (it's handed out per round): use the source's most-played
  // start when known instead of components that fit the ARAM start gold.
  let starter: Item[] = [];
  let starterSource: BuildPlan["starterSource"];
  const starterOptions = starterOptionsFor(ctx);
  const startGold = ctx.startGold ?? 1400;
  const pickedStarter = resolveChoice(starterOptions.map((o) => o.key), ctx.choice?.starter);
  // Default: the most-played start (Arena: always; other modes when it's a real trend and fits the start gold).
  let starterAutoIndex = -1;
  if (starterOptions.length && (arena || (starterOptions[0].stat.pickRate ?? 0) >= 0.05)) {
    const cost = starterOptions[0].items.reduce((s, i) => s + i.cost, 0);
    if (arena || cost <= startGold) starterAutoIndex = 0;
  }
  const starterPicked = pickedStarter >= 0;
  const starterIndex = starterPicked ? pickedStarter : starterAutoIndex;
  if (starterIndex >= 0) {
    starter = starterOptions[starterIndex].items;
    starterSource = "stats";
  } else if (arena) {
    const top = [...(ctx.stats?.starters ?? [])].sort((a, b) => b.games - a.games)[0];
    starter = (top?.items ?? []).map((id) => data.items.get(id)).filter((x): x is Item => onMap(x));
    if (starter.length) starterSource = "stats";
  } else {
    starter = order[0] ? componentsWithin(data, order[0].item, startGold - 0) : [];
    if (starter.length) starterSource = "gold";
  }
  const prismatic = prismaticPicks(ctx, (it) => mk(it, "flex", ["Prismatic item — from Prismatic anvils / augments, not the gold shop"]));

  return {
    family,
    source,
    sourceLabel: label,
    order,
    boots,
    bootsAlternatives: (() => {
      // If you already own different boots, surface the recommended pick first; never list what you own.
      const alts = bootsPick.alternatives.filter((a) => a.item.id !== bootsItem?.id);
      if (bootsPick.boots && bootsItem && bootsPick.boots.id !== bootsItem.id) alts.unshift({ item: bootsPick.boots, reason: `Recommended: ${bootsPick.reason}` });
      return alts.slice(0, 3);
    })(),
    situational,
    starter,
    ...(starterSource ? { starterSource } : {}),
    prismatic,
    next,
    swaps,
    playstyle: style,
    playstyleReason,
    coreOptions,
    coreIndex,
    starterOptions,
    starterIndex,
    starterAutoIndex,
    starterPicked,
    bootsOptions,
    bootsIndex,
  };
}

const pctText = (s: WinStat) => `${((s.wins / Math.max(1, s.games)) * 100).toFixed(1)}%`;
const winStatOf = (s: WinStat): WinStat => ({ games: s.games, wins: s.wins, ...(s.pickRate !== undefined ? { pickRate: s.pickRate } : {}) });

/** Most-played starting item sets (items resolvable on this map), deduplicated by their items. */
function starterOptionsFor(ctx: BuildContext): StarterOption[] {
  if (!(ctx.variantIsDefault ?? true)) return [];
  const { data } = ctx;
  const rows = (ctx.stats?.starters ?? [])
    .map((s) => ({ ...winStatOf(s), ids: s.items, items: s.items.map((id) => data.items.get(id)).filter((x): x is Item => onMap(x) && !isPrismatic(x)) }))
    // Every item must exist on this map — a half-resolved start would be misleading.
    .filter((r) => r.items.length > 0 && r.items.length === r.ids.length);
  return topOptions(rows, (r) => starterKey(r.ids), 3, 0.01).map((r) => ({ key: starterKey(r.ids), items: r.items, stat: winStatOf(r) }));
}

/** Most-played completed boots from the stats. */
function bootsOptionsFor(ctx: BuildContext): BootsOption[] {
  const { data, stats } = ctx;
  if (!stats?.boots) return [];
  const rows = Object.entries(stats.boots)
    .map(([id, s]) => ({ ...winStatOf(s), item: data.items.get(Number(id)) }))
    .filter((r): r is WinStat & { item: Item } => onMap(r.item) && r.item.tags.includes("Boots") && r.item.cost > 300);
  return topOptions(rows, (r) => itemsKey([r.item.id]), 3, 0.01).map((r) => ({ key: itemsKey([r.item.id]), item: r.item, stat: winStatOf(r) }));
}

function fmtCount(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}
