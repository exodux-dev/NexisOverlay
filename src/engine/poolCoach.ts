// Champion pool coach: 2-3 champions worth adding to your pool for a mode (and role on the Rift):
// strong this patch (tier list), not already in your pool, and the same style as the champions you
// win with (archetype, then Riot class). Needs a few recorded games in the mode.
import type { GameModeKind } from "./mode";
import { rowsForPosition, type ChampionTierRow } from "./sources/tierlists";
import type { Archetype, Champion, MatchRecord, StaticData } from "./types";

export interface PoolSuggestion {
  champion: Champion;
  row: ChampionTierRow;
  /** Your champion it plays like (for the "plays like" line). */
  like?: Champion;
}

export function poolSuggestions(o: { data: StaticData; history: MatchRecord[]; rows?: ChampionTierRow[]; mode: GameModeKind; position?: string; limit?: number }): PoolSuggestion[] {
  if (!o.rows?.length) return [];
  const mine = new Map<string, { games: number; wins: number }>();
  for (const m of o.history) {
    const s = mine.get(m.champion) ?? { games: 0, wins: 0 };
    s.games++;
    if (m.result === "Win") s.wins++;
    mine.set(m.champion, s);
  }
  if ([...mine.values()].reduce((t, s) => t + s.games, 0) < 5) return [];
  // Your style: champions you've won with (smoothed), weighted by games.
  const styles = new Map<Archetype, { weight: number; best?: Champion; bestScore: number }>();
  const tagWeight = new Map<string, number>();
  for (const [id, s] of mine) {
    const c = o.data.championsById.get(id);
    if (!c) continue;
    const score = ((s.wins + 1) / (s.games + 2)) * Math.min(1, s.games / 5);
    const st = styles.get(c.archetype) ?? { weight: 0, bestScore: -1 };
    st.weight += score;
    if (score > st.bestScore) {
      st.bestScore = score;
      st.best = c;
    }
    styles.set(c.archetype, st);
    for (const t of c.tags) tagWeight.set(t, (tagWeight.get(t) ?? 0) + score * 0.5);
  }
  const rows = o.mode === "sr" ? rowsForPosition(o.rows, o.position) : o.rows;
  const out: Array<PoolSuggestion & { score: number }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (mine.has(r.championKey) || seen.has(r.championKey)) continue;
    const c = o.data.championsById.get(r.championKey);
    if (!c) continue;
    seen.add(c.id);
    const st = styles.get(c.archetype);
    const fit = (st?.weight ?? 0) + c.tags.reduce((t, x) => t + (tagWeight.get(x) ?? 0), 0) * 0.3;
    if (fit <= 0) continue;
    const strength = r.winRate - 0.5 + (typeof r.tier === "number" ? (3 - r.tier) * 0.004 : 0);
    out.push({ champion: c, row: r, like: st?.best, score: fit * 0.04 + strength });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, o.limit ?? 3)
    .map(({ score: _s, ...x }) => x);
}
