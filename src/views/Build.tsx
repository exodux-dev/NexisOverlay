import { Fragment, useState } from "react";
import { DataSourceBar } from "../ui/DataSourceBar";
import { ChampSelectScout } from "./ChampSelectScout";
import { playstyleLabel } from "../ui/format";
import { ShareBuildButtons } from "../ui/ShareBuild";
import { actions, useApp, useChampionSpells, useDerived, webKey, type Derived } from "../app/store";
import { COUNTER_LABEL, type BuildPlan, type ItemRec } from "../engine/build";
import { findChampion } from "../engine/staticData";
import { threatLevel } from "../engine/threat";
import type { Champion, PlayerState } from "../engine/types";
import { ChampionPicker } from "../ui/ChampionPicker";
import { FavStar } from "../ui/FavStar";
import { RunesSpells } from "../ui/RunesSpells";
import { ImportToLeagueButton } from "../ui/ImportToLeague";
import { BootsOptions, CoreOptions, StarterOptions } from "../ui/BuildOptions";
import type { BuildChoice } from "../engine/options";
import { ChampSelectHelper } from "./ChampSelectHelper";
import { MatchupsCard } from "./Matchups";
import { ShopCard } from "./ShopCard";
import { Card, Empty, LEVEL_LABEL, LEVEL_TONE, Meter, Pill, Segmented, SkeletonCard, Toggle } from "../ui/controls";
import { ARCHETYPE_LABEL, gold } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { AbilityTip } from "../ui/GameTips";
import { ItemTooltip, WinRate } from "../ui/ItemIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import { ArenaPlacement } from "../ui/arenaText";

const KIND_LABEL: Record<ItemRec["kind"], string> = { core: "Core", situational: "Situational", flex: "Flex", boots: "Boots" };
const SOURCE_PILL: Record<BuildPlan["source"], { label: string; tone: "teal" | "gold" | "muted"; title: string }> = {
  stats: { label: "Global stats", tone: "teal", title: "Aggregated from the stats dataset (Riot API)" },
  personal: { label: "Your games", tone: "gold", title: "Tuned to your recorded games" },
  template: { label: "Baseline", tone: "muted", title: "Curated baseline build — add a stats source in Settings for win rates" },
};

// ------------------------------------------------------------------ build order

/** Stores a pick among the plan's options for the current champion + mode. */
function chooser(d: Derived): ((patch: Partial<BuildChoice>) => void) | undefined {
  const key = d.choiceKey;
  return key ? (patch) => void actions.setBuildChoice(key, patch) : undefined;
}

function BuildOrder({ plan }: { plan: BuildPlan }) {
  const nextId = plan.next?.rec.item.id;
  const d = useDerived();
  const provider = d.statsProvider;
  const arena = d.gameMode === "arena";
  const src =
    plan.source === "stats" && provider === "hexmayhem"
      ? { label: "HexMayhem", tone: "teal" as const, title: "Public ARAM: Mayhem stats from hexmayhem.com" }
      : plan.source === "stats" && provider === "opgg"
        ? { label: "OP.GG", tone: "teal" as const, title: arena ? "Public Arena stats from op.gg — rates are top-4 finishes" : "Public champion stats from op.gg" }
        : SOURCE_PILL[plan.source];
  return (
    <Card
      title="Build order"
      icon="build"
      className="order-card"
      extra={
        <>
          <ShareBuildButtons d={d} />
          <ImportToLeagueButton />
          <Pill tone={src.tone} title={src.title} dot>
            Data: {src.label}
          </Pill>
        </>
      }
    >
      <div className="order-source">{plan.sourceLabel}</div>
      {arena && <ArenaPlacement stats={d.championStats} className="order-arena small" showTop4={false} />}
      <ol className="order">
        {plan.order.map((rec, i) => {
          const isNext = rec.item.id === nextId && !rec.owned;
          return (
            <Fragment key={`${rec.item.id}-${i}`}>
              {i > 0 && (
                <li className="order-arrow" aria-hidden="true">
                  <Icon name="chevron" size={16} />
                </li>
              )}
              <li className={`slot ${rec.owned ? "slot-owned" : ""} ${isNext ? "slot-next" : ""}`}>
                <Tip content={<ItemTooltip item={rec.item} rec={rec} />}>
                  <div className="slot-icon" tabIndex={0}>
                    <GameIcon src={rec.item.icon} name={rec.item.name} size={56} />
                    <span className="slot-num">{i + 1}</span>
                    {rec.owned && (
                      <span className="slot-check">
                        <Icon name="check" size={12} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                </Tip>
                <span className={`slot-name ${rec.item.name.split(" ").some((w) => w.length > 11) ? "slot-name-long" : ""}`}>{rec.item.name}</span>
                <span className={`kind-badge kind-${rec.kind}`}>{isNext ? "Next" : KIND_LABEL[rec.kind]}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      <CoreOptions plan={plan} onChoose={chooser(d)} top4={arena} />
      <div className="order-foot">
        <span className="ps-chip">{playstyleLabel(plan.playstyle)}</span>
        <span className="dim">{plan.playstyleReason}</span>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ situational

function Situational({ plan }: { plan: BuildPlan }) {
  return (
    <Card title="Situational counters" icon="shield" extra={<span className="dim small">Based on the enemy team</span>}>
      {plan.situational.length === 0 ? (
        <Empty title="No urgent counters" icon="check">
          Their team doesn't force any specific answer — stick to the core build.
        </Empty>
      ) : (
        <ul className="sit-list">
          {plan.situational.map((rec) => {
            const lvl = threatLevel(rec.urgency ?? 0);
            return (
              <li key={rec.item.id} className={`sit ${rec.owned ? "sit-owned" : ""}`}>
                <Tip content={<ItemTooltip item={rec.item} rec={rec} />}>
                  <div className="sit-icon">
                    <GameIcon src={rec.item.icon} name={rec.item.name} size={44} />
                    {rec.owned && (
                      <span className="slot-check">
                        <Icon name="check" size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                </Tip>
                <div className="sit-body">
                  <div className="sit-top">
                    <span className="sit-name">{rec.item.name}</span>
                    {rec.counter && <span className="counter-chip">{COUNTER_LABEL[rec.counter]}</span>}
                    {rec.winRate && <WinRate wr={rec.winRate} />}
                  </div>
                  {rec.reasons.map((r, i) => (
                    <div key={i} className="sit-reason">
                      {r}
                    </div>
                  ))}
                </div>
                <div className="sit-urgency">
                  <span className={`lvl lvl-${lvl}`}>{LEVEL_LABEL[lvl]}</span>
                  <Meter value={rec.urgency ?? 0} tone={LEVEL_TONE[lvl]} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Boots({ plan, d }: { plan: BuildPlan; d: Derived }) {
  if (!plan.boots) return null;
  const b = plan.boots;
  // Boots already listed under "Most played" (with their numbers) aren't repeated as alternatives.
  const alts = plan.bootsAlternatives.filter((a) => !plan.bootsOptions.some((o) => o.item.id === a.item.id) || a.reason.startsWith("Auto"));
  return (
    <Card title="Boots" icon="boot">
      <div className="boots-main">
        <Tip content={<ItemTooltip item={b.item} rec={b} />}>
          <GameIcon src={b.item.icon} name={b.item.name} size={44} />
        </Tip>
        <div>
          <div className="row-title">
            {b.item.name}
            {b.owned && <Icon name="check" size={14} className="ok" />}
          </div>
          <div className="dim small">{b.reasons[0]}</div>
        </div>
      </div>
      <BootsOptions plan={plan} onChoose={chooser(d)} top4={d.gameMode === "arena"} />
      {alts.length > 0 && (
        <>
          <div className="subhead">Alternatives</div>
          <ul className="alt-list">
            {alts.map((a) => (
              <li key={a.item.id}>
                <Tip content={<ItemTooltip item={a.item} note={a.reason} />}>
                  <GameIcon src={a.item.icon} name={a.item.name} size={28} />
                </Tip>
                <span className="alt-name">{a.item.name}</span>
                <span className="dim small alt-reason">{a.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Starter({ plan, startGold, d }: { plan: BuildPlan; startGold: number; d: Derived }) {
  if (!plan.starter.length) return null;
  const total = plan.starter.reduce((s, i) => s + i.cost, 0);
  const fromStats = plan.starterSource === "stats";
  return (
    <Card
      title={fromStats && d.gameMode === "arena" ? "First shop" : "Starting items"}
      icon="play"
      extra={
        <span className="dim small tnum">
          {fromStats && d.gameMode === "arena" ? `${gold(total)}g · ${plan.starterPicked ? "your pick" : "most played"}` : `${gold(total)} / ${gold(startGold)}g`}
        </span>
      }
    >
      <div className="starter">
        {plan.starter.map((it, i) => (
          <Tip key={`${it.id}-${i}`} content={<ItemTooltip item={it} />}>
            <div className="starter-item">
              <GameIcon src={it.icon} name={it.name} size={40} />
              <span className="starter-cost">{gold(it.cost)}</span>
            </div>
          </Tip>
        ))}
      </div>
      <StarterOptions plan={plan} onChoose={chooser(d)} top4={d.gameMode === "arena"} />
      <div className="dim small">
        {!fromStats
          ? `Components toward ${plan.order[0]?.item.name ?? "your first item"}.`
          : plan.starterPicked
            ? "Your pick — used for the shop advice and the item set."
            : d.gameMode === "arena"
              ? "What most players buy in the first shop round."
              : "What most players start with."}
      </div>
    </Card>
  );
}

/** Arena: Prismatic items (Prismatic anvils / augments only) ranked by top-4 rate. */
function Prismatic({ plan }: { plan: BuildPlan }) {
  if (!plan.prismatic.length) return null;
  return (
    <Card title="Prismatic items" icon="spark" className="prism-card" extra={<span className="dim small">From Prismatic anvils & augments</span>}>
      <ul className="prism-list">
        {plan.prismatic.map((rec) => (
          <li key={rec.item.id} className={`prism ${rec.owned ? "sit-owned" : ""}`}>
            <Tip content={<ItemTooltip item={rec.item} rec={rec} />}>
              <div className="sit-icon">
                <GameIcon src={rec.item.icon} name={rec.item.name} size={40} />
                {rec.owned && (
                  <span className="slot-check">
                    <Icon name="check" size={11} strokeWidth={3} />
                  </span>
                )}
              </div>
            </Tip>
            <div className="prism-body">
              <span className="sit-name">{rec.item.name}</span>
              {rec.winRate ? <WinRate wr={rec.winRate} /> : <span className="dim small">No data yet</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Swaps({ plan }: { plan: BuildPlan }) {
  if (!plan.swaps.length) return null;
  return (
    <Card title="Late-game swaps" icon="swap">
      <ul className="swap-list">
        {plan.swaps.map((s) => (
          <li key={s.sell.id}>
            <Tip content={<ItemTooltip item={s.sell} note="Sell" />}>
              <GameIcon src={s.sell.icon} name={s.sell.name} size={32} className="swap-sell" />
            </Tip>
            <Icon name="chevron" size={14} className="dim" />
            <Tip content={<ItemTooltip item={s.buy.item} rec={s.buy} />}>
              <GameIcon src={s.buy.item.icon} name={s.buy.item.name} size={32} />
            </Tip>
            <div className="swap-text">
              <div>
                Sell <strong>{s.sell.name}</strong> for <strong>{s.buy.item.name}</strong>
              </div>
              <div className="dim small">{s.buy.reasons[0]}</div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ------------------------------------------------------------------ context bars

function TeamIcons({ players, me }: { players: PlayerState[]; me?: PlayerState }) {
  const list = me ? [me, ...players] : players;
  return (
    <div className="team-icons">
      {list.map((p, i) => (
        <Tip key={`${p.championName}-${i}`} content={<span className="tt-plain">{p.isMe ? `${p.championName} (you)` : p.championName}</span>}>
          <GameIcon src={p.champion?.icon} name={p.championName} size={34} round className={p.isMe ? "me-ring" : ""} />
        </Tip>
      ))}
    </div>
  );
}

function MatchupBar({ d }: { d: Derived }) {
  const game = d.game!;
  return (
    <div className="context-bar">
      <TeamIcons players={game.allies} me={game.me} />
      <span className="vs">VS</span>
      <TeamIcons players={game.enemies} />
      <div className="tb-spacer" />
      {d.mode === "demo" && (
        <div className="demo-flag">
          <Toggle checked onChange={() => actions.setDemo(false)} label="Demo game" sub="Sample data — turn off to explore" />
        </div>
      )}
    </div>
  );
}

type PickTarget = { kind: "me" } | { kind: "enemy"; index: number };

function ExplorePanel({ d }: { d: Derived }) {
  const data = useApp((s) => s.data)!;
  const explore = useApp((s) => s.explore);
  const [pick, setPick] = useState<PickTarget | null>(null);
  const me = d.baseChampion;
  const enemies = explore.enemies.map((id) => findChampion(data, id)).filter((c): c is Champion => !!c);

  const onPick = (c: Champion) => {
    if (!pick) return;
    if (pick.kind === "me") actions.setExploreChampion(c.id);
    else {
      const ids = [...explore.enemies];
      ids[pick.index] = c.id;
      actions.setExploreEnemies(ids.filter(Boolean));
    }
    setPick(null);
  };

  return (
    <div className="explore">
      <div className="explore-block">
        <div className="eyebrow">Your champion</div>
        <div className="explore-me">
          <button type="button" className="champ-select-btn" onClick={() => setPick({ kind: "me" })}>
            {me && <GameIcon src={me.icon} name={me.name} size={44} />}
            <span className="csb-text">
              <span className="csb-name">{me?.name ?? "Pick a champion"}</span>
              {me && <span className="dim small">{ARCHETYPE_LABEL[(d.champion ?? me).archetype]}</span>}
            </span>
            <Icon name="chevronDown" size={16} className="dim" />
          </button>
          {me && <FavStar id={me.id} name={me.name} size={18} className="explore-fav" />}
        </div>
      </div>
      <div className="explore-block explore-enemies">
        <div className="eyebrow">
          Enemy team <span className="dim">({enemies.length}/5)</span>
        </div>
        <div className="enemy-slots">
          {Array.from({ length: 5 }, (_, i) => {
            const c = enemies[i];
            if (!c)
              return (
                <button
                  key={i}
                  type="button"
                  className="enemy-slot empty-slot"
                  onClick={() => setPick({ kind: "enemy", index: enemies.length })}
                  aria-label="Add enemy"
                  title="Add enemy"
                >
                  <Icon name="plus" size={16} />
                </button>
              );
            return (
              <div key={c.id} className="enemy-slot">
                <button type="button" className="enemy-slot-btn" onClick={() => setPick({ kind: "enemy", index: i })} title={`Change ${c.name}`}>
                  <GameIcon src={c.icon} name={c.name} size={44} />
                </button>
                <button
                  type="button"
                  className="enemy-remove"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => actions.setExploreEnemies(explore.enemies.filter((_, j) => j !== i))}
                >
                  <Icon name="close" size={10} strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="explore-demo">
        <Toggle checked={false} onChange={() => actions.setDemo(true)} label="Try demo game" sub="See the overlay with a sample in-game state" />
      </div>
      {pick && (
        <ChampionPicker
          title={pick.kind === "me" ? "Choose your champion" : "Choose an enemy"}
          champions={data.champions}
          exclude={pick.kind === "enemy" ? explore.enemies : []}
          onPick={onPick}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  );
}

function ChampSelectPanel() {
  const cs = useApp((s) => s.champSelect)!;
  const mine = cs.me?.id;
  return (
    <div className="cs-panel">
      <div className="cs-group">
        <div className="eyebrow">Your team</div>
        <div className="cs-row">
          {cs.team.map((c) => (
            <div key={c.id} className={`cs-champ ${c.id === mine ? "cs-me" : ""}`}>
              <GameIcon src={c.icon} name={c.name} size={44} round />
              <span>{c.id === mine ? "You" : c.name}</span>
            </div>
          ))}
        </div>
      </div>
      {cs.bench.length > 0 && (
        <div className="cs-group">
          <div className="eyebrow">Bench</div>
          <div className="cs-row">
            {cs.bench.map((c) => (
              <Tip key={c.id} content={<span className="tt-plain">{c.name}</span>}>
                <GameIcon src={c.icon} name={c.name} size={34} round className="cs-bench" />
              </Tip>
            ))}
          </div>
        </div>
      )}
      <div className="cs-note">
        <Icon name="info" size={15} />
        Enemy team appears once the game loads — counters update automatically.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ build style

function StyleBar({ d }: { d: Derived }) {
  const base = d.baseChampion;
  const v = d.variant;
  if (!base || !v || d.variants.length < 2) return null;
  const rec = d.advice.find((a) => a.variantId && d.variants.some((x) => x.id === a.variantId));
  const recVariant = rec && d.variants.find((x) => x.id === rec.variantId);
  return (
    <div className="style-bar">
      <div className="style-label">
        <span className="eyebrow">Build style</span>
        <span className="style-sub">
          {base.name} · {ARCHETYPE_LABEL[(d.champion ?? base).archetype]}
        </span>
      </div>
      <Segmented<string>
        label="Build style"
        value={v.id}
        onChange={(id) => void actions.setBuildStyle(base.id, id)}
        options={d.variants.map((x) => ({
          value: x.id,
          hint: x.blurb ?? ARCHETYPE_LABEL[x.archetype],
          label: (
            <>
              {x.label}
              {recVariant?.id === x.id && <span className="rec-dot" aria-label="recommended" />}
            </>
          ),
        }))}
      />
      {rec && recVariant ? (
        <Tip content={<div className="tt"><strong>{rec.title}</strong><span className="tt-note">{rec.text}</span></div>}>
          <button
            type="button"
            className={`style-rec ${recVariant.id === v.id ? "is-on" : ""}`}
            onClick={() => void actions.setBuildStyle(base.id, recVariant.id)}
          >
            <Icon name={recVariant.id === v.id ? "check" : "spark"} size={13} />
            {recVariant.id === v.id ? "Recommended vs this comp" : `Recommended vs this comp: ${recVariant.label}`}
          </button>
        </Tip>
      ) : (
        <span className="style-blurb">{v.blurb ?? `Items and augments ranked for a ${ARCHETYPE_LABEL[v.archetype].toLowerCase()} build.`}</span>
      )}
    </div>
  );
}

function SkillStrip({ d }: { d: Derived }) {
  const sp = d.skillPlan;
  const spells = useChampionSpells(sp ? d.baseChampion?.id : undefined);
  if (!sp) return null;
  const byKey = new Map(spells.map((s) => [s.key, s]));
  const live = d.mode === "live" || d.mode === "demo";
  const rankOf = (k: string) => (live ? d.game?.skills?.[k as "Q" | "W" | "E" | "R"] : undefined);
  const key = (k: string, cls: string, i: number) => {
    const spell = byKey.get(k as "Q");
    return (
      <AbilityTip key={i} spell={spell} rank={rankOf(k)}>
        <span className={`skill-key ${cls} key-${k} ${spell ? "gt-focus" : ""}`} tabIndex={spell ? 0 : undefined} onClick={(e) => e.stopPropagation()}>
          {k}
        </span>
      </AbilityTip>
    );
  };
  return (
    // The whole strip opens the guide on click; the keys are focusable for their ability cards
    // and the "Guide" button is the keyboard route to the guide.
    <div className="skill-strip" onClick={() => actions.setTab("guide")} title={sp.note ?? "Open the full skill guide"}>
      <span className="eyebrow">Skill order</span>
      <span className="skill-max">
        {sp.max.map((k: string, i: number) => (
          <span key={k} className="skill-max-item">
            {i > 0 && <Icon name="chevron" size={12} className="dim" />}
            {key(k, "", i)}
          </span>
        ))}
      </span>
      <span className="skill-start">
        <span className="dim small">Start</span>
        {sp.start.slice(0, 3).map((k: string, i: number) => key(k, "skill-key-sm", i))}
      </span>
      <button type="button" className="skill-link" onClick={() => actions.setTab("guide")}>
        Guide <Icon name="chevron" size={13} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ view

function ChampSelectHelperBox({ d }: { d: Derived }) {
  const cs = useApp((s) => s.champSelect);
  const rows = useApp((s) => s.tierLists[d.gameMode]?.rows);
  if (!cs) return null;
  return (
    <ChampSelectHelper
      mode={d.gameMode}
      me={cs.me}
      team={cs.team}
      bench={cs.bench}
      rows={rows}
      myPosition={cs.position}
      onPick={actions.setExploreChampion}
      meStats={d.championStats}
    />
  );
}

export function BuildView({ d }: { d: Derived }) {
  const startGold = useApp((s) => s.settings.startGold);
  const data = useApp((s) => s.data);
  const plan = d.plan;
  // While this champion's live stats load (and nothing better is available yet), show placeholders
  // instead of a baseline build that would visibly reshuffle a moment later.
  const statsLoading = useApp((s) => (d.baseChampion && s.settings.webStats ? s.web.champions[webKey(d.gameMode, d.baseChampion.id, d.position)] === "loading" : false));
  const showSkeleton = statsLoading && (d.statsProvider === "none" || d.statsProvider === "personal");
  return (
    <div className="view view-build">
      {d.mode === "explore" && <ExplorePanel d={d} />}
      {d.mode === "champselect" && <ChampSelectPanel />}
      {d.mode === "champselect" && <ChampSelectScout />}
      {d.mode === "champselect" && <ChampSelectHelperBox d={d} />}
      {(d.mode === "live" || d.mode === "demo") && d.game && <MatchupBar d={d} />}
      {d.baseChampion && (
        <div className="meta-row">
          <StyleBar d={d} />
          <SkillStrip d={d} />
        </div>
      )}
      {d.baseChampion && <DataSourceBar d={d} />}
      {!plan ? (
        <Card>
          <Empty title="Pick a champion to see a build" icon="build">
            Choose your champion above, or turn on the demo game.
          </Empty>
        </Card>
      ) : showSkeleton ? (
        <div className="build-skeleton" aria-busy="true">
          <SkeletonCard title="Shop now" icon="coin" rows={2} label={`Loading ${d.baseChampion?.name ?? ""} stats…`} />
          <SkeletonCard title="Build order" icon="build" rows={0} icons={6} label="Fetching live data" />
          <div className="build-bottom">
            <SkeletonCard title="Situational counters" icon="shield" rows={3} label="" />
            <SkeletonCard title="Runes" rows={2} label="" />
          </div>
        </div>
      ) : (
        <>
          <ShopCard d={d} />
          <BuildOrder plan={plan} />
          {plan.prismatic.length > 0 && <Prismatic plan={plan} />}
          <div className="build-bottom">
            <Situational plan={plan} />
            <div className="stack">
              {data && <RunesSpells stats={d.championStats} data={data} choice={d.choice} onChoose={chooser(d)} />}
              <MatchupsCard d={d} />
              <Boots plan={plan} d={d} />
              <Starter plan={plan} startGold={d.gameMode === "sr" ? 500 : startGold} d={d} />
              <Swaps plan={plan} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
