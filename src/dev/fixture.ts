// Offline Data Dragon fixture.
//
// The sandbox / CI can't reach ddragon.leagueoflegends.com, so this module
// fabricates the raw Data Dragon JSON (champion.json, item.json,
// runesReforged.json, summoner.json, versions.json) in the exact shapes that
// `assembleStaticData` consumes, plus a realistic Live Client `allgamedata`
// payload. Used by unit tests and for browser screenshots / UI development.
//
// Ids are the real Riot ids where known; recipes and prices are close to the
// live game but not guaranteed exact — don't use this for anything gameplay-critical.

import { CHAMPION_KB } from "../data/championKb";
import { assembleStaticData } from "../engine/staticData";
import type { AllGameDataRaw } from "../engine/live";
import type { Archetype, StaticData } from "../engine/types";

export const FIXTURE_VERSION = "16.23.1";

// --------------------------------------------------------------- raw shapes (mirror staticData.ts)

export interface FixtureDDChampion {
  id: string;
  key: string;
  name: string;
  title: string;
  tags: string[];
  info: { attack: number; defense: number; magic: number; difficulty: number };
  stats: { attackrange: number };
  image: { full: string };
}

export interface FixtureDDItem {
  name: string;
  gold: { base: number; total: number; sell: number; purchasable: boolean };
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

export interface FixtureDDRuneTree {
  id: number;
  key: string;
  name: string;
  icon: string;
  slots: Array<{ runes: Array<{ id: number; key: string; name: string; icon: string }> }>;
}

export interface FixtureDDSpell {
  id: string;
  key: string;
  name: string;
  modes: string[];
  image: { full: string };
}

export interface FixtureRaw {
  version: string;
  champions: Record<string, FixtureDDChampion>;
  items: Record<string, FixtureDDItem>;
  runes: FixtureDDRuneTree[];
  spells: Record<string, FixtureDDSpell>;
}

// --------------------------------------------------------------- champions

/** Real Riot champion keys. Champions not listed get a unique key >= 2000. */
const CHAMPION_KEYS: Record<string, number> = {
  Annie: 1, Olaf: 2, Galio: 3, TwistedFate: 4, XinZhao: 5, Urgot: 6, Leblanc: 7, Vladimir: 8, Fiddlesticks: 9,
  Kayle: 10, MasterYi: 11, Alistar: 12, Ryze: 13, Sion: 14, Sivir: 15, Soraka: 16, Teemo: 17, Tristana: 18,
  Warwick: 19, Nunu: 20, MissFortune: 21, Ashe: 22, Tryndamere: 23, Jax: 24, Morgana: 25, Zilean: 26, Singed: 27,
  Evelynn: 28, Twitch: 29, Karthus: 30, Chogath: 31, Amumu: 32, Rammus: 33, Anivia: 34, Shaco: 35, DrMundo: 36,
  Sona: 37, Kassadin: 38, Irelia: 39, Janna: 40, Gangplank: 41, Corki: 42, Karma: 43, Taric: 44, Veigar: 45,
  Trundle: 48, Swain: 50, Caitlyn: 51, Blitzcrank: 53, Malphite: 54, Katarina: 55, Nocturne: 56, Maokai: 57,
  Renekton: 58, JarvanIV: 59, Elise: 60, Orianna: 61, MonkeyKing: 62, Brand: 63, LeeSin: 64, Vayne: 67, Rumble: 68,
  Cassiopeia: 69, Skarner: 72, Heimerdinger: 74, Nasus: 75, Nidalee: 76, Udyr: 77, Poppy: 78, Gragas: 79,
  Pantheon: 80, Ezreal: 81, Mordekaiser: 82, Yorick: 83, Akali: 84, Kennen: 85, Garen: 86, Leona: 89, Malzahar: 90,
  Talon: 91, Riven: 92, KogMaw: 96, Shen: 98, Lux: 99, Xerath: 101, Shyvana: 102, Ahri: 103, Graves: 104, Fizz: 105,
  Volibear: 106, Rengar: 107, Varus: 110, Nautilus: 111, Viktor: 112, Sejuani: 113, Fiora: 114, Ziggs: 115, Lulu: 117,
  Draven: 119, Hecarim: 120, Khazix: 121, Darius: 122, Jayce: 126, Lissandra: 127, Diana: 131, Quinn: 133,
  Syndra: 134, AurelionSol: 136, Kayn: 141, Zoe: 142, Zyra: 143, Kaisa: 145, Seraphine: 147, Gnar: 150, Zac: 154,
  Yasuo: 157, Velkoz: 161, Taliyah: 163, Camille: 164, Akshan: 166, Belveth: 200, Braum: 201, Jhin: 202,
  Kindred: 203, Zeri: 221, Jinx: 222, TahmKench: 223, Briar: 233, Viego: 234, Senna: 235, Lucian: 236, Zed: 238,
  Kled: 240, Ekko: 245, Qiyana: 246, Vi: 254, Aatrox: 266, Nami: 267, Azir: 268, Yuumi: 350, Samira: 360,
  Thresh: 412, Illaoi: 420, RekSai: 421, Ivern: 427, Kalista: 429, Bard: 432, Rakan: 497, Xayah: 498, Ornn: 516,
  Sylas: 517, Neeko: 518, Aphelios: 523, Rell: 526, Pyke: 555, Vex: 711, Yone: 777, Ambessa: 799, Mel: 800,
  Yunara: 804, Sett: 875, Lillia: 876, Gwen: 887, Renata: 888, Aurora: 893, Nilah: 895, KSante: 897, Smolder: 901,
  Milio: 902, Hwei: 910, Naafiri: 950,
};

const DISPLAY_NAMES: Record<string, string> = {
  AurelionSol: "Aurelion Sol",
  Belveth: "Bel'Veth",
  Chogath: "Cho'Gath",
  DrMundo: "Dr. Mundo",
  JarvanIV: "Jarvan IV",
  KSante: "K'Sante",
  Kaisa: "Kai'Sa",
  Khazix: "Kha'Zix",
  KogMaw: "Kog'Maw",
  Leblanc: "LeBlanc",
  LeeSin: "Lee Sin",
  MasterYi: "Master Yi",
  MissFortune: "Miss Fortune",
  MonkeyKing: "Wukong",
  Nunu: "Nunu & Willump",
  RekSai: "Rek'Sai",
  Renata: "Renata Glasc",
  TahmKench: "Tahm Kench",
  TwistedFate: "Twisted Fate",
  Velkoz: "Vel'Koz",
  XinZhao: "Xin Zhao",
};

/** Melee champions per Data Dragon attack range (< 325). Everyone else is ranged. */
const MELEE = new Set([
  "Aatrox", "Akali", "Alistar", "Ambessa", "Amumu", "Belveth", "Blitzcrank", "Braum", "Briar", "Camille", "Chogath",
  "Darius", "Diana", "DrMundo", "Ekko", "Evelynn", "Fiora", "Fizz", "Galio", "Gangplank", "Garen", "Gnar", "Gragas",
  "Gwen", "Hecarim", "Illaoi", "Irelia", "JarvanIV", "Jax", "Jayce", "Kassadin", "Katarina", "Kayle", "Kayn",
  "Khazix", "Kled", "KSante", "LeeSin", "Leona", "Lillia", "Locke", "Malphite", "Maokai", "MasterYi", "MonkeyKing",
  "Mordekaiser", "Naafiri", "Nasus", "Nautilus", "Nilah", "Nocturne", "Nunu", "Olaf", "Ornn", "Pantheon", "Poppy",
  "Pyke", "Qiyana", "Rakan", "Rammus", "RekSai", "Rell", "Renekton", "Rengar", "Riven", "Rumble", "Sejuani", "Sett",
  "Shaco", "Shen", "Shyvana", "Singed", "Sion", "Skarner", "Sylas", "TahmKench", "Talon", "Taric", "Trundle",
  "Tryndamere", "Udyr", "Vi", "Viego", "Volibear", "Warwick", "XinZhao", "Yasuo", "Yone", "Yorick", "Zaahen", "Zac",
  "Zed",
]);

const ARCH_TAGS: Record<Archetype, string[]> = {
  mage_burst: ["Mage", "Assassin"],
  mage_poke: ["Mage"],
  mage_dps: ["Mage", "Support"],
  ap_assassin: ["Assassin", "Mage"],
  ap_bruiser: ["Fighter", "Mage"],
  ap_onhit: ["Marksman", "Mage"],
  adc_crit: ["Marksman"],
  adc_onhit: ["Marksman", "Fighter"],
  adc_caster: ["Marksman", "Mage"],
  ad_assassin: ["Assassin", "Fighter"],
  bruiser: ["Fighter", "Tank"],
  tank: ["Tank", "Support"],
  enchanter: ["Support", "Mage"],
};

const ARCH_INFO: Record<Archetype, { attack: number; defense: number; magic: number }> = {
  mage_burst: { attack: 2, defense: 3, magic: 9 },
  mage_poke: { attack: 2, defense: 2, magic: 9 },
  mage_dps: { attack: 2, defense: 4, magic: 8 },
  ap_assassin: { attack: 3, defense: 3, magic: 8 },
  ap_bruiser: { attack: 3, defense: 6, magic: 7 },
  ap_onhit: { attack: 6, defense: 3, magic: 7 },
  adc_crit: { attack: 9, defense: 2, magic: 2 },
  adc_onhit: { attack: 8, defense: 3, magic: 3 },
  adc_caster: { attack: 8, defense: 2, magic: 5 },
  ad_assassin: { attack: 9, defense: 2, magic: 1 },
  bruiser: { attack: 8, defense: 6, magic: 2 },
  tank: { attack: 4, defense: 9, magic: 5 },
  enchanter: { attack: 2, defense: 4, magic: 7 },
};

function makeChampions(): Record<string, FixtureDDChampion> {
  const out: Record<string, FixtureDDChampion> = {};
  let nextKey = 2000;
  for (const id of Object.keys(CHAMPION_KB).sort()) {
    const kb = CHAMPION_KB[id];
    const key = CHAMPION_KEYS[id] ?? nextKey++;
    out[id] = {
      id,
      key: String(key),
      name: DISPLAY_NAMES[id] ?? id,
      title: "the Fixture",
      tags: ARCH_TAGS[kb.a],
      info: { ...ARCH_INFO[kb.a], difficulty: 5 },
      stats: { attackrange: MELEE.has(id) ? 125 : 550 },
      image: { full: `${id}.png` },
    };
  }
  return out;
}

// --------------------------------------------------------------- items

type ItemDef = [id: number, name: string, total: number, from: number[], tags: string];

const BOOTS_TAGS = "Boots";

/** [id, name, total gold, components, comma-separated tags]. `into` is derived from `from`. */
const ITEM_DEFS: ItemDef[] = [
  // ---- basics
  [1001, "Boots", 300, [], "Boots"],
  [1004, "Faerie Charm", 200, [], "ManaRegen"],
  [1011, "Giant's Belt", 900, [1028], "Health"],
  [1018, "Cloak of Agility", 600, [], "CriticalStrike"],
  [1026, "Blasting Wand", 850, [], "SpellDamage"],
  [1027, "Sapphire Crystal", 300, [], "Mana"],
  [1028, "Ruby Crystal", 400, [], "Health"],
  [1029, "Cloth Armor", 300, [], "Armor"],
  [1031, "Chain Vest", 800, [1029], "Armor"],
  [1033, "Null-Magic Mantle", 400, [], "SpellBlock"],
  [1036, "Long Sword", 350, [], "Damage"],
  [1037, "Pickaxe", 875, [], "Damage"],
  [1038, "B. F. Sword", 1300, [], "Damage"],
  [1042, "Dagger", 250, [], "AttackSpeed"],
  [1043, "Recurve Bow", 700, [], "AttackSpeed,OnHit"],
  [1052, "Amplifying Tome", 400, [], "SpellDamage"],
  [1053, "Vampiric Scepter", 900, [1036], "Damage,LifeSteal"],
  [1057, "Negatron Cloak", 900, [1033], "SpellBlock"],
  [1058, "Needlessly Large Rod", 1200, [], "SpellDamage"],
  [3057, "Sheen", 900, [], "SpellDamage"],
  [3070, "Tear of the Goddess", 400, [], "Mana"],
  [4642, "Glowing Mote", 250, [], "AbilityHaste"],
  // ---- epics
  [3024, "Glacial Buckler", 900, [1027, 1029], "Armor,Mana,AbilityHaste"],
  [3035, "Last Whisper", 1450, [1037, 1036], "Damage,ArmorPenetration"],
  [3044, "Phage", 1100, [1028, 1036], "Health,Damage"],
  [3066, "Winged Moonplate", 800, [1028], "Health,NonbootsMovement"],
  [3067, "Kindlegem", 800, [1028], "Health,AbilityHaste"],
  [3076, "Bramble Vest", 800, [1029, 1029], "Armor"],
  [3077, "Tiamat", 1200, [1036, 1036], "Damage"],
  [3082, "Warden's Mail", 1000, [1029, 1029], "Armor"],
  [3086, "Zeal", 1200, [1042, 1018], "AttackSpeed,CriticalStrike,NonbootsMovement"],
  [3108, "Fiendish Codex", 900, [1052], "SpellDamage,AbilityHaste"],
  [3113, "Aether Wisp", 900, [1052], "SpellDamage,NonbootsMovement"],
  [3114, "Forbidden Idol", 800, [1004, 1004], "ManaRegen"],
  [3123, "Executioner's Calling", 800, [1036], "Damage"],
  [3133, "Caulfield's Warhammer", 1050, [1036, 1036], "Damage,AbilityHaste"],
  [3134, "Serrated Dirk", 1100, [1036, 1036], "Damage,ArmorPenetration"],
  [3140, "Quicksilver Sash", 1300, [1033], "SpellBlock"],
  [3145, "Hextech Alternator", 1100, [1052, 1052], "SpellDamage"],
  [3155, "Hexdrinker", 1300, [1036, 1033], "Damage,SpellBlock"],
  [3191, "Seeker's Armguard", 1000, [1052, 1029], "SpellDamage,Armor"],
  [3211, "Spectre's Cowl", 1250, [1028, 1033], "Health,SpellBlock"],
  [3802, "Lost Chapter", 1200, [1052, 1027], "SpellDamage,Mana,AbilityHaste"],
  [3916, "Oblivion Orb", 800, [1052], "SpellDamage"],
  [4630, "Blighting Jewel", 1100, [1052], "SpellDamage,MagicPenetration"],
  [4632, "Verdant Barrier", 1000, [1052, 1033], "SpellDamage,SpellBlock"],
  [6660, "Bami's Cinder", 900, [1028], "Health"],
  // ---- boots
  [3006, "Berserker's Greaves", 1100, [1001, 1042, 1042], `${BOOTS_TAGS},AttackSpeed`],
  [3009, "Boots of Swiftness", 1000, [1001], BOOTS_TAGS],
  [3020, "Sorcerer's Shoes", 1100, [1001, 1052], `${BOOTS_TAGS},MagicPenetration`],
  [3047, "Plated Steelcaps", 1200, [1001, 1029], `${BOOTS_TAGS},Armor`],
  [3111, "Mercury's Treads", 1250, [1001, 1033], `${BOOTS_TAGS},SpellBlock,Tenacity`],
  [3158, "Ionian Boots of Lucidity", 900, [1001], `${BOOTS_TAGS},AbilityHaste`],
  // ---- AP legendaries
  [2503, "Blackfire Torch", 2800, [3802, 3113], "SpellDamage,Mana,AbilityHaste"],
  [3089, "Rabadon's Deathcap", 3600, [1058, 1058, 1052], "SpellDamage"],
  [3100, "Lich Bane", 3100, [3057, 3113, 1052], "SpellDamage,NonbootsMovement"],
  [3102, "Banshee's Veil", 3000, [4632, 1026], "SpellDamage,SpellBlock"],
  [3115, "Nashor's Tooth", 3000, [1043, 1026], "SpellDamage,AttackSpeed,OnHit"],
  [3116, "Rylai's Crystal Scepter", 2600, [1026, 1011], "SpellDamage,Health,Slow"],
  [3118, "Malignance", 2700, [3802, 3108], "SpellDamage,Mana,AbilityHaste"],
  [3135, "Void Staff", 3000, [4630, 1026], "SpellDamage,MagicPenetration"],
  [3137, "Cryptbloom", 2850, [4630, 3108], "SpellDamage,MagicPenetration,AbilityHaste"],
  [3152, "Hextech Rocketbelt", 2600, [3145, 1028], "SpellDamage,Health,Active"],
  [3157, "Zhonya's Hourglass", 3250, [3191, 1058], "SpellDamage,Armor,Active"],
  [3165, "Morellonomicon", 2850, [3916, 3108], "SpellDamage,AbilityHaste,GrievousWounds"],
  [4628, "Horizon Focus", 2750, [3145, 1026], "SpellDamage,AbilityHaste"],
  [4629, "Cosmic Drive", 3000, [3145, 3067], "SpellDamage,Health,AbilityHaste,NonbootsMovement"],
  [4633, "Riftmaker", 3100, [3067, 1026], "SpellDamage,Health,AbilityHaste,SpellVamp"],
  [4645, "Shadowflame", 3200, [1058, 4642], "SpellDamage,MagicPenetration"],
  [4646, "Stormsurge", 2900, [1026, 3113], "SpellDamage,MagicPenetration,NonbootsMovement"],
  [6653, "Liandry's Torment", 3000, [1026, 3067], "SpellDamage,Health,AbilityHaste"],
  [6655, "Luden's Echo", 2750, [3802, 1026], "SpellDamage,Mana,AbilityHaste,MagicPenetration"],
  [6657, "Rod of Ages", 2600, [1026, 1028, 1027], "SpellDamage,Health,Mana"],
  [3003, "Archangel's Staff", 2900, [3070, 1058], "SpellDamage,Mana,AbilityHaste"],
  [3040, "Seraph's Embrace", 3000, [3003], "SpellDamage,Mana,AbilityHaste"],
  // ---- enchanter
  [2065, "Shurelya's Battlesong", 2200, [3067, 3114], "SpellDamage,AbilityHaste,ManaRegen,Active"],
  [3107, "Redemption", 2300, [3114, 1028], "Health,AbilityHaste,ManaRegen,Active"],
  [3109, "Knight's Vow", 2200, [3067, 1029], "Health,Armor,AbilityHaste"],
  [3190, "Locket of the Iron Solari", 2200, [3067, 1033], "Health,SpellBlock,Armor,Active"],
  [3222, "Mikael's Blessing", 2300, [3114, 1033], "SpellBlock,ManaRegen,Active"],
  [3504, "Ardent Censer", 2200, [3114, 1052], "SpellDamage,ManaRegen"],
  [6616, "Staff of Flowing Water", 2250, [3114, 1052, 1052], "SpellDamage,ManaRegen"],
  [6617, "Moonstone Renewer", 2200, [3114, 3067], "Health,AbilityHaste,ManaRegen"],
  [6620, "Echoes of Helia", 2200, [3114, 1028, 1004], "Health,AbilityHaste,ManaRegen"],
  // ---- marksman / crit / on-hit
  [3004, "Manamune", 2900, [3070, 1037, 1036], "Damage,Mana,AbilityHaste"],
  [3026, "Guardian Angel", 3200, [1038, 1031], "Damage,Armor"],
  [3031, "Infinity Edge", 3450, [1038, 1037, 1018], "Damage,CriticalStrike"],
  [3032, "Yun Tal Wildarrows", 3000, [1037, 1043, 1018], "Damage,AttackSpeed,CriticalStrike"],
  [3033, "Mortal Reminder", 3000, [3035, 3123], "Damage,ArmorPenetration,GrievousWounds"],
  [3036, "Lord Dominik's Regards", 3000, [3035, 1038], "Damage,CriticalStrike,ArmorPenetration"],
  [3046, "Phantom Dancer", 2650, [3086, 1042], "AttackSpeed,CriticalStrike,NonbootsMovement"],
  [3072, "Bloodthirster", 3400, [1038, 1053, 1036], "Damage,CriticalStrike,LifeSteal"],
  [3085, "Runaan's Hurricane", 2650, [1043, 1042, 1042], "AttackSpeed,CriticalStrike,OnHit"],
  [3091, "Wit's End", 2800, [1043, 1057, 1042], "AttackSpeed,SpellBlock,OnHit"],
  [3094, "Rapid Firecannon", 2650, [3086, 1018], "AttackSpeed,CriticalStrike,NonbootsMovement"],
  [3124, "Guinsoo's Rageblade", 3000, [1043, 1037], "Damage,AttackSpeed,OnHit"],
  [3139, "Mercurial Scimitar", 3200, [3140, 1037], "Damage,SpellBlock,Active"],
  [3153, "Blade of the Ruined King", 3200, [1053, 1043, 1036], "Damage,AttackSpeed,LifeSteal,OnHit"],
  [3302, "Terminus", 3000, [1043, 1036, 1033], "Damage,AttackSpeed,OnHit,Armor,SpellBlock"],
  [3508, "Essence Reaver", 2900, [3057, 1037], "Damage,CriticalStrike,AbilityHaste"],
  [6672, "Kraken Slayer", 3100, [3086, 1037], "Damage,AttackSpeed,NonbootsMovement,OnHit"],
  [6673, "Immortal Shieldbow", 3000, [1053, 1018, 1036], "Damage,CriticalStrike,LifeSteal"],
  [6675, "Navori Flickerblade", 2650, [3086, 1018], "AttackSpeed,CriticalStrike,NonbootsMovement"],
  // ---- lethality
  [126697, "Hubris", 2950, [3134, 1037], "Damage,ArmorPenetration"],
  [123430, "Rite of Ruin", 3000, [3802, 1018], "SpellDamage,CriticalStrike,AbilityHaste"],
  [8010, "Bloodletter's Curse", 2900, [1026, 1028], "SpellDamage,Health,MagicPenetration,AbilityHaste"],
  [2522, "Actualizer", 2800, [3802, 1058], "SpellDamage,Mana,AbilityHaste"],
  [2510, "Dusk and Dawn", 3100, [3057, 1058], "SpellDamage,Health,AttackSpeed,AbilityHaste,OnHit"],
  [3146, "Hextech Gunblade", 3000, [1036, 1058], "SpellDamage,Damage,SpellVamp,Active"],
  [2517, "Endless Hunger", 3100, [3133, 1037], "Damage,LifeSteal,Tenacity,AbilityHaste"],
  [2501, "Overlord's Bloodmail", 3300, [3044, 1011], "Damage,Health"],
  [2512, "Fiendhunter Bolts", 2650, [1018, 1042], "AttackSpeed,CriticalStrike,NonbootsMovement"],
  [2523, "Hexoptics C44", 2800, [1038, 1018], "Damage,CriticalStrike"],
  [3095, "Stormrazor", 3200, [1038, 1018], "Damage,AttackSpeed,CriticalStrike"],
  [4004, "Spectral Cutlass", 2800, [3134, 1036], "Damage,ArmorPenetration,Active"],
  [2502, "Unending Despair", 2800, [1031, 1011], "Health,Armor,AbilityHaste"],
  [2525, "Protoplasm Harness", 2600, [1011, 3067], "Health,AbilityHaste"],
  [3039, "Atma's Reckoning", 2900, [1011, 1018], "Health,CriticalStrike,AbilityHaste"],
  [2524, "Bandlepipes", 2300, [1029, 1033], "Health,Armor,SpellBlock,AbilityHaste"],
  [4005, "Imperial Mandate", 2400, [3113, 1052], "SpellDamage,AbilityHaste,ManaRegen"],
  [6621, "Dawncore", 2500, [1052, 3114], "SpellDamage,ManaRegen"],
  [3142, "Youmuu's Ghostblade", 2800, [3134, 3133], "Damage,ArmorPenetration,Active,NonbootsMovement"],
  [3814, "Edge of Night", 2800, [3134, 1033], "Damage,ArmorPenetration,SpellBlock"],
  [6676, "The Collector", 3000, [3134, 1018], "Damage,CriticalStrike,ArmorPenetration"],
  [6692, "Eclipse", 2900, [1036, 1036, 3133], "Damage,ArmorPenetration,AbilityHaste"],
  [6694, "Serylda's Grudge", 3000, [3035, 3133], "Damage,ArmorPenetration,AbilityHaste,Slow"],
  [6695, "Serpent's Fang", 2500, [3134, 1036], "Damage,ArmorPenetration"],
  [6696, "Axiom Arc", 3000, [3134, 3133], "Damage,ArmorPenetration,AbilityHaste"],
  [6697, "Hubris", 3000, [3134, 1036, 1036], "Damage,ArmorPenetration,AbilityHaste"],
  [6698, "Profane Hydra", 3200, [3077, 3134], "Damage,ArmorPenetration,Active"],
  [6701, "Opportunity", 2700, [3134, 1037], "Damage,ArmorPenetration,NonbootsMovement"],
  // ---- fighter
  [3053, "Sterak's Gage", 3200, [1011, 1037], "Health,Damage"],
  [3071, "Black Cleaver", 3000, [3044, 3133], "Health,Damage,AbilityHaste,ArmorPenetration"],
  [3074, "Ravenous Hydra", 3300, [3077, 1053], "Damage,LifeSteal,AbilityHaste,Active"],
  [3078, "Trinity Force", 3333, [3057, 3044], "Health,Damage,AttackSpeed,AbilityHaste,NonbootsMovement"],
  [3156, "Maw of Malmortius", 2900, [3155, 3133], "Damage,SpellBlock,AbilityHaste"],
  [6333, "Death's Dance", 3300, [1037, 1031, 3133], "Damage,Armor,AbilityHaste"],
  [6609, "Chempunk Chainsword", 2800, [3123, 3133], "Health,Damage,AbilityHaste,GrievousWounds"],
  [6610, "Sundered Sky", 3100, [3133, 3044], "Health,Damage,AbilityHaste"],
  // ---- tank
  [2504, "Kaenic Rookern", 2900, [1057, 1011], "Health,SpellBlock"],
  [3065, "Spirit Visage", 2900, [3067, 3211], "Health,SpellBlock,AbilityHaste"],
  [3068, "Sunfire Aegis", 2700, [6660, 1031], "Health,Armor"],
  [3075, "Thornmail", 2450, [3076, 1011], "Health,Armor,GrievousWounds"],
  [3083, "Warmog's Armor", 3100, [1011, 1011, 1028], "Health,HealthRegen"],
  [3084, "Heartsteel", 3000, [3067, 1011], "Health,HealthRegen"],
  [3110, "Frozen Heart", 2500, [3024, 1031], "Armor,Mana,AbilityHaste"],
  [3143, "Randuin's Omen", 2700, [3082, 1011], "Health,Armor"],
  [3742, "Dead Man's Plate", 2900, [1031, 1011], "Health,Armor,NonbootsMovement"],
  [4401, "Force of Nature", 2800, [1057, 3066], "Health,SpellBlock,NonbootsMovement"],
  [6664, "Hollow Radiance", 2800, [6660, 1057], "Health,SpellBlock,AbilityHaste"],
  [6665, "Jak'Sho, The Protean", 3200, [1031, 1057, 1028], "Health,Armor,SpellBlock"],
  [8020, "Abyssal Mask", 2650, [3067, 1057], "Health,SpellBlock,AbilityHaste"],
];

/**
 * Item names referenced by src/data/itemKb.ts that no longer exist in the live
 * game, deliberately omitted so the fixture behaves like real Data Dragon
 * (the build engine must fall back to the next candidate).
 */
export const FIXTURE_REMOVED_ITEMS: string[] = [];

const STAT_KEYS: Record<string, string> = {
  SpellDamage: "FlatMagicDamageMod",
  Damage: "FlatPhysicalDamageMod",
  Health: "FlatHPPoolMod",
  Armor: "FlatArmorMod",
  SpellBlock: "FlatSpellBlockMod",
  Mana: "FlatMPPoolMod",
  AttackSpeed: "PercentAttackSpeedMod",
  CriticalStrike: "FlatCritChanceMod",
  NonbootsMovement: "PercentMovementSpeedMod",
  Boots: "FlatMovementSpeedMod",
  LifeSteal: "PercentLifeStealMod",
};

function statsFor(tags: string[], total: number): Record<string, number> {
  const stats: Record<string, number> = {};
  const scale = Math.max(1, Math.round(total / 100));
  for (const t of tags) {
    const k = STAT_KEYS[t];
    if (!k) continue;
    if (k.startsWith("Percent") || k === "FlatCritChanceMod") stats[k] = Math.min(0.5, scale / 100);
    else if (k === "FlatMovementSpeedMod") stats[k] = 45;
    else if (k === "FlatHPPoolMod") stats[k] = scale * 15;
    else stats[k] = scale * 2;
  }
  return stats;
}

function makeItems(): Record<string, FixtureDDItem> {
  const out: Record<string, FixtureDDItem> = {};
  const into = new Map<number, number[]>();
  for (const [id, , , from] of ITEM_DEFS)
    for (const c of new Set(from)) into.set(c, [...(into.get(c) ?? []), id]);
  const byId = new Map(ITEM_DEFS.map((d) => [d[0], d]));
  const depth = (id: number): number => {
    const d = byId.get(id);
    return d && d[3].length ? 1 + Math.max(...d[3].map(depth)) : 1;
  };
  for (const [id, name, total, from, tagStr] of ITEM_DEFS) {
    const tags = tagStr.split(",").filter(Boolean);
    const compCost = from.reduce((s, c) => s + (byId.get(c)?.[2] ?? 0), 0);
    const parents = into.get(id);
    const it: FixtureDDItem = {
      name,
      gold: { base: total - compCost, total, sell: Math.round(total * 0.7), purchasable: true },
      tags,
      maps: { "11": true, "12": true, "21": false, "30": false },
      stats: statsFor(tags, total),
      image: { full: `${id}.png` },
      depth: depth(id),
    };
    if (from.length) it.from = from.map(String);
    if (parents?.length) it.into = parents.map(String);
    out[String(id)] = it;
  }

  // Entries assembleStaticData must ignore / de-prioritise (mirrors real Data Dragon quirks).
  out["223031"] = { ...out["3031"], from: undefined, depth: 3, maps: { "11": false, "12": false, "30": true } }; // Arena copy
  out["3599"] = {
    name: "Kalista's Black Spear",
    gold: { base: 0, total: 0, sell: 0, purchasable: false },
    tags: ["Consumable"],
    maps: { "11": true, "12": true },
    image: { full: "3599.png" },
    requiredChampion: "Kalista",
  };
  out["3513"] = {
    name: "Eye of the Herald",
    gold: { base: 0, total: 0, sell: 0, purchasable: false },
    tags: ["Trinket"],
    maps: { "11": true, "12": false },
    image: { full: "3513.png" },
    inStore: false,
  };
  out["3340"] = {
    // Summoner's Rift only (maps.12 false) — exists, but findItem must not resolve it in ARAM.
    name: "Stealth Ward",
    gold: { base: 0, total: 0, sell: 0, purchasable: true },
    tags: ["Trinket", "Vision"],
    maps: { "11": true, "12": false },
    image: { full: "3340.png" },
  };
  return out;
}

// --------------------------------------------------------------- runes

function rune(id: number, key: string, name: string, path: string) {
  return { id, key, name, icon: `perk-images/Styles/${path}/${key}/${key}.png` };
}

function makeRunes(): FixtureDDRuneTree[] {
  return [
    {
      id: 8000, key: "Precision", name: "Precision", icon: "perk-images/Styles/7201_Precision.png",
      slots: [
        { runes: [rune(8005, "PressTheAttack", "Press the Attack", "Precision"), rune(8008, "LethalTempo", "Lethal Tempo", "Precision"), rune(8021, "FleetFootwork", "Fleet Footwork", "Precision"), rune(8010, "Conqueror", "Conqueror", "Precision")] },
        { runes: [rune(9101, "AbsorbLife", "Absorb Life", "Precision"), rune(9111, "Triumph", "Triumph", "Precision"), rune(8009, "PresenceOfMind", "Presence of Mind", "Precision")] },
        { runes: [rune(9104, "LegendAlacrity", "Legend: Alacrity", "Precision"), rune(9105, "LegendHaste", "Legend: Haste", "Precision"), rune(9103, "LegendBloodline", "Legend: Bloodline", "Precision")] },
        { runes: [rune(8014, "CoupDeGrace", "Coup de Grace", "Precision"), rune(8017, "CutDown", "Cut Down", "Precision"), rune(8299, "LastStand", "Last Stand", "Sorcery")] },
      ],
    },
    {
      id: 8100, key: "Domination", name: "Domination", icon: "perk-images/Styles/7200_Domination.png",
      slots: [
        { runes: [rune(8112, "Electrocute", "Electrocute", "Domination"), rune(8128, "DarkHarvest", "Dark Harvest", "Domination"), rune(9923, "HailOfBlades", "Hail of Blades", "Domination")] },
        { runes: [rune(8126, "CheapShot", "Cheap Shot", "Domination"), rune(8139, "TasteOfBlood", "Taste of Blood", "Domination"), rune(8143, "SuddenImpact", "Sudden Impact", "Domination")] },
        { runes: [rune(8137, "SixthSense", "Sixth Sense", "Domination"), rune(8140, "GrislyMementos", "Grisly Mementos", "Domination"), rune(8141, "DeepWard", "Deep Ward", "Domination")] },
        { runes: [rune(8135, "TreasureHunter", "Treasure Hunter", "Domination"), rune(8105, "RelentlessHunter", "Relentless Hunter", "Domination"), rune(8106, "UltimateHunter", "Ultimate Hunter", "Domination")] },
      ],
    },
    {
      id: 8200, key: "Sorcery", name: "Sorcery", icon: "perk-images/Styles/7202_Sorcery.png",
      slots: [
        { runes: [rune(8214, "SummonAery", "Summon Aery", "Sorcery"), rune(8229, "ArcaneComet", "Arcane Comet", "Sorcery"), rune(8230, "PhaseRush", "Phase Rush", "Sorcery")] },
        { runes: [rune(8224, "Axiom_Arcanist", "Axiom Arcanist", "Sorcery"), rune(8226, "ManaflowBand", "Manaflow Band", "Sorcery"), rune(8275, "NimbusCloak", "Nimbus Cloak", "Sorcery")] },
        { runes: [rune(8210, "Transcendence", "Transcendence", "Sorcery"), rune(8234, "Celerity", "Celerity", "Sorcery"), rune(8233, "AbsoluteFocus", "Absolute Focus", "Sorcery")] },
        { runes: [rune(8237, "Scorch", "Scorch", "Sorcery"), rune(8232, "Waterwalking", "Waterwalking", "Sorcery"), rune(8236, "GatheringStorm", "Gathering Storm", "Sorcery")] },
      ],
    },
    {
      id: 8400, key: "Resolve", name: "Resolve", icon: "perk-images/Styles/7204_Resolve.png",
      slots: [
        { runes: [rune(8437, "GraspOfTheUndying", "Grasp of the Undying", "Resolve"), rune(8439, "VeteranAftershock", "Aftershock", "Resolve"), rune(8465, "Guardian", "Guardian", "Resolve")] },
        { runes: [rune(8446, "Demolish", "Demolish", "Resolve"), rune(8463, "FontOfLife", "Font of Life", "Resolve"), rune(8401, "MirrorShell", "Shield Bash", "Resolve")] },
        { runes: [rune(8429, "Conditioning", "Conditioning", "Resolve"), rune(8444, "SecondWind", "Second Wind", "Resolve"), rune(8473, "BonePlating", "Bone Plating", "Resolve")] },
        { runes: [rune(8451, "Overgrowth", "Overgrowth", "Resolve"), rune(8453, "Revitalize", "Revitalize", "Resolve"), rune(8242, "Unflinching", "Unflinching", "Sorcery")] },
      ],
    },
    {
      id: 8300, key: "Inspiration", name: "Inspiration", icon: "perk-images/Styles/7203_Whimsy.png",
      slots: [
        { runes: [rune(8351, "GlacialAugment", "Glacial Augment", "Inspiration"), rune(8360, "UnsealedSpellbook", "Unsealed Spellbook", "Inspiration"), rune(8369, "FirstStrike", "First Strike", "Inspiration")] },
        { runes: [rune(8306, "HextechFlashtraption", "Hextech Flashtraption", "Inspiration"), rune(8304, "MagicalFootwear", "Magical Footwear", "Inspiration"), rune(8321, "CashBack", "Cash Back", "Inspiration")] },
        { runes: [rune(8313, "PerfectTiming", "Triple Tonic", "Inspiration"), rune(8352, "TimeWarpTonic", "Time Warp Tonic", "Inspiration"), rune(8345, "BiscuitDelivery", "Biscuit Delivery", "Inspiration")] },
        { runes: [rune(8347, "CosmicInsight", "Cosmic Insight", "Inspiration"), rune(8410, "ApproachVelocity", "Approach Velocity", "Resolve"), rune(8316, "JackOfAllTrades", "Jack of All Trades", "Inspiration")] },
      ],
    },
  ];
}

// --------------------------------------------------------------- summoner spells

function makeSpells(): Record<string, FixtureDDSpell> {
  const defs: Array<[string, number, string, string[]]> = [
    ["SummonerBoost", 1, "Cleanse", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerExhaust", 3, "Exhaust", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerFlash", 4, "Flash", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerHaste", 6, "Ghost", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerHeal", 7, "Heal", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerSmite", 11, "Smite", ["CLASSIC"]],
    ["SummonerTeleport", 12, "Teleport", ["CLASSIC"]],
    ["SummonerClarity", 13, "Clarity", ["ARAM", "KIWI"]],
    ["SummonerDot", 14, "Ignite", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerBarrier", 21, "Barrier", ["CLASSIC", "ARAM", "KIWI"]],
    ["SummonerSnowball", 32, "Mark", ["ARAM", "KIWI"]],
  ];
  const out: Record<string, FixtureDDSpell> = {};
  for (const [id, key, name, modes] of defs) out[id] = { id, key: String(key), name, modes, image: { full: `${id}.png` } };
  return out;
}

// --------------------------------------------------------------- public API

export function makeFixtureRaw(): FixtureRaw {
  return { version: FIXTURE_VERSION, champions: makeChampions(), items: makeItems(), runes: makeRunes(), spells: makeSpells() };
}

/** Fake Data Dragon responses keyed by URL path suffix (match with `url.endsWith(key)`). */
export function fixtureResponses(): Record<string, unknown> {
  const raw = makeFixtureRaw();
  return {
    "api/versions.json": [raw.version, "16.22.1", "16.21.1"],
    "data/en_US/champion.json": { type: "champion", format: "standAloneComplex", version: raw.version, data: raw.champions },
    "data/en_US/item.json": { type: "item", version: raw.version, data: raw.items },
    "data/en_US/runesReforged.json": raw.runes,
    "data/en_US/summoner.json": { type: "summoner", version: raw.version, data: raw.spells },
  };
}

/** Look up a fixture response for a full Data Dragon URL (undefined when not covered). */
export function fixtureResponseFor(url: string): unknown {
  const path = url.split("?")[0];
  const hit = Object.entries(fixtureResponses()).find(([suffix]) => path.endsWith(suffix));
  return hit?.[1];
}

export function makeFixtureStaticData(): StaticData {
  const raw = makeFixtureRaw();
  return assembleStaticData(raw.version, raw.champions, raw.items, raw.runes, raw.spells);
}

// --------------------------------------------------------------- live client demo

type DemoPlayer = {
  champ: string; // Data Dragon id
  riot: string;
  team: "ORDER" | "CHAOS";
  level: number;
  k: number;
  d: number;
  a: number;
  items: number[];
};

const DEMO_PLAYERS: DemoPlayer[] = [
  { champ: "Ahri", riot: "You#NA1", team: "ORDER", level: 11, k: 3, d: 2, a: 4, items: [6655, 3020, 3108] },
  { champ: "Jinx", riot: "Powder#EUW", team: "ORDER", level: 11, k: 5, d: 3, a: 2, items: [3032, 3006, 1037] },
  { champ: "Leona", riot: "Dawnbringer#NA1", team: "ORDER", level: 10, k: 0, d: 4, a: 7, items: [3068, 3047, 1011] },
  { champ: "Lux", riot: "LadyOfLight#NA1", team: "ORDER", level: 11, k: 4, d: 3, a: 6, items: [6655, 3020, 1058] },
  { champ: "Darius", riot: "Noxus Hand#EUW", team: "ORDER", level: 12, k: 2, d: 4, a: 3, items: [3071, 3047] },
  { champ: "Soraka", riot: "Starchild#KR1", team: "CHAOS", level: 10, k: 0, d: 2, a: 9, items: [6617, 3158, 3114] },
  { champ: "Aatrox", riot: "Darkin Blade#NA1", team: "CHAOS", level: 12, k: 5, d: 3, a: 3, items: [6610, 3047, 1037] },
  { champ: "Vladimir", riot: "Crimson#OCE", team: "CHAOS", level: 12, k: 4, d: 2, a: 5, items: [4633, 3020, 1052] },
  { champ: "Zed", riot: "Shadow Master#NA1", team: "CHAOS", level: 11, k: 6, d: 3, a: 2, items: [3142, 3158, 3134] },
  { champ: "Malphite", riot: "Shard#EUNE", team: "CHAOS", level: 11, k: 1, d: 3, a: 8, items: [3075, 3047, 1011] },
];

/** A realistic Live Client Data API `/liveclientdata/allgamedata` payload (ARAM Mayhem, ~12:22). */
export function demoAllGameData(): AllGameDataRaw & Record<string, unknown> {
  const raw = makeFixtureRaw();
  const itemName = (id: number) => raw.items[String(id)]?.name ?? `Item ${id}`;
  const champName = (id: string) => raw.champions[id]?.name ?? id;
  const payload = {
    activePlayer: {
      riotId: "You#NA1",
      riotIdGameName: "You",
      riotIdTagLine: "NA1",
      summonerName: "You#NA1",
      currentGold: 1850,
      level: 11,
      championStats: {},
      abilities: {},
      fullRunes: {},
    },
    allPlayers: DEMO_PLAYERS.map((p) => {
      const [gameName, tag] = p.riot.split("#");
      return {
        championName: champName(p.champ),
        rawChampionName: `game_character_displayname_${p.champ}`,
        riotId: p.riot,
        riotIdGameName: gameName,
        riotIdTagLine: tag,
        summonerName: p.riot,
        team: p.team,
        level: p.level,
        isBot: false,
        isDead: false,
        respawnTimer: 0,
        position: "",
        skinID: 0,
        items: p.items.map((id, slot) => ({
          itemID: id,
          displayName: itemName(id),
          count: 1,
          slot,
          price: raw.items[String(id)]?.gold.base ?? 0,
          canUse: false,
          consumable: false,
          rawDisplayName: `Item_${id}_Name`,
        })),
        scores: { kills: p.k, deaths: p.d, assists: p.a, creepScore: p.level * 4, wardScore: 0 },
        summonerSpells: {
          summonerSpellOne: { displayName: "Flash", rawDisplayName: "SummonerFlash" },
          summonerSpellTwo: { displayName: "Mark", rawDisplayName: "SummonerSnowball" },
        },
      };
    }),
    gameData: { gameMode: "KIWI", gameTime: 742, mapName: "Map12", mapNumber: 12, mapTerrain: "Default" },
    events: { Events: [] as Array<{ EventName: string; Result?: string }> },
  };
  return payload;
}
