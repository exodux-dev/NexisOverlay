// "Team power" card on the Players tab: team item gold / levels / kills, Summoner's Rift lanes and
// what each enemy is building toward. Scoreboard information only (see engine/power.ts).

import { t as tx } from "../i18n";
import type { ReactNode } from "react";
import { CATEGORY_LABEL, LANE_LABEL, shortGold, signedGold, teamDiffText, type EnemyBuild, type LaneMatchup, type PlayerPower, type TeamPower } from "../engine/power";
import type { BuildCategory } from "../engine/power";
import { Card } from "../ui/controls";
import { gold } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { ItemIcon } from "../ui/ItemIcon";
import { Tip } from "../ui/Tip";
import "./power.css";

const EVEN_GOLD = 300;

function tone(diff: number, even: number): "good" | "bad" | "even" {
  return Math.abs(diff) < even ? "even" : diff > 0 ? "good" : "bad";
}

function signed(n: number): string {
  return n === 0 ? "±0" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

/** One "tug of war" row: your team left, enemy team right. */
function Versus({ label, ally, enemy, fmt, diff, even, tip }: { label: string; ally: number; enemy: number; fmt: (n: number) => string; diff: string; even: number; tip: ReactNode }) {
  const total = ally + enemy;
  const pct = total ? (ally / total) * 100 : 50;
  const t = tone(ally - enemy, even);
  return (
    <div className="tp-vs">
      <span className="tp-vs-val tp-ally tnum">{fmt(ally)}</span>
      <div className="tp-vs-mid">
        <div className="tp-vs-head">
          <Tip content={<div className="tt">{tip}</div>}>
            <span className="tp-vs-label">{label}</span>
          </Tip>
          <span className={`tp-diff tp-${t} tnum`}>{t === "even" ? "Even" : diff}</span>
        </div>
        <div className="tp-bar" role="img" aria-label={`${label}: your team ${fmt(ally)}, enemy team ${fmt(enemy)}`}>
          <span className="tp-bar-ally" style={{ width: `${pct}%` }} />
          <span className="tp-bar-enemy" style={{ width: `${100 - pct}%` }} />
          <i className="tp-bar-mid" />
        </div>
      </div>
      <span className="tp-vs-val tp-enemy tnum">{fmt(enemy)}</span>
    </div>
  );
}

function Avatar({ p, size = 30 }: { p: PlayerPower; size?: number }) {
  return (
    <span className={`tp-avatar tp-${p.side}`}>
      <GameIcon src={p.champion?.icon} name={p.championName} size={size} />
      <span className="tp-lvl tnum">{p.level}</span>
    </span>
  );
}

function Stat({ label, v, even = 0, fmt = signed }: { label: string; v?: number; even?: number; fmt?: (n: number) => string }) {
  if (v === undefined) return null;
  return (
    <span className={`tp-stat tp-${tone(v, even || 1)}`}>
      <small>{label}</small>
      <b className="tnum">{Math.abs(v) < (even || 1) && even ? "Even" : fmt(v)}</b>
    </span>
  );
}

function LaneRow({ l, max }: { l: LaneMatchup; max: number }) {
  const t = tone(l.itemGold, EVEN_GOLD);
  const w = max ? Math.min(50, (Math.abs(l.itemGold) / max) * 50) : 0;
  return (
    <li className={`tp-lane ${l.mine ? "tp-mine" : ""}`}>
      <span className="tp-lane-tag">{LANE_LABEL[l.lane]}</span>
      <span className="tp-lane-side">
        <Avatar p={l.ally} size={28} />
        <span className="tp-lane-name">{l.ally.isMe ? "You" : l.ally.championName}</span>
      </span>
      <span className="tp-lane-diff">
        <span className="tp-dbar" aria-hidden="true">
          <i className={`tp-dfill tp-${t}`} style={l.itemGold >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
          <i className="tp-dbar-mid" />
        </span>
        <span className={`tp-lane-gold tp-${t} tnum`}>{t === "even" ? "Even" : signedGold(l.itemGold)}</span>
      </span>
      <span className="tp-lane-side tp-right">
        <span className="tp-lane-name">{l.enemy.championName}</span>
        <Avatar p={l.enemy} size={28} />
      </span>
      <span className="tp-lane-stats">
        <Stat label="LVL" v={l.level} />
        <Stat label="CS" v={l.cs} even={10} />
      </span>
    </li>
  );
}

const CAT_TONE: Record<BuildCategory, string> = {
  antiheal: "red",
  lethality: "red",
  armorpen: "orange",
  magicpen: "purple",
  mr: "blue",
  armor: "gold",
  healing: "green",
  shield: "blue",
  crit: "orange",
  attackspeed: "orange",
  health: "green",
  support: "green",
  ap: "purple",
  ad: "orange",
};

function BuildRow({ b }: { b: EnemyBuild }) {
  const t = b.toward;
  const slots = 6;
  return (
    <li className="tp-build">
      <span className="tp-avatar tp-enemy">
        <GameIcon src={b.champion?.icon} name={b.championName} size={32} />
        <span className="tp-lvl tnum">{b.level}</span>
      </span>
      <span className="tp-build-who">
        <span className="tp-build-name">{b.championName}</span>
        <span className="tp-build-gold tnum">{gold(b.itemGold)} in items</span>
      </span>
      <span className="tp-build-items">
        {b.completed.slice(0, slots).map((it, i) => (
          <ItemIcon key={`${it.id}-${i}`} item={it} size={24} />
        ))}
        {b.components.slice(0, Math.max(0, slots - b.completed.length)).map((it, i) => (
          <ItemIcon key={`c-${it.id}-${i}`} item={it} size={24} className="tp-part" />
        ))}
        {Array.from({ length: Math.max(0, slots - b.completed.length - b.components.length) }, (_, i) => (
          <span key={`e-${i}`} className="tp-slot" />
        ))}
      </span>
      {t ? (
        <Tip
          content={
            <div className="tt tp-tt">
              <strong>
                {t.confidence === "likely" ? "Likely" : "Possibly"} building {t.item.name}
              </strong>
              <div className="dim small">
                Holds {t.parts.map((p) => p.name).join(" + ")} · {Math.round(t.progress * 100)}% of the recipe, {gold(t.missing)} gold to go
              </div>
              <div className="tp-tt-hint">{t.hint}</div>
            </div>
          }
        >
          <span className={`tp-toward tp-c-${CAT_TONE[t.category]}`} tabIndex={0}>
            <span className="tp-toward-icon">
              <GameIcon src={t.item.icon} name={t.item.name} size={22} />
              <svg viewBox="0 0 24 24" className="tp-ring" aria-hidden="true">
                <circle cx="12" cy="12" r="10.5" pathLength={100} strokeDasharray={`${Math.round(t.progress * 100)} 100`} />
              </svg>
            </span>
            <span className="tp-toward-text">
              <span className="tp-toward-cat">
                {CATEGORY_LABEL[t.category]}
                <span className="tp-toward-item"> · {t.confidence === "likely" ? "" : "maybe "}{t.item.name}</span>
              </span>
              <span className="tp-toward-hint">{t.hint}</span>
            </span>
          </span>
        </Tip>
      ) : (
        <span className="tp-toward tp-none">{b.completed.length >= 5 ? "Full build" : "No components"}</span>
      )}
    </li>
  );
}

export function TeamPowerCard({ power }: { power: TeamPower }) {
  const { ally, enemy, diff } = power;
  const t = tone(diff.itemGold, EVEN_GOLD);
  const maxLane = Math.max(1000, ...power.lanes.map((l) => Math.abs(l.itemGold)));
  return (
    <Card
      title="Team power"
      icon="power"
      className="tp-card"
      extra={
        power.teamsComparable ? (
          <span className={`tp-verdict tp-${t}`}>{teamDiffText(diff.itemGold, EVEN_GOLD)}</span>
        ) : (
          <span className="dim small">{tx("Arena \u00b7 enemy duos aren't shown on the scoreboard")}</span>
        )
      }
    >
      {power.teamsComparable && (
        <div className="tp-teams">
          <div className="tp-legend">
            <span className="tp-ally">{tx("Your team")}</span>
            <span className="tp-enemy">{tx("Enemy team")}</span>
          </div>
          <Versus
            label="Item gold"
            ally={ally.itemGold}
            enemy={enemy.itemGold}
            fmt={shortGold}
            diff={signedGold(diff.itemGold)}
            even={EVEN_GOLD}
            tip="Value of the items each team holds (completed items and components), from the scoreboard. Unspent gold isn't visible."
          />
          <Versus
            label="Levels"
            ally={ally.levels}
            enemy={enemy.levels}
            fmt={String}
            diff={`${signed(diff.levels)} · avg ${ally.avgLevel.toFixed(1)} vs ${enemy.avgLevel.toFixed(1)}`}
            even={1}
            tip="Sum of champion levels on each team."
          />
          <Versus label="Kills" ally={ally.kills} enemy={enemy.kills} fmt={String} diff={signed(diff.kills)} even={1} tip="Team kills from the scoreboard." />
        </div>
      )}
      {power.lanes.length > 0 && (
        <div className="tp-sec">
          <div className="tp-sec-head">
            <span>{tx("Lanes")}</span>
            <span className="dim">{tx("Item gold \u00b7 level \u00b7 CS difference")}</span>
          </div>
          <ul className="tp-lanes">
            {power.lanes.map((l) => (
              <LaneRow key={l.lane} l={l} max={maxLane} />
            ))}
          </ul>
        </div>
      )}
      <div className="tp-sec">
        <div className="tp-sec-head">
          <span>{tx("Enemy builds")}</span>
          <span className="dim">{tx("Building toward \u2014 from components held")}</span>
        </div>
        <ul className="tp-builds">
          {power.builds.map((b) => (
            <BuildRow key={b.riotId} b={b} />
          ))}
        </ul>
      </div>
    </Card>
  );
}
