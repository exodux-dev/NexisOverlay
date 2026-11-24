// Home: the landing page when no game / champ select is running. Patch, mode and client status,
// a champion search that opens the build, favorites, recent champions, your recent form,
// this patch's top picks and quick actions.

import { searchChampions } from "../engine/championSearch";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { MODE_LABEL, actions, useApp, type Derived, type GameModeKind } from "../app/store";
import { isTauri, setHudEdit } from "../bridge";
import { formSummary, recentChampions, topPicks } from "../engine/home";
import { computeMovers, previousSnapshot, tierChange, type Mover, type TierSnapshot } from "../engine/movers";
import { useTierHistory } from "../app/tierHistory";
import { historyForMode } from "../engine/mode";
import { opggPosition } from "../engine/sources/opgg";
import { POSITION_LABEL, findTierRow, type ChampionTierRow, type TierPosition } from "../engine/sources/tierlists";
import { findChampion } from "../engine/staticData";
import { norm } from "../engine/text";
import type { Champion, StaticData } from "../engine/types";
import { ChampionPicker } from "../ui/ChampionPicker";
import { Card, Empty, Kbd, Segmented, Skeleton } from "../ui/controls";
import { FavStar } from "../ui/FavStar";
import { ARCHETYPE_LABEL, displayPatch, relativeDate, winRate } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { Icon, type IconName } from "../ui/icons";
import { useLeagueClientConnected } from "../ui/ImportToLeague";
import { rateLabel } from "../ui/arenaText";
import { toast } from "../ui/Toasts";
import { TierBadge, fmtPct, wrTone } from "./TierList";
import "./home.css";

const SPLASH = "https://ddragon.leagueoflegends.com/cdn/img/champion/centered";

/** Open a champion's build (explore mode). */
export function openBuild(id: string) {
  actions.setDemo(false);
  actions.setExploreChampion(id);
  actions.setTab("build");
}

const MODE_OPTIONS: Array<{ value: "auto" | GameModeKind; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "Follow the queue you're in" },
  { value: "mayhem", label: "Mayhem", hint: "ARAM: Mayhem" },
  { value: "aram", label: "ARAM", hint: "ARAM" },
  { value: "sr", label: "Rift", hint: "Summoner's Rift (Normal / Ranked)" },
  { value: "arena", label: "Arena", hint: "Arena (2v2v2v2)" },
];

const PHASE_LABEL: Record<string, string> = {
  Lobby: "In lobby",
  Matchmaking: "In queue",
  ReadyCheck: "Match found",
  ChampSelect: "Champ select",
  InProgress: "In game",
  GameStart: "Loading",
  WaitingForStats: "Post-game",
  PreEndOfGame: "Post-game",
  EndOfGame: "Post-game",
  None: "Home screen",
};

/** "16.23.1" → "16.23" */
const shortPatch = (v: string | undefined) => displayPatch(v);

// ------------------------------------------------------------------ hero

function ClientStatus() {
  const connected = useLeagueClientConnected();
  const phase = useApp((s) => s.clientInfo?.phase);
  const label = connected ? (phase && PHASE_LABEL[phase]) || "Connected" : "Not running";
  return (
    <span
      className={`home-status ${connected ? "is-on" : ""}`}
      title={connected ? "The League client is running — Nexis follows your queue and champ select." : "Start League and Nexis connects automatically."}
    >
      <span className="home-status-dot" />
      <span className="home-status-k">League client</span>
      <span className="home-status-v">{label}</span>
    </span>
  );
}

function ChampionSearch({ data }: { data: StaticData }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    // Name guesses first ("yas", "tahm", "mf", typos); a class ("mage", "tank") as a fallback.
    const byName = searchChampions(q, data.champions, 6);
    if (byName.length) return byName;
    return data.champions.filter((c) => norm(ARCHETYPE_LABEL[c.archetype]).includes(n)).slice(0, 6);
  }, [q, data]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);
  // "/" focuses the search (Ctrl+K stays the global command palette).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (c: Champion | undefined) => c && openBuild(c.id);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setSel((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[sel]);
    } else if (e.key === "Escape" && q) {
      e.stopPropagation();
      setQ("");
    }
  };
  const showList = open && q.trim().length > 0;
  return (
    <div className={`home-search ${showList ? "is-open" : ""}`} ref={box}>
      <label className="home-search-field">
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search a champion to open its build…"
          aria-label="Search champions"
          aria-expanded={showList}
          aria-controls="home-search-list"
          role="combobox"
          spellCheck={false}
        />
        <span className="home-search-keys">
          <Kbd>/</Kbd>
        </span>
      </label>
      {showList && (
        <div className="home-search-list" id="home-search-list" role="listbox">
          {results.length === 0 && <div className="home-search-empty">No champion matches “{q}”.</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={`home-search-item ${i === sel ? "is-sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(c)}
            >
              <GameIcon src={c.icon} name={c.name} size={30} />
              <span className="home-search-name">{c.name}</span>
              <span className="home-search-arch">{ARCHETYPE_LABEL[c.archetype]}</span>
              <span className="home-search-go">
                Build <Icon name="chevron" size={13} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Hero({ d, data, patch, featured, recent }: { d: Derived; data: StaticData; patch?: string; featured?: Champion; recent: Champion[] }) {
  const pref = useApp((s) => s.settings.mode);
  const [splashOk, setSplashOk] = useState(true);
  useEffect(() => setSplashOk(true), [featured?.id]);
  const how = pref !== "auto" ? "Set manually" : d.gameModeDetected ? "Detected from your queue" : "Your last queue";
  return (
    <section className="home-hero">
      <div className="home-hero-art" aria-hidden="true">
        {featured && splashOk && (
          <img key={featured.id} className="home-hero-splash" src={`${SPLASH}/${featured.id}_0.jpg`} alt="" draggable={false} onError={() => setSplashOk(false)} />
        )}
        <div className="home-hero-shade" />
      </div>
      <div className="home-hero-body">
        <div className="home-hero-top">
          <div className="home-hero-meta">
            <span className="home-patch">
              <span className="home-patch-k">Patch</span>
              <span className="home-patch-v">{patch ?? "—"}</span>
            </span>
            <ClientStatus />
          </div>
        </div>
        <div className="home-mode">
          <div className="home-mode-text">
            <span className="home-mode-how">{how}</span>
            <h1 className="home-mode-name">{MODE_LABEL[d.gameMode]}</h1>
          </div>
          <Segmented size="sm" label="Game mode" options={MODE_OPTIONS} value={pref} onChange={(m) => void actions.setMode(m)} />
        </div>
        <ChampionSearch data={data} />
        {recent.length > 0 && (
          <div className="home-recent" aria-label="Recent champions">
            <span className="home-recent-k">Jump back in</span>
            <div className="home-recent-chips">
              {recent.map((c) => (
                <button key={c.id} type="button" className="home-chip" onClick={() => openBuild(c.id)} title={`Open ${c.name}'s build`}>
                  <GameIcon src={c.icon} name={c.name} size={22} round />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ favorites

function TierLine({ row, mode, loading }: { row?: ChampionTierRow; mode: GameModeKind; loading: boolean }) {
  if (row)
    return (
      <span className="home-tierline">
        <TierBadge tier={row.tier} size="sm" />
        <span className={`home-wr ${wrTone(row.winRate)}`}>{fmtPct(row.winRate)}</span>
        <span className="home-wr-k">{rateLabel(mode, "WR")}</span>
      </span>
    );
  if (loading) return <Skeleton w={64} h={14} />;
  return <span className="home-tierline dim">No data</span>;
}

/** "▲ A→S" on a favorite whose tier changed since the previous patch. */
function TierMoveBadge({ m, since }: { m: Mover; since: string }) {
  const up = m.tierDelta > 0;
  return (
    <span className={`home-move-badge ${up ? "is-up" : "is-down"}`} title={`${up ? "Up" : "Down"} from ${m.oldTier} to ${m.newTier} tier since patch ${since}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span> {m.oldTier}→{m.newTier}
    </span>
  );
}

function Favorites({
  data,
  mode,
  rows,
  loading,
  position,
  prev,
}: {
  data: StaticData;
  mode: GameModeKind;
  rows?: ChampionTierRow[];
  loading: boolean;
  position?: string;
  prev?: TierSnapshot;
}) {
  const favs = useApp((s) => s.settings.favorites ?? []);
  const [adding, setAdding] = useState(false);
  const champs = favs.map((id) => findChampion(data, id)).filter((c): c is Champion => !!c);
  return (
    <Card
      title="Favorites"
      icon="star"
      className="home-card home-favs"
      extra={
        <button type="button" className="home-link" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add
        </button>
      }
    >
      {champs.length === 0 ? (
        <div className="home-empty">
          <span className="home-empty-ico">
            <Icon name="star" size={18} />
          </span>
          <div>
            <div className="home-empty-title">Star the champions you play</div>
            <div className="home-empty-body">
              Tap <Icon name="star" size={12} className="home-inline-ico" /> on a build or in the tier list. They'll show up here with their tier and win rate for the current mode.
            </div>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            Add favorite
          </button>
        </div>
      ) : (
        <div className="home-fav-grid">
          {champs.map((c) => {
            const row = findTierRow(rows, c.id, position);
            const move = tierChange(prev, row);
            return (
              <div key={c.id} className="home-fav">
                <button type="button" className="home-fav-main" onClick={() => openBuild(c.id)} title={`Open ${c.name}'s build`}>
                  <span className="home-fav-ico">
                    <GameIcon src={c.icon} name={c.name} size={44} />
                    {move && prev && <TierMoveBadge m={move} since={prev.patch} />}
                  </span>
                  <span className="home-fav-text">
                    <span className="home-fav-name">{c.name}</span>
                    <TierLine row={row} mode={mode} loading={loading} />
                  </span>
                </button>
                <FavStar id={c.id} name={c.name} size={14} className="home-fav-star" />
              </div>
            );
          })}
        </div>
      )}
      {adding && (
        <ChampionPicker
          title="Add a favorite"
          champions={data.champions}
          exclude={favs}
          onClose={() => setAdding(false)}
          onPick={(c) => {
            void actions.toggleFavorite(c.id);
            setAdding(false);
          }}
        />
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ recent form

function FormCard({ data, mode }: { data: StaticData; mode: GameModeKind }) {
  const history = useApp((s) => s.history);
  const hotkey = useApp((s) => s.settings.hotkeyToggle);
  const modeGames = useMemo(() => historyForMode(history, mode), [history, mode]);
  const scoped = modeGames.length > 0;
  const f = useMemo(() => formSummary(scoped ? modeGames : history, 10), [scoped, modeGames, history]);
  const champ = (id: string) => findChampion(data, id);
  const link = (
    <button type="button" className="home-link" onClick={() => actions.setTab("history")}>
      History <Icon name="chevron" size={13} />
    </button>
  );

  if (!f.games)
    return (
      <Card title="Your recent form" icon="history" className="home-card home-form" extra={link}>
        <div className="home-onboard">
          <p className="home-onboard-lead">Play a game with Nexis running and your results, KDA and most played champions appear here.</p>
          <ul className="home-tips">
            <li>
              <span className="home-tip-ico">
                <Icon name="keyboard" size={14} />
              </span>
              <span>
                Show / hide the overlay with <Kbd>{hotkey}</Kbd> — <Kbd>Esc</Kbd> hides it too.
              </span>
            </li>
            <li>
              <span className="home-tip-ico">
                <Icon name="window" size={14} />
              </span>
              <span>
                Set League to <b>Borderless</b> (Settings → Video → Window Mode). Fullscreen can't show overlays.
              </span>
            </li>
            <li>
              <span className="home-tip-ico">
                <Icon name="search" size={14} />
              </span>
              <span>
                <Kbd>Ctrl+K</Kbd> jumps to any champion, tab or setting.
              </span>
            </li>
          </ul>
        </div>
      </Card>
    );

  const mp = f.mostPlayed && champ(f.mostPlayed.champion);
  const wr = f.winRate ?? 0;
  return (
    <Card title="Your recent form" icon="history" className="home-card home-form" extra={link}>
      <div className="home-form-top">
        <div className="home-form-wr" style={{ "--wr": String(wr) } as CSSProperties}>
          <svg viewBox="0 0 36 36" className="home-ring" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" className="home-ring-track" />
            <circle cx="18" cy="18" r="15.5" className="home-ring-fill" pathLength={100} strokeDasharray={`${wr * 100} 100`} />
          </svg>
          <span className="home-ring-text">
            <span className={`home-ring-pct ${wrTone(wr)}`}>{winRate(wr)}</span>
            <span className="home-ring-k">{rateLabel(mode, "Win rate")}</span>
          </span>
        </div>
        <div className="home-form-stats">
          <div className="home-stat">
            <span className="home-stat-k">Record</span>
            <span className="home-stat-v">
              <span className="tone-win">{f.wins}W</span> <span className="tone-loss">{f.losses}L</span>
            </span>
          </div>
          <div className="home-stat">
            <span className="home-stat-k">KDA</span>
            <span className="home-stat-v">{f.kda!.toFixed(2)}</span>
            <span className="home-stat-sub">
              {f.avg.kills.toFixed(1)} / {f.avg.deaths.toFixed(1)} / {f.avg.assists.toFixed(1)}
            </span>
          </div>
          {mp && f.mostPlayed && (
            <button type="button" className="home-stat home-stat-btn" onClick={() => openBuild(mp.id)} title={`Open ${mp.name}'s build`}>
              <span className="home-stat-k">Most played</span>
              <span className="home-stat-champ">
                <GameIcon src={mp.icon} name={mp.name} size={22} round />
                <span className="home-stat-v">{mp.name}</span>
              </span>
              <span className="home-stat-sub">
                {f.mostPlayed.games} {f.mostPlayed.games === 1 ? "game" : "games"} · {f.mostPlayed.wins}W
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="home-strip" aria-label={`Last ${f.games} games`}>
        {f.results.map((r) => {
          const c = champ(r.champion);
          return (
            <span key={r.id} className={`home-strip-g ${r.win ? "is-win" : "is-loss"}`} title={`${r.win ? "Win" : "Loss"} · ${c?.name ?? r.champion} · ${r.kda} · ${relativeDate(r.date)}`}>
              <GameIcon src={c?.icon} name={c?.name ?? r.champion} size={26} />
              <span className="home-strip-r">{r.win ? "W" : "L"}</span>
            </span>
          );
        })}
      </div>
      <div className="home-form-foot">
        <span>
          Last {f.games} {scoped ? MODE_LABEL[mode] : ""} {f.games === 1 ? "game" : "games"}
        </span>
        {f.streak && f.streak.count >= 2 && (
          <span className={f.streak.win ? "tone-win" : "tone-loss"}>
            {f.streak.count} {f.streak.win ? "win" : "loss"} streak
          </span>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ top picks

function TopPicks({ data, mode, rows, status, position }: { data: StaticData; mode: GameModeKind; rows?: ChampionTierRow[]; status: "loading" | "ok" | "error"; position?: TierPosition }) {
  const picks = useMemo(() => topPicks(rows, 5, mode === "sr" ? position : undefined), [rows, mode, position]);
  const maxPick = Math.max(0.0001, ...picks.map((r) => r.pickRate ?? 0));
  const webStats = useApp((s) => s.settings.webStats);
  return (
    <Card
      title="Top picks this patch"
      icon="tiers"
      className="home-card home-top"
      extra={
        <>
          {mode === "sr" && position && <span className="home-role">{POSITION_LABEL[position]} · your last role</span>}
          <button type="button" className="home-link" onClick={() => actions.setTab("tiers")}>
            Tier list <Icon name="chevron" size={13} />
          </button>
        </>
      }
    >
      {!webStats ? (
        <Empty
          compact
          icon="power"
          title="Live stats are off"
          action={
            <button type="button" className="btn btn-sm" onClick={() => actions.setTab("settings")}>
              Settings
            </button>
          }
        >
          Turn them on in Settings → Data to see this patch's strongest champions.
        </Empty>
      ) : picks.length === 0 && status === "loading" ? (
        <div className="home-top-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="home-top-row is-skel">
              <Skeleton w={14} h={12} />
              <Skeleton w={34} h={34} />
              <Skeleton w="40%" h={12} />
            </div>
          ))}
        </div>
      ) : picks.length === 0 ? (
        <Empty
          compact
          tone="error"
          icon="warning"
          title="Couldn't load the tier list"
          action={
            <button type="button" className="btn btn-sm" onClick={() => void actions.loadTierList(mode, true)}>
              <Icon name="refresh" size={13} />
              Retry
            </button>
          }
        >
          {status === "error" ? "Check your internet connection — the stats site didn't answer." : "No champions listed for this mode yet."}
        </Empty>
      ) : (
        <div className="home-top-list">
          <div className="home-top-head" aria-hidden="true">
            <span>#</span>
            <span />
            <span>Champion</span>
            <span className="num">{rateLabel(mode, "Win")}</span>
            <span className="num home-top-pr">Pick</span>
          </div>
          {picks.map((r, i) => {
            const c = findChampion(data, r.championKey);
            const name = c?.name ?? r.championKey;
            return (
              <div key={`${r.championKey}-${r.position ?? ""}`} className="home-top-row">
                <span className="home-top-rank">{i + 1}</span>
                <TierBadge tier={r.tier} size="sm" />
                <button type="button" className="home-top-main" onClick={() => openBuild(r.championKey)} title={`Open ${name}'s build`}>
                  <GameIcon src={c?.icon} name={name} size={34} />
                  <span className="home-top-name">
                    <span>{name}</span>
                    <span className="home-top-sub">{r.position ? POSITION_LABEL[r.position] : c ? ARCHETYPE_LABEL[c.archetype] : ""}</span>
                  </span>
                </button>
                <span className={`num home-top-wr ${wrTone(r.winRate)}`}>{fmtPct(r.winRate)}</span>
                <span className="num home-top-pr">
                  <span className="home-bar">
                    <span style={{ width: `${((r.pickRate ?? 0) / maxPick) * 100}%` }} />
                  </span>
                  {fmtPct(r.pickRate)}
                </span>
                <FavStar id={r.championKey} name={name} size={14} className="home-top-star" />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ patch movers

const fmtDelta = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d * 100).toFixed(1)}`;

function MoverRow({ m, data }: { m: Mover; data: StaticData }) {
  const c = findChampion(data, m.id);
  const name = c?.name ?? m.id;
  const up = m.wrDelta >= 0;
  return (
    <button type="button" className="home-mover" onClick={() => openBuild(m.id)} title={`Open ${name}'s build`}>
      <GameIcon src={c?.icon} name={name} size={30} />
      <span className="home-mover-name">
        <span>{name}</span>
        <span className="home-mover-sub">
          {fmtPct(m.oldWr)} → {fmtPct(m.newWr)}
        </span>
      </span>
      <span className="home-mover-tiers" aria-label={m.tierDelta ? `Tier ${m.oldTier} to ${m.newTier}` : `Tier ${m.newTier}, unchanged`}>
        {m.tierDelta !== 0 ? (
          <>
            <span className="home-mover-old">{m.oldTier}</span>
            <span className="home-mover-arrow" aria-hidden="true">
              →
            </span>
          </>
        ) : null}
        <TierBadge tier={m.newTier} size="sm" />
      </span>
      <span className={`home-mover-delta num ${up ? "is-up" : "is-down"}`} title={`${fmtDelta(m.wrDelta)} pts since last patch`}>
        {fmtDelta(m.wrDelta)}
      </span>
    </button>
  );
}

function MoverList({ kind, list, data, mode }: { kind: "up" | "down"; list: Mover[]; data: StaticData; mode: GameModeKind }) {
  return (
    <div className={`home-movers-col is-${kind}`}>
      <div className="home-movers-head">
        <span className="home-movers-glyph" aria-hidden="true">
          {kind === "up" ? "▲" : "▼"}
        </span>
        {kind === "up" ? "Risers" : "Fallers"}
        <span className="home-movers-k">Δ {rateLabel(mode, "WR")} pts</span>
      </div>
      {list.length ? list.map((m) => <MoverRow key={`${m.id}-${m.position ?? ""}`} m={m} data={data} />) : <div className="home-movers-none">No big {kind === "up" ? "gains" : "drops"}</div>}
    </div>
  );
}

function PatchMovers({
  data,
  mode,
  rows,
  patch,
  prev,
  status,
  position,
}: {
  data: StaticData;
  mode: GameModeKind;
  rows?: ChampionTierRow[];
  patch?: string;
  prev?: TierSnapshot;
  status: "loading" | "ok" | "error";
  position?: TierPosition;
}) {
  const movers = useMemo(() => computeMovers(prev, rows, { position: mode === "sr" ? position : undefined, limit: 5 }), [prev, rows, mode, position]);
  const any = movers.risers.length + movers.fallers.length > 0;
  return (
    <Card
      title="Patch movers"
      icon="swap"
      className="home-card home-movers"
      extra={
        prev && patch ? (
          <span className="home-movers-patches" title={`Compared with the tier list Nexis saw on patch ${displayPatch(prev.patch)}`}>
            {displayPatch(prev.patch)} <span aria-hidden="true">→</span> {patch}
            {mode === "sr" && position ? ` · ${POSITION_LABEL[position]}` : ""}
          </span>
        ) : undefined
      }
    >
      {!rows?.length && status === "loading" ? (
        <div className="home-movers-skel">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} w="100%" h={30} />
          ))}
        </div>
      ) : !rows?.length ? (
        <Empty compact icon="tiers" title="No tier list yet">
          Movers appear once this mode's tier list has loaded.
        </Empty>
      ) : !prev ? (
        <Empty compact icon="info" title="No previous patch yet">
          Movers appear after the next patch — Nexis keeps a snapshot of this patch's tiers.
        </Empty>
      ) : !any ? (
        <Empty compact icon="check" title="A quiet patch">
          No champion changed tier or moved 1 pt in win rate since {displayPatch(prev.patch)}.
        </Empty>
      ) : (
        <div className="home-movers-grid">
          <MoverList kind="up" list={movers.risers} data={data} mode={mode} />
          <MoverList kind="down" list={movers.fallers} data={data} mode={mode} />
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ quick actions

function QuickAction({ icon, title, sub, onClick, tone }: { icon: IconName; title: string; sub: string; onClick: () => void; tone?: "hex" }) {
  return (
    <button type="button" className={`home-qa ${tone ? `home-qa-${tone}` : ""}`} onClick={onClick}>
      <span className="home-qa-ico">
        <Icon name={icon} size={17} />
      </span>
      <span className="home-qa-text">
        <span className="home-qa-title">{title}</span>
        <span className="home-qa-sub">{sub}</span>
      </span>
    </button>
  );
}

function QuickActions({ mode }: { mode: GameModeKind }) {
  const hudKey = useApp((s) => s.settings.hotkeyHudEdit);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all([actions.refreshData(), actions.loadTierList(mode, true)]);
      toast("Stats refreshed", "good");
    } catch (e) {
      toast("Couldn't refresh stats", "bad", { detail: String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Quick actions" icon="spark" className="home-card home-actions">
      <div className="home-qa-grid">
        <QuickAction
          icon="play"
          tone="hex"
          title="Try the demo game"
          sub="See the overlay mid-game"
          onClick={() => {
            actions.setDemo(true);
            actions.setTab("build");
          }}
        />
        <QuickAction
          icon="window"
          title="Edit HUD layout"
          sub={hudKey ? `Or ${hudKey} in game` : "Drag & resize the mini HUD"}
          onClick={() => {
            void setHudEdit(true, true);
            if (!isTauri) toast("Layout editing runs in the desktop app", "info", { detail: "Open the HUD view (?view=hud) to try it in a browser." });
          }}
        />
        <QuickAction icon="refresh" title={busy ? "Refreshing…" : "Refresh stats"} sub="Re-download builds & tiers" onClick={() => void refresh()} />
        <QuickAction icon="settings" title="Settings" sub="Hotkeys, HUD, theme" onClick={() => actions.setTab("settings")} />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ view

export function HomeView({ d }: { d: Derived }) {
  const data = useApp((s) => s.data)!;
  const mode = d.gameMode;
  const tl = useApp((s) => s.tierLists[mode]);
  const webPatch = useApp((s) => s.web.patch);
  const history = useApp((s) => s.history);
  const picks = useApp((s) => s.recentPicks);
  const lastChampion = useApp((s) => s.settings.lastChampion);
  const favorites = useApp((s) => s.settings.favorites ?? []);
  const position = useApp((s) => s.tierPosition ?? opggPosition(s.lastPosition) ?? "mid");
  useEffect(() => {
    void actions.loadTierList(mode);
  }, [mode]);

  const recent = useMemo(
    () =>
      recentChampions(history, picks, { lastChampion, limit: 8, known: (id) => !!findChampion(data, id) })
        .map((r) => findChampion(data, r.id))
        .filter((c): c is Champion => !!c),
    [history, picks, lastChampion, data],
  );
  const top = tl?.rows ? topPicks(tl.rows, 1, mode === "sr" ? position : undefined)[0] : undefined;
  const featured = recent[0] ?? (favorites[0] ? findChampion(data, favorites[0]) : undefined) ?? (top ? findChampion(data, top.championKey) : undefined);
  const patch = shortPatch(tl?.patch ?? webPatch ?? data.version);
  const rows = tl?.rows;
  const loading = !tl || tl.status === "loading";
  const tierHistory = useTierHistory();
  const prev = useMemo(() => previousSnapshot(tierHistory, mode, tl?.patch), [tierHistory, mode, tl?.patch]);
  const webStats = useApp((s) => s.settings.webStats);

  return (
    <div className="view view-home">
      <Hero d={d} data={data} patch={patch} featured={featured} recent={recent} />
      <div className="home-grid">
        <div className="home-col">
          <Favorites data={data} mode={mode} rows={rows} loading={loading} position={mode === "sr" ? position : undefined} prev={prev} />
          <TopPicks data={data} mode={mode} rows={rows} status={tl?.status ?? "loading"} position={position} />
        </div>
        <div className="home-col">
          <FormCard data={data} mode={mode} />
          {webStats && <PatchMovers data={data} mode={mode} rows={rows} patch={shortPatch(tl?.patch)} prev={prev} status={tl?.status ?? "loading"} position={position} />}
          <QuickActions mode={mode} />
        </div>
      </div>
    </div>
  );
}
