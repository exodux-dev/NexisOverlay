import { useMemo, useState } from "react";
import { t as tx } from "../i18n";
import { augmentTargets, RARITY_ORDER } from "../engine/augmentPlan";
import { DataSourceBar } from "../ui/DataSourceBar";
import { MODE_LABEL as GAME_MODE_LABEL, actions, useApp, webKey, type Derived } from "../app/store";
import { combosFor, rerollAdvice, synergiesFor, type AugmentScore, type AugmentSynergy } from "../engine/augments";
import { buildLabel, type AugmentCombo } from "../engine/sources/combos";
import { norm } from "../engine/text";
import type { AugmentRarity } from "../engine/types";
import { Card, Empty, Kbd, Meter, Pill, Segmented, SkeletonCard, Spinner } from "../ui/controls";
import { ChampionPicker } from "../ui/ChampionPicker";
import { GameIcon } from "../ui/GameIcon";
import { AugmentTip, AugmentTooltip } from "../ui/GameTips";
import { ItemIcon } from "../ui/ItemIcon";
import { ARCHETYPE_LABEL } from "../ui/format";
import { RARITY_LABEL } from "../ui/format";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import { ArenaPlacement } from "../ui/arenaText";
import "./augments.css";

type Grade = AugmentScore["grade"];
const GRADES: Grade[] = ["S", "A", "B", "C", "D"];
const GRADE_HINT: Record<Grade, string> = { S: "Take it", A: "Strong", B: "Solid", C: "Situational", D: "Avoid" };

const WR_SOURCE: Record<string, string> = { champion: "this champion", global: "all champions", personal: "your games" };

function fmtN(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

/** HexMayhem "God-Tier Combos", once the store loads them into `web.combos` (read defensively). */
function useCombos(): AugmentCombo[] | undefined {
  return useApp((s) => (s.web as { combos?: AugmentCombo[] }).combos);
}

type SynCtx = Parameters<typeof synergiesFor>[1];

/** Combo synergies for a scored augment, plus its reasons with the combo reason first (deduped). */
function withSynergies(s: AugmentScore, ctx: SynCtx): { syn: AugmentSynergy[]; reasons: string[] } {
  const syn = ctx.combos?.length ? synergiesFor(s.augment, ctx) : [];
  const combo = syn.slice(0, 1).map((x) => x.reason);
  return { syn, reasons: [...combo, ...s.reasons.filter((r) => !combo.includes(r))].slice(0, 3) };
}

function WinLine({ s }: { s: AugmentScore }) {
  if (!s.winRate) return null;
  const pr = s.winRate.pickRate;
  return (
    <span className="aug-wr">
      {(s.winRate.rate * 100).toFixed(1)}% {s.winRate.metric === "top4" ? "top 4" : "win"}{pr !== undefined && <> · {(pr * 100).toFixed(1)}% pick</>} · {fmtN(s.winRate.games)} games ·{" "}
      {WR_SOURCE[s.winRate.source]}
    </span>
  );
}

function AugTip({ s, ctx }: { s: AugmentScore; ctx: SynCtx }) {
  const { syn, reasons } = withSynergies(s, ctx);
  const comboReason = syn[0]?.reason;
  return (
    <div className="tt tt-wide">
      <div className="tt-head">
        <strong>{s.augment.name}</strong>
        <span className={`grade-mini g-${s.grade}`}>{s.grade}</span>
      </div>
      <div className={`tt-kind rar-text-${s.augment.rarity}`}>
        {RARITY_LABEL[s.augment.rarity]} · score {Math.round(s.score * 100)}
      </div>
      <p className="tt-desc">{s.augment.desc}</p>
      {reasons.length > 0 && (
        <ul className="tt-list">
          {reasons.map((r, i) => (
            <li key={i} className={r === comboReason ? "tt-combo" : undefined}>
              {r}
            </li>
          ))}
        </ul>
      )}
      {syn[0]?.combo.note && <div className="tt-note">{syn[0].combo.note}</div>}
      {s.winRate && (
        <div className="tt-foot">
          <WinLine s={s} />
        </div>
      )}
    </div>
  );
}

function OfferCard({ s, best, ctx }: { s: AugmentScore; best: boolean; ctx: SynCtx }) {
  const { syn, reasons } = withSynergies(s, ctx);
  const comboReason = syn[0]?.reason;
  return (
    <article className={`offer rar-${s.augment.rarity} ${best ? "offer-best" : ""}`}>
      {best && <span className="ribbon">#1 Pick</span>}
      <div className="offer-top">
        <span className={`rar-label rar-text-${s.augment.rarity}`}>{RARITY_LABEL[s.augment.rarity]}</span>
        <button type="button" className="icon-btn icon-btn-sm" onClick={() => actions.toggleOffered(s.augment.name)} aria-label="Remove from offered" title="Remove">
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="offer-grade-row">
        <span className={`grade-big g-${s.grade}`}>{s.grade}</span>
        <div className="offer-score">
          <span className="offer-hint">{GRADE_HINT[s.grade]}</span>
          <span className="tnum dim small">{Math.round(s.score * 100)}/100</span>
        </div>
      </div>
      <Meter value={s.score} tone={s.grade === "S" || s.grade === "A" ? "gold" : s.grade === "B" ? "blue" : "muted"} />
      <h4 className="offer-name">{s.augment.name}</h4>
      <WinLine s={s} />
      {comboReason && (
        <span className="combo-tag" title={syn[0].combo.note}>
          <Icon name="spark" size={12} />
          {comboReason}
        </span>
      )}
      <ul className="offer-reasons">
        {(reasons.length ? reasons.filter((r) => r !== comboReason) : ["No strong synergy signals for your champion"]).map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <p className="offer-desc">{s.augment.desc}</p>
      <button type="button" className={`btn ${best ? "btn-primary" : "btn-ghost"} offer-take`} onClick={() => actions.takeAugment(s.augment.name)}>
        Take
      </button>
    </article>
  );
}

/** "Consider a reroll" — static evaluation of the offer on screen (Mayhem lets you reroll augment offers). */
function RerollBanner({ offered }: { offered: AugmentScore[] }) {
  const advice = rerollAdvice(offered);
  if (!advice?.reroll) return null;
  return (
    <div className="reroll-banner" role="note">
      <span className="reroll-icon">
        <Icon name="swap" size={16} />
      </span>
      <div className="reroll-text">
        <strong>{tx("Consider a reroll")}</strong>
        <span>{advice.reason}</span>
      </div>
    </div>
  );
}

/** Top HexMayhem "God-Tier Combos" for your champion (and multi-augment combos with what you own). */
const RARITY_NAME = { prismatic: "Prismatic", gold: "Gold", silver: "Silver" } as const;

/** "Look for next": the best augments still to take, per rarity (offers come one rarity at a time). */
function LookForNext({ ranked, ctx }: { ranked: AugmentScore[]; ctx: SynCtx }) {
  const targets = useMemo(() => augmentTargets(ranked, ctx), [ranked, ctx]);
  if (!RARITY_ORDER.some((r) => targets[r].length)) return null;
  return (
    <Card title="Look for next" icon="spark" className="lfn-card" extra={<span className="dim small">{tx("Best picks left for this champion and what you own")}</span>}>
      <div className="lfn-grid">
        {RARITY_ORDER.map((r) =>
          targets[r].length ? (
            <div key={r} className={`lfn-col rar-chip-${r}`}>
              <span className="lfn-rarity">
                <span className="rar-dot" />
                {RARITY_NAME[r]}
              </span>
              {targets[r].map((t) => (
                <AugmentTip key={t.score.augment.name} name={t.score.augment.name} block>
                  <div className="lfn-item gt-focus" tabIndex={0}>
                    <span className={`lfn-grade g-${t.score.grade}`}>{t.score.grade}</span>
                    <span className="lfn-text">
                      <span className="lfn-name">{t.score.augment.name}</span>
                      <span className="lfn-sub">
                        {t.pairsWith.length
                          ? `Pairs with ${t.pairsWith.join(", ")}`
                          : t.score.winRate
                            ? `${(t.score.winRate.rate * 100).toFixed(1)}% ${t.score.winRate.metric === "top4" ? "top 4" : "WR"}`
                            : t.score.reasons[0] ?? ""}
                      </span>
                    </span>
                  </div>
                </AugmentTip>
              ))}
            </div>
          ) : null,
        )}
      </div>
    </Card>
  );
}

function CombosCard({ ctx, championName }: { ctx: SynCtx; championName: string }) {
  const items = useApp((s) => s.data?.items);
  const mine = useApp((s) => s.myAugments);
  const offered = useApp((s) => s.offered);
  const list = combosFor(ctx, 5);
  return (
    <Card
      title={`Combos for ${championName}`}
      icon="spark"
      className="combos-card"
      extra={
        <span className="dim small" title="HexMayhem “God-Tier Combos”: augment + core build, ranked by sample-adjusted win rate">
          HexMayhem · god-tier combos
        </span>
      }
    >
      {list.length === 0 ? (
        <p className="dim small no-margin">No god-tier combos listed for {championName} this patch — the tier list below still uses its own augment stats.</p>
      ) : (
        <ul className="combo-list">
          {list.map((c, i) => {
            const taken = c.augments.filter((a) => mine.includes(a));
            const onOffer = c.augments.some((a) => offered.includes(a));
            return (
              <li key={`${c.augments.join("+")}:${i}`} className={`combo-row ${onOffer ? "combo-on-offer" : ""}`}>
                <div className="combo-main">
                  <div className="combo-augs">
                    {c.augments.map((a) => (
                      <Tip
                        key={a}
                        content={
                          <AugmentTooltip name={a}>
                            <div className="tt-foot dim small">{offered.includes(a) ? "Click to remove from “Offered now”" : "Click to add to “Offered now” and compare"}</div>
                          </AugmentTooltip>
                        }
                      >
                        <button type="button" className={`combo-aug ${taken.includes(a) ? "combo-aug-mine" : ""}`} onClick={() => actions.toggleOffered(a)}>
                          {a}
                          {taken.includes(a) && <Icon name="check" size={11} strokeWidth={3} />}
                        </button>
                      </Tip>
                    ))}
                    {c.hidden && (
                      <Pill tone="gold" title="Few people play this combo — strong but under the radar">
                        Hidden gem
                      </Pill>
                    )}
                    {onOffer && <Pill tone="teal">On offer</Pill>}
                  </div>
                  <span className="dim small">
                    {[buildLabel(c.build) && `${buildLabel(c.build)} build`, c.games !== undefined && `${fmtN(c.games)} games`, c.lift !== undefined && `${c.lift >= 0 ? "+" : ""}${c.lift.toFixed(1)}% vs. ${championName} average`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {c.items?.length ? (
                  <div className="combo-items" aria-label="Core build">
                    {c.items.map((id, k) => (
                      <ItemIcon key={`${id}:${k}`} item={items?.get(id)} name={`Item ${id}`} size={30} />
                    ))}
                  </div>
                ) : null}
                {c.winRate !== undefined && (
                  <span className="combo-wr tnum" title="Win rate with this augment + core build">
                    {(c.winRate * 100).toFixed(1)}%<small>win</small>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ScanBanner() {
  const scan = useApp((s) => s.scan);
  const hotkey = useApp((s) => s.settings.hotkeyScan);
  const auto = useApp((s) => s.settings.autoDetectAugments);
  return (
    <div className="banner">
      <span className="banner-icon">
        <Icon name="spark" size={18} />
      </span>
      <div className="banner-text">
        <div>
          {auto ? "Augments are detected automatically in game and tier badges appear under the cards." : "Automatic detection is off."} Press{" "}
          <Kbd>{hotkey}</Kbd> to scan manually.
        </div>
        {scan.status === "scanning" && (
          <div className="scan-status">
            <Spinner size={13} /> Scanning screen…
          </div>
        )}
        {scan.status === "error" && (
          <div className="scan-status scan-error">
            <Icon name="warning" size={14} /> {scan.error}
          </div>
        )}
        {scan.status === "done" && (
          <div className="scan-status scan-ok">
            <Icon name="check" size={14} /> Found {scan.matches?.length ?? 0} augments{scan.ms !== undefined ? ` in ${scan.ms} ms` : ""}
          </div>
        )}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => void actions.scan()} disabled={scan.status === "scanning"}>
        <Icon name="scan" size={16} />
        Scan screen
      </button>
    </div>
  );
}

type RarityFilter = "all" | AugmentRarity;

function TierList({ ranked, ctx }: { ranked: AugmentScore[]; ctx: SynCtx }) {
  const offered = useApp((s) => s.offered);
  const mine = useApp((s) => s.myAugments);
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const n = norm(q);
    const list = ranked.filter((s) => (rarity === "all" || s.augment.rarity === rarity) && (!n || norm(s.augment.name).includes(n) || norm(s.augment.desc).includes(n)));
    return GRADES.map((g) => ({ g, items: list.filter((s) => s.grade === g) }));
  }, [ranked, rarity, q]);
  const total = rows.reduce((n, r) => n + r.items.length, 0);

  return (
    <Card
      title="Tier list"
      icon="augments"
      className="tier-card"
      extra={
        <div className="tier-tools">
          <Segmented<RarityFilter>
            size="sm"
            label="Rarity"
            value={rarity}
            onChange={setRarity}
            options={[
              { value: "all", label: "All" },
              { value: "prismatic", label: "Prismatic" },
              { value: "gold", label: "Gold" },
              { value: "silver", label: "Silver" },
            ]}
          />
          <label className="search search-sm">
            <Icon name="search" size={14} />
            <input value={q} placeholder="Search augments…" onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      }
    >
      <p className="dim small tier-help">{tx("Click augments to add them to \u201cOffered now\u201d and compare \u2014 handy when you want to enter what's on screen by hand.")}</p>
      {total === 0 ? (
        <Empty
          title="No augments match"
          icon="search"
          action={
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setQ("");
                setRarity("all");
              }}
            >
              Clear filters
            </button>
          }
        >
          Try another name or rarity.
        </Empty>
      ) : (
        <div className="tiers">
          {rows
            .filter((r) => r.items.length)
            .map((r) => (
              <div key={r.g} className="tier-row">
                <div className={`tier-label g-${r.g}`}>
                  <span>{r.g}</span>
                </div>
                <div className="tier-chips">
                  {r.items.map((s) => {
                    const isOffered = offered.includes(s.augment.name);
                    const isMine = mine.includes(s.augment.name);
                    const hasCombo = !!ctx.combos?.length && synergiesFor(s.augment, ctx).length > 0;
                    return (
                      <Tip key={s.augment.name} content={<AugTip s={s} ctx={ctx} />}>
                        <button
                          type="button"
                          className={`aug-chip rar-chip-${s.augment.rarity} ${isOffered ? "chip-offered" : ""} ${isMine ? "chip-mine" : ""}`}
                          onClick={() => actions.toggleOffered(s.augment.name)}
                          aria-pressed={isOffered}
                        >
                          <span className="rar-dot" />
                          {s.augment.name}
                          {hasCombo && (
                            <span className="chip-combo" aria-label="Known combo">
                              <Icon name="spark" size={11} />
                            </span>
                          )}
                          {s.winRate?.source === "champion" && (
                            <span className="chip-wr" title={s.winRate.metric === "top4" ? "Top-4 rate on this champion" : "Win rate on this champion"}>
                              {(s.winRate.rate * 100).toFixed(1)}%
                            </span>
                          )}
                          {isOffered && <Icon name="check" size={12} strokeWidth={3} />}
                        </button>
                      </Tip>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}

const MODE_LABEL: Record<Derived["mode"], string> = {
  live: "Auto-detected · in game",
  champselect: "Auto-detected · champ select",
  demo: "Demo game",
  explore: "",
};

/** Which champion the augments are ranked for, where it came from, and how much per-champion data is loaded. */
function ChampionBar({ d }: { d: Derived }) {
  const [picking, setPicking] = useState(false);
  const champions = useApp((s) => s.data?.champions ?? []);
  const explore = useApp((s) => s.explore);
  const webOn = useApp((s) => s.settings.webStats);
  const webEntry = useApp((s) => (d.baseChampion ? s.web.champions[webKey(d.gameMode, d.baseChampion.id, d.position)] : undefined));
  const c = d.baseChampion;
  if (!c) return null;
  const locked = d.mode === "live" || d.mode === "champselect";
  const source = MODE_LABEL[d.mode] || (explore.source === "detected" ? "Last detected champion" : "Picked manually");

  const champAugs = d.allRanked.filter((s) => s.winRate?.source === "champion").length;
  const stats = d.championStats;
  let data: React.ReactNode;
  if ((d.statsProvider === "hexmayhem" || d.statsProvider === "riot" || (d.statsProvider === "opgg" && d.gameMode === "arena")) && champAugs > 0) {
    data = (
      <Pill tone="teal" dot title={`Augment ratings use this champion's own ${d.gameMode === "arena" ? "top-4 rates (OP.GG Arena)" : "win rates"}`}>
        {champAugs} augments rated for {c.name}
        {stats ? ` · ${stats.games >= 1e6 ? `${(stats.games / 1e6).toFixed(1)}M` : stats.games >= 1e3 ? `${(stats.games / 1e3).toFixed(0)}k` : stats.games} games` : ""}
      </Pill>
    );
  } else if (webOn && webEntry === "loading") {
    data = (
      <Pill tone="gold" dot>
        Loading {c.name} stats…
      </Pill>
    );
  } else if (webOn && webEntry === "error") {
    data = (
      <Pill tone="red" dot title="Using champion fit + all-champion stats instead">
        No {c.name} data — using fit + global stats
      </Pill>
    );
  } else {
    data = <Pill dot>Champion fit {d.statsProvider === "personal" ? "+ your games" : "estimates"}</Pill>;
  }

  return (
    <div className="aug-champbar">
      <GameIcon src={c.icon} name={c.name} size={44} round />
      <div className="aug-champbar-text">
        <strong>
          {c.name}
          {d.variants.length > 1 && d.variant ? <span className="dim"> · {d.variant.label}</span> : null}
        </strong>
        <span className="dim small">
          {source} · {ARCHETYPE_LABEL[d.champion?.archetype ?? c.archetype]}
        </span>
        {d.gameMode === "arena" && <ArenaPlacement stats={stats} className="small" />}
      </div>
      <div className="aug-champbar-data">{data}</div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={locked}
        title={locked ? "Following your champion automatically" : "Rank augments for another champion"}
        onClick={() => setPicking(true)}
      >
        Change
      </button>
      {picking && (
        <ChampionPicker
          title="Rank augments for…"
          champions={champions}
          onPick={(p) => {
            actions.setExploreChampion(p.id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

export function AugmentsView({ d }: { d: Derived }) {
  const mine = useApp((s) => s.myAugments);
  const offered = d.offeredRanked;
  const byName = useMemo(() => new Map(d.allRanked.map((s) => [s.augment.name, s])), [d.allRanked]);
  const combos = useCombos();
  const synCtx = useMemo<SynCtx>(() => ({ combos, owned: mine, champion: d.champion ?? d.baseChampion }), [combos, mine, d.champion, d.baseChampion]);
  const statsLoading = useApp((s) => (d.baseChampion && s.settings.webStats ? s.web.champions[webKey(d.gameMode, d.baseChampion.id, d.position)] === "loading" : false));

  return (
    <div className="view view-augments">
      {d.gameMode !== "mayhem" && d.gameMode !== "arena" && (
        <Card>
          <Empty
            title={`No augments in ${GAME_MODE_LABEL[d.gameMode]}`}
            icon="augments"
            action={
              <button type="button" className="btn btn-sm" onClick={() => actions.setMode("mayhem")}>
                Switch to ARAM: Mayhem
              </button>
            }
          >
            Augments are an ARAM: Mayhem and Arena feature, so detection is paused. The tier list below shows Mayhem ratings — switch the mode in the top bar to plan
            ahead.
          </Empty>
        </Card>
      )}
      <ChampionBar d={d} />
      <DataSourceBar d={d} />
      <ScanBanner />
      <Card
        title="Offered now"
        icon="spark"
        extra={
          <>
            {d.baseChampion && (
              <Pill tone="teal" title="Augments are ranked for this champion and build style (change it on the Build tab)">
                Ranked for {d.baseChampion.name}
                {d.variants.length > 1 && d.variant ? ` · ${d.variant.label}` : ""}
              </Pill>
            )}
            {offered.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={actions.clearOffered}>
                Clear
              </button>
            )}
          </>
        }
      >
        {offered.length === 0 ? (
          <Empty title="Nothing offered right now" icon="augments">
            When the augment choice appears in game it shows up here automatically. You can also click augments in the tier list below.
          </Empty>
        ) : (
          <>
            <RerollBanner offered={offered} />
            <div className="offers">
              {offered.map((s, i) => (
                <OfferCard key={s.augment.name} s={s} best={i === 0 && offered.length > 1} ctx={synCtx} />
              ))}
            </div>
          </>
        )}
      </Card>
      <Card title="Your augments this game" icon="check" extra={<span className="dim small">{mine.length} taken</span>}>
        {mine.length === 0 ? (
          <p className="dim small no-margin">{tx("None yet \u2014 press \u201cTake\u201d on an offered augment. Owned augments influence the next recommendations.")}</p>
        ) : (
          <div className="my-augs">
            {mine.map((name) => {
              const s = byName.get(name);
              return (
                <span key={name} className={`my-aug rar-chip-${s?.augment.rarity ?? "silver"}`}>
                  <span className="rar-dot" />
                  <AugmentTip name={name}>
                    <span className="gt-focus" tabIndex={0}>
                      {name}
                    </span>
                  </AugmentTip>
                  <button type="button" onClick={() => actions.removeAugment(name)} aria-label={`Remove ${name}`}>
                    <Icon name="close" size={11} strokeWidth={2.6} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </Card>
      {d.baseChampion && (d.gameMode === "mayhem" || d.gameMode === "arena") && <LookForNext ranked={d.allRanked} ctx={synCtx} />}
      {combos?.length && d.baseChampion && d.gameMode === "mayhem" ? <CombosCard ctx={synCtx} championName={d.baseChampion.name} /> : null}
      {statsLoading && (d.gameMode === "mayhem" || d.gameMode === "arena") && d.statsProvider !== "riot" ? (
        <SkeletonCard title="Tier list" icon="augments" rows={5} label={`Rating augments for ${d.baseChampion?.name ?? "your champion"}…`} className="tier-card" />
      ) : (
        <TierList ranked={d.allRanked} ctx={synCtx} />
      )}
    </div>
  );
}
