// Champion coaching knowledge base for ARAM (Howling Abyss / ARAM Mayhem).
// SKILL_ORDERS: most common max order + level 1-3 start (u.gg / op.gg consensus).
// GUIDES: pre-game reference only (combos, tips, champion-unique systems) - never real-time prompts.

export type SkillKey = "Q" | "W" | "E" | "R";
type Basic = "Q" | "W" | "E";

export interface SkillPlan {
  /** Max priority order of the three basic abilities, e.g. ["Q","E","W"]. */
  max: Basic[];
  /** Abilities taken at levels 1, 2, 3. */
  start: Basic[];
  note?: string;
}

export interface Combo {
  name: string;
  keys: string;
  when: string;
}

export interface ChampionGuide {
  summary: string;
  combos: Combo[];
  tips: string[];
  fights?: Partial<Record<"teamfight" | "poke" | "dive" | "skirmish", string>>;
  mechanics?: { title: string; items: { name: string; text: string }[] }[];
}

/** "QEW" -> ["Q","E","W"] */
const S = (max: string, start: string, note?: string): SkillPlan => ({
  max: max.split("") as Basic[],
  start: start.split("") as Basic[],
  ...(note ? { note } : {}),
});

const NEW = "Newer champion - order based on early consensus, double-check u.gg";

export const SKILL_ORDERS: Record<string, SkillPlan> = {
  Aatrox: S("QEW", "QEW"),
  Ahri: S("QWE", "QEW"),
  Akali: S("QEW", "QEW"),
  Akshan: S("QEW", "QEW"),
  Alistar: S("QEW", "QWE"),
  Ambessa: S("QEW", "QEW"),
  Amumu: S("EQW", "QEW", "Tank: E max for damage reduction + spammable damage"),
  "Amumu:ap": S("EWQ", "QEW", "AP: W (Despair) second for burn damage"),
  Anivia: S("EQW", "QEW"),
  Annie: S("QWE", "QWE"),
  Aphelios: S("QWE", "QWE", "No normal ranks: Q = bonus AD, W = attack speed, E = lethality"),
  Ashe: S("WQE", "WQE"),
  AurelionSol: S("QEW", "QEW"),
  Aurora: S("QEW", "QEW"),
  Azir: S("QWE", "WQE", "Some players max W first for more soldier damage/attack speed"),
  Bard: S("QWE", "QWE"),
  Belveth: S("QEW", "QEW"),
  Blitzcrank: S("QEW", "QEW"),
  Brand: S("WEQ", "WEQ"),
  Braum: S("QEW", "QEW"),
  Briar: S("WQE", "WQE"),
  Caitlyn: S("QWE", "QWE"),
  Camille: S("QEW", "QEW"),
  Cassiopeia: S("EQW", "QEW"),
  Chogath: S("QEW", "QEW"),
  Corki: S("QEW", "QEW"),
  Darius: S("QEW", "QEW"),
  Diana: S("QWE", "QWE"),
  DrMundo: S("QEW", "QEW"),
  Draven: S("QWE", "QWE"),
  Ekko: S("QEW", "QEW"),
  Elise: S("QWE", "QWE", "Ranks apply to both forms; R ranks automatically"),
  Evelynn: S("EQW", "QEW"),
  Ezreal: S("QEW", "QEW"),
  "Ezreal:ap": S("QWE", "QEW", "AP: W (Essence Flux) second for burst"),
  "Ezreal:lethality": S("QEW", "QEW"),
  Fiddlesticks: S("WQE", "WEQ"),
  Fiora: S("QEW", "QEW"),
  Fizz: S("EWQ", "EQW"),
  Galio: S("QEW", "QWE"),
  Gangplank: S("QEW", "QEW"),
  Garen: S("EQW", "QEW"),
  Gnar: S("QWE", "QEW"),
  Gragas: S("QEW", "QEW"),
  Graves: S("QEW", "QEW"),
  Gwen: S("QEW", "QEW"),
  Hecarim: S("QWE", "QEW"),
  Heimerdinger: S("QWE", "QWE"),
  Hwei: S("QEW", "QEW"),
  Illaoi: S("QEW", "QEW"),
  Irelia: S("QEW", "EQW"),
  Ivern: S("EQW", "EQW"),
  Janna: S("EWQ", "EQW"),
  JarvanIV: S("QEW", "QEW"),
  Jax: S("QWE", "QEW"),
  "Jax:ap": S("WQE", "QWE", "AP: W (Empower) carries the AP ratio"),
  Jayce: S("QWE", "QEW", "R ranks automatically; Q/W/E go to rank 6"),
  Jhin: S("QWE", "QWE"),
  Jinx: S("QWE", "QWE"),
  KSante: S("QEW", "QEW"),
  Kaisa: S("QEW", "QWE"),
  "Kaisa:ap": S("WQE", "QWE", "AP: W (Void Seeker) max; still evolve W first"),
  "Kaisa:crit": S("QEW", "QWE"),
  Kalista: S("EQW", "QEW"),
  Karma: S("QEW", "QEW"),
  Karthus: S("QEW", "QEW"),
  Kassadin: S("QEW", "QEW"),
  Katarina: S("QEW", "QEW"),
  Kayle: S("EQW", "EQW"),
  "Kayle:ad": S("EQW", "EQW", "AD on-hit: E still max - its on-hit scales with both AD and AP"),
  Kayn: S("QWE", "QEW"),
  "Kayn:red": S("QWE", "QEW", "Rhaast: Q/W deal % max HP"),
  "Kayn:blue": S("QWE", "QEW", "Shadow Assassin: Q first for burst, W for the long-range poke"),
  Kennen: S("QWE", "QWE"),
  Khazix: S("QWE", "QEW"),
  Kindred: S("QWE", "QWE"),
  Kled: S("QWE", "QEW"),
  KogMaw: S("WQE", "WQE"),
  "KogMaw:ap": S("WEQ", "WEQ", "AP: rank R whenever possible - artillery spam is the damage"),
  Leblanc: S("QWE", "QWE"),
  LeeSin: S("QEW", "QEW"),
  Leona: S("WEQ", "EQW"),
  Lillia: S("QWE", "QEW"),
  Lissandra: S("QWE", "QWE"),
  Locke: S("QEW", "QEW", NEW),
  Lucian: S("QEW", "QEW"),
  Lulu: S("EWQ", "EQW"),
  "Lulu:ap": S("QEW", "QEW", "AP: Q max for poke"),
  Lux: S("EQW", "EQW"),
  "Lux:support": S("EWQ", "EQW", "Enchanter: W shield second"),
  Malphite: S("QEW", "QEW"),
  "Malphite:ap": S("QEW", "QEW", "AP: Q max for long-range poke; R + E is the one-shot"),
  Malzahar: S("EQW", "EQW"),
  Maokai: S("QEW", "QEW"),
  MasterYi: S("QEW", "QEW"),
  Mel: S("QEW", "QWE"),
  Milio: S("EWQ", "EQW"),
  MissFortune: S("QWE", "QWE"),
  "MissFortune:lethality": S("QEW", "QEW"),
  MonkeyKing: S("QEW", "QEW"),
  Mordekaiser: S("QEW", "QEW"),
  Morgana: S("WQE", "QWE"),
  Naafiri: S("QEW", "QEW"),
  Nami: S("WEQ", "WEQ"),
  Nasus: S("QEW", "QEW"),
  Nautilus: S("QEW", "QEW"),
  "Nautilus:ap": S("EQW", "QEW", "AP: E max for spammable AoE"),
  Neeko: S("QEW", "QEW"),
  Nidalee: S("QEW", "QEW", "R ranks automatically; Q/W/E go to rank 6 (spear poke first)"),
  Nilah: S("QEW", "QEW"),
  Nocturne: S("QEW", "QEW"),
  Nunu: S("QEW", "QEW"),
  "Nunu:ap": S("EQW", "QEW", "AP: E max for snowball barrage damage"),
  Olaf: S("QEW", "QEW"),
  Orianna: S("QWE", "QEW"),
  Ornn: S("QWE", "QWE"),
  Pantheon: S("QEW", "QEW"),
  Poppy: S("QEW", "QEW"),
  Pyke: S("QEW", "QEW"),
  Qiyana: S("QWE", "QEW"),
  Quinn: S("QEW", "QEW"),
  Rakan: S("WEQ", "WEQ"),
  "Rakan:ap": S("WQE", "WQE"),
  Rammus: S("QWE", "QWE"),
  RekSai: S("QEW", "QEW"),
  Rell: S("WEQ", "WEQ"),
  Renata: S("EQW", "QEW"),
  Renekton: S("QEW", "QEW"),
  Rengar: S("QWE", "QWE"),
  "Rengar:lethality": S("QEW", "QWE"),
  Riven: S("QEW", "QEW"),
  Rumble: S("QEW", "QEW"),
  Ryze: S("QEW", "QEW"),
  Samira: S("QEW", "QEW"),
  Sejuani: S("WQE", "QWE"),
  Senna: S("QWE", "QWE"),
  Seraphine: S("QEW", "QEW"),
  "Seraphine:support": S("WQE", "QWE", "Enchanter: W heal/shield second-ranked early"),
  Sett: S("QWE", "QWE"),
  Shaco: S("EQW", "QEW"),
  Shen: S("QEW", "QEW"),
  Shyvana: S("EQW", "QEW"),
  "Shyvana:ap": S("EQW", "QEW", "AP: E (Flame Breath) max"),
  "Shyvana:ad": S("WQE", "WQE", "AD: W burn max for sustained fighting"),
  Singed: S("QEW", "QEW"),
  Sion: S("QWE", "QWE"),
  Sivir: S("QWE", "QWE"),
  Skarner: S("QWE", "QWE"),
  Smolder: S("QWE", "QWE"),
  Sona: S("QWE", "QWE"),
  Soraka: S("WQE", "QWE"),
  Swain: S("QEW", "QEW"),
  Sylas: S("QWE", "QWE"),
  Syndra: S("QWE", "QWE"),
  TahmKench: S("QWE", "QEW"),
  Taliyah: S("QWE", "QWE"),
  Talon: S("WQE", "WQE"),
  Taric: S("EWQ", "EWQ"),
  Teemo: S("EQW", "EQW"),
  Thresh: S("QEW", "QEW"),
  Tristana: S("EQW", "EQW"),
  Trundle: S("QWE", "QWE"),
  Tryndamere: S("EQW", "QEW"),
  TwistedFate: S("QWE", "QWE"),
  "TwistedFate:ad": S("WEQ", "WEQ", "AD on-hit: W cards + E (Stacked Deck) on-hit"),
  Twitch: S("EQW", "EQW"),
  Udyr: S("QEW", "QEW", "R is a normal ability for Udyr: AD/on-hit max Q; AP/tank max R (Wingborne Storm) instead of Q"),
  Urgot: S("QEW", "QEW"),
  Varus: S("QEW", "QEW"),
  "Varus:lethality": S("QEW", "QEW", "Lethality: Q poke max"),
  "Varus:onhit": S("QWE", "QWE", "On-hit: W (Blighted Quiver) second for on-hit damage"),
  "Varus:ap": S("QEW", "QEW", "AP: Q then E - both carry big AP ratios"),
  Vayne: S("QWE", "QWE"),
  Veigar: S("QWE", "QWE"),
  Velkoz: S("WQE", "QWE"),
  Vex: S("QEW", "QEW"),
  Vi: S("QEW", "QEW"),
  Viego: S("QWE", "QWE"),
  Viktor: S("QEW", "QEW"),
  Vladimir: S("QEW", "QEW"),
  Volibear: S("WEQ", "QWE"),
  "Volibear:ap": S("EWQ", "QEW", "AP: E (Sky Splitter) max"),
  Warwick: S("QWE", "QEW"),
  Xayah: S("EWQ", "QEW"),
  Xerath: S("QWE", "QWE"),
  XinZhao: S("QEW", "QEW"),
  Yasuo: S("QEW", "QEW"),
  Yone: S("QWE", "QEW"),
  Yorick: S("QEW", "QEW"),
  Yunara: S("QWE", "QWE", NEW),
  Yuumi: S("EQW", "QEW"),
  Zaahen: S("QEW", "QEW", NEW),
  Zac: S("EWQ", "QEW"),
  Zed: S("QEW", "QEW"),
  Zeri: S("QEW", "QEW"),
  Ziggs: S("QEW", "QEW"),
  Zilean: S("QWE", "QWE"),
  Zoe: S("QEW", "QEW"),
  Zyra: S("EQW", "QEW"),
};

export const GUIDES: Record<string, ChampionGuide> = {
  // ---------------------------------------------------------------- marksmen
  Aphelios: {
    summary:
      "Hyper-carry with five weapons. Win by entering every fight with the right main/off-hand pair and dumping R on a clumped team - no recall in ARAM, so plan ammo before the fight starts.",
    combos: [
      { name: "Gravitum root into Infernum", keys: "Gravitum AA (slow) → Gravitum Q (root) → W (swap to Infernum) → R", when: "Pick-off or teamfight start; R splash hits the rooted group" },
      { name: "Infernum R teamfight", keys: "R (Infernum main) → W (swap) → AA", when: "Enemies clumped in the lane - biggest AoE damage" },
      { name: "Calibrum mark pop", keys: "Calibrum Q → W (swap) → AA (marked target, any range)", when: "Poke: marks are consumed by your next attacks from anywhere on the map you can see" },
      { name: "Crescendum turret", keys: "Crescendum Q (Sentry) → W (Severum) → Severum Q", when: "Melee range all-in or holding a choke vs divers" },
    ],
    tips: [
      "Watch the ammo counter: when main-hand hits 0 it is replaced by the next weapon in the queue (shown on the HUD), not by your off-hand.",
      "Burn bad weapons on minions between fights so a strong pair is ready for the next engage.",
      "R applies your MAIN-hand weapon's bonus to everyone hit, then you keep attacking with that weapon - swap before R if needed.",
      "No recall: you cannot reset the rotation, so plan 1-2 fights ahead.",
    ],
    fights: {
      poke: "Calibrum main / Infernum or Gravitum off-hand. Q mark from max range, then hit marks with swapped weapon.",
      teamfight: "Infernum main for R, Crescendum or Calibrum off-hand. Stay behind the frontline.",
      dive: "Keep Gravitum (root) or Crescendum (turret) available; Severum Q for heal + speed to escape.",
      skirmish: "Severum/Crescendum or Crescendum/Severum for sustained 1v1 DPS.",
    },
    mechanics: [
      {
        title: "Weapons (main-hand Q in brackets)",
        items: [
          { name: "Calibrum (green rifle)", text: "Extra range; hits mark targets. Q Moonshot: long-range shot that marks; attacking marked enemies from any range pops the mark." },
          { name: "Severum (red pistol)", text: "Lifesteal on attacks (overheal shield). Q Onslaught: rapid-fire both weapons at nearby enemies while gaining move speed." },
          { name: "Gravitum (purple cannon)", text: "Attacks slow. Q Binding Eclipse: roots every enemy currently slowed by Gravitum." },
          { name: "Infernum (blue flamethrower)", text: "Attacks splash in a cone. Q Duskwave: cone wave that also fires the off-hand weapon at everyone hit." },
          { name: "Crescendum (white chakram)", text: "Boomerang that stacks chakrams for big melee-range DPS. Q Sentry: turret that fires your off-hand weapon." },
        ],
      },
      {
        title: "Rotation & off-hand queue",
        items: [
          { name: "Order", text: "Calibrum → Severum → Gravitum → Infernum → Crescendum → (back to Calibrum). You start with Calibrum main, Severum off-hand." },
          { name: "How the queue works", text: "Two weapons are held (main + off-hand), three wait in the queue. When the MAIN-hand empties (ammo 0), it goes to the back and the next queued weapon replaces it. W only swaps main and off-hand; it never pulls from the queue." },
          { name: "Controlling it", text: "To get a specific pair, decide which weapon to empty: swapping (W) before burning ammo changes which weapon gets replaced." },
        ],
      },
      {
        title: "Best pairings (main / off-hand)",
        items: [
          { name: "Poke / siege", text: "Calibrum / Infernum or Calibrum / Gravitum - long-range marks, then swap for splash or slow." },
          { name: "Teamfight", text: "Infernum / Crescendum or Infernum / Calibrum - R splash into chakram stacks or marks on everyone." },
          { name: "Vs dive / peel", text: "Gravitum / anything (Q root), Crescendum turret + Gravitum off-hand (slowing turret), Severum Q to run." },
          { name: "Vs tanks", text: "Crescendum / Severum or Infernum / Crescendum - sustained DPS and healing." },
          { name: "1v1 / skirmish", text: "Severum / Crescendum or Crescendum / Severum." },
        ],
      },
      {
        title: "Notable combos",
        items: [
          { name: "Gravitum Q → Infernum R", text: "Root a slowed group, swap, R with Infernum for splash on immobile targets." },
          { name: "Infernum Q + Calibrum off-hand", text: "Duskwave fires Calibrum at everyone hit - marks the whole team for long-range pops." },
          { name: "Crescendum Sentry + Infernum/Gravitum off-hand", text: "Turret splashes (Infernum) or slows (Gravitum) to zone a choke." },
          { name: "Severum Q + Crescendum off-hand", text: "Onslaught fires both weapons - fast chakram stacks and big healing." },
          { name: "Calibrum R", text: "Marks everyone hit; swap to a close-range weapon and pop marks for burst." },
        ],
      },
    ],
  },
  Draven: {
    summary: "Snowball ADC. Catch Spinning Axes for huge auto damage; every kill/assist feeds Adoration gold. Win early fights or force the enemy to respect your damage.",
    combos: [
      { name: "All-in", keys: "Q → AA → (catch) → E → AA → W → R", when: "Enemy steps forward or is slowed" },
      { name: "Double R", keys: "R → R (recast on hit)", when: "Recast to make axes return early and double-hit a low target" },
    ],
    tips: [
      "Juggle two axes; drop to one when you need to move freely.",
      "Do not step into enemy poke to catch an axe - a missed axe is cheaper than a lost fight.",
      "E peels divers and interrupts dashes.",
      "You lose a large part of your Adoration stacks on death - play safer when you have many.",
    ],
    fights: { teamfight: "Hit the closest target with axes; E the diver.", poke: "Not great at poke - wait in safety and punish engages." },
  },
  Kalista: {
    summary: "Hop-kiting ADC. Stack spears with attacks and pop Rend (E); Fate's Call (R) throws your bound ally into the enemy.",
    combos: [
      { name: "Rend stack", keys: "AA (hop) → AA → Q → E", when: "Pop E when enough spears are in, or to execute minions and reset E" },
      { name: "Fate's Call engage", keys: "R → (ally lands) → AA → E", when: "Bound engage ally (Malphite, Alistar, Sion...)" },
    ],
    tips: [
      "Bind your Oathsworn with the Black Spear early - pick the best engage tank or a diver.",
      "E resets its cooldown when it kills a target: use minions to keep slows ready.",
      "Q through a minion it kills transfers spears to the next target.",
      "Move-click between autos to hop; never stand still.",
    ],
  },
  Varus: {
    summary: "Long-range poke (lethality/AP) or blight-stacking DPS (on-hit). Q from max range, R to start or stop engages.",
    combos: [
      { name: "Poke", keys: "Q (charge) → E", when: "Lethality/AP: hit from long range" },
      { name: "Blight burst", keys: "AA → AA → AA → W (empower) → Q", when: "On-hit: detonate 3 blight stacks with Q or E" },
      { name: "Chain", keys: "R → E → Q", when: "Root the frontline target so R spreads to the clumped team" },
    ],
    tips: [
      "Lethality: just poke; you are the zone-control piece.",
      "On-hit: build Blight stacks with autos before detonating with abilities.",
      "Save R for the enemy engager or to peel a diver.",
    ],
  },
  Ezreal: {
    summary: "Safe caster ADC. Spam Mystic Shot poke, keep Arcane Shift for escape, R for long-range finishing.",
    combos: [
      { name: "Proc W", keys: "W → Q (or AA)", when: "Mark with W, detonate with Q for damage + mana refund" },
      { name: "Shift burst", keys: "W → E (aggressive) → Q", when: "Kill a low target - E bolt detonates W too" },
      { name: "Siege R", keys: "R → Q", when: "Hit the whole clumped team in the lane" },
    ],
    tips: [
      "Every Q hit reduces all cooldowns by 1.5s - accuracy is your DPS.",
      "Hold E as escape vs assassins; using it aggressively is a commit.",
      "R hits minions and the whole lane in ARAM - fire it into clumps.",
    ],
  },
  Jinx: {
    summary: "Hyper-carry that snowballs off takedowns (Get Excited!). Rocket splash in clumped ARAM fights is huge.",
    combos: [
      { name: "Zone", keys: "E (chompers) → W → Q (rockets) AA", when: "Chompers under a fleeing or diving enemy" },
      { name: "Cleanup", keys: "R → Q (swap)", when: "Low HP targets anywhere - R damage scales with missing health" },
    ],
    tips: [
      "Use minigun to stack attack speed, then swap to rockets for splash.",
      "Chompers at your own feet stop divers.",
      "A takedown gives huge move/attack speed - chain into the next target.",
    ],
  },
  Samira: {
    summary: "Short-range ADC that builds Style (C to S) with varied attacks/abilities, then R (Inferno Trigger) at S rank.",
    combos: [
      { name: "Style to S", keys: "E → AA → Q → AA → W → R", when: "Alternate different abilities/attacks to raise grade fast" },
      { name: "Knock-up follow", keys: "(ally CC) → E → AA (passive) → Q → R", when: "Melee attacks vs airborne targets trigger passive execute-ish combo" },
    ],
    tips: [
      "W destroys enemy projectiles - time it vs key skillshots and ults.",
      "E refreshes on takedown: chain resets after the first kill.",
      "Go in after allied CC, never first.",
    ],
  },
  Kaisa: {
    summary: "Hybrid ADC that evolves abilities with item stats. Isolated Q burst and E/R repositioning win skirmishes.",
    combos: [
      { name: "Isolated burst", keys: "AA → Q → AA → AA", when: "Target with no allies nearby takes all missiles" },
      { name: "Plasma R", keys: "W (plasma) → R → Q", when: "R requires a target with Plasma; W from range applies it" },
    ],
    tips: [
      "Evolution thresholds: Q = 100 bonus AD, W = 100 AP, E = 100% bonus attack speed (levels also count).",
      "R shields you - use it defensively onto plasma-marked targets.",
      "In ARAM minions absorb Q: isolate targets at the side of the lane.",
    ],
  },
  Smolder: {
    summary: "Scaling caster ADC. Stack Dragon Practice with Q (and abilities on champions); stacks unlock AoE, burn and execute.",
    combos: [
      { name: "Poke", keys: "W → Q → AA", when: "W hits enemy, then Q to stack" },
      { name: "Mama R", keys: "R (centered on yourself) → E", when: "Standing in the middle of R heals you" },
    ],
    tips: [
      "Stacks: 25 = Q explosion AoE, 125 = burn, 225 = execute (low-HP targets).",
      "In ARAM, Q minions in fights to stack while staying safe.",
      "E lets you fly over walls; use it to escape divers.",
    ],
  },
  // ---------------------------------------------------------------- jungle-ish / fighters with forms
  Kayn: {
    summary: "Shape-shifting jungler. Choose Rhaast (red, drain bruiser) or Shadow Assassin (blue, backline assassin) based on enemy comp once the orb fills.",
    combos: [
      { name: "Standard", keys: "W → Q → AA → R → R (recast)", when: "Both forms: knockup/slow then dive" },
      { name: "Rhaast drain", keys: "E → Q → W → R → R (recast)", when: "Red: R heals % of target HP on exit" },
      { name: "Assassin pick", keys: "E (through wall) → W → Q → R", when: "Blue: flank through terrain onto ranged carry" },
    ],
    tips: [
      "Orb fills by damaging champions - in ARAM it fills fast; decide red vs blue before the first big fight.",
      "R (Umbral Trespass) needs a target you recently damaged; it makes you untargetable.",
      "Use R to dodge key skillshots or ults.",
    ],
    mechanics: [
      {
        title: "Rhaast (red) vs Shadow Assassin (blue)",
        items: [
          { name: "Earning orbs", text: "Red orbs come from damaging MELEE champions, blue from damaging RANGED champions. The form whose bar fills first is offered - click the transform icon on the HUD to take it." },
          { name: "Pick Rhaast (red)", text: "Vs 3+ melee / tanky comps, extended fights. Q and W deal % max HP; passive heals a % of damage to champions; W knocks up; R exit heals and deals % max HP." },
          { name: "Pick Shadow Assassin (blue)", text: "Vs ranged / squishy comps. Passive bonus damage in the first seconds of combat; W longer range and no longer stops movement; E lasts longer; R longer range." },
          { name: "Builds", text: "Red: Black Cleaver, Sundered Sky, Sterak's - health/fighter. Blue: lethality (Youmuu's, Profane Hydra, Opportunity, Serylda's)." },
        ],
      },
    ],
  },
  Udyr: {
    summary: "Stance fighter with four ultimate-like abilities. Pick stance by role: Wilding Claw (Q) on-hit DPS, Storm (R) AP/tank AoE.",
    combos: [
      { name: "Engage", keys: "E (stampede) → AA (stun) → R → W", when: "Run in, stun, place storm, shield" },
      { name: "Awakened burst", keys: "E → AA → Q → Q (awaken) → AA", when: "AD: awakened Q lightning on a single target" },
      { name: "Storm sustain", keys: "R → R (awaken) → W → W (awaken)", when: "AP/tank: storm follows you, then awakened W for heal" },
    ],
    tips: [
      "Each target can only be stunned by E's attack once every few seconds.",
      "Awakening needs a passive charge; save it for the stance you need most in that fight.",
      "Your attacks after a stance swap are empowered - weave autos between casts.",
    ],
    mechanics: [
      {
        title: "Stances & Awakened",
        items: [
          { name: "Q Wilding Claw", text: "Attack speed + bonus on-hit damage. Awakened: lightning strikes dealing % max HP. Max for AD/on-hit." },
          { name: "W Iron Mantle", text: "Shield + lifesteal. Awakened: bigger shield and % HP heal over time." },
          { name: "E Blazing Stampede", text: "Move speed; next attack stuns. Awakened: unstoppable while charging, longer speed." },
          { name: "R Wingborne Storm", text: "Storm around you damaging/slowing. Awakened: storm detaches and chases enemies. Max for AP/tank." },
          { name: "Awakening", text: "Recast a stance while you have a passive charge to Awaken it. Charges recover over time, faster with levels." },
          { name: "Ranks", text: "R is not an ultimate - rank it like a basic ability when going storm." },
        ],
      },
    ],
  },
  Jayce: {
    summary: "Poke/burst fighter that swaps between Hammer (melee) and Cannon (ranged). In ARAM, gated Shock Blast poke then hammer finish.",
    combos: [
      { name: "Gated Shock Blast", keys: "E (gate) → Q (cannon)", when: "Long-range poke - gate boosts Q speed, range and damage" },
      { name: "Full burst", keys: "E → Q (cannon) → R → Q (hammer) → W → E (hammer)", when: "Poke then leap in; hammer E knocks them back toward your team" },
      { name: "Disengage", keys: "E (hammer) → R → E (gate) → Q", when: "Knock the diver away, swap and gate out" },
    ],
    tips: [
      "Cannon W (Hyper Charge) gives three fast autos - use it right after a stance swap.",
      "Swapping forms empowers your next attack (cannon: armor/MR shred buff; hammer: armor/MR).",
      "Hammer E can knock enemies into your team or out of a fight.",
    ],
    mechanics: [
      {
        title: "Stance swap",
        items: [
          { name: "Cannon (ranged)", text: "Q Shock Blast poke, W Hyper Charge attack speed, E Acceleration Gate (speed boost, boosts Q)." },
          { name: "Hammer (melee)", text: "Q leap slam, W Lightning Field (aura damage + mana restore), E Thundering Blow (knockback, % HP)." },
          { name: "Cooldowns", text: "Each form tracks its own cooldowns - cast abilities in one form, swap, cast the other three." },
        ],
      },
    ],
  },
  Nidalee: {
    summary: "Spear poke huntress. Land long-range Javelin Toss, then pounce on hunted targets in cougar form.",
    combos: [
      { name: "Spear → pounce", keys: "Q (spear) → R → W (pounce) → E → Q", when: "Spear hit marks the target as Hunted: pounce range increases" },
      { name: "Trap pounce", keys: "W (trap) → R → W → E → Q", when: "Trap hit also marks them" },
    ],
    tips: [
      "Spear damage scales with distance - throw from max range.",
      "Human E heals allies and gives attack speed; use it between fights.",
      "Cougar Q executes low HP targets; pounce resets on takedown.",
    ],
    mechanics: [
      {
        title: "Human / Cougar",
        items: [
          { name: "Human", text: "Q Javelin Toss (more damage farther), W Bushwhack trap, E Primal Surge heal + attack speed." },
          { name: "Cougar", text: "Q Takedown (more damage vs low HP), W Pounce (long pounce on Hunted), E Swipe (cone)." },
          { name: "Hunt", text: "Hitting spear or trap marks the target as Hunted for a few seconds." },
        ],
      },
    ],
  },
  Elise: {
    summary: "Pick-off assassin. Land Cocoon (E) then burst in spider form; Rappel to dodge.",
    combos: [
      { name: "Standard", keys: "E (cocoon) → W → Q → R → Q → W → AA", when: "Stun, human burst, spider execute" },
      { name: "Rappel escape", keys: "R → E (rappel) → E (recast)", when: "Dodge skillshots or tower shots; drop onto a target" },
    ],
    tips: [
      "Human Q = % current HP; spider Q = % missing HP. Open with human, finish with spider.",
      "Rappel makes you untargetable - dodge ults like Jhin R or Ezreal R.",
      "Spiderlings absorb damage from turrets and minions.",
    ],
    mechanics: [
      {
        title: "Human / Spider",
        items: [
          { name: "Human", text: "Q Neurotoxin (% current HP), W Volatile Spiderling, E Cocoon (stun)." },
          { name: "Spider", text: "Q Venomous Bite (% missing HP), W Skittering Frenzy (attack speed), E Rappel (untargetable, reposition)." },
        ],
      },
    ],
  },
  Gnar: {
    summary: "Mini (ranged kite) / Mega (AoE engage) toplaner. Control the Rage bar so Mega comes out when the fight starts.",
    combos: [
      { name: "Wall slam", keys: "E (hop, transform) → W (stun) → R (into wall) → Q", when: "Near walls with full Rage" },
      { name: "Flash R", keys: "Flash → R → W → Q", when: "Mega Gnar into a clumped team near wall" },
    ],
    tips: [
      "Rage decays out of combat - stop attacking at 70-90% Rage to time the transform.",
      "Mega Gnar lasts about 15s; after it, you get a cooldown before rage builds again.",
      "Mini Gnar: kite with Q boomerang and E hop off enemies.",
    ],
    mechanics: [
      {
        title: "Rage management",
        items: [
          { name: "Mini", text: "Gains Rage on attacks/abilities. Ranged, high move speed, kiting." },
          { name: "Mega", text: "At 100 Rage the next ability transforms (or auto after a few seconds). AoE CC, tanky." },
          { name: "Timing", text: "Keep 80-90% Rage before engages; one ability transforms you instantly in the fight." },
        ],
      },
    ],
  },
  Hwei: {
    summary: "Long-range mage with 9 spells. Pick the subject (Q damage, W utility, E control) then the spell.",
    combos: [
      { name: "Pick", keys: "EQ (fear) → QW (execute) → R", when: "Single target catch" },
      { name: "Zone", keys: "EW (root eye) → QE (fissure) → QQ", when: "Defending a choke" },
      { name: "AoE", keys: "R → EE (pull) → QQ", when: "Teamfight on clumped enemies" },
    ],
    tips: [
      "QW (Severing Bolt) deals extra damage to immobile/isolated targets - follow CC.",
      "WW shields an ally; WQ speeds allies.",
      "Spells have separate cooldowns per subject - choose one per subject.",
    ],
    mechanics: [
      {
        title: "Spell grid",
        items: [
          { name: "QQ Devastating Fire", text: "Fireball that explodes; % max HP damage." },
          { name: "QW Severing Bolt", text: "Long-range strike; bonus vs immobile or isolated targets." },
          { name: "QE Molten Fissure", text: "Line of eruptions that slows." },
          { name: "WQ Fleeting Current", text: "Speed zone for allies." },
          { name: "WW Pool of Reflection", text: "Shield allies standing in it." },
          { name: "WE Stirring Lights", text: "Empowers your next attacks and restores mana." },
          { name: "EQ Grim Visage", text: "Skillshot that fears." },
          { name: "EW Gaze of the Abyss", text: "Eye that roots enemies who enter." },
          { name: "EE Crushing Maw", text: "Pulls enemies toward the center of the area." },
        ],
      },
    ],
  },
  Kled: {
    summary: "Mounted bruiser with a big engage R. Dismounting gives a second life.",
    combos: [
      { name: "Standard", keys: "Q (beartrap) → E → E (recast) → W → AA", when: "Snapping Q into target" },
      { name: "R engage", keys: "R → E → Q → W", when: "Charge team from range" },
    ],
    tips: [
      "When Skaarl HP hits 0, Kled dismounts; regain Courage by attacking enemies.",
      "R gives allies a speed trail - use it to start fights.",
      "Q pulls target after a short delay if they stay leashed.",
    ],
    mechanics: [
      {
        title: "Dismount / remount",
        items: [
          { name: "Dismount", text: "Kled loses Skaarl at 0 Skaarl HP and becomes a ranged pistol fighter." },
          { name: "Courage", text: "Attacks and abilities on champions fill the meter; at 100 he remounts with HP restored." },
        ],
      },
    ],
  },
  Qiyana: {
    summary:
      "Element-swapping assassin. Grab the right element with W, then R into the Howling Abyss walls to stun a whole clump of enemies.",
    combos: [
      { name: "Wall stun", keys: "W (terrain) → E → Q → R (aim so they land in the wall) → AA", when: "Enemy near the lane edge or a turret wall" },
      { name: "Flash R", keys: "E → Flash → R", when: "R knock pushes enemies into terrain behind them - flash to fix the angle" },
      { name: "River root pick", keys: "W (river) → E → Q (root) → AA → R", when: "Need lockdown on a mobile carry" },
    ],
    tips: [
      "R stuns enemies knocked into terrain, and the shockwave travels along walls/river/brush to stun everyone touching them.",
      "Howling Abyss has walls everywhere - every fight near the lane edge is an R opportunity.",
      "W refreshes the element and resets your auto; dash with it to the element you need.",
      "Don't E in first vs heavy CC; wait for their engage to be used.",
    ],
    fights: {
      teamfight: "Flank along the wall, R the backline into the side wall, clean up with terrain Q.",
      poke: "Wait in brush/fog near the lane edge; your poke is weak, so don't trade HP.",
    },
    mechanics: [
      {
        title: "Element choice (W, then Q)",
        items: [
          { name: "Terrain (rock)", text: "Q deals bonus damage to low-HP enemies (below 50%). Pick for burst and cleanup." },
          { name: "River (water)", text: "Q leaves a slowing area that roots. Needs water terrain - Howling Abyss has none, so in ARAM you mostly use terrain and brush." },
          { name: "Brush (grass)", text: "Q leaves a field that grants camouflage + move speed. Pick to flank or escape." },
          { name: "Element source", text: "W must target a nearby wall, brush or water to take that element; it lasts until you use a new one." },
        ],
      },
    ],
  },
  Azir: {
    summary: "Long-range DPS mage that fights through Sand Soldiers. Kite from max range; Shurima Shuffle a priority target back into your team.",
    combos: [
      { name: "Shurima Shuffle", keys: "W (soldier past/near enemy) → E (dash to soldier) → Q (during dash, further ahead) → R", when: "Dash behind a target and R them toward your team" },
      { name: "Insec flash", keys: "W → E → Flash → R", when: "Long-range version when you need extra distance" },
      { name: "Escape", keys: "W (away / over wall) → E → Q", when: "Disengage from divers" },
    ],
    tips: [
      "Soldiers only deal damage when you attack an enemy in their range - always auto through a soldier.",
      "Keep one W charge for escape: E needs a soldier to dash to.",
      "R (Emperor's Divide) wall blocks enemy dashes - use it to peel your carry.",
      "On a destroyed allied turret you can raise a Sun Disc (passive) - strong defense near your base.",
    ],
    fights: {
      poke: "Q soldiers into the minion wave and enemy frontline; 3 soldiers stacked hit hard.",
      dive: "Save E/Q for escape; R pushes divers off you.",
      teamfight: "Fight at max soldier range; shuffle only when it wins the fight.",
    },
    mechanics: [
      {
        title: "Soldier mechanics",
        items: [
          { name: "W Arise!", text: "Summons a soldier (stores charges). Soldier stabs whenever you attack an enemy within its reach; damage hits in a line." },
          { name: "Q Conquering Sands", text: "Sends all soldiers to a location, damaging and slowing along the way." },
          { name: "E Shifting Sands", text: "Shield + dash to a soldier; stops on the first enemy champion hit (knocks up)." },
          { name: "Shurima Shuffle", text: "Cast Q while E is dashing - you keep dashing to the new soldier position, reaching behind the target for R." },
        ],
      },
    ],
  },
  Viego: {
    summary: "Possession skirmisher. Every takedown lets you take over the corpse, use its basic abilities and heal - chain resets in the five-man ARAM fights.",
    combos: [
      { name: "Standard", keys: "W (charge stun) → Q → AA → AA (passive proc) → E", when: "Engage a single target from mist" },
      { name: "Reset chain", keys: "takedown → possess → their abilities → R (exit + execute)", when: "Teamfight with multiple low targets" },
    ],
    tips: [
      "Possessing heals you and grants their basic abilities and items' stats; your R remains usable and ends possession.",
      "R (Heartbreaker) deals more to low HP targets - use it to execute and to dash out of a bad possession.",
      "E mist gives camouflage and attack speed near walls - ARAM lane edges are perfect.",
      "Possess a tank or strong-CC champion when you are low to survive and peel.",
    ],
    fights: { teamfight: "Wait for the first death, then possess and chain.", skirmish: "Strong 1v1 with Q double-hit + W stun." },
    mechanics: [
      {
        title: "Possession",
        items: [
          { name: "Trigger", text: "When an enemy champion dies to a takedown you are part of, a Wraith appears; walk over/click it to possess." },
          { name: "What you get", text: "Their Q/W/E (not their ult), their auto attacks, heal on possess. Your R is still available and exits possession." },
          { name: "Duration", text: "Possession ends when you cast R or the timer runs out; plan an exit." },
        ],
      },
    ],
  },
  Sylas: {
    summary: "AP bruiser that steals enemy ultimates. Look at the enemy team at load-in and plan whose R you want.",
    combos: [
      { name: "Burst", keys: "E → E (recast, stun) → Q → AA → W → AA", when: "Weave autos between abilities for passive damage" },
      { name: "Steal and use", keys: "R (Hijack) → stolen ult", when: "Grab a big ult and use it in the same or next fight" },
    ],
    tips: [
      "W heals more the lower your HP - use it late in the trade, not first.",
      "Stolen ult cooldown is based on the original's; you can hold it.",
      "Hijack has range and the ult stays until used.",
      "Prioritize AoE engages (Malphite, Amumu, Orianna) over self-buff ults.",
    ],
    fights: { teamfight: "Engage with a stolen AoE ult, then chain E into the backline." },
    mechanics: [
      {
        title: "Best ultimates to steal",
        items: [
          { name: "Engage", text: "Malphite R, Amumu R, Leona R, Sejuani R, Jarvan IV R, Orianna R, Wukong R, Rell R, Nautilus R." },
          { name: "Damage", text: "Annie R (Tibbers), Fiddlesticks R, Kennen R, Karthus R, Lux R, Ziggs R, Miss Fortune R, Brand R." },
          { name: "Utility / save", text: "Soraka R (global heal), Taric R, Zilean R, Kayle R, Kindred R, Lulu R." },
          { name: "Avoid", text: "Transformation ults (Jayce, Nidalee, Elise R) and passive stat ults - low value." },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------- fighters / skirmishers
  LeeSin: {
    summary: "Play-making skirmisher. Land Sonic Wave, then kick a priority target into your team (Insec) or kick the tank into its own carries.",
    combos: [
      { name: "Insec (no wards)", keys: "Q → Q (recast) → W (to ally/minion behind target) → R", when: "Kick the carry into your team; ARAM has no wards, use allies/minions" },
      { name: "Flash Insec", keys: "Q → Q (recast) → R → Flash (during R cast)", when: "Flash behind as R casts - same result, harder to read" },
      { name: "Standard", keys: "Q → Q (recast) → AA → E → E (recast) → AA → R", when: "Single-target kill" },
    ],
    tips: [
      "Q2 deals more damage the lower the target's HP - use it to finish, not open, when they are healthy.",
      "Each ability empowers two autos (attack speed + energy) - weave autos for energy.",
      "R kicked target knocks up everyone it passes through - aim through clumps.",
      "W shield on an ally doubles as a gap-closer; keep it to escape after Insec.",
    ],
    fights: { teamfight: "Wait for engage, then kick the frontline back into their backline or the carry into your team.", skirmish: "Q on health relic contests and picks." },
  },
  Riven: {
    summary: "Combo bruiser. Chain animation-cancelled Broken Wings and R2 execute; Valor shield absorbs burst.",
    combos: [
      { name: "Shy combo", keys: "E → R → Flash → W → AA → R (recast) → Q", when: "One-shot a squishy" },
      { name: "Fast Q", keys: "AA → Q → AA → Q → AA → Q", when: "Cancel each Q with a move command for max DPS" },
      { name: "Engage", keys: "E → R → Q → W → AA → Q → Q → R (recast)", when: "Standard all-in" },
    ],
    tips: [
      "R2 (Wind Slash) damage scales with missing HP - fire it on low targets or a clump.",
      "E shield blocks a big ability; hold it for enemy burst instead of only gap-closing.",
      "Third Q jumps thin walls on the lane edge.",
      "W stun is short range - get close first.",
    ],
  },
  Yasuo: {
    summary: "Melee carry that needs knockups. Stack Q, block projectiles with Wind Wall, R any airborne enemies (yours or allies' knockups).",
    combos: [
      { name: "Beyblade", keys: "E → Q3 (during E) → Flash (during EQ) → R", when: "Knock up several enemies at once" },
      { name: "EQ circle", keys: "E → Q", when: "Q during E becomes a circle - stack Q on minions while closing in" },
      { name: "Ally knockup", keys: "(ally knockup) → R → Q → AA", when: "Malphite/Alistar/Gragas etc. R off allies' airborne" },
    ],
    tips: [
      "W (Wind Wall) blocks every projectile including ults like Jinx R and Ashe R.",
      "E can't target the same unit twice quickly - minions are your route.",
      "R grants armor pen on crits - commit fully after R.",
      "Shield passive (Way of the Wanderer) charges while moving.",
    ],
  },
  Yone: {
    summary: "Mixed-damage melee carry. Soul Unbound (E) lets you dive and snap back; R knocks up a line of enemies.",
    combos: [
      { name: "Engage", keys: "E → Q3 (dash knockup) → R → W → AA → E (return)", when: "Group engage; stored damage pops when E ends" },
      { name: "Trade", keys: "Q → AA → W → AA", when: "Short trades; W shield scales with champions hit" },
      { name: "Flash R", keys: "R → Flash", when: "Re-angle R to hit more targets" },
    ],
    tips: [
      "E return location is safe ground - start E from behind your frontline.",
      "E re-deals a % of damage done during it - burst everything while in spirit form.",
      "Q3 is a dash knockup; it stacks from Q hits on minions.",
      "Don't R into five enemies without follow-up.",
    ],
  },
  Irelia: {
    summary: "Reset-based diver. Bladesurge resets on marked or killed targets; stacks passive for attack speed.",
    combos: [
      { name: "Stun reset", keys: "E → E (recast, stun) → Q (reset) → AA → Q", when: "E marks the target, Q resets" },
      { name: "R engage", keys: "R → Q → E → E → Q → W", when: "R marks everyone hit; Q onto each for resets" },
    ],
    tips: [
      "Q minions near death to dash toward the fight (passive stacks too).",
      "Max passive stacks (4) for extra attack speed and on-hit.",
      "W reduces damage while charging; release to damage.",
      "R creates a blade wall that slows - zone enemies.",
    ],
  },
  Camille: {
    summary: "Wall-hook diver. Hookshot onto lane walls, stun the target, isolate it with Hextech Ultimatum.",
    combos: [
      { name: "Hook engage", keys: "E (to wall) → E (recast to target, stun) → W → Q → AA → Q (empowered) → R", when: "Pick a carry near the wall" },
      { name: "Isolate", keys: "R → Q → AA → Q → W", when: "R the carry so their team can't reach" },
    ],
    tips: [
      "Q2 deals true damage if delayed - wait a moment after Q1.",
      "W outer edge slows and heals.",
      "E only dashes from walls - use lane walls in ARAM.",
      "Passive shields vs physical or magic based on target.",
    ],
  },
  Fiora: {
    summary: "Duelist. Strike Vitals for true damage and healing; Riposte parries damage and stuns if it blocks CC.",
    combos: [
      { name: "Vital trade", keys: "Q (into the vital side) → AA → E → AA", when: "Q prefers hitting a Vital - aim it at the marked side" },
      { name: "Grand Challenge", keys: "R → Q → AA → E → AA → Q → AA", when: "Pop all 4 Vitals (or kill the target) to create a healing zone for your team" },
      { name: "Parry", keys: "W (toward enemy)", when: "Time on the key CC (Leona E, Morgana Q...) - a blocked CC stuns the attacker" },
    ],
    tips: [
      "Vitals refresh every few seconds and show a direction - reposition to hit them.",
      "R on a tank still wins: Vitals deal % max HP true damage.",
      "Don't waste W on minion/auto damage when a key CC is up.",
      "Health relics + Ravenous Hydra sustain is key in ARAM since you can't recall.",
    ],
  },
  Aatrox: {
    summary: "Drain bruiser. Land the edges (sweet spots) of each Darkin Blade cast; heal through fights with R and Omnivamp.",
    combos: [
      { name: "Sweet spots", keys: "Q1 → E (during Q) → Q2 → E → Q3", when: "Use E during each Q cast to land the edge" },
      { name: "Chain pull", keys: "W → Q1 → Q2 (pull lands in Q2 edge) → Q3", when: "If W target stays in the chain it is pulled to the center" },
      { name: "Full", keys: "R → W → Q1 → E → Q2 → Q3", when: "R grants AD, move speed and increased healing" },
    ],
    tips: [
      "Q edges knock up and deal extra damage; the center does far less.",
      "R duration extends with takedowns; it also fears minions.",
      "Anti-heal (Executioner's, Morello) wrecks you - build Sterak's/Death's Dance vs it.",
      "Fight in long extended brawls, not in poke phases.",
    ],
  },
  // ---------------------------------------------------------------- assassins
  Zoe: {
    summary: "Long-range burst mage. Sleep a target, then hit it with a long-travel Paddle Star for double damage.",
    combos: [
      { name: "Sleep + star", keys: "E (bubble) → Q1 (throw away from target) → R → Q2 (redirect to sleeper)", when: "Q damage scales with distance traveled; R adds distance" },
      { name: "Through-wall bubble", keys: "E (over a wall) → Q1 → Q2", when: "E travels much farther when it passes over terrain" },
    ],
    tips: [
      "Sleeping targets take bonus true damage from the next hit - use Q, never an auto.",
      "R returns you to where you cast it after 1s - safe poke angle.",
      "W picks up summoner spell and item-active shards dropped by enemies.",
      "E traps (bubbles) left on the ground near walls zone choke points.",
    ],
  },
  Akali: {
    summary: "Energy assassin. Shroud for safety, E mark to dash in, R for two-part execute.",
    combos: [
      { name: "Standard", keys: "E → E (recast) → Q → AA (ring) → R → Q → R (recast)", when: "Dive a squishy" },
      { name: "Shroud trade", keys: "Q → W → AA → Q", when: "Shroud gives energy + move speed; leave the passive ring for an empowered auto" },
    ],
    tips: [
      "R2 deals more damage the lower the target's HP - finish with it.",
      "Shroud is invisible but still hit by AoE and true sight (Pink wards don't exist in ARAM).",
      "E2 dashes to the marked target; mark a minion to escape.",
      "Leave the passive ring to empower your next auto.",
    ],
  },
  Katarina: {
    summary: "Reset assassin. Daggers and Shunpo resets let you chain through a teamfight after the first takedown.",
    combos: [
      { name: "Dagger burst", keys: "Q → E (to dagger) → W → E → R", when: "Picking up daggers deals AoE damage" },
      { name: "Reset chain", keys: "takedown → E (resets) → W → R", when: "Takedowns reduce basic ability cooldowns" },
    ],
    tips: [
      "E can target allies, enemies, minions, or daggers.",
      "R channel is canceled by CC - wait for enemy CC to be used.",
      "Pick daggers inside enemy groups for AoE damage.",
    ],
  },
  Fizz: {
    summary: "AP assassin. Land Chum the Waters (bigger shark the farther it flies), dive in, and use Playful/Trickster to dodge the enemy's answer.",
    combos: [
      { name: "Shark burst", keys: "R → W → Q → AA → E", when: "Throw R from long range for the biggest shark, then all-in" },
      { name: "Flash shark", keys: "E (hop) → Flash (during E) → R", when: "Close range R that can't be dodged" },
      { name: "Trade", keys: "W → Q → AA → E (out)", when: "Short trade, then E back to safety" },
    ],
    tips: [
      "E makes you untargetable - dodge Malphite R, Leona E, Lux Q, Ashe R, turret shots.",
      "Shark knocks up everyone near the attached target - aim at clumps.",
      "Q passes through the target; use it on a minion behind them to escape.",
      "Don't open with E: it is your only defensive tool.",
    ],
  },
  Ekko: {
    summary: "Burst assassin. Pre-place Parallel Convergence (W) and dash into it; Chronobreak (R) undoes a bad dive and heals.",
    combos: [
      { name: "W stun", keys: "W (on target's path) → E (Phase Dive) → AA → Q → (Q returns)", when: "Cast W early - the field arms after a delay, then you stand in it for a shield + stun" },
      { name: "R burst", keys: "E → AA → Q → R", when: "Go in, then rewind to your old position - R damages around the landing spot" },
    ],
    tips: [
      "Third hit on a target (passive Z-Drive Resonance) deals bonus damage and gives speed.",
      "Watch your 'ghost' trail - R returns you to where you were 4s ago.",
      "R landing in enemy clumps is part of your damage.",
      "W cast range is huge - use it to zone chokes in ARAM.",
    ],
  },
  Zed: {
    summary: "Energy assassin. Poke with shadow Razor Shurikens, then Death Mark a carry and swap back to safety.",
    combos: [
      { name: "Shadow poke", keys: "W → E → Q", when: "Long-range triple-hit poke" },
      { name: "Death Mark", keys: "R → E → W → Q → AA → R (swap back)", when: "Kill the carry; Death Mark pops 3s later for a % of damage dealt" },
      { name: "Escape", keys: "W (recast swap) or R (recast swap)", when: "Swap to a shadow to dodge" },
    ],
    tips: [
      "Shadows copy Q and E - align them to hit the same target.",
      "R untargetable during the dash - dodge key abilities.",
      "Buy Edge of Night / Zhonya-style defenses vs heavy CC comps.",
      "In ARAM, poke is weak vs sustain - focus on assassinating the carry.",
    ],
  },
  Talon: {
    summary: "AD assassin. Rake poke and bleed burst; Shadow Assault grants invisibility for flanks.",
    combos: [
      { name: "Burst", keys: "W → Q (leap) → AA → R → AA (bleed)", when: "Three ability hits proc the passive bleed" },
      { name: "R first", keys: "R → Q → W → AA → R (blades return)", when: "Invisible approach, blades return for extra damage" },
    ],
    tips: [
      "Passive: three separate ability hits on a champion trigger a big bleed on your next auto.",
      "E Assassin's Path jumps over walls - good for escaping or flanking.",
      "W returns - hit with both passes for more damage.",
      "Q is a leap from range; in melee range it crits instead.",
    ],
  },
  // ---------------------------------------------------------------- mages
  Lux: {
    summary: "Long-range poke/burst mage. Land Light Binding, then follow with E and Final Spark; in ARAM, R the whole clumped lane.",
    combos: [
      { name: "Full burst", keys: "Q (root) → E → R → AA (passive) → E (recast)", when: "Rooted target can't dodge R" },
      { name: "Poke", keys: "E → AA (passive) → E (recast)", when: "Safe poke; autos detonate Illumination" },
      { name: "Lane R", keys: "R (through the minion wave)", when: "R hits everything in a long line - great for clumped enemies" },
    ],
    tips: [
      "Q roots up to two targets - throw it through the first champion to catch a second.",
      "W shield goes out and back; hit allies both ways for double shield.",
      "R has a short cooldown and hits the whole lane - fire it every time enemies clump.",
      "Stay at max range; you have no escape.",
    ],
    fights: { poke: "E + R every cooldown on clumps.", teamfight: "Root the diver or the engager, then R the group." },
  },
  Xerath: {
    summary: "Artillery mage. Poke from max range with charged Arcanopulse and Eye of Destruction; R finishes low targets from across the map.",
    combos: [
      { name: "Stun combo", keys: "E (stun) → W (center) → Q", when: "Stunned target guaranteed W center + Q" },
      { name: "Poke", keys: "W → Q (charged)", when: "W slows and sets up Q" },
      { name: "Finish", keys: "R → R → R", when: "Low HP targets fleeing; lead your shots" },
    ],
    tips: [
      "E stun lasts longer the farther it travels.",
      "W center deals bonus damage and a bigger slow.",
      "Don't R when divers are near - you are immobile.",
      "Mana Surge passive: autos on enemies restore mana; use them on minions.",
    ],
    fights: { poke: "Main role; stay at max distance.", dive: "E the diver, W under you, back off." },
  },
  Ziggs: {
    summary: "Siege mage. Poke with bouncing bombs and execute turrets with Satchel Charge; Mega Inferno Bomb covers huge areas.",
    combos: [
      { name: "Poke", keys: "E (minefield) → W → Q", when: "Satchel knocks enemies into mines" },
      { name: "Siege", keys: "W (on low turret)", when: "Satchel executes turrets below a % HP threshold" },
      { name: "Escape", keys: "W (self) → W (recast)", when: "Knock yourself away from divers or over walls" },
    ],
    tips: [
      "R center deals bonus damage; aim at the clump middle.",
      "Short Fuse passive empowers your next auto every few seconds.",
      "In ARAM, turrets die fast to W - always push with it.",
    ],
    fights: { poke: "Q spam into minions/champions.", teamfight: "R on the clumped frontline." },
  },
  Velkoz: {
    summary: "True-damage artillery mage. Land three abilities on a target for Organic Deconstruction true damage; R melts anyone you've researched.",
    combos: [
      { name: "Full", keys: "E (knockup) → W → Q → R", when: "Three hits proc passive; R deals true damage to researched targets" },
      { name: "Split Q", keys: "Q → Q (recast at 90 degrees)", when: "Split Q around minions to hit behind cover" },
    ],
    tips: [
      "W is the main poke and wave clear; it detonates after a delay.",
      "R turns to follow your cursor; it can be cancelled by CC.",
      "Stay behind the frontline - you are immobile.",
    ],
    fights: { poke: "W + Q from max range.", teamfight: "R from flank into clumps." },
  },
  Orianna: {
    summary: "Control mage. Everything happens where the Ball is - put it on your engager with E and Shockwave the whole enemy team.",
    combos: [
      { name: "Engage Shockwave", keys: "E (on diving ally) → R", when: "Ally lands in the enemy team - instant R on everyone around them" },
      { name: "Q R", keys: "Q (ball into clump) → R", when: "No engager; R as soon as the ball arrives" },
      { name: "Poke", keys: "Q → W", when: "Dissonance slows enemies and speeds allies" },
    ],
    tips: [
      "E on an ally shields them and damages enemies the ball passes through.",
      "Flash does not move the ball - Flash R only works if the ball is on you.",
      "Passive: your autos deal bonus magic damage stacking on the same target.",
      "W speed zone helps your team run away or chase.",
    ],
    fights: { teamfight: "Ball on Malphite/Sion/Amumu; R right as they land.", poke: "Q W the wave and nearby champions." },
  },
  Syndra: {
    summary: "Burst mage. Spheres everywhere; QE stun at range, R damage scales with spheres on the field.",
    combos: [
      { name: "QE stun", keys: "Q → E", when: "E knocks the sphere forward to stun" },
      { name: "Full", keys: "Q → E → W → R", when: "R throws every sphere; more spheres = more damage" },
      { name: "Long-range stun", keys: "W (sphere) → E", when: "Throw a grabbed sphere and push it with E" },
    ],
    tips: [
      "Passive (Transcendent) upgrades abilities as you collect splinters from ability hits on champions.",
      "R can execute low targets at high splinter stacks.",
      "Keep spheres around before a fight to boost R.",
    ],
    fights: { poke: "Q every cooldown.", teamfight: "QE the diver or the carry; R the most valuable target." },
  },
  Ahri: {
    summary: "Mobile burst mage. Land Charm, then Orb of Deception both ways; Spirit Rush lets you reposition three times.",
    combos: [
      { name: "Charm burst", keys: "E → Q → W → AA → R", when: "Charmed target takes bonus damage" },
      { name: "R charm", keys: "R → E → Q → W → R → R", when: "Dash close for a guaranteed charm" },
    ],
    tips: [
      "Q's return path deals true damage - position so both passes hit.",
      "Champion takedowns during R grant an extra dash.",
      "Keep one R dash to escape after the burst.",
      "Passive heals you after collecting enough soul fragments (minions/champions).",
    ],
    fights: {
      teamfight: "Hold E for the diver or flank charm the carry; don't R in first.",
      poke: "Q through the minion wave hits champions behind it both ways.",
      dive: "R away and E the chaser.",
    },
  },
  Leblanc: {
    summary: "Burst assassin. Distortion dashes in and back; Mimic copies your last ability.",
    combos: [
      { name: "Q burst", keys: "Q → R (Q) → W → E", when: "Single target burst" },
      { name: "AoE", keys: "W → R (W) → Q → E", when: "Multiple targets clumped" },
    ],
    tips: [
      "Q marks the target; any other ability hitting it detonates the mark for extra damage.",
      "Recast W within the window to return to the launch pad - your main escape.",
      "E chain roots if the target stays leashed until it ends.",
      "Passive: dropping low makes you invisible briefly and spawns a decoy clone.",
    ],
    fights: {
      poke: "W in → Q → W (return) on the closest squishy.",
      teamfight: "Wait for enemy CC to be used, then burst a carry and return with W.",
    },
  },
  Mel: {
    summary: "Poke/burst mage. Stack Overwhelm with every hit, reflect enemy projectiles with Rebuttal, then Golden Eclipse hits every stacked enemy at once.",
    combos: [
      { name: "Root burst", keys: "E (root center) → Q → AA (empowered) → R", when: "E roots in the center, slows on the edge" },
      { name: "Reflect", keys: "W (on enemy projectile/ult)", when: "Reflects projectiles back - huge vs Ezreal, Jinx R, Caitlyn, Varus" },
      { name: "Team R", keys: "R", when: "R hits every enemy with Overwhelm stacks, anywhere - poke the team first" },
    ],
    tips: [
      "Overwhelm executes a target when its stacks exceed their remaining HP.",
      "After casting an ability, your next autos fire extra bolts (passive) - weave them.",
      "Hold W for the scariest projectile, not random minion damage.",
    ],
    fights: { poke: "Q volleys on clumps to stack everyone, then R.", dive: "W the diver's projectile, E root, walk away." },
  },
  Aurora: {
    summary: "Mobile burst mage. Twofold Hex poke, Across the Veil hops, and Between Worlds traps enemies inside a looping zone.",
    combos: [
      { name: "Burst", keys: "E → Q → Q (recast) → AA → W", when: "E knocks you back while slowing - recast Q pulls the spirit back through them" },
      { name: "R trap", keys: "R (on target) → E → Q → Q (recast)", when: "Enemies crossing the zone edge loop to the other side" },
    ],
    tips: [
      "Passive: damaging an enemy burns spirits off them, giving you speed and healing.",
      "W makes you invisible briefly - hop out of danger or into a flank.",
      "Q recast damage increases vs lower HP targets.",
      "Inside R you also loop - use it to escape the enemy frontline.",
    ],
    fights: { teamfight: "R the backline group from a flank.", dive: "E knockback + W hop away." },
  },
  Ambessa: {
    summary: "Dash-weaving bruiser. Every ability input can trigger a dash and an empowered attack; Public Execution grabs the farthest enemy in a line.",
    combos: [
      { name: "Standard", keys: "E → Q1 → Q2 → W → AA", when: "Weave dashes and autos between casts" },
      { name: "R pick", keys: "R → Q1 → Q2 → W → E", when: "R blinks to the farthest champion in the line, suppresses then slams" },
    ],
    tips: [
      "Passive (Drakehound's Step): after an ability, a movement input dashes you and empowers your next attack.",
      "W shields; if it blocks damage, the next punch hits harder.",
      "Q2 hit sundering slam slows; hold it vs runners.",
      "R through a clump to grab the backline carry.",
    ],
    fights: { teamfight: "Enter after enemy CC, R the farthest squishy.", skirmish: "Strong 1v1 with W timing." },
  },
  // ---------------------------------------------------------------- supports / tanks
  Thresh: {
    summary: "Playmaking support. Hook picks, Flay pushes or pulls, Lantern saves allies.",
    combos: [
      { name: "Hook", keys: "Q → Q (recast) → E (pull back) → R", when: "Hook a squishy, fly in, Flay them toward your team" },
      { name: "Lantern engage", keys: "Q → W (lantern to ally) → Q (recast)", when: "Bring a follow-up ally into the hooked target" },
      { name: "Flay peel", keys: "E (push away)", when: "Interrupt dashes and push divers off your carry" },
    ],
    tips: [
      "Collect souls from dying enemies to gain armor and AP.",
      "Lantern shield protects the carry clicking it.",
      "R box walls slow anyone crossing them.",
    ],
    fights: { teamfight: "Lantern your diver, hook the carry.", dive: "Flay + box peel." },
  },
  Blitzcrank: {
    summary: "Hook support. Rocket Grab picks a target into your team; Power Fist knocks up; Static Field silences.",
    combos: [
      { name: "Hook", keys: "Q → E → AA → R", when: "Knock up and silence the pulled target" },
      { name: "Flash E", keys: "W → Flash → E → R", when: "Speed into a target and knock up" },
    ],
    tips: [
      "Hook through minion gaps; in ARAM, fish near the side of the lane.",
      "Mana Barrier passive shields you when low.",
      "R silence is an AoE - hit as many as possible.",
    ],
    fights: { poke: "Fish for hooks; one pick wins the fight.", teamfight: "Peel with E on divers." },
  },
  Malphite: {
    summary: "AoE engage tank. Unstoppable Force on a clump wins ARAM fights. AP Malphite one-shots squishies.",
    combos: [
      { name: "Engage", keys: "R → E → W → Q", when: "Clumped enemies" },
      { name: "Flash R", keys: "Flash → R", when: "Unexpected engage range" },
      { name: "Poke", keys: "Q", when: "Slow and steal move speed" },
    ],
    tips: [
      "Passive: Granite Shield refreshes after not taking damage for a while.",
      "E reduces attack speed: big vs ADCs.",
      "Build armor; vs heavy AP adjust with MR.",
    ],
    fights: { teamfight: "R on the most targets possible, then soak.", poke: "Q poke until R is up." },
  },
  Amumu: {
    summary: "AoE CC tank. Bandage Toss engages; Curse of the Sad Mummy stuns everyone nearby.",
    combos: [
      { name: "Engage", keys: "Q → Q (second charge) → R → E → W", when: "Hit a target, R around the clump" },
      { name: "Flash R", keys: "Flash → R", when: "Catch the clump without Q" },
    ],
    tips: [
      "Q has two charges - use the second to follow a dash or reach the next target.",
      "E (Tantrum) cooldown drops every time you are hit; it also reduces physical damage.",
      "W toggle costs mana per second - turn it off between fights.",
      "Q onto a minion near the enemy clump is a sneaky engage angle.",
    ],
    fights: {
      teamfight: "R the most enemies you can; Flash R if Q misses.",
      dive: "R on top of the divers attacking your carry.",
      poke: "Look for Q off-angles; don't sit in poke.",
    },
  },
  Leona: {
    summary: "All-in engage support. Zenith Blade dash, Shield of Daybreak stun, Solar Flare AoE.",
    combos: [
      { name: "Engage", keys: "E → Q → AA → W → R", when: "Pick target" },
      { name: "R first", keys: "R → E → Q → AA", when: "Clumped enemies" },
    ],
    tips: [
      "E stops on the first enemy champion hit - aim past minions or it will miss.",
      "W gives armor/MR, then explodes; staying in fights extends the resistances.",
      "Passive Sunlight: your abilities mark enemies; ally damage detonates the mark.",
      "R center stuns, the edge only slows - aim the middle at the carry.",
      "Use E on a diver to stun them off your carry.",
    ],
    fights: {
      teamfight: "R → E onto the clump; your team follows on the stuns.",
      poke: "Don't stand in poke; wait in safety and engage the moment health relics or cooldowns are down.",
      dive: "Q + R the diver.",
    },
  },
  Sona: {
    summary: "Aura enchanter. Every ability gives an aura and charges Power Chord; Crescendo stuns a line of enemies.",
    combos: [
      { name: "Crescendo", keys: "R → Q → AA (Power Chord)", when: "Stun the clump, follow with Q + empowered auto" },
      { name: "Power Chord", keys: "Q → W → E → AA", when: "Third ability charges Power Chord; the auto applies the last song's effect (Q damage, W damage reduction, E slow)" },
    ],
    tips: [
      "Q poke is your main damage in ARAM - hit two closest enemies.",
      "W heals the lowest ally and yourself; it also shields allies touched by the aura.",
      "E speed helps escape or catch.",
      "Stay behind your team - you are very squishy.",
    ],
    fights: { teamfight: "R the enemy engage or the clump.", poke: "Q every cooldown; W to sustain." },
  },
  Seraphine: {
    summary: "AoE mage/enchanter. Every third spell echoes (casts twice); Encore charms a long line and extends through allies.",
    combos: [
      { name: "Double E root", keys: "E (echo) → Q", when: "Echoed E roots slowed targets (first E slows, second roots)" },
      { name: "Encore", keys: "R (through an ally) → E → Q", when: "R extends when it passes allies or enemies" },
      { name: "Team save", keys: "W (echo)", when: "Echo W heals + shields allies around you" },
    ],
    tips: [
      "Watch your passive counter - save the echo for E or W.",
      "Q deals more damage to low HP targets.",
      "Notes: casting abilities near allies gives them notes - your autos fire with extra damage.",
    ],
    fights: { teamfight: "R through allies into the clump.", poke: "Q from range; E slow." },
  },
  Karthus: {
    summary: "AoE DPS mage. Lay Waste spam, Defile toggle; Requiem hits every enemy on the map. Passive lets you cast while dead.",
    combos: [
      { name: "Slow Q", keys: "W (wall slow) → Q → Q", when: "Slowed enemies can't dodge Q" },
      { name: "Requiem", keys: "R", when: "Cast when 2+ enemies are low; hits everyone globally after 3s" },
    ],
    tips: [
      "Q deals double damage if it hits only one target.",
      "Passive: after death you keep casting for 7s - stay in fight.",
      "E toggles mana drain; turn it off out of combat.",
    ],
    fights: { teamfight: "Walk into fights with E; die late with passive.", poke: "Q spam." },
  },
  MissFortune: {
    summary: "AoE ADC. Bullet Time on clumped enemies devastates ARAM fights.",
    combos: [
      { name: "R", keys: "E → R", when: "Slowed and clumped enemies" },
      { name: "Bounce", keys: "Q (bounce through minion)", when: "Q bounces to a target behind" },
    ],
    tips: [
      "Passive Love Tap: your first hit on a new target deals bonus damage - alternate targets.",
      "R is cancelled if you move or get CC'd; wait for enemy CC to be spent or use it from fog.",
      "Q bounce crits if the first target dies, and prioritizes Love Tap marked targets.",
      "E slow zone zones chokepoints and sets up R.",
    ],
    fights: { teamfight: "Channel R from behind your frontline once the enemy engage is used.", poke: "Q bounce off minions onto champions." },
  },
  Brand: {
    summary: "AoE burn mage. Stack Blaze three times on enemies to detonate; Pyroclasm bounces through clumps.",
    combos: [
      { name: "Stun", keys: "E → Q", when: "Q stuns ablaze targets" },
      { name: "Full AoE", keys: "W → E → Q → R", when: "R bounces between enemies; three stacks detonate" },
    ],
    tips: [
      "W pillar deals bonus damage to targets already ablaze.",
      "E on a burning minion spreads fire to nearby champions.",
      "R prefers champions and can hit a lone target several times - best into clumps.",
    ],
    fights: { teamfight: "E → W into clumps, R the fight.", poke: "W from max range." },
  },
  Veigar: {
    summary: "Scaling burst mage. Stack AP with Baleful Strike; Event Horizon cage stuns anyone crossing the edge.",
    combos: [
      { name: "Cage burst", keys: "E → W → Q → R", when: "Stunned targets can't dodge W" },
      { name: "Execute", keys: "R", when: "R deals more damage vs low HP targets" },
    ],
    tips: [
      "Q last hits on minions grant stacks - ARAM waves give constant stacks.",
      "E cage edge stuns - place it so enemies have to cross it.",
      "Hold R for low-HP targets.",
    ],
  },
  Kennen: {
    summary: "AoE stun flanker. Slicing Maelstrom with Lightning Rush engage stuns whole teams.",
    combos: [
      { name: "Flank R", keys: "E (energy speed) → Flash → R → W → Zhonya's", when: "Run into the clump and stun everyone" },
      { name: "Trade", keys: "Q → AA → W", when: "Three Mark of the Storm stacks stun" },
    ],
    tips: [
      "Three Mark of the Storm stacks stun; R applies marks repeatedly so it stuns everyone in it.",
      "E: big move speed, pass through units marking them; bonus attack speed when it ends.",
      "Zhonya's after R keeps the storm going while you are invulnerable.",
    ],
  },
};
