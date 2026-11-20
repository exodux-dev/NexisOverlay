// Game phase + gold-aware shop advice ("what should I buy right now?").
//
//   phase    = mode × game time × level (× first tower on Summoner's Rift, × items owned in Arena)
//   buyNow   = finish the next planned item if the gold is there, else the most valuable affordable
//              components of it, then leftover-gold fillers (boots, Control Ward, Elixir)
//   saveFor  = the next big item and the gold still missing
//   tips     = short, shop/build-only advice for the phase (no timers, no hidden info, no
//              real-time combat calls — Riot overlay policy)
//
// Pure: everything comes in through ShopContext; item pools are read per mode (no global map state).

import type { BuildPlan, ItemRec } from "./build";
import { COUNTER_LABEL } from "./build";
import type { GameModeKind } from "./mode";
import { itemMapFor, type ItemMap } from "./staticData";
import type { ThreatReport } from "./threat";
import type { GameSnapshot, Item, StaticData } from "./types";

export type GamePhase = "pregame" | "early" | "laning" | "mid" | "late";

export interface ShopBuy {
  itemId: string;
  name: string;
  icon?: string;
  cost: number;
  reason: string;
}

export interface ShopAdvice {
  phase: GamePhase;
  /** e.g. "Laning phase", "Mid game", "Late game". */
  phaseLabel: string;
  /** Current gold when in a game. */
  gold?: number;
  /** Best affordable purchase(s) right now, max 3, best first. */
  buyNow: ShopBuy[];
  /** Next big target and the gold still needed. */
  saveFor?: { itemId: string; name: string; icon?: string; need: number };
  /** Max 3 short, general shop/build tips for the phase. */
  tips: string[];
}

export interface ShopContext {
  data: StaticData;
  plan?: BuildPlan;
  /** The displayed game; null / loading screen / explore snapshot → pregame. */
  game: GameSnapshot | null;
  mode: GameModeKind;
  threat?: ThreatReport;
}

// ------------------------------------------------------------------ constants

export const CONTROL_WARD = 2055;
export const BASIC_BOOTS = 1001;
export const ELIXIR_IRON = 2138;
export const ELIXIR_SORCERY = 2139;
export const ELIXIR_WRATH = 2140;
/** The Grievous Wounds components (Executioner's Calling, Oblivion Orb, Bramble Vest). */
export const ANTIHEAL_COMPONENTS = [3123, 3916, 3076];

const MAX_BUYS = 3;
const MAX_TIPS = 3;
const MIN = 60;

// ------------------------------------------------------------------ phase

export interface PhaseInput {
  mode: GameModeKind;
  /** False for champ select, the loading screen and explore mode. */
  inGame: boolean;
  gameTime: number; // seconds
  level: number;
  /** Completed items owned (incl. upgraded boots). */
  completedItems?: number;
  /** All six slots hold completed items, or the planned build is done. */
  fullBuild?: boolean;
  /** Summoner's Rift: game time (s) of the first turret kill, when known. */
  firstTowerAt?: number;
}

const LABELS: Record<GameModeKind, Record<GamePhase, string>> = {
  sr: { pregame: "Pre-game", early: "Early game", laning: "Laning phase", mid: "Mid game", late: "Late game" },
  aram: { pregame: "Pre-game", early: "Early game", laning: "Early game", mid: "Mid game", late: "Late game" },
  mayhem: { pregame: "Pre-game", early: "Early game", laning: "Early game", mid: "Mid game", late: "Late game" },
  arena: { pregame: "Pre-game", early: "Early rounds", laning: "Early rounds", mid: "Mid rounds", late: "Late rounds" },
};

export function phaseLabel(phase: GamePhase, mode: GameModeKind): string {
  return LABELS[mode][phase];
}

/** End of the Summoner's Rift laning phase: plates fall at 14:00, an early first tower (≥ 9:00) ends it sooner. */
export function laningEndsAt(firstTowerAt?: number): number {
  if (firstTowerAt === undefined || !Number.isFinite(firstTowerAt)) return 14 * MIN;
  return Math.min(14 * MIN, Math.max(9 * MIN, firstTowerAt));
}

export function gamePhase(p: PhaseInput): GamePhase {
  if (!p.inGame) return "pregame";
  const t = Math.max(0, p.gameTime);
  switch (p.mode) {
    case "sr":
      if (t < 3.5 * MIN) return "early";
      if (t < laningEndsAt(p.firstTowerAt)) return "laning";
      return t < 25 * MIN ? "mid" : "late";
    case "arena": {
      // Rounds are short and gold arrives per round: items owned (and level) say more than the clock.
      const items = p.completedItems ?? 0;
      if (p.fullBuild || items >= 4 || p.level >= 16) return "late";
      if (items >= 2 || p.level >= 10) return "mid";
      return "early";
    }
    default:
      // ARAM / Mayhem: no lane phase.
      if (p.fullBuild || t > 18 * MIN) return "late";
      if (t < 6 * MIN || p.level < 9) return "early";
      return "mid";
  }
}

// ------------------------------------------------------------------ item helpers

function availableOn(map: ItemMap) {
  return (it: Item | undefined): it is Item => !!it && (map === "sr" ? it.sr : map === "arena" ? it.arena === true : it.aram);
}

const isBoots = (it: Item | undefined) => !!it?.tags.includes("Boots");
const isTrinket = (it: Item | undefined) => !!it?.tags.includes("Trinket");
const isConsumable = (it: Item | undefined) => !!it?.tags.includes("Consumable");

/** A completed (legendary or upgraded-boots) item, the kind you only ever hold one of. */
const isCompleted = (it: Item | undefined) => !!it && it.completed && !isConsumable(it) && !isTrinket(it);

function buy(it: Item, reason: string, cost = it.cost): ShopBuy {
  return { itemId: String(it.id), name: it.name, icon: it.icon, cost, reason };
}

/** A missing piece of an item's recipe, priced as if bought now (owned sub-components are consumed). */
interface Need {
  item: Item;
  price: number;
  /** Inventory items this purchase combines (frees their slots). */
  consumed: number[];
  children: Need[];
}

/**
 * The parts of `item` still missing given `pool` (inventory ids, consumed as they're used).
 * Returns the item's own node: price = gold to buy it outright now.
 */
function needTree(data: StaticData, item: Item, pool: number[]): Need {
  const children: Need[] = [];
  const consumed: number[] = [];
  let price = item.cost;
  for (const cid of item.from) {
    const idx = pool.indexOf(cid);
    const c = data.items.get(cid);
    if (idx >= 0) {
      pool.splice(idx, 1);
      consumed.push(cid);
      price -= c?.cost ?? 0;
      continue;
    }
    if (!c) continue;
    const child = needTree(data, c, pool);
    children.push(child);
    consumed.push(...child.consumed);
    price -= c.cost - child.price;
  }
  return { item, price: Math.max(0, price), consumed, children };
}

function flatten(n: Need, out: Need[] = []): Need[] {
  for (const c of n.children) {
    out.push(c);
    flatten(c, out);
  }
  return out;
}

function within(n: Need, other: Need): boolean {
  return n === other || flatten(other).includes(n) || flatten(n).includes(other);
}

/**
 * Greedy component path toward `item`: the most valuable affordable missing parts (higher cost
 * first), never two parts where one builds into the other.
 */
function componentPath(
  data: StaticData,
  item: Item,
  inventory: number[],
  budget: number,
  slots: number,
  ok: (it: Item | undefined) => it is Item,
): Array<{ need: Need; slotsUsed: number }> {
  const root = needTree(data, item, [...inventory]);
  const options = flatten(root)
    .filter((n) => ok(n.item) && n.price > 0)
    .sort((a, b) => b.item.cost - a.item.cost || a.price - b.price);
  const picked: Array<{ need: Need; slotsUsed: number }> = [];
  let left = budget;
  let free = slots;
  for (const n of options) {
    if (n.price > left) continue;
    if (picked.some((p) => within(p.need, n))) continue;
    const slotsUsed = 1 - n.consumed.length;
    if (free - slotsUsed < 0) continue;
    picked.push({ need: n, slotsUsed });
    left -= n.price;
    free -= slotsUsed;
  }
  return picked;
}

/** Gold still missing for `item` given the inventory (components count toward it). */
function missingFor(data: StaticData, item: Item, inventory: number[]): number {
  return needTree(data, item, [...inventory]).price;
}

function elixirFor(plan: BuildPlan | undefined): number {
  switch (plan?.family) {
    case "ap":
    case "enchanter":
      return ELIXIR_SORCERY;
    case "adc":
    case "lethality":
      return ELIXIR_WRATH;
    default:
      return ELIXIR_IRON;
  }
}

function kindReason(rec: ItemRec, invested: number): string {
  const base =
    rec.kind === "boots"
      ? "Upgrades your boots"
      : rec.kind === "situational"
        ? `Counter item${rec.counter ? ` — ${COUNTER_LABEL[rec.counter].toLowerCase()}` : ""}`
        : rec.kind === "core"
          ? "Completes a core item — power spike"
          : "Completes your next item";
  return invested > 0 ? `${base} (combines your components)` : base;
}

// ------------------------------------------------------------------ advice

export function shopAdvice(ctx: ShopContext): ShopAdvice {
  const { data, plan, game, mode, threat } = ctx;
  const ok = availableOn(itemMapFor(mode));
  const inGame = !!game && !game.loading && game.gameMode !== "EXPLORE";
  const inventory = (game?.me.items ?? []).map((i) => i.id);
  const owned = inventory.map((id) => data.items.get(id));
  const completedOwned = owned.filter(isCompleted).length;
  const fullBuild = completedOwned >= 6 || (!!plan && !plan.next && plan.order.length > 0 && plan.order.every((r) => r.owned));

  const phase = gamePhase({
    mode,
    inGame,
    gameTime: game?.gameTime ?? 0,
    level: game?.me.level ?? 1,
    completedItems: completedOwned,
    fullBuild,
    firstTowerAt: game?.firstTowerAt,
  });
  const label = phaseLabel(phase, mode);

  if (phase === "pregame") return pregame(ctx, ok, label);

  // A missing / garbage gold value must not turn into NaN (every comparison false, "NaN" shown).
  const gold = Number.isFinite(game!.gold) ? Math.max(0, Math.floor(game!.gold)) : 0;
  const buys: ShopBuy[] = [];
  const pickedIds = new Set<number>();
  let left = gold;
  let slots = Math.max(0, 6 - owned.filter((it) => !isTrinket(it)).length);
  const push = (b: ShopBuy, id: number, cost: number, slotsUsed: number) => {
    buys.push(b);
    pickedIds.add(id);
    left -= cost;
    slots -= slotsUsed;
  };
  const ownsBoots = owned.some(isBoots);
  const ownsUpgradedBoots = owned.some((it) => isBoots(it) && isCompleted(it));
  const ownsCompleted = (id: number) => owned.some((it) => it?.id === id && isCompleted(it));

  // ---- 1. the planned item: finish it, else its best affordable components
  // Never a second copy of a completed item, never a second pair of upgraded boots.
  const buyable = (r: ItemRec) => !r.owned && !ownsCompleted(r.item.id) && !(isBoots(r.item) && ownsUpgradedBoots);
  const target = plan && !fullBuild ? plan.order.find(buyable) : undefined;
  let saveTarget: Item | undefined;
  let saveInv = inventory;
  let spentElsewhere = 0;

  // Heavy healing: a Grievous Wounds component jumps the queue (cheap, and it matters early).
  // Meter sources mix champions and items ("Soraka", "Soraka (Moonstone Renewer)"): champions only, once.
  const healSources = [...new Set((threat?.meters.find((m) => m.key === "heal")?.sources ?? []).map((x) => x.replace(/ \(.*\)$/, "")))];
  const antihealRec = plan?.situational.find((s) => s.counter === "antiheal");
  const ownsAntiheal = owned.some((it) => !!it && (ANTIHEAL_COMPONENTS.includes(it.id) || it.tags.includes("GrievousWounds") || it.id === antihealRec?.item.id));
  const antihealComp = antihealRec ? antihealComponent(data, antihealRec.item, ok) : undefined;
  const wantAntiheal = !fullBuild && !!antihealComp && !ownsAntiheal && (threat?.heal ?? 0) >= 0.6 && !antihealRec?.owned;
  const tryAntiheal = () => {
    if (!wantAntiheal || !antihealComp || pickedIds.has(antihealComp.id) || buys.length >= MAX_BUYS) return;
    if (antihealComp.cost > left || slots < 1) return;
    const who = healSources.slice(0, 2).join(", ");
    push(buy(antihealComp, `Anti-heal${who ? ` vs ${who}` : ""} — builds into ${antihealRec!.item.name}`), antihealComp.id, antihealComp.cost, 1);
    spentElsewhere += antihealComp.cost;
  };
  // The anti-heal component bought first can also be part of the planned item's recipe:
  // componentPath doesn't know it's already in the cart, so don't list it twice.
  const dupAntiheal = (id: number) => id === antihealComp?.id && pickedIds.has(id);
  const antihealFirst = wantAntiheal && (threat?.heal ?? 0) >= 0.8 && target?.item.id !== antihealRec?.item.id;

  if (target && ok(target.item)) {
    const missing = missingFor(data, target.item, inventory);
    const tree = needTree(data, target.item, [...inventory]);
    const slotsUsed = 1 - tree.consumed.length;
    if (missing <= left && slots - slotsUsed >= 0) {
      push(buy(target.item, kindReason(target, target.item.cost - missing), missing), target.item.id, missing, slotsUsed);
      spentElsewhere += missing;
      // Leftover: start the item after it.
      const after = plan!.order.find((r) => r !== target && buyable(r) && !(isBoots(r.item) && isBoots(target.item)));
      if (after && ok(after.item)) {
        const pool = [...inventory];
        for (const id of tree.consumed) pool.splice(pool.indexOf(id), 1);
        const inv2 = [...pool, target.item.id];
        saveTarget = after.item;
        saveInv = inv2;
        if (antihealFirst) tryAntiheal();
        for (const { need, slotsUsed: su } of componentPath(data, after.item, inv2, left, slots, ok)) {
          if (buys.length >= MAX_BUYS) break;
          if (dupAntiheal(need.item.id)) continue;
          push(buy(need.item, `Starts ${after.item.name}`, need.price), need.item.id, need.price, su);
        }
      }
    } else {
      saveTarget = target.item;
      if (antihealFirst) tryAntiheal();
      for (const { need, slotsUsed: su } of componentPath(data, target.item, inventory, left, slots, ok)) {
        if (buys.length >= MAX_BUYS) break;
        if (dupAntiheal(need.item.id)) continue;
        const uses = need.consumed.map((id) => data.items.get(id)?.name).filter(Boolean);
        const why = `Builds into ${target.item.name}${uses.length ? ` — uses your ${uses.join(" + ")}` : ""}`;
        push(buy(need.item, why, need.price), need.item.id, need.price, su);
      }
    }
  }
  tryAntiheal();

  // ---- 2. leftover fillers
  const early = phase === "early" || phase === "laning";
  const boots = data.items.get(BASIC_BOOTS);
  if (
    early &&
    !ownsBoots &&
    plan?.boots &&
    !isBoots(target?.item) &&
    ![...pickedIds].some((id) => isBoots(data.items.get(id))) &&
    ok(boots) &&
    boots.cost <= left &&
    slots >= 1 &&
    buys.length < MAX_BUYS
  ) {
    push(buy(boots, `Tier-1 boots — upgrade to ${plan.boots.item.name} later`), boots.id, boots.cost, 1);
    spentElsewhere += boots.cost;
  }

  const ward = data.items.get(CONTROL_WARD);
  const wardsOwned = inventory.filter((id) => id === CONTROL_WARD).length;
  if (mode === "sr" && ok(ward) && wardsOwned < 2 && ward.cost <= left && (wardsOwned > 0 || slots >= 1) && buys.length < MAX_BUYS) {
    push(buy(ward, wardsOwned ? "Second Control Ward — you can carry 2" : "Control Ward — vision for your lane and objectives"), ward.id, ward.cost, wardsOwned ? 0 : 1);
    spentElsewhere += ward.cost;
  }

  if (fullBuild && phase === "late" && (mode === "sr" || mode === "aram" || mode === "mayhem")) {
    const elixir = data.items.get(elixirFor(plan));
    if (ok(elixir) && elixir.cost <= left && buys.length < MAX_BUYS) {
      push(buy(elixir, "Full build — an Elixir is your best use of gold"), elixir.id, elixir.cost, 0);
      spentElsewhere += elixir.cost;
    }
  }

  // ---- 3. save for
  let saveFor: ShopAdvice["saveFor"];
  if (saveTarget && !fullBuild) {
    // Gold that goes into the saved item's own components counts toward it; fillers don't.
    const need = Math.max(0, missingFor(data, saveTarget, saveInv) - (gold - spentElsewhere));
    if (need > 0) saveFor = { itemId: String(saveTarget.id), name: saveTarget.name, icon: saveTarget.icon, need };
  }

  return {
    phase,
    phaseLabel: label,
    gold,
    buyNow: buys.slice(0, MAX_BUYS),
    ...(saveFor ? { saveFor } : {}),
    tips: inGameTips({ ctx, phase, fullBuild, ownsBoots, owned, wantAntiheal, antihealComp, healSources, completedOwned }),
  };
}

/** The Grievous Wounds component in `item`'s recipe (or the family's usual one). */
function antihealComponent(data: StaticData, item: Item, ok: (it: Item | undefined) => it is Item): Item | undefined {
  const walk = (it: Item): Item | undefined => {
    for (const cid of it.from) {
      if (ANTIHEAL_COMPONENTS.includes(cid)) {
        const c = data.items.get(cid);
        if (ok(c)) return c;
      }
      const c = data.items.get(cid);
      const deep = c && walk(c);
      if (deep) return deep;
    }
    return undefined;
  };
  return walk(item);
}

// ------------------------------------------------------------------ pregame

function pregame(ctx: ShopContext, ok: (it: Item | undefined) => it is Item, label: string): ShopAdvice {
  const { plan, mode, data } = ctx;
  const buyNow: ShopBuy[] = [];
  const first = plan?.order[0];
  for (const it of plan?.starter ?? []) {
    if (buyNow.length >= MAX_BUYS || !ok(it)) continue;
    const reason = plan?.starterSource === "stats" ? "Most-played first buy" : first ? `Component of ${first.item.name}` : "Starting item";
    buyNow.push(buy(it, reason));
  }
  let saveFor: ShopAdvice["saveFor"];
  if (first && ok(first.item) && mode !== "arena") {
    const inv = (plan?.starter ?? []).map((i) => i.id);
    const need = missingFor(data, first.item, inv);
    if (need > 0) saveFor = { itemId: String(first.item.id), name: first.item.name, icon: first.item.icon, need };
  }
  const tips: string[] = [];
  if (first) tips.push(`Rush ${first.item.name} — your first power spike`);
  const counter = plan?.situational.find((s) => !s.owned && (s.urgency ?? 0) >= 0.6);
  if (counter?.counter) tips.push(`Plan ${counter.item.name} for ${COUNTER_LABEL[counter.counter].toLowerCase()}`);
  if (mode === "sr") tips.push("Pick up a Control Ward on your first back");
  else if (mode === "arena") tips.push("Gold arrives every round — spend it all in each shop phase");
  else tips.push("You can only shop on death in ARAM — spend all your start gold");
  return { phase: "pregame", phaseLabel: label, buyNow, ...(saveFor ? { saveFor } : {}), tips: tips.slice(0, MAX_TIPS) };
}

// ------------------------------------------------------------------ tips

function inGameTips(a: {
  ctx: ShopContext;
  phase: GamePhase;
  fullBuild: boolean;
  ownsBoots: boolean;
  owned: Array<Item | undefined>;
  wantAntiheal: boolean;
  antihealComp?: Item;
  healSources: string[];
  completedOwned: number;
}): string[] {
  const { ctx, phase, fullBuild, owned, completedOwned } = a;
  const { mode, plan } = ctx;
  const tips: string[] = [];
  const add = (t: string | undefined) => {
    if (t && !tips.includes(t)) tips.push(t);
  };

  // Enemy-comp shop advice first: it changes what to buy.
  if (a.wantAntiheal && a.antihealComp) add(`Enemy has heavy healing — buy ${a.antihealComp.name} early`);
  const counter = plan?.situational.find((s) => !s.owned && s.counter !== "antiheal" && (s.urgency ?? 0) >= 0.7);
  if (counter?.counter && !fullBuild) add(`${COUNTER_LABEL[counter.counter]} matters this game — slot in ${counter.item.name}`);
  const swap = plan?.swaps[0];
  if (swap && fullBuild) add(`Swap ${swap.sell.name} for ${swap.buy.item.name}`);

  const coreDone = plan ? plan.order.filter((r) => r.kind !== "boots" && r.owned).length : completedOwned;
  const bootsT1 = owned.some((it) => it?.id === BASIC_BOOTS);
  const firstItem = plan?.order[0]?.item.name;

  if (mode === "sr") {
    if (phase === "early") {
      add("Early game: back with enough gold for a full component");
      add("Buy a Control Ward on your first back");
    } else if (phase === "laning") {
      add("Laning phase: a Control Ward each back keeps your lane safe");
      if (coreDone === 0 && firstItem) add(`Complete ${firstItem} — your first power spike`);
      add("Don't back with under ~400g unless you must — it costs you lane time");
    } else if (phase === "mid") {
      if (bootsT1) add("Upgrade your tier-1 boots — they fall off after laning");
      if (coreDone <= 1) add("Mid game: finish your 2nd core item for its power spike");
      add("Keep a Control Ward in your inventory for objectives");
    } else {
      if (fullBuild) {
        add("Late game: keep an Elixir active");
        add("Full build — consider selling boots for a 6th damage item");
      } else add("Late game: unspent gold gives no stats — shop on every back");
    }
  } else if (mode === "arena") {
    if (phase === "early") add("Early rounds: one completed item beats several components");
    else if (phase === "mid") add("Mid rounds: complete boots and your 2nd-3rd items");
    else add("Late rounds: spend every round's gold — anvils when full");
    add("Gold arrives every round — spend it all in each shop phase");
  } else {
    if (phase === "early") {
      add("No laning phase — you only shop on death, so spend all your gold");
      if (!a.ownsBoots) add("Grab tier-1 boots early for mobility");
    } else if (phase === "mid") {
      if (bootsT1) add("Upgrade your boots — tier-1 boots fall off quickly");
      add(coreDone >= 2 ? "Mid game: your 3rd item is a big power spike" : "Mid game: finish your 2nd core item for its power spike");
    } else {
      add(fullBuild ? "Full build — buy an Elixir each time you respawn" : "Late game: finish your build — every item counts now");
    }
  }
  return tips.slice(0, MAX_TIPS);
}
