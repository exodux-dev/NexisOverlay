// Team composition UI (engine/comp.ts): your team's profile in champ select — with a preview of
// how the highlighted pick-helper candidate changes it — and a two-team comparison on the Players tab.

import { useMemo, type ReactNode } from "react";
import { AXIS_HINT, AXIS_LABEL, analyzeComp, compareComps, pickImpact, type CompAxis, type CompNote, type CompProfile } from "../engine/comp";
import type { GameModeKind } from "../engine/mode";
import type { Champion } from "../engine/types";
import { Card } from "../ui/controls";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import "./teamcomp.css";

const SHORT: Record<CompAxis, string> = {
  frontline: "Frontline",
  engage: "Engage",
  peel: "Peel",
  cc: "CC",
  poke: "Poke",
  sustain: "Sustain",
  waveclear: "Waveclear",
  splitpush: "Split",
  late: "Late game",
};

function level(v: number): { word: string; cls: string } {
  if (v >= 0.75) return { word: "High", cls: "hi" };
  if (v >= 0.45) return { word: "Medium", cls: "mid" };
  if (v >= 0.2) return { word: "Low", cls: "lo" };
  return { word: "Minimal", cls: "none" };
}
const lateLevel = (v: number) => (v >= 0.85 ? { word: "Scales", cls: "hi" } : v >= 0.72 ? { word: "Even", cls: "mid" } : { word: "Falls off", cls: "lo" });
const levelOf = (axis: CompAxis, v: number) => (axis === "late" ? lateLevel(v) : level(v));
function dmgLean(p: CompProfile): { word: string; cls: string } {
  if (!p.count) return { word: "—", cls: "tc-mid" };
  if (p.damage.ad >= 0.75) return { word: "Physical", cls: "tc-lo" };
  if (p.damage.ap >= 0.75) return { word: "Magic", cls: "tc-lo" };
  return { word: "Mixed", cls: "tc-hi" };
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

function AxisTip({ axis, p, title }: { axis: CompAxis; p: CompProfile; title?: string }) {
  const src = p.sources[axis] ?? [];
  return (
    <div className="tt tt-wide">
      <span className="tt-head">
        <strong>{title ?? AXIS_LABEL[axis]}</strong>
        <span className={`tc-lvl tc-${levelOf(axis, p.scores[axis]).cls}`}>{levelOf(axis, p.scores[axis]).word}</span>
      </span>
      <span className="dim small">{AXIS_HINT[axis]}</span>
      {axis === "late" ? (
        <span className="small tc-tt-curve">
          Early {pct(p.curve.early)} · Mid {pct(p.curve.mid)} · Late {pct(p.curve.late)}
        </span>
      ) : null}
      {src.length > 0 && <span className="small">From {src.join(", ")}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ damage split

function DamageBar({ p, thin = false, label }: { p: CompProfile; thin?: boolean; label?: string }) {
  const { ad, ap } = p.damage;
  const tr = p.damage.true;
  const text = `${label ? `${label}: ` : ""}${pct(ad)} physical, ${pct(ap)} magic, ${pct(tr)} true`;
  return (
    <div className={`tc-dmg ${thin ? "tc-dmg-thin" : ""}`} role="img" aria-label={text}>
      {p.count ? (
        <>
          {ad > 0 && <span className="tc-dmg-ad" style={{ width: pct(ad) }} />}
          {ap > 0 && <span className="tc-dmg-ap" style={{ width: pct(ap) }} />}
          {tr > 0 && <span className="tc-dmg-true" style={{ width: pct(tr) }} />}
        </>
      ) : null}
    </div>
  );
}

function DamageLegend({ p }: { p: CompProfile }) {
  return (
    <span className="tc-dmg-legend">
      <span>
        <i className="tc-dot tc-dot-ad" />
        AD <b className="tnum">{pct(p.damage.ad)}</b>
      </span>
      <span>
        <i className="tc-dot tc-dot-ap" />
        AP <b className="tnum">{pct(p.damage.ap)}</b>
      </span>
      {p.damage.true > 0.005 && (
        <span>
          <i className="tc-dot tc-dot-true" />
          True <b className="tnum">{pct(p.damage.true)}</b>
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ profile bars (champ select)

function ProfileRow({ axis, p, preview }: { axis: CompAxis; p: CompProfile; preview?: CompProfile }) {
  const v = p.scores[axis];
  const nv = preview?.scores[axis];
  const delta = nv === undefined ? 0 : nv - v;
  const shown = Math.abs(delta) >= 0.04;
  const lv = levelOf(axis, nv ?? v);
  return (
    <div className="tc-row">
      <Tip content={<AxisTip axis={axis} p={preview ?? p} />}>
        <span className="tc-row-label">{AXIS_LABEL[axis]}</span>
      </Tip>
      <span className="tc-track" aria-hidden="true">
        <i className="tc-fill" style={{ width: pct(shown && delta < 0 ? nv! : v) }} />
        {shown && delta > 0 && <i className="tc-gain" style={{ left: pct(v), width: pct(delta) }} />}
        {shown && delta < 0 && <i className="tc-loss" style={{ left: pct(nv!), width: pct(-delta) }} />}
      </span>
      <span className={`tc-lvl tc-${lv.cls}`}>
        {shown && <Icon name="chevron" size={11} strokeWidth={3} className={`tc-arrow ${delta > 0 ? "tc-up" : "tc-down"}`} />}
        {lv.word}
      </span>
    </div>
  );
}

function NoteList({ notes, empty }: { notes: CompNote[]; empty?: ReactNode }) {
  if (!notes.length) return empty ? <div className="tc-empty dim small">{empty}</div> : null;
  return (
    <ul className="tc-notes">
      {notes.map((n) => (
        <li key={n.key} className={`tc-note tc-note-${n.tone}`}>
          <Icon name={n.tone === "warn" ? "warning" : n.tone === "good" ? "check" : "info"} size={13} strokeWidth={n.tone === "good" ? 2.6 : undefined} />
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

export interface TeamCompSectionProps {
  mode: GameModeKind;
  /** Your team's picks (may include you). */
  team: Champion[];
  me?: Champion;
  /** Highlighted pick-helper option: previewed as if it replaced your champion. */
  candidate?: Champion;
  /** True when `candidate` comes from hovering (vs. the default "best available" suggestion). */
  hovered?: boolean;
  /** Shown when nothing is previewed (e.g. "Hover a bench champion to preview it"). */
  hint?: string;
}

/** "Team comp" block inside the champ select pick helper. */
export function TeamCompSection({ mode, team, me, candidate, hovered, hint }: TeamCompSectionProps) {
  const roster = useMemo(() => (me && !team.some((c) => c.id === me.id) ? [...team, me] : team), [team, me]);
  const profile = useMemo(() => analyzeComp(roster, mode), [roster, mode]);
  const cand = candidate && candidate.id !== me?.id && !roster.some((c) => c.id === candidate.id) ? candidate : undefined;
  const impact = useMemo(() => (cand ? pickImpact(roster, me, cand, mode) : undefined), [roster, me, cand, mode]);
  const preview = useMemo(() => {
    if (!cand) return undefined;
    return analyzeComp([...roster.filter((c) => c.id !== me?.id), cand], mode);
  }, [roster, me, cand, mode]);
  if (!roster.length) return null;

  const notes = [...profile.warnings, ...profile.strengths];
  const partial = profile.count < profile.size;
  return (
    <div className="tc-section" aria-label="Team composition">
      <div className="tc-section-head">
        <span className="eyebrow">Team comp</span>
        <span className="tc-roster">
          {roster.map((c) => (
            <GameIcon key={c.id} src={c.icon} name={c.name} size={20} round />
          ))}
          {Array.from({ length: Math.max(0, profile.size - roster.length) }, (_, i) => (
            <span key={i} className="tc-roster-empty" />
          ))}
          <span className="dim small">{partial ? `${profile.count}/${profile.size} picked · so far` : "Full team"}</span>
        </span>
      </div>
      <div className="tc-section-body">
        <div className="tc-bars">
          <div className="tc-row tc-row-dmg">
            <span className="tc-row-label">Damage</span>
            <span className="tc-dmg-stack">
              <DamageBar p={profile} label="Your team" />
              {preview && <DamageBar p={preview} thin label={`With ${cand!.name}`} />}
              <DamageLegend p={preview ?? profile} />
            </span>
            <span className={`tc-lvl ${dmgLean(preview ?? profile).cls}`}>{dmgLean(preview ?? profile).word}</span>
          </div>
          {profile.axes.map((a) => (
            <ProfileRow key={a} axis={a} p={profile} preview={preview} />
          ))}
        </div>
        <div className="tc-side">
          {cand && impact && (
            <div className="tc-impact">
              <GameIcon src={cand.icon} name={cand.name} size={30} round />
              <div className="tc-impact-text">
                <span className="tc-impact-title">
                  {hovered ? "With" : "If you take"} <b>{cand.name}</b>
                  {me ? <span className="dim"> instead of {me.name}</span> : null}
                </span>
                <span className="tc-impact-sum">{impact.summary || "Barely changes your comp"}</span>
                {impact.fixes.length > 0 && <span className="tc-impact-fix">Fixes: {impact.fixes.map((f) => f.text.split(" — ")[0]).join(" · ")}</span>}
                {impact.adds.length > 0 && <span className="tc-impact-add">New gap: {impact.adds.map((f) => f.text.split(" — ")[0]).join(" · ")}</span>}
              </div>
            </div>
          )}
          {!cand && hint && <div className="tc-hint dim small">{hint}</div>}
          <NoteList notes={notes} empty={partial ? "Comp notes appear as your team locks in." : "Well-rounded comp — no obvious gaps."} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ two-team comparison (Players tab)

function Radar({ axes, ally, enemy }: { axes: CompAxis[]; ally: CompProfile; enemy: CompProfile }) {
  const W = 300;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2 + 2;
  const R = 78;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pt = (i: number, v: number) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v] as const;
  const poly = (p: CompProfile) => axes.map((a, i) => pt(i, Math.max(0.04, p.scores[a])).join(",")).join(" ");
  const summary = axes.map((a) => `${AXIS_LABEL[a]} ${pct(ally.scores[a])} vs ${pct(enemy.scores[a])}`).join("; ");
  return (
    <svg className="tc-radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Team comparison: ${summary}`}>
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} className="tc-radar-ring" points={axes.map((_, i) => pt(i, r).join(",")).join(" ")} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.2);
        const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end";
        return (
          <g key={a}>
            <line className="tc-radar-spoke" x1={cx} y1={cy} x2={x} y2={y} />
            <text className="tc-radar-label" x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle">
              {SHORT[a]}
            </text>
          </g>
        );
      })}
      <polygon className="tc-radar-enemy" points={poly(enemy)} />
      <polygon className="tc-radar-ally" points={poly(ally)} />
      {axes.map((a, i) => {
        const [ex, ey] = pt(i, Math.max(0.04, enemy.scores[a]));
        const [ax, ay] = pt(i, Math.max(0.04, ally.scores[a]));
        return (
          <g key={a}>
            <circle className="tc-radar-dot tc-radar-dot-enemy" cx={ex} cy={ey} r={2.6} />
            <circle className="tc-radar-dot tc-radar-dot-ally" cx={ax} cy={ay} r={2.6} />
          </g>
        );
      })}
    </svg>
  );
}

function VersusRow({ axis, ally, enemy }: { axis: CompAxis; ally: CompProfile; enemy: CompProfile }) {
  const a = ally.scores[axis];
  const e = enemy.scores[axis];
  const diff = a - e;
  const tone = Math.abs(diff) < 0.15 ? "even" : diff > 0 ? "good" : "bad";
  return (
    <div className="tc-vs-row">
      <Tip content={<AxisTip axis={axis} p={ally} title={`${AXIS_LABEL[axis]} · your team`} />} block>
        <span className="tc-vs-bar tc-vs-left" aria-hidden="true">
          <i className="tc-vs-fill-ally" style={{ width: pct(a) }} />
        </span>
      </Tip>
      <span className="tc-vs-mid">
        <span className="tc-vs-label">{AXIS_LABEL[axis]}</span>
        <span className={`tc-vs-tag tc-${tone}`}>{tone === "even" ? "Even" : tone === "good" ? "You" : "Enemy"}</span>
      </span>
      <Tip content={<AxisTip axis={axis} p={enemy} title={`${AXIS_LABEL[axis]} · enemy team`} />} block>
        <span className="tc-vs-bar tc-vs-right" aria-hidden="true">
          <i className="tc-vs-fill-enemy" style={{ width: pct(e) }} />
        </span>
      </Tip>
    </div>
  );
}

function TeamIcons({ champs, side }: { champs: Champion[]; side: "ally" | "enemy" }) {
  return (
    <span className={`tc-team-icons tc-${side}`}>
      {champs.map((c, i) => (
        <GameIcon key={`${c.id}-${i}`} src={c.icon} name={c.name} size={22} round />
      ))}
    </span>
  );
}

/** Players tab: your team vs the enemy team, side by side. */
export function TeamCompVersusCard({ mode, allies, enemies }: { mode: GameModeKind; allies: Champion[]; enemies: Champion[] }) {
  const ally = useMemo(() => analyzeComp(allies, mode), [allies, mode]);
  const enemy = useMemo(() => analyzeComp(enemies, mode), [enemies, mode]);
  const vs = useMemo(() => compareComps(ally, enemy), [ally, enemy]);
  if (allies.length < 2 || enemies.length < 2) return null;
  const axes = ally.axes;
  // Matchup notes take precedence over the matching one-team note ("Strong engage" vs "Enemy has more engage").
  const own = [...ally.warnings, ...ally.strengths].filter((w) => !vs.some((v) => v.key.slice(3) === w.key));
  return (
    <Card
      title="Team comps"
      icon="enemies"
      className="tc-card"
      extra={
        <span className="tc-legend">
          <span className="tc-ally">
            <i className="tc-key tc-key-ally" />
            Your team
          </span>
          <span className="tc-enemy">
            <i className="tc-key tc-key-enemy" />
            Enemy
          </span>
        </span>
      }
    >
      <div className="tc-vs">
        <div className="tc-vs-chart">
          <Radar axes={axes} ally={ally} enemy={enemy} />
        </div>
        <div className="tc-vs-rows">
          <div className="tc-vs-teams">
            <TeamIcons champs={allies} side="ally" />
            <TeamIcons champs={enemies} side="enemy" />
          </div>
          <div className="tc-vs-dmg">
            <div className="tc-vs-dmg-side">
              <DamageBar p={ally} label="Your team" />
              <DamageLegend p={ally} />
            </div>
            <span className="tc-vs-mid">
              <span className="tc-vs-label">Damage</span>
            </span>
            <div className="tc-vs-dmg-side tc-right">
              <DamageBar p={enemy} label="Enemy team" />
              <DamageLegend p={enemy} />
            </div>
          </div>
          {axes.map((a) => (
            <VersusRow key={a} axis={a} ally={ally} enemy={enemy} />
          ))}
        </div>
      </div>
      <div className="tc-vs-notes">
        <div>
          <div className="eyebrow">Matchup</div>
          <NoteList notes={vs} empty="Comps are evenly matched on paper." />
        </div>
        <div>
          <div className="eyebrow">Your comp</div>
          <NoteList notes={own.slice(0, 5)} empty="No obvious gaps." />
        </div>
      </div>
    </Card>
  );
}
