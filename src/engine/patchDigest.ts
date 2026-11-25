// "What changed for you": Data Dragon differences between two patches for your favorite champions
// (base stats, ability cooldowns / costs) and the items you build (cost, stats). Riot's patch notes
// cover more (ability damage, reworks); this is the part the game data shows reliably.

export interface Change {
  label: string;
  from: number;
  to: number;
  /** true = better for whoever uses it (buff), false = nerf. */
  buff: boolean;
}

export interface DigestEntry {
  id: string;
  name: string;
  kind: "champion" | "item";
  changes: Change[];
}

/** Minimal Data Dragon shapes (champion/<Id>.json and item.json). */
export interface DDChampionDetailLite {
  id: string;
  name: string;
  stats?: Record<string, number>;
  spells?: Array<{ name: string; cooldown?: number[]; cost?: number[] }>;
}
export interface DDItemLite {
  name: string;
  gold?: { total?: number };
  stats?: Record<string, number>;
}

const STAT_LABEL: Record<string, string> = {
  hp: "Base health",
  hpperlevel: "Health per level",
  mp: "Base mana",
  armor: "Base armor",
  armorperlevel: "Armor per level",
  spellblock: "Base magic resist",
  attackdamage: "Base attack damage",
  attackdamageperlevel: "Attack damage per level",
  attackspeedperlevel: "Attack speed per level",
  movespeed: "Move speed",
  hpregen: "Health regen",
  attackrange: "Attack range",
};

const ITEM_STAT_LABEL: Record<string, string> = {
  FlatHPPoolMod: "Health",
  FlatMPPoolMod: "Mana",
  FlatArmorMod: "Armor",
  FlatSpellBlockMod: "Magic resist",
  FlatPhysicalDamageMod: "Attack damage",
  FlatMagicDamageMod: "Ability power",
  PercentAttackSpeedMod: "Attack speed",
  FlatCritChanceMod: "Crit chance",
  PercentMovementSpeedMod: "Move speed %",
  FlatMovementSpeedMod: "Move speed",
  PercentLifeStealMod: "Life steal",
};

const SLOT = ["Q", "W", "E", "R"];
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const round = (x: number) => Math.round(x * 1000) / 1000;

export function diffChampion(prev: DDChampionDetailLite, cur: DDChampionDetailLite): DigestEntry {
  const changes: Change[] = [];
  for (const [k, label] of Object.entries(STAT_LABEL)) {
    const a = prev.stats?.[k];
    const b = cur.stats?.[k];
    if (typeof a === "number" && typeof b === "number" && !same(a, b)) changes.push({ label, from: round(a), to: round(b), buff: b > a });
  }
  (cur.spells ?? []).forEach((sp, i) => {
    const old = prev.spells?.[i];
    if (!old) return;
    const key = SLOT[i] ?? sp.name;
    // Compare at max rank (the last value) — that's what decides the late game.
    const cdA = old.cooldown?.at(-1);
    const cdB = sp.cooldown?.at(-1);
    if (typeof cdA === "number" && typeof cdB === "number" && !same(cdA, cdB)) changes.push({ label: `${key} cooldown`, from: cdA, to: cdB, buff: cdB < cdA });
    const cA = old.cost?.at(-1);
    const cB = sp.cost?.at(-1);
    if (typeof cA === "number" && typeof cB === "number" && !same(cA, cB)) changes.push({ label: `${key} cost`, from: cA, to: cB, buff: cB < cA });
  });
  return { id: cur.id, name: cur.name, kind: "champion", changes };
}

export function diffItem(id: string, prev: DDItemLite, cur: DDItemLite): DigestEntry {
  const changes: Change[] = [];
  const ga = prev.gold?.total;
  const gb = cur.gold?.total;
  if (typeof ga === "number" && typeof gb === "number" && ga !== gb) changes.push({ label: "Cost", from: ga, to: gb, buff: gb < ga });
  const keys = new Set([...Object.keys(prev.stats ?? {}), ...Object.keys(cur.stats ?? {})]);
  for (const k of keys) {
    const label = ITEM_STAT_LABEL[k];
    if (!label) continue;
    const a = prev.stats?.[k] ?? 0;
    const b = cur.stats?.[k] ?? 0;
    if (!same(a, b)) changes.push({ label, from: round(a), to: round(b), buff: b > a });
  }
  return { id, name: cur.name, kind: "item", changes };
}

/** Major.minor of a Data Dragon version ("16.23.1" → "16.23"). */
export const patchOf = (v: string) => v.split(".").slice(0, 2).join(".");

/** The previous patch (different major.minor) in Data Dragon's newest-first version list. */
export function previousVersion(versions: string[], current: string): string | undefined {
  const cur = patchOf(current);
  return versions.find((v) => /^\d+\.\d+\.\d+$/.test(v) && patchOf(v) !== cur && v.localeCompare(current, undefined, { numeric: true }) < 0);
}
