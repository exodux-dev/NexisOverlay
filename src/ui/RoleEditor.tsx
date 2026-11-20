// Summoner's Rift role fixes: a role dropdown per champion (picking a taken lane swaps the two)
// and a roles card for the Players tab. Hidden outside SR (no lanes in ARAM / Mayhem / Arena).
import { Fragment, useState } from "react";
import { actions, type Derived } from "../app/store";
import { LANE_LABEL, LANES, type Lane } from "../engine/power";
import type { PlayerState } from "../engine/types";
import { Card } from "./controls";
import { GameIcon } from "./GameIcon";

const LANE_SHORT: Record<Lane, string> = { TOP: "Top", JUNGLE: "Jg", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Sup" };

export function RoleSelect({ d, player, short = false }: { d: Derived; player: PlayerState; short?: boolean }) {
  const key = d.roleGame;
  if (!key) return null;
  const lane = (LANES as string[]).includes((player.position ?? "").toUpperCase()) ? (player.position!.toUpperCase() as Lane) : "";
  const name = player.champion?.name ?? player.championName;
  return (
    <select
      className="role-select"
      aria-label={`${name} role`}
      title="Fix this champion's role (a teammate already there swaps)"
      value={lane}
      onChange={(e) => e.target.value && void actions.setRole(key, player, e.target.value as Lane)}
    >
      {!lane && <option value="">—</option>}
      {LANES.map((l) => (
        <option key={l} value={l}>
          {short ? LANE_SHORT[l] : LANE_LABEL[l]}
        </option>
      ))}
    </select>
  );
}

export function ResetRolesButton({ d }: { d: Derived }) {
  if (!d.roleGame || !d.roleOverridden) return null;
  return (
    <button type="button" className="btn btn-sm btn-ghost" onClick={() => void actions.resetRoles()} title="Back to the roles from the game">
      Reset roles
    </button>
  );
}

const laneOf = (p: PlayerState): Lane | undefined => {
  const l = (p.position ?? "").toUpperCase();
  return (LANES as string[]).includes(l) ? (l as Lane) : undefined;
};
const pkey = (p: PlayerState) => `${p.team}:${p.championName}`;

/** A champion in a lane slot: drag it onto another lane (same team) to swap, or click then click a lane. */
function ChampChip({ p, picked, onPick }: { p: PlayerState; picked: boolean; onPick: () => void }) {
  const name = p.champion?.name ?? p.championName;
  return (
    <button
      type="button"
      draggable
      className={`lb-chip ${p.isMe ? "lb-me" : ""} ${picked ? "lb-picked" : ""}`}
      aria-pressed={picked}
      aria-label={`${name}${p.isMe ? " (you)" : ""}: drag to another lane`}
      title="Drag onto another lane to swap, or click then click a lane"
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-nexis-player", pkey(p));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onPick}
    >
      <GameIcon src={p.champion?.icon} name={name} size={30} round />
      <span className="lb-name">
        {name}
        {p.isMe ? <span className="dim"> (you)</span> : null}
      </span>
    </button>
  );
}

function LaneSlot({ d, lane, team, players, picked, setPicked }: { d: Derived; lane: Lane; team: string; players: PlayerState[]; picked?: string; setPicked: (k?: string) => void }) {
  const [over, setOver] = useState(false);
  const here = players.find((p) => laneOf(p) === lane);
  const move = (key: string) => {
    const who = players.find((p) => pkey(p) === key);
    if (who && d.roleGame && laneOf(who) !== lane) void actions.setRole(d.roleGame, who, lane);
    setPicked(undefined);
  };
  const pickedHere = picked && players.some((p) => pkey(p) === picked);
  return (
    <div
      className={`lb-slot ${over ? "lb-over" : ""} ${pickedHere && (!here || pkey(here) !== picked) ? "lb-target" : ""}`}
      data-lane={lane}
      data-team={team}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("text/x-nexis-player")) return;
        const key = e.dataTransfer.getData("text/x-nexis-player");
        // getData is empty during dragover in most browsers: same-team check happens on drop.
        if (key && !players.some((p) => pkey(p) === key)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        move(e.dataTransfer.getData("text/x-nexis-player"));
      }}
      onClick={(e) => {
        // Click-to-move: a picked champion of this team goes here (the chip's own click picks).
        if (pickedHere && e.target === e.currentTarget) move(picked!);
      }}
    >
      {here ? (
        <ChampChip
          p={here}
          picked={picked === pkey(here)}
          onPick={() => (pickedHere && picked !== pkey(here) ? move(picked!) : setPicked(picked === pkey(here) ? undefined : pkey(here)))}
        />
      ) : (
        <span className="lb-empty dim">Drop here</span>
      )}
    </div>
  );
}

/** Players tab: League-style lane board for both teams, with Reset. */
export function RolesCard({ d }: { d: Derived }) {
  const [picked, setPicked] = useState<string>();
  const g = d.game;
  if (!g || !d.roleGame) return null;
  const allies = [g.me, ...g.allies];
  const unassigned = [...allies, ...g.enemies].filter((p) => !laneOf(p));
  return (
    <Card
      title="Roles"
      icon="user"
      className="roles-card"
      extra={
        <>
          <span className="dim small">Wrong lane? Drag champions to swap: lanes, matchups and your stats follow</span>
          <ResetRolesButton d={d} />
        </>
      }
    >
      <div className="lane-board" role="group" aria-label="Lane board">
        <div className="lb-head" />
        <div className="lb-head eyebrow">Your team</div>
        <div className="lb-head eyebrow">Enemy team</div>
        {LANES.map((lane) => (
          <Fragment key={lane}>
            <div className="lb-lane">{LANE_LABEL[lane]}</div>
            <LaneSlot d={d} lane={lane} team="ally" players={allies} picked={picked} setPicked={setPicked} />
            <LaneSlot d={d} lane={lane} team="enemy" players={g.enemies} picked={picked} setPicked={setPicked} />
          </Fragment>
        ))}
      </div>
      {unassigned.length > 0 && (
        <div className="lb-unassigned">
          <span className="dim small">No lane yet:</span>
          {unassigned.map((p) => (
            <ChampChip key={pkey(p)} p={p} picked={picked === pkey(p)} onPick={() => setPicked(picked === pkey(p) ? undefined : pkey(p))} />
          ))}
        </div>
      )}
    </Card>
  );
}
