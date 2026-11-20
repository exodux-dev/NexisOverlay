// Post-game summary: shown right after a game ends (and from a match in History).
//
//   <PostGameSummary record={rec} onClose={…} onOpenHistory={…} />

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MODE_LABEL, modeFromGameMode, useApp, webKey } from "../app/store";
import { datasetMode } from "../engine/mode";
import { findAugment, rankAugments, type AugmentScore } from "../engine/augments";
import { recommendBuild, type ItemRec } from "../engine/build";
import { getItemMap, itemMapFor, setItemMap } from "../engine/staticData";
import { analyzeEnemies } from "../engine/threat";
import type { ChampionStats, MatchRecord, PlayerState } from "../engine/types";
import { applyVariant, pickVariant, variantsFor } from "../engine/variants";
import { clock, kda, winRate } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { AugmentTip } from "../ui/GameTips";
import { GameTimelinePanel } from "./GameTimeline";
import { ItemIcon } from "../ui/ItemIcon";
import { Tip } from "../ui/Tip";
import "./postgame.css";

const SPLASH = "https://ddragon.leagueoflegends.com/cdn/img/champion/centered";

interface Props {
  record: MatchRecord;
  onClose: () => void;
  onOpenHistory: () => void;
}

function norm(name: string | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function signed(n: number, digits = 0): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

export function PostGameSummary({ record, onClose, onOpenHistory }: Props) {
  const data = useApp((s) => s.data);
  const history = useApp((s) => s.history);
  const settings = useApp((s) => s.settings);
  const dataset = useApp((s) => s.stats);
  const web = useApp((s) => s.web);
  const lastPosition = useApp((s) => s.lastPosition);
  const [splashOk, setSplashOk] = useState(true);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const win = record.result === "Win";
  const mode = modeFromGameMode(record.gameMode);
  const champ = data?.championsById.get(record.champion);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Enemy comp → threat report (same engine the live build uses).
  const threat = useMemo(() => {
    const enemies: PlayerState[] = record.enemies.map((id) => {
      const c = data?.championsById.get(id);
      return { championName: c?.name ?? id, champion: c, riotId: "", team: "CHAOS", level: 18, items: [], kills: 0, deaths: 0, assists: 0, isMe: false };
    });
    return analyzeEnemies(enemies);
  }, [record.enemies, data]);

  const stats: ChampionStats | undefined = useMemo(() => {
    if (!champ) return undefined;
    // The Riot dataset is for one queue (Mayhem by default): only use it for games of that mode.
    const g = dataset && mode && datasetMode(dataset) === mode ? dataset.champions[champ.id] : undefined;
    if (g && g.games > 0) return g;
    if (!settings.webStats || !mode) return undefined;
    const w = web.champions[webKey(mode, champ.id, lastPosition)];
    return w && typeof w === "object" && w.games > 0 ? w : undefined;
  }, [champ, dataset, settings.webStats, web, mode, lastPosition]);

  const variant = useMemo(() => (champ ? pickVariant(champ, settings.buildStyles[champ.id]) : undefined), [champ, settings.buildStyles]);
  const champion = useMemo(() => (champ ? applyVariant(champ, variant) : undefined), [champ, variant]);

  // Recommended build for this champion vs this enemy team.
  const plan = useMemo(() => {
    if (!data || !champion) return undefined;
    const prev = getItemMap();
    setItemMap(itemMapFor(mode));
    try {
      const variantIsDefault = !variant || variantsFor(champ!)[0]?.id === variant.id;
      return recommendBuild({
        data,
        champion,
        threat,
        playstyle: settings.playstyle,
        stats: variantIsDefault ? stats : undefined,
        startGold: mode === "sr" ? 500 : settings.startGold,
        variant,
        variantIsDefault,
        mode,
      });
    } catch {
      return undefined;
    } finally {
      setItemMap(prev);
    }
  }, [data, champion, champ, threat, settings.playstyle, settings.startGold, stats, variant, mode]);

  const builtNames = useMemo(() => new Set(record.items.map((id) => norm(data?.items.get(id)?.name))), [record.items, data]);
  const isBuilt = (r: ItemRec) => record.items.includes(r.item.id) || builtNames.has(norm(r.item.name));
  const core = (plan?.order ?? []).filter((r) => r.kind === "core");
  const coreBuilt = core.filter(isBuilt).length;
  const recommendedNames = new Set((plan?.order ?? []).concat(plan?.situational ?? []).map((r) => norm(r.item.name)));
  const counterBuilt = (plan?.situational ?? []).filter((r) => r.kind === "situational" && isBuilt(r) && !core.some((c) => c.item.id === r.item.id));

  // Augments you took, graded for this champion (in the order you took them).
  const graded = useMemo(() => {
    if (!champion) return [] as Array<{ name: string; score?: AugmentScore }>;
    const augs = record.augments.map(findAugment).filter((a): a is NonNullable<typeof a> => !!a);
    const ranked = rankAugments(augs, {
      champion,
      threat,
      stats,
      // HexMayhem's mode-wide augment stats are Mayhem-only data; rank in this game's augment pool.
      global: settings.webStats && mode !== "arena" ? (web.global ?? undefined) : undefined,
      globalAvgWr: web.globalAvgWr,
      mode,
    });
    return record.augments.map((name) => ({ name, score: ranked.find((r) => r.augment.name === name) }));
  }, [record.augments, champion, threat, stats, web.global, web.globalAvgWr, settings.webStats, mode]);

  // Your record on this champion, now vs before this game.
  const champStats = useMemo(() => {
    const all = history.filter((m) => m.champion === record.champion);
    if (!all.some((m) => m.id === record.id)) all.push(record);
    const before = all.filter((m) => m.id !== record.id);
    const wr = (l: MatchRecord[]) => (l.length ? l.filter((m) => m.result === "Win").length / l.length : 0);
    const sum = (l: MatchRecord[], k: "kills" | "deaths" | "assists") => l.reduce((s, m) => s + m[k], 0);
    const avgRatio = (l: MatchRecord[]) => {
      const d = sum(l, "deaths");
      return d === 0 ? sum(l, "kills") + sum(l, "assists") : (sum(l, "kills") + sum(l, "assists")) / d;
    };
    return {
      games: all.length,
      wins: all.filter((m) => m.result === "Win").length,
      wr: wr(all),
      wrBefore: before.length ? wr(before) : undefined,
      kda: kda(sum(all, "kills"), sum(all, "deaths"), sum(all, "assists")),
      ratioBefore: before.length ? avgRatio(before) : undefined,
      rank: all.sort((a, b) => a.date.localeCompare(b.date)).findIndex((m) => m.id === record.id) + 1,
    };
  }, [history, record]);

  const name = champ?.name ?? record.champion;
  const ratio = record.deaths === 0 ? record.kills + record.assists : (record.kills + record.assists) / record.deaths;
  const ratioDelta = champStats.ratioBefore !== undefined ? ratio - champStats.ratioBefore : undefined;
  const wrDelta = champStats.wrBefore !== undefined ? (champStats.wr - champStats.wrBefore) * 100 : undefined;

  const body = (
    <div className="pg-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`pg-card ${win ? "pg-win" : "pg-loss"}`} role="dialog" aria-modal="true" aria-labelledby="pg-title">
        <header className="pg-banner">
          {splashOk && champ && <img className="pg-splash" src={`${SPLASH}/${champ.id}_0.jpg`} alt="" draggable={false} onError={() => setSplashOk(false)} />}
          <span className="pg-banner-shade" />
          <button ref={closeBtn} type="button" className="pg-close" onClick={onClose} aria-label="Close summary">
            <Icon name="close" size={16} />
          </button>
          <div className="pg-banner-body">
            <GameIcon src={champ?.icon} name={name} size={64} className="pg-portrait" />
            <div className="pg-headline">
              <span className="pg-eyebrow">
                {mode ? MODE_LABEL[mode] : "Game"} · {clock(record.durationSec)}
              </span>
              <h2 id="pg-title" className="pg-result">
                {win ? "Victory" : "Defeat"}
              </h2>
              <span className="pg-champ">{name}</span>
            </div>
            <div className="pg-kda">
              <span className="pg-kda-line tnum">
                {record.kills}
                <i>/</i>
                <span className="pg-deaths">{record.deaths}</span>
                <i>/</i>
                {record.assists}
              </span>
              <span className="pg-kda-ratio tnum">
                {record.deaths === 0 ? "Perfect KDA" : `${ratio.toFixed(2)} KDA`}
                {ratioDelta !== undefined && Math.abs(ratioDelta) >= 0.05 && (
                  <span className={ratioDelta > 0 ? "pg-up" : "pg-down"}> {signed(ratioDelta, 1)} vs your avg</span>
                )}
              </span>
            </div>
          </div>
        </header>

        <div className="pg-body">
          <section className="pg-sec">
            <div className="pg-sec-head">
              <h3>Build check</h3>
              {core.length > 0 && (
                <span className={`pg-score ${coreBuilt === core.length ? "pg-score-full" : coreBuilt === 0 ? "pg-score-none" : ""}`}>
                  {coreBuilt}/{core.length} core items
                </span>
              )}
            </div>
            <div className="pg-build">
              <div className="pg-build-row">
                <span className="pg-row-label">Your build</span>
                <span className="pg-items">
                  {Array.from({ length: 6 }, (_, i) => {
                    const id = record.items[i];
                    const it = id !== undefined ? data?.items.get(id) : undefined;
                    if (id === undefined) return <span key={i} className="pg-slot-empty" />;
                    const rec = recommendedNames.has(norm(it?.name));
                    return <ItemIcon key={i} item={it} name={`Item ${id}`} size={34} className={rec ? "pg-item-rec" : ""} note={rec ? "In Nexis' recommended build for this game" : undefined} />;
                  })}
                </span>
              </div>
              <div className="pg-build-row">
                <span className="pg-row-label">
                  Recommended
                  {plan && (
                    <Tip content={<span className="tt-plain">Core build from {plan.sourceLabel}, against this enemy team.</span>}>
                      <span className="pg-info" tabIndex={0}>
                        <Icon name="info" size={12} />
                      </span>
                    </Tip>
                  )}
                </span>
                <span className="pg-items">
                  {core.length === 0 && <span className="pg-muted">No recommendation available for {name}.</span>}
                  {core.map((r) => {
                    const ok = isBuilt(r);
                    return (
                      <ItemIcon key={r.item.id} item={r.item} rec={r} size={34} className={`pg-core ${ok ? "pg-core-ok" : "pg-core-miss"}`}>
                        <span className="pg-core-badge" aria-label={ok ? "Built" : "Not built"}>
                          <Icon name={ok ? "check" : "close"} size={10} />
                        </span>
                      </ItemIcon>
                    );
                  })}
                </span>
              </div>
            </div>
            <p className="pg-note">
              {core.length === 0
                ? ""
                : coreBuilt === core.length
                  ? "You finished the full recommended core."
                  : coreBuilt === 0
                    ? `None of the recommended core — ${core.map((r) => r.item.name).join(", ")} — made it into your final build.`
                    : `Missing: ${core.filter((r) => !isBuilt(r)).map((r) => r.item.name).join(", ")}.`}
              {counterBuilt.length > 0 && ` Good call on ${counterBuilt.map((r) => r.item.name).join(", ")} against this comp.`}
            </p>
          </section>

          {record.timeline && record.timeline.samples.length > 0 && (
            <section className="pg-sec" aria-label="Game timeline">
              <div className="pg-sec-head">
                <h3>Game timeline</h3>
                <span className="pg-muted">From your scoreboard during the game</span>
              </div>
              <GameTimelinePanel timeline={record.timeline} data={data} />
            </section>
          )}

          <section className="pg-sec">
            <div className="pg-sec-head">
              <h3>Augments</h3>
              {graded.length > 0 && <span className="pg-muted">Graded for {name}</span>}
            </div>
            {graded.length === 0 ? (
              <p className="pg-muted pg-tight">No augments were recorded for this game.</p>
            ) : (
              <ul className="pg-augs">
                {graded.map(({ name: a, score }) => {
                  const aug = findAugment(a);
                  return (
                    <li key={a} className={`pg-aug pg-rar-${aug?.rarity ?? "silver"}`}>
                      <span className={`pg-grade pg-grade-${score?.grade ?? "none"}`}>{score?.grade ?? "?"}</span>
                      <span className="pg-aug-text">
                        <AugmentTip name={a} className="pg-aug-tip">
                          <span className="pg-aug-name gt-focus" tabIndex={0}>
                            {a}
                          </span>
                        </AugmentTip>
                        <span className="pg-aug-why">{score?.reasons[0] ?? (aug ? aug.rarity : "Unknown augment")}</span>
                      </span>
                      {score?.winRate && <span className="pg-aug-wr tnum">{winRate(score.winRate.rate)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="pg-sec pg-sec-stats">
            <div className="pg-sec-head">
              <h3>Your {name}</h3>
              <span className="pg-muted">Game #{champStats.rank} on this champion</span>
            </div>
            <div className="pg-stats">
              <div className="pg-stat">
                <span className="pg-stat-label">Games</span>
                <span className="pg-stat-val tnum">{champStats.games}</span>
                <span className="pg-muted tnum">
                  {champStats.wins}W {champStats.games - champStats.wins}L
                </span>
              </div>
              <div className="pg-stat">
                <span className="pg-stat-label">Win rate</span>
                <span className={`pg-stat-val tnum ${champStats.wr >= 0.5 ? "pg-up" : "pg-down"}`}>{winRate(champStats.wr)}</span>
                <span className="pg-muted tnum">
                  {wrDelta === undefined ? "First game recorded" : Math.abs(wrDelta) < 0.5 ? "Unchanged" : `${signed(wrDelta, 1)} pts this game`}
                </span>
              </div>
              <div className="pg-stat">
                <span className="pg-stat-label">Avg KDA</span>
                <span className="pg-stat-val tnum">{champStats.kda}</span>
                <span className="pg-muted">across all games</span>
              </div>
            </div>
          </section>
        </div>

        <footer className="pg-foot">
          <span className="pg-muted">Saved to your match history on this PC.</span>
          <span className="pg-foot-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenHistory}>
              <Icon name="history" size={14} />
              Open history
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              Done
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
  return createPortal(body, document.body);
}
