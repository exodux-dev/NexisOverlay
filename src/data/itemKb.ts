// Curated item knowledge used by the build engine.
//
// Items are referenced by NAME and resolved against Data Dragon at runtime, so a
// patch that renames/removes an item never breaks the app: unresolved names are
// skipped and the next candidate is used instead. Order inside lists = preference.

import type { Archetype } from "../engine/types";

/** Template builds per archetype. `core` = first three items, `flex` = late/flex slots. */
export const ARCHETYPE_BUILDS: Record<Archetype, { core: string[]; flex: string[] }> = {
  mage_burst: {
    core: ["Luden's Echo", "Shadowflame", "Rabadon's Deathcap"],
    flex: ["Void Staff", "Zhonya's Hourglass", "Rite of Ruin", "Banshee's Veil", "Stormsurge", "Horizon Focus"],
  },
  mage_poke: {
    core: ["Luden's Echo", "Horizon Focus", "Rabadon's Deathcap"],
    flex: ["Shadowflame", "Void Staff", "Actualizer", "Malignance", "Rite of Ruin", "Zhonya's Hourglass", "Banshee's Veil"],
  },
  mage_dps: {
    core: ["Liandry's Torment", "Rylai's Crystal Scepter", "Rabadon's Deathcap"],
    flex: ["Void Staff", "Bloodletter's Curse", "Zhonya's Hourglass", "Cryptbloom", "Blackfire Torch", "Banshee's Veil"],
  },
  ap_assassin: {
    core: ["Stormsurge", "Shadowflame", "Rabadon's Deathcap"],
    flex: ["Zhonya's Hourglass", "Void Staff", "Hextech Gunblade", "Banshee's Veil", "Lich Bane", "Hextech Rocketbelt"],
  },
  ap_bruiser: {
    core: ["Riftmaker", "Liandry's Torment", "Zhonya's Hourglass"],
    flex: ["Rabadon's Deathcap", "Bloodletter's Curse", "Dusk and Dawn", "Void Staff", "Cosmic Drive", "Banshee's Veil"],
  },
  ap_onhit: {
    core: ["Nashor's Tooth", "Riftmaker", "Rabadon's Deathcap"],
    flex: ["Dusk and Dawn", "Shadowflame", "Void Staff", "Lich Bane", "Zhonya's Hourglass", "Banshee's Veil"],
  },
  adc_crit: {
    core: ["Yun Tal Wildarrows", "Infinity Edge", "Phantom Dancer"],
    flex: ["Lord Dominik's Regards", "Bloodthirster", "Fiendhunter Bolts", "Hexoptics C44", "Rapid Firecannon", "Stormrazor", "Navori Flickerblade"],
  },
  adc_onhit: {
    core: ["Blade of the Ruined King", "Guinsoo's Rageblade", "Kraken Slayer"],
    flex: ["Wit's End", "Terminus", "Runaan's Hurricane", "Lord Dominik's Regards", "Bloodthirster"],
  },
  adc_caster: {
    core: ["Essence Reaver", "Navori Flickerblade", "Infinity Edge"],
    flex: ["Lord Dominik's Regards", "Bloodthirster", "Serylda's Grudge", "Fiendhunter Bolts", "Mercurial Scimitar"],
  },
  ad_assassin: {
    core: ["Profane Hydra", "Youmuu's Ghostblade", "Hubris"],
    flex: ["Serylda's Grudge", "Edge of Night", "Axiom Arc", "Spectral Cutlass", "The Collector"],
  },
  bruiser: {
    core: ["Black Cleaver", "Sundered Sky", "Sterak's Gage"],
    flex: ["Death's Dance", "Endless Hunger", "Overlord's Bloodmail", "Spirit Visage", "Maw of Malmortius", "Trinity Force"],
  },
  tank: {
    core: ["Sunfire Aegis", "Thornmail", "Kaenic Rookern"],
    flex: ["Jak'Sho, The Protean", "Unending Despair", "Randuin's Omen", "Protoplasm Harness", "Warmog's Armor", "Force of Nature", "Frozen Heart"],
  },
  enchanter: {
    core: ["Moonstone Renewer", "Redemption", "Staff of Flowing Water"],
    flex: ["Echoes of Helia", "Dawncore", "Ardent Censer", "Imperial Mandate", "Bandlepipes", "Mikael's Blessing", "Locket of the Iron Solari"],
  },
};

/** Champion-specific core overrides where the archetype template is clearly wrong. */
export const CHAMPION_BUILDS: Record<string, { core: string[]; flex?: string[] }> = {
  Ezreal: { core: ["Trinity Force", "Manamune", "Serylda's Grudge"], flex: ["Blade of the Ruined King", "Lord Dominik's Regards", "Bloodthirster"] },
  Jax: { core: ["Blade of the Ruined King", "Trinity Force", "Sterak's Gage"] },
  Gangplank: { core: ["Trinity Force", "Essence Reaver", "Infinity Edge"] },
  Kaisa: { core: ["Kraken Slayer", "Guinsoo's Rageblade", "Nashor's Tooth"] },
  Shyvana: { core: ["Nashor's Tooth", "Riftmaker", "Liandry's Torment"] },
  Jayce: { core: ["Youmuu's Ghostblade", "Hubris", "Serylda's Grudge"] },
  Varus: { core: ["Youmuu's Ghostblade", "Hubris", "Serylda's Grudge"] },
  Kassadin: { core: ["Rod of Ages", "Archangel's Staff", "Rabadon's Deathcap"] },
  Ryze: { core: ["Rod of Ages", "Archangel's Staff", "Rabadon's Deathcap"] },
  Kayn: { core: ["Black Cleaver", "Sundered Sky", "Sterak's Gage"] },
  MasterYi: { core: ["Blade of the Ruined King", "Guinsoo's Rageblade", "Wit's End"] },
  Galio: { core: ["Hollow Radiance", "Riftmaker", "Kaenic Rookern"] },
  Malphite: { core: ["Sunfire Aegis", "Thornmail", "Kaenic Rookern"] },
  Seraphine: { core: ["Luden's Echo", "Shadowflame", "Rabadon's Deathcap"] },
  Karma: { core: ["Luden's Echo", "Shadowflame", "Rabadon's Deathcap"] },
  Corki: { core: ["Trinity Force", "Infinity Edge", "Navori Flickerblade"] },
  Twitch: { core: ["Blade of the Ruined King", "Guinsoo's Rageblade", "Kraken Slayer"] },
  Ashe: { core: ["Blade of the Ruined King", "Guinsoo's Rageblade", "Kraken Slayer"] },
  Vladimir: { core: ["Riftmaker", "Cosmic Drive", "Rabadon's Deathcap"] },
  Swain: { core: ["Liandry's Torment", "Riftmaker", "Rylai's Crystal Scepter"] },
  Sion: { core: ["Heartsteel", "Sunfire Aegis", "Thornmail"] },
  Chogath: { core: ["Heartsteel", "Sunfire Aegis", "Thornmail"] },
  Nasus: { core: ["Trinity Force", "Sterak's Gage", "Spirit Visage"] },
  Yasuo: { core: ["Yun Tal Wildarrows", "Infinity Edge", "Immortal Shieldbow"] },
  Yone: { core: ["Yun Tal Wildarrows", "Infinity Edge", "Immortal Shieldbow"] },
};

export type BootsName =
  | "Sorcerer's Shoes"
  | "Berserker's Greaves"
  | "Plated Steelcaps"
  | "Mercury's Treads"
  | "Ionian Boots of Lucidity"
  | "Boots of Swiftness";

export const ALL_BOOTS: BootsName[] = [
  "Sorcerer's Shoes",
  "Berserker's Greaves",
  "Plated Steelcaps",
  "Mercury's Treads",
  "Ionian Boots of Lucidity",
  "Boots of Swiftness",
];

/** Broad family used to decide which situational items an archetype can use. */
export type Family = "ap" | "adc" | "lethality" | "bruiser" | "tank" | "enchanter";

export const FAMILY: Record<Archetype, Family> = {
  mage_burst: "ap",
  mage_poke: "ap",
  mage_dps: "ap",
  ap_assassin: "ap",
  ap_bruiser: "ap",
  ap_onhit: "ap",
  adc_crit: "adc",
  adc_onhit: "adc",
  adc_caster: "adc",
  ad_assassin: "lethality",
  bruiser: "bruiser",
  tank: "tank",
  enchanter: "enchanter",
};

export type Counter =
  | "antiheal"
  | "antishield"
  | "armorpen"
  | "magicpen"
  | "antitank"
  | "armor"
  | "mr"
  | "antiburst_ad"
  | "antiburst_ap"
  | "anticrit"
  | "antias"
  | "cleanse";

/**
 * Situational answers per threat & family. First resolvable item wins.
 * Families missing from a counter simply have no item answer for it.
 */
export const COUNTER_ITEMS: Record<Counter, Partial<Record<Family, string[]>>> = {
  antiheal: {
    ap: ["Morellonomicon"],
    adc: ["Mortal Reminder"],
    lethality: ["Chempunk Chainsword"],
    bruiser: ["Chempunk Chainsword"],
    tank: ["Thornmail"],
    enchanter: ["Morellonomicon"],
  },
  antishield: { lethality: ["Serpent's Fang"], bruiser: ["Serpent's Fang"], adc: ["Serpent's Fang"] },
  armorpen: {
    adc: ["Lord Dominik's Regards"],
    lethality: ["Serylda's Grudge"],
    bruiser: ["Black Cleaver", "Serylda's Grudge"],
  },
  magicpen: { ap: ["Void Staff", "Bloodletter's Curse", "Cryptbloom"] },
  antitank: {
    ap: ["Liandry's Torment", "Void Staff"],
    adc: ["Blade of the Ruined King", "Lord Dominik's Regards"],
    bruiser: ["Black Cleaver", "Blade of the Ruined King"],
    lethality: ["Serylda's Grudge"],
    tank: ["Heartsteel"],
  },
  armor: {
    ap: ["Zhonya's Hourglass"],
    adc: ["Immortal Shieldbow", "Death's Dance"],
    lethality: ["Edge of Night", "Death's Dance"],
    bruiser: ["Death's Dance", "Randuin's Omen"],
    tank: ["Randuin's Omen", "Dead Man's Plate", "Frozen Heart"],
    enchanter: ["Locket of the Iron Solari", "Knight's Vow"],
  },
  mr: {
    ap: ["Banshee's Veil"],
    adc: ["Wit's End", "Maw of Malmortius", "Mercurial Scimitar"],
    lethality: ["Maw of Malmortius", "Edge of Night"],
    bruiser: ["Maw of Malmortius", "Spirit Visage", "Kaenic Rookern"],
    tank: ["Force of Nature", "Kaenic Rookern", "Spirit Visage", "Abyssal Mask"],
    enchanter: ["Mikael's Blessing", "Locket of the Iron Solari"],
  },
  antiburst_ad: {
    ap: ["Zhonya's Hourglass"],
    adc: ["Immortal Shieldbow", "Mercurial Scimitar"],
    lethality: ["Edge of Night", "Spectral Cutlass"],
    bruiser: ["Death's Dance", "Sterak's Gage"],
    enchanter: ["Locket of the Iron Solari"],
  },
  antiburst_ap: {
    ap: ["Banshee's Veil"],
    adc: ["Maw of Malmortius", "Immortal Shieldbow"],
    lethality: ["Edge of Night", "Maw of Malmortius"],
    bruiser: ["Maw of Malmortius", "Sterak's Gage"],
    enchanter: ["Mikael's Blessing"],
  },
  anticrit: { tank: ["Randuin's Omen"], bruiser: ["Randuin's Omen"] },
  antias: { tank: ["Frozen Heart"], bruiser: ["Frozen Heart"] },
  cleanse: { adc: ["Mercurial Scimitar"], lethality: ["Mercurial Scimitar"], enchanter: ["Mikael's Blessing"] },
};

/** Items whose presence on an enemy raises a threat (on top of champion traits). */
export const ENEMY_ITEM_SIGNALS: Record<string, Partial<Record<"heal" | "shield" | "armor" | "mr" | "hp", number>>> = {
  Bloodthirster: { heal: 1 },
  "Ravenous Hydra": { heal: 1 },
  "Spirit Visage": { heal: 1, mr: 1 },
  "Sundered Sky": { heal: 1 },
  "Death's Dance": { heal: 0.5, armor: 1 },
  "Moonstone Renewer": { heal: 1 },
  Redemption: { heal: 1 },
  "Echoes of Helia": { heal: 1 },
  "Staff of Flowing Water": { heal: 0.5 },
  "Warmog's Armor": { heal: 0.5, hp: 1 },
  "Riftmaker": { heal: 0.5 },
  "Immortal Shieldbow": { shield: 1 },
  "Sterak's Gage": { shield: 1 },
  "Locket of the Iron Solari": { shield: 1 },
  "Seraph's Embrace": { shield: 1 },
  "Eclipse": { shield: 0.5 },
  "Thornmail": { armor: 1 },
  "Randuin's Omen": { armor: 1, hp: 0.5 },
  "Frozen Heart": { armor: 1 },
  "Dead Man's Plate": { armor: 1, hp: 0.5 },
  "Plated Steelcaps": { armor: 0.5 },
  "Force of Nature": { mr: 1, hp: 0.5 },
  "Kaenic Rookern": { mr: 1, shield: 0.5 },
  "Banshee's Veil": { mr: 1 },
  "Mercury's Treads": { mr: 0.5 },
  "Maw of Malmortius": { mr: 1, shield: 0.5 },
  "Heartsteel": { hp: 1.5 },
  "Sunfire Aegis": { armor: 0.5, hp: 0.5 },
  "Jak'Sho, The Protean": { armor: 1, mr: 1 },
  "Unending Despair": { heal: 0.7, armor: 1, hp: 0.5 },
  "Endless Hunger": { heal: 0.8 },
  "Protoplasm Harness": { heal: 0.6, hp: 1 },
  "Overlord's Bloodmail": { hp: 1 },
  "Atma's Reckoning": { hp: 1 },
  "Hextech Gunblade": { heal: 0.5 },
  "Dusk and Dawn": { heal: 0.4 },
};
