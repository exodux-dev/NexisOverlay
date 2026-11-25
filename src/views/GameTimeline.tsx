// Game timeline (post-game summary + History detail): item timings, an item-gold chart
// (you vs team avg vs enemy avg) and CS/min + KDA trends. Light inline SVG, no chart library.
//
//   <GameTimelinePanel timeline={record.timeline} />

import { t as tx } from "../i18n";
import { useId, useMemo, useState, type PointerEvent } from "react";
import { summarizeTimeline, type GameTimeline, type TimelineSample } from "../engine/timeline";
import type { StaticData } from "../engine/types";
import { clock, gold } from "../ui/format";
import { ItemIcon } from "../ui/ItemIcon";
import "./timeline.css";

const W = 560;
const H = 150;
const PAD = { l: 40, r: 10, t: 12, b: 20 };

type SeriesKey = "itemGold" | "teamItemGold" | "enemyItemGold";
const SERIES: Array<{ key: SeriesKey; label: string; cls: string }> = [
  { key: "itemGold", label: "You", cls: "gtl-you" },
  { key: "teamItemGold", label: "Team avg", cls: "gtl-team" },
  { key: "enemyItemGold", label: "Enemy avg", cls: "gtl-enemy" },
];

function niceStep(max: number): number {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
}

function kStr(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(Math.round(n));
}

function GoldChart({ samples, levels, itemTimes }: { samples: TimelineSample[]; levels: GameTimeline["levels"]; itemTimes: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const tMax = Math.max(60, samples[samples.length - 1]?.t ?? 60);
  const vMax = Math.max(1000, ...samples.flatMap((s) => [s.itemGold, s.teamItemGold, s.enemyItemGold]));
  const step = niceStep(vMax);
  const yTop = Math.ceil(vMax / step) * step;
  const x = (t: number) => PAD.l + (t / tMax) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yTop) * (H - PAD.t - PAD.b);
  const path = (k: SeriesKey) => samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${y(s[k]).toFixed(1)}`).join("");
  const minStep = tMax > 1800 ? 600 : tMax > 600 ? 300 : 120;
  const xTicks = Array.from({ length: Math.floor(tMax / minStep) + 1 }, (_, i) => i * minStep);
  const yTicks = Array.from({ length: Math.round(yTop / step) + 1 }, (_, i) => i * step);
  const youAt = (t: number) => {
    const j = samples.findIndex((s) => s.t >= t);
    // After the last sample: hold its value (not the first sample's).
    if (j < 0) return samples[samples.length - 1]?.itemGold ?? 0;
    if (j === 0) return samples[0].itemGold;
    const a = samples[j - 1];
    const b = samples[j];
    return a.itemGold + ((b.itemGold - a.itemGold) * (t - a.t)) / Math.max(1, b.t - a.t);
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width * W - PAD.l) / (W - PAD.l - PAD.r) * tMax;
    let best = 0;
    samples.forEach((s, i) => Math.abs(s.t - t) < Math.abs(samples[best].t - t) && (best = i));
    setHover(best);
  };
  const h = hover !== null ? samples[hover] : undefined;
  const last = samples[samples.length - 1];
  const summary = last
    ? `Item gold over ${clock(last.t)}. At the end: you ${gold(last.itemGold)}, your team's average ${gold(last.teamItemGold)}, the enemy average ${gold(last.enemyItemGold)}.`
    : "No samples recorded.";

  return (
    <div className="gtl-chart">
      <div className="gtl-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className={`gtl-key ${s.cls}`}>
            <svg width="18" height="6" viewBox="0 0 18 6">
              <line x1="1" y1="3" x2="17" y2="3" />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="gtl-key gtl-key-buy">
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="3" />
          </svg>
          Item done
        </span>
      </div>
      <div className="gtl-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {yTicks.map((v) => (
            <g key={v} className="gtl-grid">
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
              <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end">
                {kStr(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} className="gtl-axis" x={x(t)} y={H - 5} textAnchor={t === 0 ? "start" : "middle"}>
              {Math.round(t / 60)}m
            </text>
          ))}
          {levels.map((l) => (
            <g key={l.level} className="gtl-lvl">
              <line x1={x(l.t)} x2={x(l.t)} y1={PAD.t} y2={H - PAD.b} />
              <text x={x(l.t) + 3} y={PAD.t + 8}>
                Lv{l.level}
              </text>
            </g>
          ))}
          {SERIES.slice()
            .reverse()
            .map((s) => (
              <path key={s.key} className={`gtl-line ${s.cls}`} d={path(s.key)} />
            ))}
          {itemTimes.map((t, i) => (
            <circle key={i} className="gtl-buy" cx={x(t)} cy={y(youAt(t))} r={4} />
          ))}
          {h && (
            <g className="gtl-cross">
              <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={H - PAD.b} />
              {SERIES.map((s) => (
                <circle key={s.key} className={s.cls} cx={x(h.t)} cy={y(h[s.key])} r={3.5} />
              ))}
            </g>
          )}
        </svg>
        {h && (
          <div className={`gtl-tip tnum ${x(h.t) > W / 2 ? "gtl-tip-left" : ""}`} style={{ left: `${(x(h.t) / W) * 100}%` }} role="presentation">
            <strong>{clock(h.t)}</strong>
            {SERIES.map((s) => (
              <span key={s.key} className={s.cls}>
                <i />
                {s.label} <b>{gold(h[s.key])}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Spark({ pts, label, value }: { pts: Array<{ t: number; v: number }>; label: string; value: string }) {
  const w = 120;
  const h = 32;
  const tMax = Math.max(1, ...pts.map((p) => p.t));
  const tMin = pts[0]?.t ?? 0;
  const vMax = Math.max(1, ...pts.map((p) => p.v));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(((p.t - tMin) / Math.max(1, tMax - tMin)) * (w - 4) + 2).toFixed(1)},${(h - 3 - (p.v / vMax) * (h - 6)).toFixed(1)}`).join("");
  const first = pts[0]?.v;
  const lastV = pts[pts.length - 1]?.v;
  const trend = first === undefined || lastV === undefined ? "" : lastV > first * 1.05 ? "rising" : lastV < first * 0.95 ? "falling" : "steady";
  return (
    <div className="gtl-trend">
      <span className="gtl-trend-label">{label}</span>
      <span className="gtl-trend-val tnum">{value}</span>
      {pts.length > 1 && (
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} ${value}, ${trend} over the game`} preserveAspectRatio="none">
          <path d={d} />
        </svg>
      )}
    </div>
  );
}

export function GameTimelinePanel({ timeline, data, compact = false }: { timeline: GameTimeline; data: StaticData | null; compact?: boolean }) {
  const sum = useMemo(() => summarizeTimeline(timeline, data), [timeline, data]);
  const headId = useId();
  const last = timeline.samples[timeline.samples.length - 1];
  const csMin = sum.csPerMin[sum.csPerMin.length - 1]?.v;
  const kda = sum.kda[sum.kda.length - 1]?.v;
  const spike = sum.timings.find((x) => x.legendaryNo === 3);
  return (
    <div className={`gtl ${compact ? "gtl-compact" : ""}`}>
      <div className="gtl-row">
        <div className="gtl-row-head">
          <span className="gtl-label" id={headId}>
            Item timings
          </span>
          <span className="gtl-headline tnum">
            {sum.coreDoneAt !== undefined ? (
              <>
                Core done at <strong>{clock(sum.coreDoneAt)}</strong>
                {spike?.item && <span className="gtl-muted"> · 3-item spike with {spike.item.name}</span>}
              </>
            ) : sum.firstItemAt !== undefined ? (
              <>
                First item at <strong>{clock(sum.firstItemAt)}</strong>
              </>
            ) : (
              <span className="gtl-muted">{tx("No completed items recorded")}</span>
            )}
          </span>
        </div>
        {sum.timings.length > 0 && (
          <ol className="gtl-items" aria-labelledby={headId}>
            {sum.timings.map((x, i) => (
              <li key={`${x.itemId}-${i}`} className={`gtl-item ${x.spike ? "gtl-item-spike" : ""} ${x.boots ? "gtl-item-boots" : ""}`}>
                <ItemIcon item={x.item} name={`Item ${x.itemId}`} size={compact ? 28 : 32} note={x.spike ? (x.legendaryNo === 3 ? "Power spike: completes your 3-item core" : "Power spike: high-impact item") : undefined} />
                <span className="gtl-item-t tnum">{clock(x.t)}</span>
                {x.spike && <span className="gtl-sr"> (power spike)</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
      {timeline.samples.length > 1 && (
        <div className="gtl-row">
          <div className="gtl-row-head">
            <span className="gtl-label">{tx("Item gold")}</span>
            {last && (
              <span className="gtl-muted tnum">
                {last.itemGold >= last.enemyItemGold ? "+" : "−"}
                {gold(Math.abs(last.itemGold - last.enemyItemGold))} vs enemy avg at the end
              </span>
            )}
          </div>
          <GoldChart samples={timeline.samples} levels={timeline.levels} itemTimes={sum.timings.filter((x) => x.legendaryNo).map((x) => x.t)} />
        </div>
      )}
      {(sum.csPerMin.length > 0 || sum.kda.length > 0) && (
        <div className="gtl-trends">
          <Spark pts={sum.csPerMin} label="CS / min" value={csMin === undefined ? "—" : csMin.toFixed(1)} />
          <Spark pts={sum.kda} label="KDA" value={kda === undefined ? "—" : kda.toFixed(2)} />
        </div>
      )}
    </div>
  );
}
