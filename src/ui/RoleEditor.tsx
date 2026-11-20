// Summoner's Rift role fixes: a role dropdown per champion (picking a taken lane swaps the two)
// and a roles card for the Players tab. Hidden outside SR (no lanes in ARAM / Mayhem / Arena).
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

const byLane = (ps: PlayerState[]) => {
  const order = (p: PlayerState) => {
    const i = (LANES as string[]).indexOf((p.position ?? "").toUpperCase());
    return i < 0 ? 9 : i;
  };
  return [...ps].sort((a, b) => order(a) - order(b));
};

function TeamRoles({ d, title, players }: { d: Derived; title: string; players: PlayerState[] }) {
  return (
    <div className="roles-team">
      <div className="eyebrow">{title}</div>
      <ul>
        {byLane(players).map((p) => (
          <li key={`${p.team}:${p.championName}`} className={p.isMe ? "roles-me" : ""}>
            <GameIcon src={p.champion?.icon} name={p.championName} size={28} round />
            <span className="roles-name">
              {p.champion?.name ?? p.championName}
              {p.isMe ? <span className="dim"> (you)</span> : null}
            </span>
            <RoleSelect d={d} player={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Players tab: both teams' roles, editable, with Reset. */
export function RolesCard({ d }: { d: Derived }) {
  const g = d.game;
  if (!g || !d.roleGame) return null;
  return (
    <Card
      title="Roles"
      icon="user"
      className="roles-card"
      extra={
        <>
          <span className="dim small">Wrong lane? Fix it here: lanes, matchups and your stats follow</span>
          <ResetRolesButton d={d} />
        </>
      }
    >
      <div className="roles-grid">
        <TeamRoles d={d} title="Your team" players={[g.me, ...g.allies]} />
        <TeamRoles d={d} title="Enemy team" players={g.enemies} />
      </div>
    </Card>
  );
}
