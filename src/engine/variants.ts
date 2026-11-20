// Build styles ("variants"): alternative ways to build a champion, e.g. Lethality / On-hit / AP Varus.
// Picking a variant swaps the champion's effective archetype + damage type, which changes the
// item build, situational answers, boots and augment scoring.

import type { Archetype, Champion, DamageType } from "./types";

export interface BuildVariant {
  id: string;
  label: string;
  archetype: Archetype;
  damage?: DamageType;
  /** Optional explicit core (item names). Otherwise the archetype template is used. */
  core?: string[];
  flex?: string[];
  blurb?: string;
}

const V = (id: string, label: string, archetype: Archetype, extra: Partial<BuildVariant> = {}): BuildVariant => ({
  id,
  label,
  archetype,
  ...extra,
});

/** Curated alternatives for flexible champions. The first entry is the default. */
const CURATED: Record<string, BuildVariant[]> = {
  Kayn: [
    V("red", "Rhaast (red)", "bruiser", { damage: "ad", core: ["Black Cleaver", "Sundered Sky", "Sterak's Gage"], blurb: "Drain tank — vs melee/tanky comps" }),
    V("blue", "Shadow Assassin (blue)", "ad_assassin", { damage: "ad", core: ["Youmuu's Ghostblade", "Profane Hydra", "Hubris"], blurb: "Backline assassin — vs ranged/squishy comps" }),
  ],
  Varus: [
    V("lethality", "Lethality", "ad_assassin", { core: ["Youmuu's Ghostblade", "Hubris", "Serylda's Grudge"], blurb: "Long-range Q poke" }),
    V("onhit", "On-hit", "adc_onhit", { core: ["Blade of the Ruined King", "Guinsoo's Rageblade", "Terminus"], blurb: "W stacks, sustained DPS" }),
    V("ap", "Full AP", "mage_poke", { damage: "ap", core: ["Luden's Echo", "Shadowflame", "Rabadon's Deathcap"], blurb: "Magic Q/E burst" }),
  ],
  Ezreal: [
    V("trinity", "Trinity / Manamune", "adc_caster", { core: ["Trinity Force", "Manamune", "Serylda's Grudge"] }),
    V("lethality", "Lethality", "ad_assassin", { core: ["Youmuu's Ghostblade", "Hubris", "Serylda's Grudge"] }),
    V("ap", "Full AP", "mage_burst", { damage: "ap", core: ["Luden's Echo", "Shadowflame", "Rabadon's Deathcap"] }),
  ],
  Kaisa: [
    V("hybrid", "Hybrid on-hit", "adc_onhit", { damage: "mixed", core: ["Kraken Slayer", "Guinsoo's Rageblade", "Nashor's Tooth"] }),
    V("ap", "Full AP", "ap_assassin", { damage: "ap", core: ["Nashor's Tooth", "Stormsurge", "Rabadon's Deathcap"] }),
    V("crit", "AD crit", "adc_crit", { core: ["Yun Tal Wildarrows", "Infinity Edge", "Phantom Dancer"] }),
  ],
  Kayle: [
    V("ap", "AP on-hit", "ap_onhit"),
    V("ad", "AD on-hit", "adc_onhit", { damage: "ad", core: ["Blade of the Ruined King", "Guinsoo's Rageblade", "Kraken Slayer"] }),
  ],
  Corki: [
    V("ad", "AD caster", "adc_caster", { core: ["Trinity Force", "Infinity Edge", "Navori Flickerblade"] }),
    V("ap", "Full AP", "mage_poke", { damage: "ap" }),
  ],
  Jax: [
    V("hybrid", "On-hit fighter", "bruiser", { damage: "mixed", core: ["Blade of the Ruined King", "Trinity Force", "Sterak's Gage"] }),
    V("ap", "AP Jax", "ap_bruiser", { damage: "ap", core: ["Nashor's Tooth", "Riftmaker", "Zhonya's Hourglass"] }),
  ],
  Shyvana: [
    V("ap", "AP burn", "ap_bruiser", { damage: "ap", core: ["Nashor's Tooth", "Riftmaker", "Liandry's Torment"] }),
    V("ad", "AD fighter", "bruiser", { damage: "ad" }),
  ],
  Malphite: [V("tank", "Tank", "tank"), V("ap", "AP one-shot", "mage_burst", { damage: "ap", core: ["Luden's Echo", "Rabadon's Deathcap", "Void Staff"] })],
  Sion: [V("tank", "Heartsteel tank", "tank"), V("ad", "AD bruiser", "bruiser", { damage: "ad" })],
  Galio: [V("aptank", "AP tank", "tank", { damage: "ap" }), V("ap", "Full AP", "mage_burst", { damage: "ap" })],
  TwistedFate: [V("ap", "AP", "mage_burst"), V("ad", "AD on-hit", "adc_onhit", { damage: "ad" })],
  Teemo: [V("onhit", "AP on-hit", "ap_onhit"), V("dot", "Liandry's shrooms", "mage_dps", { damage: "ap" })],
  Gragas: [V("ap", "AP bruiser", "ap_bruiser"), V("burst", "AP burst", "mage_burst", { damage: "ap" }), V("tank", "Tank", "tank", { damage: "ap" })],
  KogMaw: [V("onhit", "AD on-hit", "adc_onhit"), V("ap", "Full AP", "mage_dps", { damage: "ap" })],
  Akali: [V("burst", "AP burst", "ap_assassin"), V("bruiser", "Riftmaker bruiser", "ap_bruiser", { damage: "ap" })],
  Diana: [V("burst", "AP burst", "ap_assassin"), V("bruiser", "AP bruiser", "ap_bruiser", { damage: "ap" })],
  Ekko: [V("burst", "AP burst", "ap_assassin"), V("bruiser", "AP bruiser", "ap_bruiser", { damage: "ap" })],
  Amumu: [V("tank", "Tank", "tank"), V("ap", "AP damage", "mage_dps", { damage: "ap" })],
  Zac: [V("tank", "Tank", "tank"), V("ap", "AP damage", "ap_bruiser", { damage: "ap" })],
  Nunu: [V("tank", "Tank", "tank"), V("ap", "AP damage", "mage_dps", { damage: "ap" })],
  Volibear: [V("bruiser", "Bruiser", "bruiser"), V("ap", "AP", "ap_bruiser", { damage: "ap" }), V("tank", "Tank", "tank")],
  Senna: [V("crit", "Crit", "adc_crit"), V("lethality", "Lethality", "ad_assassin"), V("support", "Enchanter", "enchanter", { damage: "ad" })],
  Lux: [V("burst", "AP burst", "mage_burst"), V("poke", "Poke", "mage_poke"), V("support", "Enchanter", "enchanter")],
  Karma: [V("ap", "AP poke", "mage_poke"), V("support", "Enchanter", "enchanter")],
  Seraphine: [V("ap", "AP", "mage_burst"), V("support", "Enchanter", "enchanter")],
  Sona: [V("support", "Enchanter", "enchanter"), V("ap", "AP damage", "mage_burst", { damage: "ap" })],
  Nami: [V("support", "Enchanter", "enchanter"), V("ap", "AP damage", "mage_burst", { damage: "ap" })],
  Lulu: [V("support", "Enchanter", "enchanter"), V("ap", "AP damage", "mage_burst", { damage: "ap" })],
  Graves: [V("lethality", "Lethality", "ad_assassin"), V("crit", "Crit", "adc_crit")],
  Caitlyn: [V("crit", "Crit", "adc_crit"), V("lethality", "Lethality", "ad_assassin")],
  Jhin: [V("crit", "Crit", "adc_crit"), V("lethality", "Lethality", "ad_assassin")],
  MissFortune: [V("crit", "Crit", "adc_crit"), V("lethality", "Lethality", "ad_assassin")],
  Draven: [V("crit", "Crit", "adc_crit"), V("lethality", "Lethality", "ad_assassin")],
  MasterYi: [V("onhit", "On-hit", "adc_onhit"), V("crit", "Crit", "adc_crit")],
  Ashe: [V("onhit", "On-hit", "adc_onhit"), V("crit", "Crit", "adc_crit")],
  Rengar: [V("lethality", "Lethality", "ad_assassin"), V("bruiser", "Bruiser", "bruiser")],
  Khazix: [V("lethality", "Lethality", "ad_assassin"), V("bruiser", "Bruiser", "bruiser")],
  Pantheon: [V("lethality", "Lethality", "ad_assassin"), V("bruiser", "Bruiser", "bruiser")],
  Vi: [V("bruiser", "Bruiser", "bruiser"), V("lethality", "Lethality", "ad_assassin")],
  Hecarim: [V("bruiser", "Bruiser", "bruiser"), V("lethality", "Lethality", "ad_assassin")],
  Garen: [V("bruiser", "Bruiser", "bruiser"), V("lethality", "Lethality", "ad_assassin")],
  Sett: [V("bruiser", "Bruiser", "bruiser"), V("tank", "Tank", "tank")],
  Nautilus: [V("tank", "Tank", "tank"), V("ap", "AP damage", "mage_burst", { damage: "ap" })],
  Rakan: [V("support", "Enchanter", "enchanter"), V("ap", "AP damage", "mage_burst", { damage: "ap" })],
};

/** Generic second option per archetype when a champion has no curated list. */
const GENERIC_ALT: Partial<Record<Archetype, (c: Champion) => BuildVariant | undefined>> = {
  tank: (c) => V("damage", "Damage tank", c.damage === "ad" ? "bruiser" : "ap_bruiser"),
  bruiser: () => V("tank", "Tank", "tank"),
  enchanter: () => V("ap", "AP damage", "mage_burst", { damage: "ap" }),
  mage_burst: () => V("dot", "Battle mage", "mage_dps"),
  mage_dps: () => V("burst", "Burst", "mage_burst"),
  mage_poke: () => V("burst", "Burst", "mage_burst"),
  ap_assassin: () => V("bruiser", "AP bruiser", "ap_bruiser"),
  ap_bruiser: () => V("burst", "AP burst", "ap_assassin"),
};

const PRIMARY_LABEL: Record<Archetype, string> = {
  mage_burst: "AP burst",
  mage_poke: "AP poke",
  mage_dps: "Battle mage",
  ap_assassin: "AP assassin",
  ap_bruiser: "AP bruiser",
  ap_onhit: "AP on-hit",
  adc_crit: "Crit",
  adc_onhit: "On-hit",
  adc_caster: "Caster ADC",
  ad_assassin: "Lethality",
  bruiser: "Bruiser",
  tank: "Tank",
  enchanter: "Enchanter",
};

export function variantsFor(champion: Champion): BuildVariant[] {
  const curated = CURATED[champion.id];
  if (curated) return curated;
  const primary = V("default", PRIMARY_LABEL[champion.archetype], champion.archetype);
  const alt = GENERIC_ALT[champion.archetype]?.(champion);
  return alt && alt.archetype !== primary.archetype ? [primary, alt] : [primary];
}

/** The champion as seen by the engine under a given build style. */
export function applyVariant(champion: Champion, variant: BuildVariant | undefined): Champion {
  if (!variant) return champion;
  const apArch: Archetype[] = ["mage_burst", "mage_poke", "mage_dps", "ap_assassin", "ap_bruiser", "ap_onhit"];
  const adArch: Archetype[] = ["adc_crit", "adc_onhit", "adc_caster", "ad_assassin", "bruiser"];
  const damage =
    variant.damage ??
    (variant.archetype === champion.archetype ? champion.damage : apArch.includes(variant.archetype) ? "ap" : adArch.includes(variant.archetype) ? "ad" : champion.damage);
  return { ...champion, archetype: variant.archetype, damage };
}

export function pickVariant(champion: Champion, chosen: string | undefined): BuildVariant {
  const list = variantsFor(champion);
  return list.find((v) => v.id === chosen) ?? list[0];
}
