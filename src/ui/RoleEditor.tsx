// Summoner's Rift roles on the Players tab: one row per lane, both teams side by side.
// Click a champion, then a teammate: they swap roles. Hidden outside SR (no lanes there).
import { useState } from "react";
import { actions, type Derived } from "../app/store";
import { LANE_LABEL, LANES, type Lane } from "../engine/power";
import type { PlayerState } from "../engine/types";
import { Card } from "./controls";
import { GameIcon } from "./GameIcon";

const laneOf = (p: PlayerState): Lane | undefined => {
  const l = (p.position ?? "").toUpperCase();
  return (LANES as string[]).includes(l) ? (l as Lane) : undefined;
};
const pkey = (p: PlayerState) => `${p.team}:${p.championName}`;

function Chip({ p, state, onClick }: { p: PlayerState; state: "idle" | "picked" | "target" | "off"; onClick: () => void }) {
  const name = p.champion?.name ?? p.championName;
  return (
    <button
      type="button"
      className={`rb-chip rb-${state} ${p.isMe ? "rb-me" : ""}`}
      disabled={state === "off"}
      aria-pressed={state === "picked"}
      aria-label={`${name}${p.isMe ? " (you)" : ""}`}
      onClick={onClick}
    >
      <GameIcon src={p.champion?.icon} name={name} size={32} round />
      <span className="rb-name">{name}</span>
      {p.isMe && <span className="rb-you">You</span>}
    </button>
  );
}

/** Players tab: lane rows for both teams; click two teammates to swap their roles. */
export function RolesCard({ d }: { d: Derived }) {
  const [picked, setPicked] = useState<PlayerState>();
  const g = d.game;
  const key = d.roleGame;
  if (!g || !key) return null;
  const allies = [g.me, ...g.allies];
  const sameTeam = (a: PlayerState, b: PlayerState) => a.team === b.team;

  const click = (p: PlayerState) => {
    if (!picked) return setPicked(p);
    if (pkey(picked) === pkey(p)) return setPicked(undefined);
    if (!sameTeam(picked, p)) return setPicked(p);
    // Swap: the one with a lane gives it to the other (a teammate in that lane swaps back).
    const from = laneOf(picked);
    if (from) void actions.setRole(key, p, from);
    else {
      const to = laneOf(p);
      if (to) void actions.setRole(key, picked, to);
    }
    setPicked(undefined);
  };
  const stateOf = (p: PlayerState) => (!picked ? "idle" : pkey(picked) === pkey(p) ? "picked" : sameTeam(picked, p) ? "target" : "off");
  const cell = (team: PlayerState[], lane?: Lane) => {
    const p = team.find((x) => laneOf(x) === lane);
    return p ? <Chip p={p} state={stateOf(p)} onClick={() => click(p)} /> : <span className="rb-none">—</span>;
  };
  const noLane = [...allies, ...g.enemies].some((p) => !laneOf(p));

  return (
    <Card
      title="Roles"
      icon="user"
      className="roles-card"
      extra={
        d.roleOverridden ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void actions.resetRoles()}>
            Reset
          </button>
        ) : undefined
      }
    >
      <p className="rb-hint">{picked ? `Now click a teammate to swap with ${picked.champion?.name ?? picked.championName}.` : "Wrong lanes? Click two champions on the same team to swap them."}</p>
      <div className="rb-grid">
        <span />
        <span className="rb-team">Your team</span>
        <span className="rb-team">Enemies</span>
        {LANES.map((lane) => (
          <div key={lane} className="rb-row">
            <span className="rb-lane">{LANE_LABEL[lane]}</span>
            {cell(allies, lane)}
            {cell(g.enemies, lane)}
          </div>
        ))}
        {noLane && (
          <div className="rb-row">
            <span className="rb-lane">No lane</span>
            <span className="rb-stack">{allies.filter((p) => !laneOf(p)).map((p) => <Chip key={pkey(p)} p={p} state={stateOf(p)} onClick={() => click(p)} />)}</span>
            <span className="rb-stack">{g.enemies.filter((p) => !laneOf(p)).map((p) => <Chip key={pkey(p)} p={p} state={stateOf(p)} onClick={() => click(p)} />)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
