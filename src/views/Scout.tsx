// Loading-screen player scouting: rank, form, champion experience and quick tags for all 10
// players, from OP.GG public profiles (see engine/sources/opggProfile.ts).

import { t as tx } from "../i18n";
import type { CSSProperties } from "react";
import {
  positionLabel,
  rankLabel,
  scoutTags,
  summarizeProfile,
  type PlayerProfile,
  type ProfileSummary,
  type RankEntry,
  type ScoutTag,
} from "../engine/sources/opggProfile";
import { useApp } from "../app/store";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import "./scout.css";

export interface ScoutPlayer {
  riotId: string;
  championId?: string;
  championName: string;
  championIcon?: string;
  team: "ORDER" | "CHAOS";
  isMe: boolean;
  /** Assigned position this game (TOP/JUNGLE/MID/ADC/SUPPORT), when known. */
  position?: string;
}

export type ProfileState = PlayerProfile | "loading" | "error" | "private";

interface PanelProps {
  players: ScoutPlayer[];
  profiles: Record<string, ProfileState>;
  /** OP.GG region slug / platform shown in the header. */
  region?: string;
  /** Free-form status line ("Fetching 4 of 10…", "Cached 2 min ago"). */
  status?: string;
  /** Current queue/mode (e.g. "ARAM", "SOLORANKED") so tags compare like with like. */
  queue?: string;
}

const QUEUE_SHORT: Record<string, string> = { SOLORANKED: "Solo/Duo", FLEXRANKED: "Flex", RANKED5S: "5v5" };

/** Streamer mode: a player is shown by champion only ("Ahri player"), never by Riot ID. */
function useStreamer(): boolean {
  return useApp((s) => s.settings.streamerMode);
}
const maskedName = (p: { championName: string; isMe?: boolean }) => (p.isMe ? "You" : `${p.championName} player`);

function splitId(riotId: string): { name: string; tag?: string } {
  const i = riotId.lastIndexOf("#");
  return i > 0 ? { name: riotId.slice(0, i), tag: riotId.slice(i + 1) } : { name: riotId };
}

function champOf(p: ScoutPlayer) {
  return { id: p.championId ?? p.championName, name: p.championName };
}

function wrClass(wr?: number): string {
  if (wr === undefined) return "";
  return wr >= 55 ? "sc-good" : wr <= 45 ? "sc-bad" : "";
}

const TIER_SHORT: Record<string, string> = { iron: "I", bronze: "B", silver: "S", gold: "G", platinum: "P", emerald: "E", diamond: "D", master: "M", grandmaster: "GM", challenger: "C" };

/** "G2 · 66 LP", "M · 312 LP", "Unranked" — for tight spaces. */
function rankShort(r?: RankEntry): string {
  if (!r) return "Unranked";
  const t = TIER_SHORT[r.tier.toLowerCase()] ?? r.tier;
  return `${t}${r.division ?? ""}${r.lp !== undefined ? ` · ${r.lp.toLocaleString("en-US")} LP` : ""}`;
}

function RankBadge({ rank, all, size = "md" }: { rank?: RankEntry; all: RankEntry[]; size?: "sm" | "md" }) {
  const tier = rank?.tier.toLowerCase() ?? "unranked";
  const badge = (
    <span className={`sc-rank sc-rank-${size} sc-tier-${tier}`} title={size === "sm" ? rankLabel(rank) : undefined}>
      <span className="sc-rank-gem" aria-hidden />
      {size === "sm" ? rankShort(rank) : rankLabel(rank)}
    </span>
  );
  if (all.length <= 1 && !rank) return badge;
  return (
    <Tip
      content={
        <div className="tt sc-tt">
          {all.map((r) => (
            <div key={r.queue} className="sc-tt-row">
              <span className="sc-tt-k">{QUEUE_SHORT[r.queue] ?? r.queue}</span>
              <span>{rankLabel(r)}</span>
              <span className="sc-tt-dim">
                {r.wins}W {r.losses}L · {r.winRate}%
              </span>
            </div>
          ))}
        </div>
      }
    >
      {badge}
    </Tip>
  );
}

function Form({ profile, max = 10, size = "md" }: { profile: PlayerProfile; max?: number; size?: "sm" | "md" }) {
  const games = profile.recent.filter((g) => g.result !== "REMAKE").slice(0, max);
  if (!games.length) return <span className="sc-dim sc-small">{tx("No recent games")}</span>;
  return (
    <Tip
      content={
        <div className="tt sc-tt">
          <div className="sc-tt-title">{tx("Recent games \u00b7 newest first")}</div>
          {games.map((g, i) => (
            <div key={i} className="sc-tt-row">
              <span className={`sc-tt-res ${g.result === "WIN" ? "sc-good" : "sc-bad"}`}>{g.result === "WIN" ? "W" : "L"}</span>
              <span className="sc-tt-champ">{g.champion}</span>
              <span className="sc-tt-kda">
                {g.kills}/{g.deaths}/{g.assists}
              </span>
              <span className="sc-tt-dim">{g.queueName ?? QUEUE_SHORT[g.queue] ?? g.queue}</span>
            </div>
          ))}
        </div>
      }
    >
      <span className={`sc-form sc-form-${size}`} aria-label={`Recent: ${games.map((g) => (g.result === "WIN" ? "W" : "L")).join("")}`}>
        {games.map((g, i) => (
          <span key={i} className={`sc-sq ${g.result === "WIN" ? "sc-sq-w" : "sc-sq-l"}`} />
        ))}
      </span>
    </Tip>
  );
}

export function TagChip({ tag, size = "md", className }: { tag: ScoutTag; size?: "sm" | "md"; className?: string }) {
  return (
    <Tip content={<div className="sc-tag-tip">{tag.detail}</div>} className={className}>
      <span className={`sc-tag sc-tag-${tag.tone} sc-tag-${size}`} tabIndex={0}>
        {tag.label}
      </span>
    </Tip>
  );
}

function MoreTags({ tags, className }: { tags: ScoutTag[]; className: string }) {
  if (!tags.length) return null;
  return (
    <Tip
      className={className}
      content={
        <div className="sc-more-tip">
          {tags.map((t) => (
            <div key={t.label}>
              <strong className={`sc-tone-${t.tone}`}>{t.label}</strong> — {t.detail}
            </div>
          ))}
        </div>
      }
    >
      <span className="sc-tag sc-tag-more" tabIndex={0}>
        +{tags.length}
      </span>
    </Tip>
  );
}

function ChampLine({ s, champion }: { s: ProfileSummary; champion: string }) {
  const c = s.champion;
  if (!c) return null;
  if (!c.games)
    return (
      <span className="sc-stat">
        <span className="sc-k">{champion}</span>
        <span className="sc-dim">no recent games</span>
      </span>
    );
  return (
    <Tip content={<div className="sc-tag-tip">{c.source === "season" ? `${c.games} games on ${champion} in OP.GG's most-played list (${c.wins}W ${c.losses}L).` : `${c.games} of their recent games on ${champion}.`}</div>}>
      <span className="sc-stat">
        <span className="sc-k">{champion}</span>
        <span className="sc-v">{c.games}G</span>
        <span className={`sc-v ${wrClass(c.winRate)}`}>{c.winRate}%</span>
      </span>
    </Tip>
  );
}

function Skeleton() {
  return (
    <div className="sc-skel" aria-label="Loading profile">
      <span className="sc-skel-bar" style={{ width: "72%" }} />
      <span className="sc-skel-bar" style={{ width: "48%" }} />
    </div>
  );
}

function PlayerCard({ player, state, queue, style }: { player: ScoutPlayer; state: ProfileState | undefined; queue?: string; style?: CSSProperties }) {
  const streamer = useStreamer();
  const { name, tag } = streamer ? { name: maskedName(player), tag: undefined } : splitId(player.riotId);
  const profile = typeof state === "object" ? state : undefined;
  const s = profile ? summarizeProfile(profile, champOf(player)) : undefined;
  const tags = profile ? scoutTags(profile, champOf(player), queue, { position: player.position }) : [];
  const shown = tags.slice(0, 3);
  const role = positionLabel(player.position);

  return (
    <article className={`sc-card ${player.isMe ? "sc-me" : ""} sc-team-${player.team === "ORDER" ? "blue" : "red"}`} style={style}>
      <div className="sc-portrait">
        <GameIcon src={player.championIcon} name={player.championName} size={46} />
        {role && <span className="sc-role">{role}</span>}
      </div>
      <div className="sc-body">
        <header className="sc-head">
          <span className="sc-id" title={streamer ? undefined : player.riotId}>
            <span className="sc-name">{name}</span>
            {tag && <span className="sc-tagline">#{tag}</span>}
          </span>
          {player.isMe && <span className="sc-you">You</span>}
          {profile?.level !== undefined && <span className="sc-level">Lv {profile.level}</span>}
          <span className="sc-head-gap" />
          {profile && <RankBadge rank={profile.rank} all={profile.ranks} />}
        </header>

        {state === "loading" || state === undefined ? (
          <Skeleton />
        ) : !profile ? (
          <div className="sc-nodata">
            <Icon name="info" size={13} />
            {state === "private" ? "Profile is private" : "No OP.GG data"}
            <span className="sc-dim">· {player.championName}</span>
          </div>
        ) : (
          <>
            <div className="sc-stats">
              <span className="sc-stat">
                <span className="sc-k">{tx("Season")}</span>
                {s!.seasonWinRate !== undefined ? (
                  <>
                    <span className={`sc-v ${wrClass(s!.seasonWinRate)}`}>{s!.seasonWinRate}%</span>
                    <span className="sc-dim">{s!.seasonGames}G</span>
                  </>
                ) : (
                  <span className="sc-dim">—</span>
                )}
              </span>
              {s!.avg && (
                <Tip content={<div className="sc-tag-tip">Average over their last {s!.form.length} games. KDA = (kills + assists) / deaths.</div>}>
                  <span className="sc-stat">
                    <span className="sc-k">KDA</span>
                    <span className="sc-v">
                      {s!.avg.kills} / <span className="sc-bad">{s!.avg.deaths}</span> / {s!.avg.assists}
                    </span>
                    <span className={`sc-dim ${s!.avg.kda >= 4 ? "sc-good" : s!.avg.kda < 2 ? "sc-bad" : ""}`}>{s!.avg.kda}</span>
                  </span>
                </Tip>
              )}
              <ChampLine s={s!} champion={player.championName} />
            </div>
            <div className="sc-foot">
              <Form profile={profile} />
              <span className="sc-record">{s!.form.length ? s!.recentRecord : ""}</span>
              <span className="sc-tags">
                {shown.map((t, i) => (
                  <TagChip key={t.label} tag={t} className={i >= 2 ? "sc-tag-extra" : ""} />
                ))}
                {/* Narrow cards show two chips, wide cards three; each layout has its own "+N". */}
                <MoreTags tags={tags.slice(2)} className="sc-more-narrow" />
                <MoreTags tags={tags.slice(3)} className="sc-more-wide" />
              </span>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function teamsOf(players: ScoutPlayer[]) {
  const mine = players.find((p) => p.isMe)?.team ?? "ORDER";
  return { mine, ally: players.filter((p) => p.team === mine), enemy: players.filter((p) => p.team !== mine) };
}

function teamAvgWr(players: ScoutPlayer[], profiles: Record<string, ProfileState>): number | undefined {
  const wrs = players
    .map((p) => profiles[p.riotId])
    .filter((x): x is PlayerProfile => typeof x === "object")
    .map((p) => p.rank)
    .filter((r): r is RankEntry => !!r && r.wins + r.losses >= 10)
    .map((r) => r.winRate);
  return wrs.length ? Math.round(wrs.reduce((a, b) => a + b, 0) / wrs.length) : undefined;
}

export function ScoutPanel({ players, profiles, region, status, queue }: PanelProps) {
  const { ally, enemy } = teamsOf(players);
  const loading = players.filter((p) => profiles[p.riotId] === "loading" || profiles[p.riotId] === undefined).length;
  // Wide layout: one shared grid so a row's ally and enemy cards keep equal heights.
  const column = (title: string, side: "ally" | "enemy", list: ScoutPlayer[]) => {
    const col = side === "ally" ? 1 : 2;
    const wr = teamAvgWr(list, profiles);
    return (
      <section className={`sc-col sc-col-${side}`}>
        <h3 className="sc-col-title" style={{ gridColumn: col, gridRow: 1 }}>
          <span className="sc-col-mark" />
          {title}
          {wr !== undefined && (
            <span className="sc-col-sub">
              avg season WR <b className={wrClass(wr)}>{wr}%</b>
            </span>
          )}
        </h3>
        <div className="sc-list">
          {list.map((p, i) => (
            <PlayerCard key={p.riotId} player={p} state={profiles[p.riotId]} queue={queue} style={{ gridColumn: col, gridRow: i + 2 }} />
          ))}
        </div>
      </section>
    );
  };
  return (
    <div className="sc-panel">
      <header className="sc-bar">
        <h2 className="sc-title">
          <Icon name="user" size={15} />
          Player scouting
        </h2>
        {region && <span className="sc-chip">{region.toUpperCase()}</span>}
        <span className="sc-status">{status ?? (loading ? `Loading ${loading} of ${players.length} profiles…` : `${players.length} players`)}</span>
        <span className="sc-source">Data: OP.GG</span>
      </header>
      <div className="sc-cols">
        {column("Your team", "ally", ally)}
        {column("Enemy team", "enemy", enemy)}
      </div>
    </div>
  );
}

/** Compact one-line-per-enemy summary for small spaces. */
export function ScoutStrip({ players, profiles, queue, max = 1, style }: { players: ScoutPlayer[]; profiles: Record<string, ProfileState>; queue?: string; max?: number; style?: CSSProperties }) {
  const { enemy } = teamsOf(players);
  const streamer = useStreamer();
  return (
    <div className="sc-strip" style={style}>
      {enemy.map((p) => {
        const st = profiles[p.riotId];
        const prof = typeof st === "object" ? st : undefined;
        const s = prof ? summarizeProfile(prof, champOf(p)) : undefined;
        const tags = prof ? scoutTags(prof, champOf(p), queue, { position: p.position }).slice(0, max) : [];
        return (
          <div key={p.riotId} className="sc-row">
            <GameIcon src={p.championIcon} name={p.championName} size={24} />
            <span className="sc-row-name" title={streamer ? undefined : p.riotId}>
              {streamer ? maskedName(p) : splitId(p.riotId).name}
            </span>
            {st === "loading" || st === undefined ? (
              <span className="sc-skel-bar sc-row-skel" />
            ) : !prof ? (
              <span className="sc-dim sc-small sc-row-msg">{st === "private" ? "Profile is private" : "No OP.GG data"}</span>
            ) : (
              <>
                <RankBadge rank={prof.rank} all={prof.ranks} size="sm" />
                <span className={`sc-row-wr ${wrClass(s!.seasonWinRate)}`}>{s!.seasonWinRate !== undefined ? `${s!.seasonWinRate}%` : "—"}</span>
                <Form profile={prof} max={5} size="sm" />
                <span className="sc-row-tags">
                  {tags.map((t) => (
                    <TagChip key={t.label} tag={t} size="sm" />
                  ))}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
