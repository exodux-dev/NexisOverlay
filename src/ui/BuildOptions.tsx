// u.gg-style option lists on the Build view: core builds, starting items and boots from the stats
// source, each with win rate / pick rate / games. Picking one is stored per champion + mode and
// rebuilds the plan (build order, shop advice, "Import to League" item set) around it.

import { Fragment, type ReactNode } from "react";
import type { BuildPlan } from "../engine/build";
import { winRateOf, type BuildChoice } from "../engine/options";
import type { Item, WinStat } from "../engine/types";
import { gold, pct } from "./format";
import { GameIcon } from "./GameIcon";
import { Icon } from "./icons";
import { ItemTooltip } from "./ItemIcon";
import { OptionsHelp } from "./OptionsHelp";
import { gamesText, wrTone } from "./RunesSpells";
import { Tip } from "./Tip";
import "./build-options.css";

type Choose = (patch: Partial<BuildChoice>) => void;

function OptRates({ stat, top4 }: { stat: WinStat; top4?: boolean }) {
  const wr = winRateOf(stat);
  return (
    <span className="bo-rates">
      <span className={`bo-wr ${wrTone(wr)}`}>
        <b>{pct(wr, 1)}</b> {top4 ? "Top 4" : "WR"}
      </span>
      <span className="bo-pr">
        {stat.pickRate !== undefined && <>{pct(stat.pickRate, 1)} pick · </>}
        {gamesText(stat.games)} games
      </span>
    </span>
  );
}

function Icons({ items, size, arrows }: { items: Item[]; size: number; arrows?: boolean }) {
  return (
    <span className="bo-icons">
      {items.map((it, i) => (
        <Fragment key={`${it.id}-${i}`}>
          {arrows && i > 0 && <Icon name="chevron" size={11} className="bo-arrow" />}
          <Tip content={<ItemTooltip item={it} />}>
            <span className="bo-icon">
              <GameIcon src={it.icon} name={it.name} size={size} />
            </span>
          </Tip>
        </Fragment>
      ))}
    </span>
  );
}

function OptionRow({
  on,
  onPick,
  children,
  label,
  testId,
}: {
  on: boolean;
  onPick?: () => void;
  children: ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <li
      className={`bo-row ${on ? "is-on" : ""} ${onPick ? "" : "bo-static"}`}
      role="radio"
      aria-checked={on}
      aria-label={label}
      tabIndex={onPick ? 0 : undefined}
      onClick={onPick}
      onKeyDown={(e) => {
        if (onPick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onPick();
        }
      }}
      data-testid={testId}
    >
      {children}
    </li>
  );
}

/** Top core builds (auto pick first). Rendered only when the source has 2+ well-played builds. */
export function CoreOptions({ plan, onChoose, top4 }: { plan: BuildPlan; onChoose?: Choose; top4?: boolean }) {
  const opts = plan.coreOptions;
  if (opts.length < 2) return null;
  return (
    <div className="bo-core">
      <div className="bo-subhead">
        <span className="bo-head-label">
          Core builds
          <OptionsHelp top4={top4} />
        </span>
        <span className="bo-hint">Pick one to base the build order on</span>
      </div>
      <ul className="bo-core-list" role="radiogroup" aria-label="Core builds">
        {opts.map((o, i) => (
          <OptionRow
            key={o.items.map((it) => it.id).join("-")}
            on={i === plan.coreIndex}
            onPick={onChoose && (() => onChoose({ core: i === 0 ? undefined : o.key }))}
            label={`Core build ${i + 1}: ${o.items.map((it) => it.name).join(", ")}`}
            testId={`core-opt-${i}`}
          >
            <span className="bo-core-top">
              <span className="bo-rank">{i + 1}</span>
              {o.tag === "popular" && <span className="bo-tag bo-tag-best" title="What most players build — the build the stats sites list first">Recommended</span>}
              {o.tag === "best" && <span className="bo-tag" title={`Highest ${top4 ? "top-4" : "win"} rate among builds with at least 3% of games`}>Highest {top4 ? "top 4" : "win rate"}</span>}
              {i === plan.coreIndex && <Icon name="check" size={13} strokeWidth={3} className="bo-check" />}
            </span>
            <Icons items={o.items} size={32} arrows />
            <OptRates stat={o.stat} top4={top4} />
          </OptionRow>
        ))}
      </ul>
    </div>
  );
}

/** Most-played starting item sets; the picked (or auto) one is what the plan starts with. Picking the picked one again goes back to auto. */
export function StarterOptions({ plan, onChoose, top4 }: { plan: BuildPlan; onChoose?: Choose; top4?: boolean }) {
  const opts = plan.starterOptions;
  if (!opts.length) return null;
  if (opts.length === 1 && !plan.starterPicked) {
    return plan.starterIndex === 0 ? (
      <div className="bo-single">
        <OptRates stat={opts[0].stat} top4={top4} />
      </div>
    ) : null;
  }
  const auto = plan.starterAutoIndex;
  return (
    <>
      <div className="subhead bo-list-head">
        <span className="bo-head-label">
          Most played
          <OptionsHelp top4={top4} note="Starting items are listed most played first; the automatic starter is the most played one when it fits your start gold." />
        </span>
        {plan.starterPicked && onChoose && (
          <button
            type="button"
            className="bo-auto"
            onClick={() => onChoose({ starter: undefined })}
            title={auto >= 0 ? `Auto: starting items ${auto + 1}` : "Auto: components toward your first item"}
            data-testid="starter-auto"
          >
            <Icon name="spark" size={11} /> Back to auto
          </button>
        )}
      </div>
      <ul className="bo-list" role="radiogroup" aria-label="Starting items">
        {opts.map((o, i) => {
          const on = i === plan.starterIndex;
          const picked = on && plan.starterPicked;
          const isAuto = i === auto;
          return (
            <OptionRow
              key={o.key}
              on={on}
              onPick={onChoose && (() => onChoose({ starter: picked ? undefined : o.key }))}
              label={`Starting items ${i + 1}: ${o.items.map((it) => it.name).join(", ")}${picked ? " (your pick)" : isAuto ? " (auto)" : ""}`}
              testId={`starter-opt-${i}`}
            >
              <Icons items={o.items} size={26} />
              <span className="bo-name">
                <span className="bo-cost tnum">{gold(o.items.reduce((s, it) => s + it.cost, 0))}g</span>
                {picked ? <span className="bo-badge bo-badge-pick">Pick</span> : isAuto && <span className="bo-badge">Auto</span>}
              </span>
              <OptRates stat={o.stat} top4={top4} />
            </OptionRow>
          );
        })}
      </ul>
    </>
  );
}

/** Most-played boots; picking one overrides the automatic (enemy-aware) boots, picking it again goes back to auto. */
export function BootsOptions({ plan, onChoose, top4 }: { plan: BuildPlan; onChoose?: Choose; top4?: boolean }) {
  const opts = plan.bootsOptions;
  if (!opts.length) return null;
  const current = plan.boots?.item.id;
  return (
    <>
      <div className="subhead bo-list-head">
        <span className="bo-head-label">
          Most played
          <OptionsHelp top4={top4} note="Boots are listed most played first; automatic boots adapt to the enemy team." />
        </span>
        {plan.bootsIndex >= 0 && onChoose && (
          <button type="button" className="bo-auto" onClick={() => onChoose({ boots: undefined })} data-testid="boots-auto">
            <Icon name="spark" size={11} /> Back to auto
          </button>
        )}
      </div>
      <ul className="bo-list" role="radiogroup" aria-label="Boots">
        {opts.map((o, i) => {
          const on = o.item.id === current;
          return (
            <OptionRow
              key={o.item.id}
              on={on}
              onPick={onChoose && (() => onChoose({ boots: plan.bootsIndex === i ? undefined : o.key }))}
              label={`${o.item.name}${on ? (plan.bootsIndex === i ? " (your pick)" : " (auto)") : ""}`}
              testId={`boots-opt-${i}`}
            >
              <Icons items={[o.item]} size={26} />
              <span className="bo-name">
                {o.item.name}
                {on && <span className={`bo-badge ${plan.bootsIndex === i ? "bo-badge-pick" : ""}`}>{plan.bootsIndex === i ? "Pick" : "Auto"}</span>}
              </span>
              <OptRates stat={o.stat} top4={top4} />
            </OptionRow>
          );
        })}
      </ul>
    </>
  );
}
