// Loads Riot Data Dragon (champions, items, runes, summoner spells) and merges
// it with our curated champion knowledge. Cached on disk by the backend.

import { fetchJson } from "../bridge";
import { CHAMPION_KB } from "../data/championKb";
import type { Archetype, Champion, ChampionSpell, DamageType, Item, Rune, StaticData, SummonerSpell } from "./types";
import { norm } from "./text";
import { abilityCost, abilityRange, cleanGameText, type DDSpellLike } from "./tooltipText";

const DD = "https://ddragon.leagueoflegends.com";

export const AP_ARCHETYPES: Archetype[] = ["mage_burst", "mage_poke", "mage_dps", "ap_assassin", "ap_bruiser", "ap_onhit", "enchanter", "tank"];

/** Fallback archetype for champions missing from the KB (e.g. brand-new releases). */
export function guessArchetype(tags: string[], info: { attack: number; magic: number; defense: number }): Archetype {
  const [primary, secondary] = tags;
  if (primary === "Marksman") return "adc_crit";
  if (primary === "Support") return info.magic >= info.attack ? "enchanter" : "tank";
  if (primary === "Tank") return "tank";
  if (primary === "Assassin") return info.magic > info.attack ? "ap_assassin" : "ad_assassin";
  if (primary === "Mage") return secondary === "Fighter" || secondary === "Tank" ? "ap_bruiser" : "mage_burst";
  if (primary === "Fighter") return info.magic > info.attack ? "ap_bruiser" : secondary === "Tank" ? "tank" : "bruiser";
  return info.magic > info.attack ? "mage_burst" : "bruiser";
}

function defaultDamage(a: Archetype): DamageType {
  return AP_ARCHETYPES.includes(a) ? "ap" : "ad";
}

interface DDChampion {
  id: string;
  key: string;
  name: string;
  tags: string[];
  info: { attack: number; defense: number; magic: number };
  stats: { attackrange: number };
  image: { full: string };
}

interface DDItem {
  name: string;
  description?: string;
  plaintext?: string;
  gold: { total: number; purchasable: boolean };
  tags?: string[];
  from?: string[];
  into?: string[];
  maps?: Record<string, boolean>;
  stats?: Record<string, number>;
  image: { full: string };
  depth?: number;
  requiredChampion?: string;
  requiredAlly?: string;
  inStore?: boolean;
}

export function buildChampion(c: DDChampion, version: string): Champion {
  const kb = CHAMPION_KB[c.id];
  const archetype = kb?.a ?? guessArchetype(c.tags, c.info);
  return {
    id: c.id,
    key: Number(c.key),
    name: c.name,
    tags: c.tags,
    archetype,
    damage: kb?.d ?? defaultDamage(archetype),
    ranged: kb?.r ?? c.stats.attackrange >= 325,
    traits: { heal: kb?.heal ?? 0, shield: kb?.shield ?? 0, cc: kb?.cc ?? 0, suppress: kb?.sup },
    icon: `${DD}/cdn/${version}/img/champion/${c.image.full}`,
  };
}

/** Arena (Rings of Wrath) map id in Data Dragon `maps`. */
export const ARENA_MAP = "30";
/** Arena copies of regular items use the regular id + 220000 (Infinity Edge 3031 → 223031). */
export const ARENA_COPY_OFFSET = 220000;
/** Arena-only Prismatic items live in this id range (Reaper's Toll 443090, Galeforce 446671, …). */
export const isArenaPrismaticId = (id: number) => id >= 440000 && id < 450000;

const sameName = (a?: string, b?: string) => !!a && !!b && norm(a) === norm(b);

export function buildItems(raw: Record<string, DDItem>, version: string): Map<number, Item> {
  const items = new Map<number, Item>();
  for (const [id, it] of Object.entries(raw)) {
    const nId = Number(id);
    const onArena = it.maps?.[ARENA_MAP] === true;
    // Arena-only Prismatic items are kept (flagged arena-only); other ids >= 200000 are mode copies.
    const prismatic = isArenaPrismaticId(nId) && onArena && it.gold.purchasable && it.inStore !== false && !!it.name;
    // Skip champion-specific / ornn upgrades / non-store variants (ids >= 200000 are mode copies).
    if (it.requiredChampion || it.requiredAlly || it.inStore === false || (nId >= 200000 && !prismatic)) continue;
    const aram = prismatic ? it.maps?.["12"] === true : it.maps?.["12"] !== false;
    const sr = prismatic ? it.maps?.["11"] === true : it.maps?.["11"] !== false;
    const copy = raw[String(nId + ARENA_COPY_OFFSET)];
    const arena = onArena || (!!copy && copy.maps?.[ARENA_MAP] === true && sameName(copy.name, it.name));
    const into = (it.into ?? []).map(Number);
    const tags = it.tags ?? [];
    items.set(nId, {
      id: nId,
      name: it.name,
      cost: it.gold.total,
      icon: `${DD}/cdn/${version}/img/item/${it.image.full}`,
      from: (it.from ?? []).map(Number),
      into,
      tags,
      stats: it.stats ?? {},
      aram,
      sr,
      ...(arena ? { arena } : {}),
      completed: prismatic || (it.gold.purchasable && (into.length === 0 || tags.includes("Boots")) && it.gold.total >= 900),
      plaintext: it.plaintext ?? "",
      ...parseItemDescription(it.description ?? ""),
    });
  }
  return items;
}

/** Index items by name; prefer the variant available on the given map, then the lowest id. */
export function indexItemsByName(items: Map<number, Item>, map: ItemMap = "aram"): Map<string, Item> {
  const byName = new Map<string, Item>();
  const on = (it: Item) => it[map] === true;
  for (const it of items.values()) {
    const k = norm(it.name);
    const cur = byName.get(k);
    const better = !cur || (on(it) && !on(cur)) || (on(it) === on(cur) && it.id < cur.id);
    if (better) byName.set(k, it);
  }
  return byName;
}

/** Which map's item pool recommendations use (Summoner's Rift, Howling Abyss or Arena's Rings of Wrath). */
export type ItemMap = "aram" | "sr" | "arena";
let activeMap: ItemMap = "aram";
export function setItemMap(map: ItemMap) {
  activeMap = map;
}
export function getItemMap(): ItemMap {
  return activeMap;
}
/** Item pool for a game mode ("sr" → Summoner's Rift, "arena" → Arena, everything else → ARAM). */
export function itemMapFor(mode: string | undefined): ItemMap {
  return mode === "sr" ? "sr" : mode === "arena" ? "arena" : "aram";
}
/** Is this item purchasable on the active map? */
export function onMap(it: Item | undefined): it is Item {
  return !!it && (activeMap === "sr" ? it.sr : activeMap === "arena" ? it.arena === true : it.aram);
}

interface DDRuneTree {
  id: number;
  name: string;
  icon: string;
  slots: Array<{ runes: Array<{ id: number; name: string; icon: string; shortDesc?: string; longDesc?: string }> }>;
}

/** The summoner.json fields we use (description / cooldown are optional for older caches & fixtures). */
interface DDSummoner {
  key: string;
  name: string;
  image: { full: string };
  description?: string;
  cooldownBurn?: string;
  rangeBurn?: string;
  summonerLevel?: number;
}

export async function loadStaticData(onProgress?: (msg: string) => void): Promise<StaticData> {
  onProgress?.("Checking latest patch…");
  const versions = await fetchJson<string[]>(`${DD}/api/versions.json`, "versions.json", 6);
  const version = versions[0];
  onProgress?.(`Loading patch ${version} data…`);
  const base = `${DD}/cdn/${version}/data/en_US`;
  const [champs, items, runes, spells] = await Promise.all([
    fetchJson<{ data: Record<string, DDChampion> }>(`${base}/champion.json`, `champion-${version}.json`, 24 * 30),
    fetchJson<{ data: Record<string, DDItem> }>(`${base}/item.json`, `item-${version}.json`, 24 * 30),
    fetchJson<DDRuneTree[]>(`${base}/runesReforged.json`, `runes-${version}.json`, 24 * 30).catch(() => [] as DDRuneTree[]),
    fetchJson<{ data: Record<string, DDSummoner> }>(
      `${base}/summoner.json`,
      `summoner-${version}.json`,
      24 * 30,
    ).catch(() => ({ data: {} })),
  ]);
  return assembleStaticData(version, champs.data, items.data, runes, spells.data);
}

export function assembleStaticData(
  version: string,
  champs: Record<string, DDChampion>,
  items: Record<string, DDItem>,
  runeTrees: DDRuneTree[],
  spells: Record<string, DDSummoner>,
): StaticData {
  const champions = Object.values(champs).map((c) => buildChampion(c, version)).sort((a, b) => a.name.localeCompare(b.name));
  const championsById = new Map(champions.map((c) => [c.id, c]));
  const championsByName = new Map<string, Champion>();
  for (const c of champions) {
    championsByName.set(norm(c.name), c);
    championsByName.set(norm(c.id), c);
  }
  const itemMap = buildItems(items, version);

  const runeMap = new Map<number, Rune>();
  for (const tree of runeTrees) {
    runeMap.set(tree.id, { id: tree.id, name: tree.name, icon: `${DD}/cdn/img/${tree.icon}` });
    tree.slots.forEach((slot, si) => {
      for (const r of slot.runes)
        runeMap.set(r.id, {
          id: r.id,
          name: r.name,
          icon: `${DD}/cdn/img/${r.icon}`,
          tree: tree.name,
          slot: si,
          ...(r.shortDesc ? { shortDesc: r.shortDesc } : {}),
          ...(r.longDesc ? { longDesc: r.longDesc } : {}),
        });
    });
  }
  const spellMap = new Map<number, SummonerSpell>();
  for (const s of Object.values(spells)) {
    const id = Number(s.key);
    const range = s.rangeBurn && Number(s.rangeBurn) > 0 && Number(s.rangeBurn) < 25000 ? s.rangeBurn : undefined;
    spellMap.set(id, {
      id,
      name: s.name,
      icon: `${DD}/cdn/${version}/img/spell/${s.image.full}`,
      ...(s.description ? { description: cleanGameText(s.description) } : {}),
      ...(s.cooldownBurn ? { cooldown: s.cooldownBurn } : {}),
      ...(range ? { range } : {}),
      ...(s.summonerLevel ? { summonerLevel: s.summonerLevel } : {}),
    });
  }

  return {
    version,
    champions,
    championsById,
    championsByName,
    championsByKey: new Map(champions.map((c) => [c.key, c])),
    items: itemMap,
    itemsByName: indexItemsByName(itemMap, "aram"),
    itemsByNameSr: indexItemsByName(itemMap, "sr"),
    itemsByNameArena: indexItemsByName(itemMap, "arena"),
    runes: runeMap,
    spells: spellMap,
  };
}

export function findChampion(data: StaticData, nameOrId: string): Champion | undefined {
  return data.championsByName.get(norm(nameOrId));
}

export function findItem(data: StaticData, name: string): Item | undefined {
  const it = (activeMap === "sr" ? data.itemsByNameSr : activeMap === "arena" ? (data.itemsByNameArena ?? data.itemsByName) : data.itemsByName).get(norm(name));
  return onMap(it) ? it : undefined;
}

// --------------------------------------------------------------- descriptions

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(li|p|mainText|stats)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Turn Data Dragon item HTML into stat lines + named effects (passives/actives). */
export function parseItemDescription(html: string): { statLines: string[]; effects: Array<{ name: string; text: string }> } {
  if (!html) return { statLines: [], effects: [] };
  const statsHtml = /<stats>([\s\S]*?)<\/stats>/i.exec(html)?.[1] ?? "";
  const statLines = stripTags(statsHtml)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rest = html.replace(/<stats>[\s\S]*?<\/stats>/i, "");
  const effects: Array<{ name: string; text: string }> = [];
  const re = /<(passive|active|unique|rarityMythic|rarityLegendary)>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:passive|active|unique)>|<\/li>|<\/mainText>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    const name = stripTags(m[2]).replace(/:$/, "");
    const text = stripTags(m[3]).replace(/^[:\s]+/, "").replace(/\n+/g, " ").trim();
    if (name && text) effects.push({ name: m[1].toLowerCase() === "active" ? `Active – ${name}` : name, text });
  }
  if (!effects.length) {
    const text = stripTags(rest).replace(/\n+/g, " ").trim();
    if (text) effects.push({ name: "", text });
  }
  return { statLines, effects };
}

interface DDChampionDetail {
  data: Record<
    string,
    {
      partype?: string;
      passive: { name: string; description: string; image: { full: string } };
      spells: Array<DDSpellLike & { name: string; description: string; maxrank?: number; image: { full: string } }>;
    }
  >;
}

const spellCache = new Map<string, Promise<ChampionSpell[]>>();

/** Passive + Q/W/E/R names, icons and descriptions for one champion (lazy, cached). */
export function loadChampionSpells(version: string, championId: string): Promise<ChampionSpell[]> {
  const key = `${version}/${championId}`;
  let p = spellCache.get(key);
  if (!p) {
    p = fetchJson<DDChampionDetail>(`${DD}/cdn/${version}/data/en_US/champion/${championId}.json`, `champ-${version}-${championId}.json`, 24 * 30)
      .then((d) => {
        const c = d.data[championId];
        if (!c) return [];
        const keys: ChampionSpell["key"][] = ["Q", "W", "E", "R"];
        const resource = c.partype && c.partype !== "None" ? c.partype : undefined;
        return [
          {
            key: "P" as const,
            name: c.passive.name,
            icon: `${DD}/cdn/${version}/img/passive/${c.passive.image.full}`,
            description: cleanGameText(c.passive.description),
            detail: { description: c.passive.description },
          },
          ...c.spells.slice(0, 4).map((sp, i): ChampionSpell => {
            const detail: DDSpellLike = {
              tooltip: sp.tooltip,
              description: sp.description,
              cooldown: sp.cooldown,
              cooldownBurn: sp.cooldownBurn,
              cost: sp.cost,
              costBurn: sp.costBurn,
              costType: sp.costType,
              resource: sp.resource,
              range: sp.range,
              rangeBurn: sp.rangeBurn,
              maxammo: sp.maxammo,
              effectBurn: sp.effectBurn,
              datavalues: sp.datavalues,
              vars: sp.vars,
            };
            const cd = sp.cooldownBurn && sp.cooldownBurn !== "0" ? sp.cooldownBurn : undefined;
            const cost = abilityCost(detail, resource);
            const range = abilityRange(detail);
            return {
              key: keys[i],
              name: sp.name,
              icon: `${DD}/cdn/${version}/img/spell/${sp.image.full}`,
              description: cleanGameText(sp.description),
              ...(cd ? { cooldown: cd } : {}),
              ...(cost ? { cost } : {}),
              ...(range ? { range } : {}),
              ...(sp.maxrank ? { maxRank: sp.maxrank } : {}),
              ...(resource ? { resource } : {}),
              detail,
            };
          }),
        ];
      })
      .catch(() => {
        spellCache.delete(key);
        return [];
      });
    spellCache.set(key, p);
  }
  return p;
}
