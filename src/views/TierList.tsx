// Champion tier list per game mode (HexMayhem for ARAM: Mayhem, OP.GG for ARAM and Summoner's Rift).
// Pure view: the caller loads `rows` (see engine/sources/tierlists.ts) and handles picks / refresh.

import { t as tx } from "../i18n";
import { searchChampions } from "../engine/championSearch";
import { displayPatch } from "../ui/format";
import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../app/store";
import {
  POSITION_LABEL,
  TIERS,
  TIER_POSITIONS,
  compareTierRows,
  rowsForPosition,
  type ChampionTierRow,
  type Tier,
  type TierMode,
  type TierPosition,
} from "../engine/sources/tierlists";
import type { Champion, StaticData } from "../engine/types";
import { norm } from "../engine/text";
import { Card, Empty, Segmented, Spinner, friendlyError } from "../ui/controls";
import { FavStar } from "../ui/FavStar";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import { rateLabel, rateName } from "../ui/arenaText";
import "./tierlist.css";

export const TIER_MODE_LABEL: Record<TierMode, string> = { mayhem: "ARAM: Mayhem", aram: "ARAM", sr: "Summoner's Rift", arena: "Arena" };
export const TIER_SOURCE: Record<TierMode, { name: string; note: string }> = {
  mayhem: { name: "HexMayhem", note: "All ranks" },
  aram: { name: "OP.GG", note: "All ranks" },
  sr: { name: "OP.GG", note: "Emerald+" },
  arena: { name: "OP.GG", note: "All ranks · % = top-4 finishes" },
};
export const TIER_BLURB: Record<Tier, string> = { S: "Top picks", A: "Strong", B: "Solid", C: "Situational", D: "Weak" };

type SortKey = "tier" | "champion" | "win" | "pick" | "ban" | "games";
type Layout = "tiers" | "table";

export interface TierListViewProps {
  mode: TierMode;
  rows: ChampionTierRow[] | undefined;
  status: "loading" | "ok" | "error";
  /** Summoner's Rift role shown (ignored for ARAM modes). */
  position?: TierPosition;
  onPosition?: (p: TierPosition) => void;
  onPick?: (championId: string) => void;
  onRefresh?: () => void;
  error?: string;
  /** Patch the numbers are for, when known. */
  patch?: string;
  /** Champion ids to ring (e.g. your current champion). */
  highlight?: string[];
  /** Static data; defaults to the app store's. */
  data?: StaticData;
}

export const fmtPct = (x: number | undefined, digits = 1) => (x === undefined ? "–" : `${(x * 100).toFixed(digits)}%`);
const fmtGames = (n: number | undefined) =>
  n === undefined ? "–" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString("en-US")}K` : String(n);
export const wrTone = (wr: number) => (wr >= 0.515 ? "tl-up" : wr <= 0.485 ? "tl-down" : "");

interface Entry {
  row: ChampionTierRow;
  champ?: Champion;
  name: string;
}

export function TierBadge({ tier, size = "md" }: { tier: Tier; size?: "sm" | "md" | "lg" }) {
  return <span className={`tl-badge tl-badge-${size} tl-t-${tier}`}>{tier}</span>;
}

export function ChampTierTip({ e, mode }: { e: { row: ChampionTierRow; name: string }; mode: TierMode }) {
  const r = e.row;
  return (
    <div className="tt tl-tt">
      <div className="tt-head">
        <strong>{e.name}</strong>
        <TierBadge tier={r.tier} size="sm" />
      </div>
      <div className="tl-tt-grid">
        <span>{rateName(mode)}</span>
        <b className={wrTone(r.winRate)}>{fmtPct(r.winRate, 2)}</b>
        {r.pickRate !== undefined && (
          <>
            <span>{tx("Pick rate")}</span>
            <b>{fmtPct(r.pickRate)}</b>
          </>
        )}
        {r.banRate !== undefined && (
          <>
            <span>{tx("Ban rate")}</span>
            <b>{fmtPct(r.banRate)}</b>
          </>
        )}
        {r.games !== undefined && (
          <>
            <span>{tx("Games")}</span>
            <b>{r.games.toLocaleString("en-US")}</b>
          </>
        )}
        {r.rank !== undefined && (
          <>
            <span>{tx("Rank")}</span>
            <b>
              #{r.rank}
              {r.position ? ` ${POSITION_LABEL[r.position]}` : ""}
            </b>
          </>
        )}
      </div>
      <span className="tt-note tl-tt-foot">
        {TIER_MODE_LABEL[mode]} · {TIER_SOURCE[mode].name}
      </span>
    </div>
  );
}

function RoleIcon({ p }: { p: TierPosition }) {
  // Minimal lane glyphs in the spirit of the client's position icons.
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": true } as const;
  switch (p) {
    case "top":
      return (
        <svg {...common}>
          <path d="M2 2h10l-3 3H5v4l-3 3z" />
          <path d="M7 7h2v2H7z" opacity=".55" />
          <path d="M14 4v10H4l3-3h4V7z" opacity=".3" />
        </svg>
      );
    case "jungle":
      return (
        <svg {...common}>
          <path d="M8 1c-.5 3-2.5 4.5-2.5 7.5 0 1.6.8 3 1.6 3.8L5 15h6l-2.1-2.7c.8-.8 1.6-2.2 1.6-3.8C10.5 5.5 8.5 4 8 1z" />
        </svg>
      );
    case "mid":
      return (
        <svg {...common}>
          <path d="M11 2h3v3L5 14H2v-3z" />
          <path d="M2 2h5L2 7zM14 14H9l5-5z" opacity=".3" />
        </svg>
      );
    case "adc":
      return (
        <svg {...common}>
          <path d="M14 14H4l3-3h4V7l3-3z" />
          <path d="M7 7h2v2H7z" opacity=".55" />
          <path d="M2 12V2h10L9 5H5v4z" opacity=".3" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <path d="M6 2h4l1 2-3 3-3-3zM1 5h4.5L7 7l-1.5 2.5L4 8 1 7zM15 5h-4.5L9 7l1.5 2.5L12 8l3-1zM7 8.5h2l1 6.5H6z" />
        </svg>
      );
  }
}

export function TierListView({ mode, rows, status, position, onPosition, onPick, onRefresh, error, patch, highlight = [], data: dataProp }: TierListViewProps) {
  const storeData = useApp((s) => s.data);
  const data = dataProp ?? storeData;
  const [layout, setLayout] = useState<Layout>("tiers");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "tier", desc: false });
  const isSr = mode === "sr";
  const pos: TierPosition = position ?? "mid";

  const entries = useMemo<Entry[]>(() => {
    const list = isSr ? rowsForPosition(rows ?? [], pos) : (rows ?? []);
    return list.map((row) => {
      const champ = data?.championsById.get(row.championKey);
      return { row, champ, name: champ?.name ?? row.championKey };
    });
  }, [rows, isSr, pos, data]);

  const filtered = useMemo(() => {
    const n = norm(q);
    if (!n) return entries;
    const hit = new Set(searchChampions(q, entries.map((e) => ({ id: e.row.championKey, name: e.name })), entries.length).map((c) => c.id));
    return entries.filter((e) => hit.has(e.row.championKey));
  }, [entries, q]);

  const sorted = useMemo(() => {
    const dir = sort.desc ? -1 : 1;
    const val = (e: Entry): number | string | undefined =>
      sort.key === "champion" ? e.name : sort.key === "win" ? e.row.winRate : sort.key === "pick" ? e.row.pickRate : sort.key === "ban" ? e.row.banRate : e.row.games;
    return [...filtered].sort((a, b) => {
      if (sort.key === "tier") return dir * compareTierRows(a.row, b.row);
      const va = val(a);
      const vb = val(b);
      if (va === undefined || vb === undefined) return va === vb ? compareTierRows(a.row, b.row) : va === undefined ? 1 : -1;
      if (typeof va === "string" || typeof vb === "string") return dir * String(va).localeCompare(String(vb));
      return dir * (va - vb) || compareTierRows(a.row, b.row);
    });
  }, [filtered, sort]);

  const has = useMemo(
    () => ({ pick: entries.some((e) => e.row.pickRate !== undefined), ban: entries.some((e) => e.row.banRate !== undefined), games: entries.some((e) => e.row.games !== undefined) }),
    [entries],
  );

  const roleCounts = useMemo(() => {
    const c: Partial<Record<TierPosition, number>> = {};
    for (const r of rows ?? []) if (r.position) c[r.position] = (c[r.position] ?? 0) + 1;
    return c;
  }, [rows]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "tier" && key !== "champion" }));

  const pick = (id: string) => onPick?.(id);
  const src = TIER_SOURCE[mode];

  let body: ReactNode;
  if (status === "loading" && !rows?.length) {
    body = <TierSkeleton />;
  } else if (status === "error" && !rows?.length) {
    body = (
      <Empty
        icon="warning"
        tone="error"
        title="Couldn't load the tier list"
        action={
          onRefresh && (
            <button type="button" className="btn btn-sm" onClick={onRefresh}>
              <Icon name="refresh" size={13} />
              Try again
            </button>
          )
        }
      >
        {error ? friendlyError(error) : `${src.name} didn't answer or changed its page.`}
      </Empty>
    );
  } else if (!entries.length) {
    body = <Empty icon="info" title="No tier data yet">{isSr ? `Nothing for ${POSITION_LABEL[pos]} on this page.` : "The source page had no champion rows."}</Empty>;
  } else if (!filtered.length) {
    body = (
      <Empty
        icon="search"
        title={`No champion matches “${q}”`}
        action={
          <button type="button" className="btn btn-sm" onClick={() => setQ("")}>
            Clear search
          </button>
        }
      >
        Check the spelling, or search by part of the name.
      </Empty>
    );
  } else if (layout === "tiers") {
    body = (
      <div className="tl-tiers">
        {TIERS.map((t) => {
          const list = sorted.filter((e) => e.row.tier === t).sort((a, b) => compareTierRows(a.row, b.row));
          if (!list.length) return null;
          return (
            <div key={t} className={`tl-row tl-row-${t}`}>
              <div className={`tl-label tl-t-${t}`}>
                <span className="tl-label-letter">{t}</span>
                <span className="tl-label-count">{list.length}</span>
              </div>
              <div className="tl-chips">
                {list.map((e) => (
                  <Tip key={`${e.row.championKey}-${e.row.position ?? ""}`} content={<ChampTierTip e={e} mode={mode} />} className="tl-chip-wrap">
                    <button
                      type="button"
                      className={`tl-champ ${highlight.includes(e.row.championKey) ? "tl-hl" : ""}`}
                      onClick={() => pick(e.row.championKey)}
                      aria-label={`${e.name}, tier ${t}, ${fmtPct(e.row.winRate)} ${rateName(mode).toLowerCase()}`}
                    >
                      <GameIcon src={e.champ?.icon} name={e.name} size={42} />
                      <span className={`tl-champ-wr ${wrTone(e.row.winRate)}`}>{fmtPct(e.row.winRate)}</span>
                    </button>
                    <FavStar id={e.row.championKey} name={e.name} size={11} className="tl-fav" />
                  </Tip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    const th = (key: SortKey, label: string, cls = "") => (
      <th className={`${cls} ${sort.key === key ? "tl-sorted" : ""}`} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button type="button" onClick={() => toggleSort(key)}>
          {label}
          <span className={`tl-caret ${sort.key === key ? (sort.desc ? "down" : "up") : ""}`} />
        </button>
      </th>
    );
    const maxPick = Math.max(0.0001, ...sorted.map((e) => e.row.pickRate ?? 0));
    body = (
      <div className="tl-table-wrap">
        <table className="tl-table">
          <thead>
            <tr>
              <th className="tl-c-rank">#</th>
              {th("tier", "Tier", "tl-c-tier")}
              {th("champion", "Champion", "tl-c-champ")}
              {th("win", rateLabel(mode), "tl-c-num")}
              {has.pick && th("pick", "Pick", "tl-c-num tl-c-pick")}
              {has.ban && th("ban", "Ban", "tl-c-num")}
              {has.games && th("games", "Games", "tl-c-num")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => (
              <tr
                key={`${e.row.championKey}-${e.row.position ?? ""}`}
                className={highlight.includes(e.row.championKey) ? "tl-hl" : ""}
                onClick={() => pick(e.row.championKey)}
                tabIndex={0}
                onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && pick(e.row.championKey)}
              >
                <td className="tl-c-rank">{i + 1}</td>
                <td className="tl-c-tier">
                  <TierBadge tier={e.row.tier} size="sm" />
                </td>
                <td className="tl-c-champ">
                  <span className="tl-cell-champ">
                    <GameIcon src={e.champ?.icon} name={e.name} size={28} />
                    <span className="tl-cell-name">{e.name}</span>
                    <FavStar id={e.row.championKey} name={e.name} size={13} className="tl-row-fav" />
                  </span>
                </td>
                <td className={`tl-c-num tl-wr ${wrTone(e.row.winRate)}`}>{fmtPct(e.row.winRate, 2)}</td>
                {has.pick && (
                  <td className="tl-c-num tl-c-pick">
                    <span className="tl-pick">
                      <span className="tl-pick-bar">
                        <span style={{ width: `${Math.round(((e.row.pickRate ?? 0) / maxPick) * 100)}%` }} />
                      </span>
                      <span className="tl-pick-n">{fmtPct(e.row.pickRate)}</span>
                    </span>
                  </td>
                )}
                {has.ban && <td className="tl-c-num">{fmtPct(e.row.banRate)}</td>}
                {has.games && <td className="tl-c-num">{fmtGames(e.row.games)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="view tl-view">
      <Card
        title="Champion tiers"
        icon="spark"
        className="tl-card"
        extra={
          <div className="tl-tools">
            <label className="search search-sm tl-search">
              <Icon name="search" size={14} />
              <input value={q} placeholder="Search champions…" onChange={(e) => setQ(e.target.value)} aria-label="Search champions" />
              {q && (
                <button type="button" className="tl-clear" onClick={() => setQ("")} aria-label="Clear search">
                  <Icon name="close" size={12} />
                </button>
              )}
            </label>
            <Segmented<Layout>
              size="sm"
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: "tiers", label: "Tiers", hint: "Grouped by tier" },
                { value: "table", label: "Table", hint: "Sortable table" },
              ]}
            />
            {onRefresh && (
              <button type="button" className="btn btn-sm btn-ghost tl-refresh" onClick={onRefresh} disabled={status === "loading"} title="Refresh from source">
                {status === "loading" ? <Spinner size={13} /> : <RefreshGlyph />}
              </button>
            )}
          </div>
        }
      >
        <div className="tl-sub">
          <span className="tl-mode">{TIER_MODE_LABEL[mode]}</span>
          {!!rows?.length && (
            <>
              <span className="tl-dot" />
              <span>
                {entries.length} champions{isSr ? ` in ${POSITION_LABEL[pos]}` : ""}
              </span>
            </>
          )}
          <span className="tl-dot" />
          <span>
            {src.name} · {src.note}
            {patch ? ` · Patch ${displayPatch(patch)}` : ""}
          </span>
          {status === "error" && !!rows?.length && <span className="tl-stale">{tx("Showing cached data")}</span>}
        </div>
        {isSr && (
          <div className="tl-roles" role="tablist" aria-label="Role">
            {TIER_POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={p === pos}
                className={`tl-role ${p === pos ? "active" : ""}`}
                onClick={() => onPosition?.(p)}
              >
                <RoleIcon p={p} />
                {POSITION_LABEL[p]}
                {roleCounts[p] !== undefined && <span className="tl-role-n">{roleCounts[p]}</span>}
              </button>
            ))}
          </div>
        )}
        {body}
      </Card>
    </div>
  );
}

function RefreshGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function TierSkeleton() {
  return (
    <div className="tl-tiers tl-skel" aria-busy="true" aria-label="Loading tier list">
      {TIERS.slice(0, 4).map((t, i) => (
        <div key={t} className="tl-row">
          <div className={`tl-label tl-t-${t}`}>
            <span className="tl-label-letter">{t}</span>
          </div>
          <div className="tl-chips">
            {Array.from({ length: [9, 14, 16, 10][i] }, (_, k) => (
              <span key={k} className="tl-skel-icon" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
