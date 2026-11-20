// Champ select pick helper: how good is your champion in this mode, and is there something better
// you can still get — the ARAM bench / a teammate trade, or (Summoner's Rift) a stronger pick in your role.

import { useMemo, useState } from "react";
import { useApp } from "../app/store";
import { POSITION_LABEL, compareTierRows, findTierRow, rowsForPosition, type ChampionTierRow, type TierMode } from "../engine/sources/tierlists";
import { opggPosition } from "../engine/sources/opgg";
import { pickImpact } from "../engine/comp";
import type { Champion, ChampionStats, StaticData } from "../engine/types";
import { ArenaPlacement, rateName } from "../ui/arenaText";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import { ChampTierTip, TIER_MODE_LABEL, TIER_SOURCE, TierBadge, fmtPct, wrTone } from "./TierList";
import "./tierlist.css";
import { TeamCompSection } from "./TeamComp";
import "./champselect-helper.css";

export interface ChampSelectHelperProps {
  mode: TierMode;
  me?: Champion;
  /** Your team's picks (may include you). */
  team: Champion[];
  /** ARAM bench. */
  bench: Champion[];
  /** Tier list rows for `mode` (all roles on Summoner's Rift); undefined while loading. */
  rows: ChampionTierRow[] | undefined;
  /** Assigned role from champ select (top/jungle/middle/bottom/utility or OP.GG names). */
  myPosition?: string;
  /** Click on a champion (e.g. open its build). */
  onPick?: (championId: string) => void;
  data?: StaticData;
  /** Your champion's detailed stats for this mode (Arena: avg place / 1st-place rate under your pick). */
  meStats?: ChampionStats;
}

type Source = "you" | "bench" | "team" | "pool";
interface Option {
  champ?: Champion;
  id: string;
  name: string;
  source: Source;
  row?: ChampionTierRow;
  /** Win-rate difference vs your current pick (fraction), when both are known. */
  delta?: number;
}

/** Below this the difference is noise. */
const EVEN = 0.004;
const BIG = 0.01;

const signed = (d: number) => `${d >= 0 ? "+" : "−"}${(Math.abs(d) * 100).toFixed(1)}%`;

function verdict(o: Option, arena = false): { text: string; tone: "up" | "even" | "down" | "none" } {
  if (o.source === "you") return { text: "Your pick", tone: "none" };
  if (o.delta === undefined) return { text: o.row ? "—" : "No data", tone: "none" };
  if (arena && o.source === "team") return { text: o.delta !== undefined && o.delta >= BIG ? "Stronger duo pick" : "Duo pick", tone: "none" };
  if (o.delta >= BIG) return { text: o.source === "team" ? "Ask to trade" : o.source === "bench" ? "Swap if you can" : "Stronger pick", tone: "up" };
  if (o.delta >= EVEN) return { text: "Slight upgrade", tone: "up" };
  if (o.delta > -EVEN) return { text: "About even", tone: "even" };
  return { text: "Keep yours", tone: "down" };
}

export function ChampSelectHelper({ mode, me, team, bench, rows, myPosition, onPick, data: dataProp, meStats }: ChampSelectHelperProps) {
  const storeData = useApp((s) => s.data);
  const data = dataProp ?? storeData;
  const isSr = mode === "sr";
  const pos = isSr ? opggPosition(myPosition) : undefined;
  const loading = rows === undefined;

  const mine = useMemo(() => findTierRow(rows, me?.id, pos), [rows, me, pos]);
  const offRole = isSr && !!pos && !!mine && mine.position !== pos;

  const options = useMemo<Option[]>(() => {
    const mk = (champ: Champion | undefined, id: string, source: Source, row = findTierRow(rows, id, pos)): Option => ({
      champ,
      id,
      name: champ?.name ?? id,
      source,
      row,
      delta: row && mine && source !== "you" ? row.winRate - mine.winRate : undefined,
    });
    const byWr = (a: Option, b: Option) =>
      (b.row ? 1 : 0) - (a.row ? 1 : 0) || (b.row && a.row ? b.row.winRate - a.row.winRate || compareTierRows(a.row, b.row) : a.name.localeCompare(b.name));

    if (isSr) {
      const taken = new Set([...team.map((c) => c.id), me?.id]);
      const pool = rowsForPosition(rows ?? [], pos)
        .filter((r) => !taken.has(r.championKey))
        .sort(compareTierRows)
        .slice(0, 5);
      return pool.map((r) => mk(data?.championsById.get(r.championKey), r.championKey, "pool", r));
    }
    const list: Option[] = [];
    const seen = new Set<string>();
    const add = (c: Champion, s: Source) => {
      if (seen.has(c.id)) return;
      seen.add(c.id);
      list.push(mk(c, c.id, s));
    };
    if (me) add(me, "you");
    bench.forEach((c) => add(c, "bench"));
    team.forEach((c) => add(c, "team"));
    return list.sort(byWr);
  }, [isSr, rows, pos, team, bench, me, mine, data]);

  const best = useMemo(() => {
    const cands = options.filter((o) => o.source !== "you" && o.row);
    // Bench champions are free to take; trades need a teammate to agree, so they win only when clearly better.
    const score = (o: Option) => (o.row?.winRate ?? 0) - (o.source === "team" ? 0.003 : 0);
    return cands.sort((a, b) => score(b) - score(a))[0];
  }, [options]);
  const upgrade = best && (best.delta === undefined ? isSr : best.delta >= EVEN) ? best : undefined;

  // Team comp: what each bench / pool option would add if it took your slot (an extra note only —
  // the list stays ranked by win rate). Teammate trades keep the same five champions.
  const compNotes = useMemo(() => {
    const out = new Map<string, { text: string; down: boolean }>();
    if (!team.length && !me) return out;
    for (const o of options) {
      if (!o.champ || (o.source !== "bench" && o.source !== "pool")) continue;
      const imp = pickImpact(team, me, o.champ, mode);
      if (imp.summary) out.set(o.id, { text: imp.summary, down: !imp.deltas.some((d) => d.delta > 0) && !imp.fixes.length });
    }
    return out;
  }, [options, team, me, mode]);
  const [hoverId, setHoverId] = useState<string>();
  const hovered = options.find((o) => o.id === hoverId && o.champ && (o.source === "bench" || o.source === "pool"));
  const fallback = upgrade?.champ && upgrade.source !== "team" ? upgrade : undefined;
  const candidate = (hovered ?? fallback)?.champ;

  const src = TIER_SOURCE[mode];
  const posLabel = pos ? POSITION_LABEL[pos] : undefined;

  return (
    <section className={`csh ${isSr ? "csh-sr" : "csh-aram"}`} aria-label="Pick helper">
      <header className="csh-head">
        <span className="csh-title">
          <Icon name="spark" size={15} />
          Pick helper
        </span>
        <span className="csh-meta">
          {TIER_MODE_LABEL[mode]}
          {posLabel ? ` · ${posLabel}` : ""} · {src.name}
        </span>
      </header>

      <div className="csh-body">
        {/* ------------------------------------------------ your pick */}
        <div className="csh-mine">
          <div className="eyebrow">Your pick</div>
          {me ? (
            <div className="csh-me">
              <button type="button" className="csh-me-icon" onClick={() => onPick?.(me.id)} aria-label={`Open ${me.name}`}>
                <GameIcon src={me.icon} name={me.name} size={56} />
                {mine && <TierBadge tier={mine.tier} size="md" />}
              </button>
              <div className="csh-me-text">
                <span className="csh-me-name">{me.name}</span>
                {loading ? (
                  <span className="csh-me-stat dim">Loading tier data…</span>
                ) : mine ? (
                  <>
                    <span className="csh-me-stat">
                      <b className={wrTone(mine.winRate)}>{fmtPct(mine.winRate)}</b> {mode === "arena" ? "top 4" : "win"}
                      {mine.pickRate !== undefined && <span className="dim"> · {fmtPct(mine.pickRate)} pick</span>}
                    </span>
                    {mode === "arena" && meStats && meStats.mode === "arena" && <ArenaPlacement stats={meStats} showTop4={false} className="csh-me-arena small" />}
                    <span className="csh-me-rank dim">
                      {mine.rank !== undefined ? `#${mine.rank}` : ""}
                      {mine.position ? ` ${POSITION_LABEL[mine.position]}` : ""}
                      {mine.rank !== undefined || mine.position ? " · " : ""}Tier {mine.tier}
                    </span>
                  </>
                ) : (
                  <span className="csh-me-stat dim">No {TIER_MODE_LABEL[mode]} data{posLabel ? ` in ${posLabel}` : ""}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="csh-me csh-me-empty">
              <span className="csh-ph" />
              <span className="dim small">{isSr ? "Hover or lock a champion to compare." : "Waiting for your champion…"}</span>
            </div>
          )}
          {offRole && mine?.position && (
            <div className="csh-note csh-note-warn">
              <Icon name="warning" size={13} />
              {me?.name} is rarely played {posLabel}; showing {POSITION_LABEL[mine.position]} stats.
            </div>
          )}
          <Recommendation upgrade={upgrade} me={me} mine={mine} isSr={isSr} loading={loading} hasOptions={options.some((o) => o.source !== "you")} rate={rateName(mode).toLowerCase()} />
        </div>

        {/* ------------------------------------------------ options */}
        <div className="csh-options">
          <div className="eyebrow csh-opt-head">
            <span>{isSr ? `Best ${posLabel ?? ""} picks available`.replace("  ", " ") : mode === "arena" ? "Your duo" : "Bench & teammates"}</span>
            {!isSr && <span className="csh-legend">Ranked by {rateName(mode).toLowerCase()}</span>}
          </div>
          {loading ? (
            <div className="csh-list">
              {Array.from({ length: isSr ? 5 : 4 }, (_, i) => (
                <div key={i} className="csh-opt csh-opt-skel">
                  <span className="csh-ph csh-ph-sm" />
                  <span className="csh-ph-line" />
                </div>
              ))}
            </div>
          ) : !options.length ? (
            <div className="csh-none dim small">
              {isSr ? "No tier data for this role yet." : mode === "arena" ? "Your duo partner's pick shows up here." : "No bench champions yet — rerolls and bench picks show up here."}
            </div>
          ) : (
            <div className="csh-list" onMouseLeave={() => setHoverId(undefined)}>
              {options.map((o) => {
                const v = verdict(o, mode === "arena");
                const isBest = !!upgrade && o.id === upgrade.id;
                return (
                  <button
                    type="button"
                    key={`${o.source}-${o.id}`}
                    className={`csh-opt csh-src-${o.source} ${isBest ? "csh-best" : ""}`}
                    onClick={() => onPick?.(o.id)}
                    onMouseEnter={() => setHoverId(o.id)}
                    onFocus={() => setHoverId(o.id)}
                    onBlur={() => setHoverId(undefined)}
                  >
                    <GameIcon src={o.champ?.icon} name={o.name} size={34} />
                    <span className="csh-opt-name">
                      <span className="csh-opt-title">{o.name}</span>
                      <span className="csh-opt-src">
                        {o.source === "you" ? "You" : o.source === "bench" ? "Bench" : o.source === "team" ? "Teammate" : o.row?.rank !== undefined ? `#${o.row.rank} ${posLabel ?? ""}` : "Available"}
                        {isBest && <span className="csh-best-tag">Best available</span>}
                      </span>
                    </span>
                    {o.row ? (
                      <Tip content={<ChampTierTip e={{ row: o.row, name: o.name }} mode={mode} />}>
                        <span className="csh-opt-tier">
                          <TierBadge tier={o.row.tier} size="sm" />
                          <span className={`csh-opt-wr ${wrTone(o.row.winRate)}`}>{fmtPct(o.row.winRate)}</span>
                        </span>
                      </Tip>
                    ) : (
                      <span className="csh-opt-tier dim small">No data</span>
                    )}
                    <span className={`csh-delta csh-tone-${o.delta === undefined ? "none" : v.tone}`}>{o.delta !== undefined ? signed(o.delta) : ""}</span>
                    <span className={`csh-verdict csh-tone-${v.tone}`}>{v.text}</span>
                    {compNotes.get(o.id) && (
                      <span className={`csh-opt-comp ${compNotes.get(o.id)!.down ? "csh-opt-comp-down" : ""}`} title="What this pick changes in your team comp (win-rate ranking unchanged)">
                        <span className="csh-opt-comp-k">Comp</span>
                        {compNotes.get(o.id)!.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TeamCompSection
        mode={mode}
        team={team}
        me={me}
        candidate={candidate}
        hovered={!!hovered}
        hint={compNotes.size ? `Hover a ${isSr ? "pick" : "bench champion"} to preview how it changes your comp.` : undefined}
      />
    </section>
  );
}

function Recommendation({
  upgrade,
  me,
  mine,
  isSr,
  loading,
  hasOptions,
  rate,
}: {
  upgrade?: Option;
  me?: Champion;
  mine?: ChampionTierRow;
  isSr: boolean;
  loading: boolean;
  hasOptions: boolean;
  /** "win rate" ("top-4 rate" in Arena). */
  rate: string;
}) {
  if (loading || !me || !mine) return null;
  if (upgrade && upgrade.delta !== undefined) {
    const how = upgrade.source === "team" ? `Ask ${upgrade.name}'s player to trade` : upgrade.source === "bench" ? `Grab ${upgrade.name} from the bench` : `Consider ${upgrade.name}`;
    return (
      <div className="csh-rec csh-rec-up">
        <span className="csh-rec-icon">
          <Icon name="swap" size={14} />
        </span>
        <span>
          <b>
            {signed(upgrade.delta)} {rate}.
          </b>{" "}
          {how}
          {isSr ? "" : " if you can"}.
        </span>
      </div>
    );
  }
  if (!hasOptions) return null;
  return (
    <div className="csh-rec csh-rec-keep">
      <span className="csh-rec-icon">
        <Icon name="check" size={14} strokeWidth={2.6} />
      </span>
      <span>
        <b>Keep {me.name}.</b> {isSr ? "It's among the strongest picks for this role." : "Nothing available is clearly better."}
      </span>
    </div>
  );
}
