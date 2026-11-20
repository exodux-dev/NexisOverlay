// "Shop now": gold-aware purchase advice for the current phase (engine/phase.ts → derived.shop).
// Replaces the old "Next buy" card: buy-now list, "save for" progress and short shop tips.

import { useApp, type Derived } from "../app/store";
import type { BuildPlan, ItemRec } from "../engine/build";
import type { GamePhase, ShopAdvice, ShopBuy } from "../engine/phase";
import type { Item } from "../engine/types";
import { Card } from "../ui/controls";
import { gold } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { ItemTooltip } from "../ui/ItemIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import "./shop.css";

const TRACK: Record<"sr" | "other" | "arena", Array<{ phase: GamePhase; label: string }>> = {
  sr: [
    { phase: "early", label: "Early" },
    { phase: "laning", label: "Laning" },
    { phase: "mid", label: "Mid" },
    { phase: "late", label: "Late" },
  ],
  other: [
    { phase: "early", label: "Early" },
    { phase: "mid", label: "Mid" },
    { phase: "late", label: "Late" },
  ],
  arena: [
    { phase: "early", label: "Early" },
    { phase: "mid", label: "Mid" },
    { phase: "late", label: "Late" },
  ],
};

function PhaseTrack({ shop, mode }: { shop: ShopAdvice; mode: Derived["gameMode"] }) {
  const steps = TRACK[mode === "sr" ? "sr" : mode === "arena" ? "arena" : "other"];
  const at = steps.findIndex((s) => s.phase === shop.phase);
  return (
    <div className={`shop-phase phase-${shop.phase}`}>
      <span className="shop-phase-pill">
        <span className="shop-phase-dot" />
        {shop.phaseLabel}
      </span>
      {shop.phase !== "pregame" && (
        <ol className="shop-track" aria-label="Game phase">
          {steps.map((s, i) => (
            <li key={s.phase} className={i < at ? "is-past" : i === at ? "is-now" : ""} title={s.label}>
              <span />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function GoldChip({ shop, startGold, arena }: { shop: ShopAdvice; startGold: number; arena: boolean }) {
  if (shop.gold !== undefined)
    return (
      <span className="shop-gold" title="Current gold">
        <Icon name="coin" size={14} />
        <span className="tnum">{gold(shop.gold)}</span>
      </span>
    );
  if (arena) return null;
  return (
    <span className="shop-gold shop-gold-start" title="Starting gold">
      <span className="dim">Start</span>
      <Icon name="coin" size={14} />
      <span className="tnum">{gold(startGold)}</span>
    </span>
  );
}

function BuyRow({ b, item, best }: { b: ShopBuy; item?: Item; best: boolean }) {
  const discounted = !!item && b.cost < item.cost;
  return (
    <li className={`shop-buy ${best ? "is-best" : ""}`}>
      <Tip content={<ItemTooltip item={item} note={b.reason} fallbackName={b.name} />}>
        <span className="shop-buy-icon" tabIndex={0}>
          <GameIcon src={b.icon ?? item?.icon} name={b.name} size={best ? 46 : 38} />
        </span>
      </Tip>
      <span className="shop-buy-body">
        <span className="shop-buy-name">{b.name}</span>
        <span className="shop-buy-reason">{b.reason}</span>
      </span>
      <span className="shop-buy-cost">
        <Icon name="coin" size={12} />
        <span className="tnum">{gold(b.cost)}</span>
        {discounted && <span className="shop-buy-full tnum">{gold(item!.cost)}</span>}
      </span>
    </li>
  );
}

function SaveFor({ shop, plan, items }: { shop: ShopAdvice; plan?: BuildPlan; items?: Map<number, Item> }) {
  const s = shop.saveFor!;
  const item = items?.get(Number(s.itemId));
  const rec: ItemRec | undefined = plan?.order.find((r) => String(r.item.id) === s.itemId);
  const cost = item?.cost ?? s.need;
  const have = Math.max(0, cost - s.need);
  const invested = Math.min(have, rec?.invested ?? 0);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(1, cost)) * 100))}%`;
  const progress = Math.round((have / Math.max(1, cost)) * 100);
  return (
    <div className="shop-save">
      <div className="shop-sub">Save for</div>
      <div className="shop-save-main">
        <Tip content={<ItemTooltip item={item} rec={rec} fallbackName={s.name} />}>
          <span className="shop-save-icon" tabIndex={0}>
            <GameIcon src={s.icon ?? item?.icon} name={s.name} size={52} />
          </span>
        </Tip>
        <div className="shop-save-info">
          <div className="shop-save-name">{s.name}</div>
          <div className="shop-save-need">
            <strong className="tnum">{gold(s.need)}g</strong> more
            {item && <span className="dim tnum"> · {gold(cost)}g total</span>}
          </div>
        </div>
      </div>
      <div
        className="shop-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={`${s.name}: ${progress}% of the gold`}
      >
        <span className="shop-bar-inv" style={{ width: pct(invested) }} />
        <span className="shop-bar-gold" style={{ width: pct(have - invested) }} />
      </div>
      <div className="shop-bar-legend">
        {invested > 0 && (
          <span>
            <i className="lg lg-inv" />
            In components {gold(invested)}
          </span>
        )}
        {have - invested > 0 && (
          <span>
            <i className="lg lg-gold" />
            Gold {gold(have - invested)}
          </span>
        )}
        <span className="shop-bar-pct tnum">{progress}%</span>
      </div>
    </div>
  );
}

function SaveFallback({ shop, plan, arena, items }: { shop: ShopAdvice; plan?: BuildPlan; arena: boolean; items?: Map<number, Item> }) {
  const next = plan?.next;
  // Arena outside a game: gold arrives per round, so show the first target without a gold comparison.
  if (next?.goldUnknown) {
    const it = next.rec.item;
    return (
      <div className="shop-save">
        <div className="shop-sub">First target</div>
        <div className="shop-save-main">
          <Tip content={<ItemTooltip item={it} rec={next.rec} />}>
            <span className="shop-save-icon" tabIndex={0}>
              <GameIcon src={it.icon} name={it.name} size={52} />
            </span>
          </Tip>
          <div className="shop-save-info">
            <div className="shop-save-name">{it.name}</div>
            <div className="shop-save-need dim">
              <Icon name="coin" size={12} /> {gold(next.missingGold)}g · buy it in your first shop phase
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (shop.phase === "pregame") return null;
  // No save target in a game: either the next item is affordable right now, or the build is done.
  const first = shop.buyNow[0] && items?.get(Number(shop.buyNow[0].itemId));
  const ready = !!first?.completed;
  // Only claim "Build complete" when the plan really has nothing left to buy.
  if (!ready && (!plan || plan.next)) return null;
  const done = !ready;
  return (
    <div className="shop-save shop-save-done">
      <span className="shop-done-icon">
        <Icon name="check" size={20} />
      </span>
      <div>
        <div className="shop-save-name">{done ? "Build complete" : "Ready to buy"}</div>
        <div className="dim small">
          {done
            ? plan?.swaps.length
              ? "Consider the late-game swaps below."
              : arena
                ? "Spend each round's gold on stat anvils."
                : "Hold gold for Elixirs and Control Wards."
            : "You can afford your next item — finish it on this back."}
        </div>
      </div>
    </div>
  );
}

export function ShopCard({ d }: { d: Derived }) {
  const shop = d.shop;
  const items = useApp((s) => s.data?.items);
  const startGold = useApp((s) => (d.gameMode === "sr" ? 500 : s.settings.startGold));
  const plan = d.plan;
  const arena = d.gameMode === "arena";
  const pregame = shop.phase === "pregame";
  const total = shop.buyNow.reduce((s, b) => s + b.cost, 0);
  const left = shop.gold !== undefined ? shop.gold - total : undefined;
  // Green "ready" state when the best buy finishes an item (or the build is done).
  const firstBuy = shop.buyNow[0] && items?.get(Number(shop.buyNow[0].itemId));
  const ready = !pregame && (!!firstBuy?.completed || (!shop.saveFor && shop.buyNow.length > 0));

  return (
    <Card
      title={pregame ? "Shop — starting buy" : "Shop now"}
      icon="coin"
      className={`shop-card ${ready ? "is-ready" : ""}`}
      extra={
        <div className="shop-head">
          <PhaseTrack shop={shop} mode={d.gameMode} />
          <GoldChip shop={shop} startGold={startGold} arena={arena} />
        </div>
      }
    >
      <div className="shop-grid">
        <div className="shop-col shop-col-buy">
          <div className="shop-sub">
            {pregame ? (arena ? "First shop" : "Starting items") : "Buy now"}
            {shop.buyNow.length > 1 && (
              <span className="shop-sub-total tnum">
                {gold(total)}g{left !== undefined && left > 0 ? ` · ${gold(left)}g left` : ""}
              </span>
            )}
          </div>
          {shop.buyNow.length ? (
            <ol className="shop-buys">
              {shop.buyNow.map((b, i) => (
                <BuyRow key={`${b.itemId}-${i}`} b={b} item={items?.get(Number(b.itemId))} best={i === 0} />
              ))}
            </ol>
          ) : (
            <div className="shop-empty">
              <Icon name="info" size={15} />
              <span>
                {pregame
                  ? arena
                    ? "Gold arrives every round — the first shop opens after the game starts."
                    : "No starting items for this build yet."
                  : shop.saveFor
                    ? `Nothing useful to buy with ${gold(shop.gold ?? 0)}g — keep the gold for ${shop.saveFor.name}.`
                    : "Nothing to buy right now."}
              </span>
            </div>
          )}
        </div>

        <div className="shop-col shop-col-save">
          {shop.saveFor ? <SaveFor shop={shop} plan={plan} items={items} /> : <SaveFallback shop={shop} plan={plan} arena={arena} items={items} />}
        </div>

        {shop.tips.length > 0 && (
          <div className="shop-col shop-col-tips">
            <div className="shop-sub">Shop tips</div>
            <ul className="shop-tips">
              {shop.tips.map((t) => (
                <li key={t}>
                  <Icon name="spark" size={12} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
