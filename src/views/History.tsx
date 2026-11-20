// Match history: your personal profile (u.gg / op.gg style) built from games Nexis recorded on this PC.

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { actions, getState, MODE_LABEL, modeFromGameMode, useApp, type GameModeKind } from "../app/store";
import { findAugment } from "../engine/augments";
import { augmentStats, currentStreak, itemStats, parseHistoryImport, rollingWinRate, summarizeHistory, type ChampionSummary } from "../engine/history";
import type { Item, MatchRecord, StaticData } from "../engine/types";
import { Card, Empty, Segmented } from "../ui/controls";
import { clock, kda, relativeDate, winRate } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { ItemIcon } from "../ui/ItemIcon";
import { Tip } from "../ui/Tip";
import { toast } from "../ui/Toasts";
import { GameTimelinePanel } from "./GameTimeline";
import { PostGameSummary } from "./PostGame";
import "./history.css";

type ModeFilter = "all" | GameModeKind;
type ResultFilter = "all" | "Win" | "Lose";
type SortKey = "games" | "wr" | "kda" | "recent";

const MODE_SHORT: Record<GameModeKind, string> = { mayhem: "Mayhem", aram: "ARAM", sr: "Rift", arena: "Arena" };
const MATCH_PAGE = 20;
const CHAMP_ROWS = 8;

// ------------------------------------------------------------------ helpers

function champName(data: StaticData, id: string): string {
  return data.championsById.get(id)?.name ?? id;
}

function kdaRatio(k: number, d: number, a: number): number {
  return d === 0 ? k + a : (k + a) / d;
}

/** Completed, non-boots items worth ranking ("your best items"). */
function rankableItem(it: Item | undefined): it is Item {
  return !!it && it.completed && !it.tags.includes("Boots") && !it.tags.includes("Consumable") && !it.tags.includes("Trinket");
}

function wrTone(rate: number): "good" | "bad" | "even" {
  return rate >= 0.505 ? "good" : rate < 0.495 ? "bad" : "even";
}

function modeLabel(gameMode: string): string {
  const m = modeFromGameMode(gameMode);
  return m ? MODE_LABEL[m] : gameMode ? gameMode.charAt(0) + gameMode.slice(1).toLowerCase() : "Unknown mode";
}

function exportHistory(history: MatchRecord[]) {
  const json = JSON.stringify(history, null, 2);
  const n = history.length;
  const file = `nexis-history-${new Date().toISOString().slice(0, 10)}.json`;
  const copy = () =>
    navigator.clipboard.writeText(json).then(
      () => toast("History copied to clipboard", "good", { detail: `${n} games as JSON — paste it into a .json file to keep a backup.` }),
      () => toast("Couldn't export history", "bad", { detail: "Downloads and the clipboard are both unavailable here." }),
    );
  try {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Exported ${n} game${n === 1 ? "" : "s"}`, "good", { detail: `Saved as ${file} in your Downloads folder.` });
  } catch {
    void copy();
  }
}

async function importFile(file: File) {
  let parsed;
  try {
    parsed = parseHistoryImport(JSON.parse(await file.text()));
  } catch (e) {
    toast("Import failed", "bad", { detail: e instanceof SyntaxError ? `${file.name} isn't valid JSON.` : String(e instanceof Error ? e.message : e) });
    return;
  }
  const { records, invalid } = parsed;
  const existing = new Set(getState().history.map((m) => m.id));
  const fresh = records.filter((r) => !existing.has(r.id));
  const dupes = records.length - fresh.length;
  if (!fresh.length) {
    const why = records.length ? `All ${records.length} games are already in your history.` : "No valid games found in this file.";
    toast("Nothing new to import", invalid && !records.length ? "bad" : "info", { detail: invalid ? `${why} ${invalid} entr${invalid === 1 ? "y was" : "ies were"} unreadable.` : why });
    return;
  }
  await actions.importHistory(fresh);
  const extra = [dupes ? `${dupes} already present` : "", invalid ? `${invalid} unreadable skipped` : ""].filter(Boolean).join(" · ");
  toast(`Imported ${fresh.length} game${fresh.length === 1 ? "" : "s"}`, "good", { detail: extra || `From ${file.name}.` });
}

// ------------------------------------------------------------------ small pieces

function WrBar({ rate, wide = false }: { rate: number; wide?: boolean }) {
  return (
    <span className={`hi-wrbar ${wide ? "hi-wrbar-wide" : ""}`} aria-hidden="true">
      <span className={`hi-wrbar-fill hi-${wrTone(rate)}`} style={{ width: `${Math.round(rate * 100)}%` }} />
      <span className="hi-wrbar-mid" />
    </span>
  );
}

function AugChip({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const aug = findAugment(name);
  const chip = (
    <span className={`hi-aug hi-aug-${size} hi-rar-${aug?.rarity ?? "silver"}`}>
      <span className={`rar-dot rar-dot-${aug?.rarity ?? "silver"}`} />
      <span className="hi-aug-name">{name}</span>
    </span>
  );
  if (!aug?.desc) return chip;
  return (
    <Tip
      content={
        <div className="tt hi-aug-tip">
          <strong>{aug.name}</strong>
          <span className={`hi-aug-tip-rar hi-rar-text-${aug.rarity}`}>{aug.rarity}</span>
          <p>{aug.desc}</p>
        </div>
      }
    >
      {chip}
    </Tip>
  );
}

function ItemSlots({ data, ids, size }: { data: StaticData; ids: number[]; size: number }) {
  return (
    <span className="hi-slots">
      {Array.from({ length: 6 }, (_, i) => {
        const it = ids[i] !== undefined ? data.items.get(ids[i]) : undefined;
        if (!it) return <span key={i} className="hi-slot-empty" style={{ width: size, height: size }} />;
        return <ItemIcon key={i} item={it} size={size} />;
      })}
    </span>
  );
}

function ClearButton() {
  const [confirm, setConfirm] = useState(false);
  if (!confirm)
    return (
      <button type="button" className="btn btn-ghost btn-sm hi-act-danger" onClick={() => setConfirm(true)}>
        <Icon name="trash" size={14} />
        Clear
      </button>
    );
  return (
    <div className="hi-confirm" role="alertdialog" aria-label="Confirm clearing history">
      <span className="small">Delete all recorded games?</span>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        onClick={() => {
          const n = getState().history.length;
          void actions.clearHistory().then(() => {
            setConfirm(false);
            toast("Match history cleared", "good", { detail: `${n} recorded game${n === 1 ? "" : "s"} deleted from this PC.` });
          });
        }}
      >
        Delete
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>
        Cancel
      </button>
    </div>
  );
}

function ImportButton({ label = "Import", primary = false }: { label?: string; primary?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void importFile(f);
  };
  return (
    <>
      <button type="button" className={`btn btn-sm ${primary ? "btn-primary" : "btn-ghost"}`} onClick={() => input.current?.click()} title="Merge games from a Nexis history export (.json)">
        <Icon name="folder" size={14} />
        {label}
      </button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={onChange} />
    </>
  );
}

// ------------------------------------------------------------------ summary + trend

function Donut({ rate }: { rate: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className="hi-donut" viewBox="0 0 64 64" width={64} height={64} aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="hi-donut-track" />
      <circle cx="32" cy="32" r={r} className={`hi-donut-arc hi-${wrTone(rate)}`} strokeDasharray={`${c * rate} ${c}`} transform="rotate(-90 32 32)" />
    </svg>
  );
}

function SummaryCard({ games, data }: { games: MatchRecord[]; data: StaticData }) {
  const n = games.length;
  const wins = games.filter((m) => m.result === "Win").length;
  const wr = wins / n;
  const k = games.reduce((s, m) => s + m.kills, 0);
  const d = games.reduce((s, m) => s + m.deaths, 0);
  const a = games.reduce((s, m) => s + m.assists, 0);
  const streak = currentStreak(games);
  let best = 0;
  let run = 0;
  for (const m of games) {
    run = m.result === "Win" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const form = games.slice(-20);
  const formWins = form.filter((m) => m.result === "Win").length;
  const avgDur = games.reduce((s, m) => s + m.durationSec, 0) / n;
  return (
    <section className="card hi-summary" aria-label="Summary">
      <div className="hi-sum-wr">
        <Donut rate={wr} />
        <div>
          <span className="stat-label">Win rate</span>
          <span className={`hi-big hi-${wrTone(wr)}`}>{winRate(wr)}</span>
          <span className="hi-sub tnum">
            {wins}W {n - wins}L · {n} game{n === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="hi-sum-cell">
        <span className="stat-label">Avg KDA</span>
        <span className="hi-mid-num">{kda(k, d, a)}</span>
        <span className="hi-sub tnum">
          {(k / n).toFixed(1)} / <span className="hi-death">{(d / n).toFixed(1)}</span> / {(a / n).toFixed(1)}
        </span>
      </div>
      <div className="hi-sum-cell">
        <span className="stat-label">Streak</span>
        {streak && (
          <span className={`hi-mid-num ${streak.result === "Win" ? "hi-good" : "hi-bad"}`}>
            {streak.count}
            {streak.result === "Win" ? "W" : "L"}
          </span>
        )}
        <span className="hi-sub">
          {streak?.result === "Win" ? "Win streak" : "Loss streak"} · best {best}W
        </span>
      </div>
      <div className="hi-sum-form">
        <span className="hi-form-head">
          <span className="stat-label">Last {form.length}</span>
          <span className="hi-sub tnum">
            {formWins}W {form.length - formWins}L · avg {clock(avgDur)}
          </span>
        </span>
        <span className="hi-form" role="img" aria-label={`Last ${form.length} games: ${formWins} wins, ${form.length - formWins} losses`}>
          {form.map((m) => (
            <span
              key={m.id}
              className={`hi-form-cell ${m.result === "Win" ? "w" : "l"}`}
              title={`${m.result === "Win" ? "Victory" : "Defeat"} · ${champName(data, m.champion)} · ${m.kills}/${m.deaths}/${m.assists} · ${relativeDate(m.date)}`}
            />
          ))}
          {Array.from({ length: 20 - form.length }, (_, i) => (
            <span key={`e${i}`} className="hi-form-cell e" />
          ))}
        </span>
      </div>
    </section>
  );
}

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const TREND_MAX = 60;

function TrendChart({ games, data }: { games: MatchRecord[]; data: StaticData }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const window_ = games.length >= 20 ? 10 : 5;
  const roll = useMemo(() => rollingWinRate(games, window_), [games, window_]);
  // Skip the warm-up (fewer games than the window) once there's enough history to show without it.
  const warm = games.length >= window_ * 2 ? window_ - 1 : 0;
  const start = Math.max(warm, games.length - TREND_MAX);
  const shown = games.slice(start);
  const values = roll.slice(start);
  const H = 132;
  const pad = { l: 34, r: 12, t: 10, b: 22 };
  const W = Math.max(200, width);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (values.length <= 1 ? iw / 2 : (i / (values.length - 1)) * iw);
  const y = (v: number) => pad.t + (1 - v) * ih;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = values.length ? `${line}L${x(values.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
  const last = values[values.length - 1] ?? 0;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left - pad.l;
    const i = values.length <= 1 ? 0 : Math.round((px / iw) * (values.length - 1));
    setHover(Math.max(0, Math.min(values.length - 1, i)));
  };
  const h = hover !== null ? shown[hover] : undefined;

  return (
    <Card
      title="Win rate trend"
      icon="tiers"
      className="hi-trend"
      extra={
        <span className="hi-sub tnum">
          Rolling {window_}-game average
        </span>
      }
    >
      <div className="hi-trend-box" ref={box}>
        {width > 0 && values.length > 1 ? (
          <svg width={W} height={H} className="hi-chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Rolling win rate, currently ${winRate(last)}`}>
            <defs>
              <linearGradient id="hi-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" className="hi-area-top" />
                <stop offset="100%" className="hi-area-bot" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0.5 ? "hi-grid-mid" : "hi-grid"} />
                <text x={pad.l - 8} y={y(v) + 3.5} className="hi-axis" textAnchor="end">
                  {v * 100}%
                </text>
              </g>
            ))}
            <path d={area} fill="url(#hi-area)" />
            <path d={line} className="hi-line" />
            {shown.map((m, i) => (
              <rect key={m.id} x={x(i) - 1.25} y={H - pad.b + 7} width={2.5} height={8} rx={1} className={m.result === "Win" ? "hi-tick-w" : "hi-tick-l"} />
            ))}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b + 4} className="hi-cross" />
                <circle cx={x(hover)} cy={y(values[hover])} r={4.5} className="hi-dot" />
              </g>
            )}
            {hover === null && <circle cx={x(values.length - 1)} cy={y(last)} r={4} className="hi-dot" />}
          </svg>
        ) : (
          <div className="hi-trend-empty dim small">Play a couple more games to see your trend.</div>
        )}
        {h && hover !== null && (
          <div className="hi-chart-tip" style={{ left: Math.min(Math.max(x(hover), 90), W - 90) }}>
            <span className={h.result === "Win" ? "hi-good" : "hi-bad"}>{h.result === "Win" ? "Victory" : "Defeat"}</span>
            <span>
              {champName(data, h.champion)} · {h.kills}/{h.deaths}/{h.assists}
            </span>
            <span className="dim">
              Rolling WR <strong className="tnum">{winRate(values[hover])}</strong> · {relativeDate(h.date)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ champions table

interface ChampRow extends ChampionSummary {
  rate: number;
  ratio: number;
  topAug?: string;
  topItems: Item[];
}

function SortTh({ k, sort, setSort, children, className = "" }: { k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; children: ReactNode; className?: string }) {
  return (
    <th className={className} aria-sort={sort === k ? "descending" : "none"}>
      <button type="button" className={`hi-sort ${sort === k ? "active" : ""}`} onClick={() => setSort(k)}>
        {children}
        <span className="hi-sort-caret" aria-hidden="true">▾</span>
      </button>
    </th>
  );
}

function ChampionTable({ games, data, focus, onFocus }: { games: MatchRecord[]; data: StaticData; focus?: string; onFocus: (id: string | undefined) => void }) {
  const [sort, setSort] = useState<SortKey>("games");
  const [all, setAll] = useState(false);
  const rows = useMemo<ChampRow[]>(() => {
    return summarizeHistory(games).map((c) => {
      const augs = Object.entries(augmentStats(games, c.champion))
        .filter(([, s]) => s.games >= 2)
        .sort(([, a], [, b]) => b.wins / b.games - a.wins / a.games || b.games - a.games);
      const anyAug = Object.entries(augmentStats(games, c.champion)).sort(([, a], [, b]) => b.games - a.games)[0];
      const items = Object.entries(itemStats(games, c.champion))
        .map(([id, s]) => ({ it: data.items.get(Number(id)), ...s }))
        .filter((x): x is { it: Item; games: number; wins: number } => rankableItem(x.it))
        .sort((a, b) => b.games - a.games || b.wins - a.wins)
        .slice(0, 3)
        .map((x) => x.it);
      return { ...c, rate: c.wins / c.games, ratio: kdaRatio(c.kills, c.deaths, c.assists), topAug: augs[0]?.[0] ?? anyAug?.[0], topItems: items };
    });
  }, [games, data]);
  const sorted = useMemo(() => {
    const by: Record<SortKey, (a: ChampRow, b: ChampRow) => number> = {
      games: (a, b) => b.games - a.games || b.rate - a.rate,
      wr: (a, b) => b.rate - a.rate || b.games - a.games,
      kda: (a, b) => b.ratio - a.ratio || b.games - a.games,
      recent: (a, b) => b.lastPlayed.localeCompare(a.lastPlayed),
    };
    return [...rows].sort(by[sort]);
  }, [rows, sort]);

  return (
    <Card title="Champions" icon="user" pad={false} className="hi-champs" extra={<span className="hi-sub">{rows.length} played · click to focus</span>}>
      <div className="hi-table-wrap">
        <table className="hi-table">
          <thead>
            <tr>
              <th className="hi-th-champ">Champion</th>
              <SortTh k="games" sort={sort} setSort={setSort} className="num">
                Games
              </SortTh>
              <SortTh k="wr" sort={sort} setSort={setSort}>
                Win rate
              </SortTh>
              <SortTh k="kda" sort={sort} setSort={setSort} className="num">
                KDA
              </SortTh>
              <th className="hi-col-aug">Top augment</th>
              <th className="hi-col-items">Core items</th>
            </tr>
          </thead>
          <tbody>
            {(all ? sorted : sorted.slice(0, CHAMP_ROWS)).map((c) => {
              const ch = data.championsById.get(c.champion);
              const active = focus === c.champion;
              return (
                <tr
                  key={c.champion}
                  className={active ? "active" : ""}
                  tabIndex={0}
                  aria-selected={active}
                  onClick={() => onFocus(active ? undefined : c.champion)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onFocus(active ? undefined : c.champion);
                    }
                  }}
                >
                  <td>
                    <span className="hi-cell-champ">
                      <GameIcon src={ch?.icon} name={ch?.name ?? c.champion} size={30} />
                      <span>
                        <span className="hi-champ-name">{ch?.name ?? c.champion}</span>
                        <span className="hi-sub">{relativeDate(c.lastPlayed)}</span>
                      </span>
                    </span>
                  </td>
                  <td className="num tnum">{c.games}</td>
                  <td>
                    <span className="hi-cell-wr">
                      <WrBar rate={c.rate} />
                      <span className={`tnum hi-wr-num hi-${wrTone(c.rate)}`}>{winRate(c.rate)}</span>
                    </span>
                  </td>
                  <td className="num">
                    <span className="hi-kda-cell">
                      <span className="tnum">{kda(c.kills, c.deaths, c.assists)}</span>
                      <span className="hi-sub tnum">
                        {(c.kills / c.games).toFixed(1)}/{(c.deaths / c.games).toFixed(1)}/{(c.assists / c.games).toFixed(1)}
                      </span>
                    </span>
                  </td>
                  <td className="hi-col-aug">{c.topAug ? <AugChip name={c.topAug} size="sm" /> : <span className="hi-sub">—</span>}</td>
                  <td className="hi-col-items">
                    <span className="hi-slots">
                      {c.topItems.length ? c.topItems.map((it) => <ItemIcon key={it.id} item={it} size={22} />) : <span className="hi-sub">—</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > CHAMP_ROWS && (
        <button type="button" className="hi-more-btn" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${sorted.length} champions`}
        </button>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ best augments / items

function BestAugments({ games, scope }: { games: MatchRecord[]; scope: string }) {
  const rows = useMemo(
    () =>
      Object.entries(augmentStats(games))
        .filter(([, s]) => s.games >= 2)
        .map(([name, s]) => ({ name, ...s, rate: s.wins / s.games }))
        .sort((a, b) => b.rate - a.rate || b.games - a.games)
        .slice(0, 6),
    [games],
  );
  return (
    <Card title="Your best augments" icon="augments" className="hi-best" extra={<span className="hi-scope">{scope}</span>}>
      {rows.length === 0 ? (
        <p className="hi-sub no-margin">Augments show up here once you've taken one in at least 2 games{scope === "All champions" ? "" : ` on ${scope}`}.</p>
      ) : (
        <ul className="hi-best-list">
          {rows.map((s) => (
            <li key={s.name}>
              <AugChip name={s.name} />
              <span className="hi-sub tnum">{s.games}g</span>
              <WrBar rate={s.rate} />
              <span className={`tnum hi-wr-num hi-${wrTone(s.rate)}`}>{winRate(s.rate)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BestItems({ games, data, scope }: { games: MatchRecord[]; data: StaticData; scope: string }) {
  const rows = useMemo(
    () =>
      Object.entries(itemStats(games))
        .map(([id, s]) => ({ it: data.items.get(Number(id)), ...s, rate: s.wins / s.games }))
        .filter((x): x is { it: Item; games: number; wins: number; rate: number } => rankableItem(x.it) && x.games >= 2)
        .sort((a, b) => b.rate - a.rate || b.games - a.games)
        .slice(0, 6),
    [games, data],
  );
  return (
    <Card title="Your best items" icon="build" className="hi-best" extra={<span className="hi-scope">{scope}</span>}>
      {rows.length === 0 ? (
        <p className="hi-sub no-margin">Finish an item in at least 2 games to see how it performs for you.</p>
      ) : (
        <ul className="hi-best-list hi-best-items">
          {rows.map((s) => (
            <li key={s.it.id}>
              <span className="hi-item-cell">
                <ItemIcon item={s.it} size={26} />
                <span className="hi-item-name">{s.it.name}</span>
              </span>
              <span className="hi-sub tnum">{s.games}g</span>
              <WrBar rate={s.rate} />
              <span className={`tnum hi-wr-num hi-${wrTone(s.rate)}`}>{winRate(s.rate)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ matches

function MatchRow({ m, data, open, onToggle, onSummary }: { m: MatchRecord; data: StaticData; open: boolean; onToggle: () => void; onSummary: () => void }) {
  const ch = data.championsById.get(m.champion);
  const win = m.result === "Win";
  const ratio = kda(m.kills, m.deaths, m.assists);
  return (
    <li className={`hi-match ${win ? "hi-match-win" : "hi-match-loss"} ${open ? "open" : ""}`}>
      <button type="button" className="hi-match-row" onClick={onToggle} aria-expanded={open}>
        <span className="hi-m-result">
          <strong>{win ? "Victory" : "Defeat"}</strong>
          <span className="hi-sub">{relativeDate(m.date)}</span>
        </span>
        <span className="hi-m-champ">
          <GameIcon src={ch?.icon} name={ch?.name ?? m.champion} size={36} />
          <span>
            <span className="hi-champ-name">{ch?.name ?? m.champion}</span>
            <span className="hi-sub">
              {modeLabel(m.gameMode)} · {clock(m.durationSec)}
            </span>
          </span>
        </span>
        <span className="hi-m-kda tnum">
          <span className="hi-m-kda-line">
            {m.kills} / <span className="hi-death">{m.deaths}</span> / {m.assists}
          </span>
          <span className="hi-sub">{ratio === "Perfect" ? "Perfect" : `${ratio} KDA`}</span>
        </span>
        <span className="hi-m-items">
          <ItemSlots data={data} ids={m.items} size={24} />
        </span>
        <span className="hi-m-augs">
          {m.augments.slice(0, 2).map((name) => (
            <span key={name} className={`hi-aug hi-aug-sm hi-rar-${findAugment(name)?.rarity ?? "silver"}`} title={name}>
              <span className={`rar-dot rar-dot-${findAugment(name)?.rarity ?? "silver"}`} />
              <span className="hi-aug-name">{name}</span>
            </span>
          ))}
          {m.augments.length > 2 && <span className="hi-more">+{m.augments.length - 2}</span>}
        </span>
        <span className="hi-m-chev" aria-hidden="true">
          <Icon name="chevronDown" size={16} />
        </span>
      </button>
      {open && (
        <div className="hi-match-detail">
          <div className="hi-md-sec">
            <span className="stat-label">Final build</span>
            <span className="hi-md-items">
              {m.items.length === 0 && <span className="hi-sub">No items recorded</span>}
              {m.items.map((id, i) => {
                const it = data.items.get(id);
                return (
                  <span key={`${id}-${i}`} className="hi-md-item">
                    <ItemIcon item={it} name={`Item ${id}`} size={32} />
                    <span className="hi-md-item-name">{it?.name ?? `Item ${id}`}</span>
                  </span>
                );
              })}
            </span>
          </div>
          <div className="hi-md-sec">
            <span className="stat-label">Augments</span>
            <span className="hi-md-augs">{m.augments.length ? m.augments.map((a) => <AugChip key={a} name={a} />) : <span className="hi-sub">None recorded</span>}</span>
          </div>
          <div className="hi-md-sec">
            <span className="stat-label">Enemy team</span>
            <span className="hi-md-enemies">
              {m.enemies.length === 0 && <span className="hi-sub">Not recorded</span>}
              {m.enemies.map((id, i) => {
                const e = data.championsById.get(id);
                return (
                  <span key={`${id}-${i}`} className="hi-md-enemy" title={e?.name ?? id}>
                    <GameIcon src={e?.icon} name={e?.name ?? id} size={30} />
                    <span>{e?.name ?? id}</span>
                  </span>
                );
              })}
            </span>
          </div>
          {m.timeline && m.timeline.samples.length > 0 && (
            <div className="hi-md-sec hi-md-timeline">
              <span className="stat-label">Game timeline</span>
              <GameTimelinePanel timeline={m.timeline} data={data} compact />
            </div>
          )}
          <div className="hi-md-foot">
            <span className="hi-sub">{new Date(m.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onSummary}>
              <Icon name="spark" size={14} />
              Game summary
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------ view

export function HistoryView() {
  const history = useApp((s) => s.history);
  const data = useApp((s) => s.data)!;
  const [mode, setMode] = useState<ModeFilter>("all");
  const [result, setResult] = useState<ResultFilter>("all");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | undefined>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(MATCH_PAGE);
  const [summary, setSummary] = useState<MatchRecord | null>(null);

  const modeCounts = useMemo(() => {
    const c: Partial<Record<GameModeKind, number>> = {};
    for (const m of history) {
      const k = modeFromGameMode(m.gameMode);
      if (k) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [history]);
  const modes = (["mayhem", "aram", "sr", "arena"] as GameModeKind[]).filter((k) => modeCounts[k]);

  // Games matching mode + result (+ search); the champion focus narrows everything below the table.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter((m) => {
      if (mode !== "all" && modeFromGameMode(m.gameMode) !== mode) return false;
      if (result !== "all" && m.result !== result) return false;
      if (q && !champName(data, m.champion).toLowerCase().includes(q) && !m.champion.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [history, mode, result, query, data]);
  const games = useMemo(() => (focus ? base.filter((m) => m.champion === focus) : base), [base, focus]);
  const recent = useMemo(() => [...games].reverse(), [games]);
  const scope = focus ? champName(data, focus) : "All champions";

  useEffect(() => setLimit(MATCH_PAGE), [mode, result, query, focus]);
  // Drop a focus that no longer exists in the filtered set.
  useEffect(() => {
    if (focus && !base.some((m) => m.champion === focus)) setFocus(undefined);
  }, [base, focus]);

  const summaryModal = summary && (
    <PostGameSummary
      record={summary}
      onClose={() => setSummary(null)}
      onOpenHistory={() => setSummary(null)}
    />
  );

  if (!history.length) {
    return (
      <div className="view hi-view">
        <Card className="hi-empty-card">
          <Empty title="No games recorded yet" icon="history">
            <p className="no-margin">
              Nexis records every game automatically when it ends while the app is running — your champion, result, KDA, final items, augments and the enemy team.
            </p>
            <ul className="hi-empty-steps">
              <li>
                <Icon name="play" size={13} /> Play a game with Nexis open (ARAM: Mayhem, ARAM or Summoner's Rift)
              </li>
              <li>
                <Icon name="check" size={13} /> When it ends you'll get a summary, and it lands here
              </li>
              <li>
                <Icon name="tiers" size={13} /> After a few games you'll see your win rates, best augments and best items
              </li>
            </ul>
            <p className="hi-sub no-margin">Everything stays on this PC. Moving from another PC? Import a history export.</p>
            <div className="hi-empty-actions">
              <ImportButton label="Import history" primary />
            </div>
          </Empty>
        </Card>
      </div>
    );
  }

  const filtersActive = mode !== "all" || result !== "all" || !!query || !!focus;
  const resetFilters = () => {
    setMode("all");
    setResult("all");
    setQuery("");
    setFocus(undefined);
  };

  return (
    <div className="view hi-view">
      <div className="hi-toolbar">
        <div className="hi-filters">
          {modes.length > 1 && (
            <Segmented<ModeFilter>
              size="sm"
              label="Game mode"
              value={mode}
              onChange={setMode}
              options={[{ value: "all", label: "All modes" }, ...modes.map((k) => ({ value: k, label: MODE_SHORT[k], hint: `${MODE_LABEL[k]} · ${modeCounts[k]} games` }))]}
            />
          )}
          <Segmented<ResultFilter>
            size="sm"
            label="Result"
            value={result}
            onChange={setResult}
            options={[
              { value: "all", label: "All" },
              { value: "Win", label: "Wins" },
              { value: "Lose", label: "Losses" },
            ]}
          />
          <label className="search search-sm hi-search">
            <Icon name="search" size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search champion" aria-label="Search champion" spellCheck={false} />
            {query && (
              <button type="button" className="hi-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                <Icon name="close" size={12} />
              </button>
            )}
          </label>
          {focus && (
            <button type="button" className="hi-focus-chip" onClick={() => setFocus(undefined)} title="Show all champions">
              <GameIcon src={data.championsById.get(focus)?.icon} name={scope} size={18} round />
              {scope}
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
        <div className="hi-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportHistory(getState().history)} title="Download all recorded games as JSON">
            <Icon name="external" size={14} />
            Export
          </button>
          <ImportButton />
          <ClearButton />
        </div>
      </div>

      {games.length === 0 ? (
        <Card>
          <Empty title="No games match these filters" icon="search">
            <button type="button" className="btn btn-sm btn-ghost" onClick={resetFilters}>
              Reset filters
            </button>
          </Empty>
        </Card>
      ) : (
        <>
          <div className="hi-top">
            <SummaryCard games={games} data={data} />
            <TrendChart games={games} data={data} />
          </div>

          <div className="hi-grid">
            <ChampionTable games={base} data={data} focus={focus} onFocus={setFocus} />
            <div className="hi-side">
              <BestAugments games={games} scope={scope} />
              <BestItems games={games} data={data} scope={scope} />
            </div>
          </div>

          <Card
            title="Matches"
            icon="history"
            pad={false}
            className="hi-matches-card"
            extra={
              <span className="hi-sub">
                {games.length} game{games.length === 1 ? "" : "s"}
                {filtersActive ? " · filtered" : ""}
              </span>
            }
          >
            <ul className="hi-matches">
              {recent.slice(0, limit).map((m) => (
                <MatchRow key={m.id} m={m} data={data} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} onSummary={() => setSummary(m)} />
              ))}
            </ul>
            {recent.length > limit && (
              <button type="button" className="hi-more-btn" onClick={() => setLimit(limit + MATCH_PAGE)}>
                Show more · {recent.length - limit} older game{recent.length - limit === 1 ? "" : "s"}
              </button>
            )}
          </Card>
        </>
      )}
      {summaryModal}
    </div>
  );
}
