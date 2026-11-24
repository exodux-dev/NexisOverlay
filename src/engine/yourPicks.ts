// Champ select "Your best picks": the champions YOU play, ranked for this team — your own record in
// this mode (smoothed so 2 games aren't a sure thing), the champion's tier win rate, and how it fits
// your team's comp. Summoner's Rift: only champions with data for your role. ARAM / Mayhem: only
// champions you can actually get (bench, or a trade with a teammate).
import { pickImpact } from "./comp";
import type { GameModeKind } from "./mode";
import { findTierRow, rowsForPosition, type ChampionTierRow } from "./sources/tierlists";
import type { Champion, MatchRecord, StaticData } from "./types";

export interface YourPick {
  champion: Champion;
  games: number;
  wins: number;
  row?: ChampionTierRow;
  /** Comp change summary, e.g. "+Frontline · fixes all-physical damage". */
  fit: string;
  score: number;
}

export function yourBestPicks(o: {
  data: StaticData;
  history: MatchRecord[];
  mode: GameModeKind;
  rows?: ChampionTierRow[];
  position?: string;
  team: Champion[];
  me?: Champion;
  /** ARAM / Mayhem: champions you can get (bench + teammates); other modes: anyone not taken. */
  available?: Champion[];
  limit?: number;
}): YourPick[] {
  const played = new Map<string, { games: number; wins: number }>();
  for (const m of o.history) {
    const s = played.get(m.champion) ?? { games: 0, wins: 0 };
    s.games++;
    if (m.result === "Win") s.wins++;
    played.set(m.champion, s);
  }
  const taken = new Set(o.team.map((c) => c.id));
  const allowed = o.available ? new Set(o.available.map((c) => c.id)) : undefined;
  const rolePool = o.mode === "sr" && o.position && o.rows?.length ? new Set(rowsForPosition(o.rows, o.position).map((r) => r.championKey)) : undefined;
  const out: YourPick[] = [];
  for (const [id, s] of played) {
    if (s.games < 2 || id === o.me?.id) continue;
    if (allowed ? !allowed.has(id) : taken.has(id)) continue;
    if (rolePool && !rolePool.has(id)) continue;
    const champion = o.data.championsById.get(id);
    if (!champion) continue;
    const row = findTierRow(o.rows, id, o.mode === "sr" ? o.position : undefined);
    const personal = (s.wins + 2) / (s.games + 4); // pulled toward 50% on small samples
    const tier = row?.winRate ?? 0.5;
    const impact = pickImpact(o.team, o.me, champion, o.mode);
    const fitBonus = impact.fixes.length * 0.015 + impact.deltas.reduce((t, d) => t + Math.max(0, d.delta), 0) * 0.02;
    const confidence = Math.min(1, s.games / 10);
    out.push({ champion, games: s.games, wins: s.wins, row, fit: impact.summary, score: personal * (0.45 + 0.25 * confidence) + tier * (0.55 - 0.25 * confidence) + fitBonus });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, o.limit ?? 3);
}
