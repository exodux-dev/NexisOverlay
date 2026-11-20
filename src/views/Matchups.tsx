// Summoner's Rift matchups: your lane opponent and your best / worst matchups (OP.GG counters).

import { useApp, type Derived } from "../app/store";
import { resolveChampionId } from "../engine/sources/tierlists";
import type { Champion, StaticData } from "../engine/types";
import { Card, Pill } from "../ui/controls";
import { GameIcon } from "../ui/GameIcon";
import { Tip } from "../ui/Tip";
import "./matchups.css";

interface Row {
  champion: Champion;
  winRate: number;
  games: number;
}

function resolveRows(counters: NonNullable<Derived["championStats"]>["counters"], data: StaticData): Row[] {
  const out: Row[] = [];
  for (const c of counters ?? []) {
    const id = resolveChampionId(c.championKey, data);
    const champion = id ? data.championsById.get(id) : undefined;
    if (champion && !out.some((r) => r.champion.id === champion.id)) out.push({ champion, winRate: c.winRate, games: c.games });
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function MatchupChip({ row, me }: { row: Row; me: Champion }) {
  const good = row.winRate >= 0.5;
  return (
    <Tip
      content={
        <div className="tt">
          <strong>
            {me.name} vs {row.champion.name}
          </strong>
          <div className="dim small">
            {pct(row.winRate)} win rate for {me.name} · {row.games.toLocaleString()} games
          </div>
        </div>
      }
    >
      <div className={`mu-chip ${good ? "mu-good" : "mu-bad"}`}>
        <GameIcon src={row.champion.icon} name={row.champion.name} size={34} round />
        <span className="mu-name">{row.champion.name}</span>
        <span className="mu-wr">{pct(row.winRate)}</span>
      </div>
    </Tip>
  );
}

/** Lane opponent = the enemy in your position (live Summoner's Rift games). */
function laneOpponent(d: Derived): Champion | undefined {
  const me = d.game?.me;
  if (!me?.position) return undefined;
  return d.game?.enemies.find((e) => e.position === me.position)?.champion;
}

export function MatchupsCard({ d }: { d: Derived }) {
  const data = useApp((s) => s.data);
  const me = d.baseChampion;
  if (!data || !me || d.gameMode !== "sr") return null;
  const rows = resolveRows(d.championStats?.counters, data);
  const opp = laneOpponent(d);
  if (!rows.length && !opp) return null;

  const weak = rows.filter((r) => r.winRate < 0.5).sort((a, b) => a.winRate - b.winRate).slice(0, 5);
  const strong = rows.filter((r) => r.winRate >= 0.5).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
  const oppRow = opp ? rows.find((r) => r.champion.id === opp.id) : undefined;

  return (
    <Card title="Matchups" icon="enemies" extra={<span className="dim small">OP.GG · {me.name}'s win rate</span>} className="mu-card">
      {opp && (
        <div className={`mu-lane ${oppRow ? (oppRow.winRate >= 0.5 ? "mu-good" : "mu-bad") : ""}`}>
          <GameIcon src={opp.icon} name={opp.name} size={42} round />
          <div className="mu-lane-text">
            <span className="eyebrow">Lane opponent</span>
            <strong>{opp.name}</strong>
          </div>
          {oppRow ? (
            <Pill tone={oppRow.winRate >= 0.5 ? "green" : "red"}>
              {pct(oppRow.winRate)} · {oppRow.winRate >= 0.5 ? "favoured" : "tough lane"}
            </Pill>
          ) : (
            <span className="dim small">No matchup data</span>
          )}
        </div>
      )}
      <div className="mu-cols">
        {weak.length > 0 && (
          <div>
            <div className="eyebrow mu-h">Toughest matchups</div>
            <div className="mu-list">
              {weak.map((r) => (
                <MatchupChip key={r.champion.id} row={r} me={me} />
              ))}
            </div>
          </div>
        )}
        {strong.length > 0 && (
          <div>
            <div className="eyebrow mu-h">Best matchups</div>
            <div className="mu-list">
              {strong.map((r) => (
                <MatchupChip key={r.champion.id} row={r} me={me} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
