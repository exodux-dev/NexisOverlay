import { useMemo } from "react";
import { gamePlan } from "../engine/gamePlan";
import { RolesCard } from "../ui/RoleEditor";
import { actions, useApp, type Derived } from "../app/store";
import { powerSpikes, teamGold, type IntelEvent, type PlayerValue, type PowerSpike, type SpikeKind } from "../engine/intel";
import { ScoutPanel, type ScoutPlayer } from "./Scout";
import { findChampion } from "../engine/staticData";
import { threatLevel, type ThreatMeter } from "../engine/threat";
import type { Champion, PlayerState, StaticData } from "../engine/types";
import { Card, Empty, LEVEL_LABEL, LEVEL_TONE, Meter } from "../ui/controls";
import { ARCHETYPE_LABEL, gold } from "../ui/format";
import { IntelFeed } from "../ui/IntelFeed";
import { GameIcon } from "../ui/GameIcon";
import { ItemIcon } from "../ui/ItemIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import { TeamPowerCard } from "./TeamPower";
import { TeamCompVersusCard } from "./TeamComp";
import "./enemies.css";

const DMG_LABEL = { ap: "Magic", ad: "Physical", mixed: "Mixed" } as const;

function sourceChampions(data: StaticData, sources: string[]): Champion[] {
  const out: Champion[] = [];
  for (const s of sources) {
    const c = findChampion(data, s.replace(/ \(.*\)$/, ""));
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function DamageSplit({ d }: { d: Derived }) {
  const ap = Math.round(d.threat.apShare * 100);
  const ad = 100 - ap;
  const lean = ap >= 60 ? "Magic-heavy — magic resist is efficient" : ad >= 60 ? "Physical-heavy — armor is efficient" : "Mixed damage — balance your resistances";
  return (
    <Card title="Damage profile" icon="shield" className="dmg-card">
      <div className="dmg-nums">
        <div>
          <span className="dmg-pct ap">{ap}%</span>
          <span className="dmg-lbl">Magic (AP)</span>
        </div>
        <div className="right">
          <span className="dmg-pct ad">{ad}%</span>
          <span className="dmg-lbl">Physical (AD)</span>
        </div>
      </div>
      <div className="dmg-bar" role="img" aria-label={`${ap}% magic, ${ad}% physical`}>
        <div className="dmg-ap" style={{ width: `${ap}%` }} />
        <div className="dmg-ad" style={{ width: `${ad}%` }} />
      </div>
      <p className="dim small dmg-lean">{lean}</p>
      {d.threat.suppress.length > 0 && (
        <div className="warn">
          <Icon name="warning" size={16} />
          <div>
            <strong>Suppression:</strong> {d.threat.suppress.join(", ")}. Only Quicksilver effects remove it — track their cooldowns.
          </div>
        </div>
      )}
    </Card>
  );
}

function MeterTile({ m, data }: { m: ThreatMeter; data: StaticData }) {
  const lvl = threatLevel(m.value);
  const champs = sourceChampions(data, m.sources);
  return (
    <div className={`threat lvl-bg-${lvl}`}>
      <div className="threat-top">
        <span className="threat-name">{m.label}</span>
        <span className={`lvl lvl-${lvl}`}>{LEVEL_LABEL[lvl]}</span>
      </div>
      <Meter value={m.value} tone={LEVEL_TONE[lvl]} height={5} />
      <div className="threat-src">
        {champs.length === 0 ? (
          <span className="dim small">—</span>
        ) : (
          <Tip
            content={
              <div className="tt">
                <strong>{m.label}</strong>
                <ul className="tt-list">
                  {m.sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            }
          >
            <span className="avatars">
              {champs.slice(0, 5).map((c) => (
                <GameIcon key={c.id} src={c.icon} name={c.name} size={22} round />
              ))}
            </span>
          </Tip>
        )}
      </div>
    </div>
  );
}

function EnemyCard({ p, data }: { p: PlayerState; data: StaticData }) {
  const c = p.champion;
  return (
    <article className="enemy">
      <div className="enemy-head">
        <GameIcon src={c?.icon} name={p.championName} size={52} />
        <div className="enemy-id">
          <div className="enemy-name">{c?.name ?? p.championName}</div>
          <div className="dim small">{c ? ARCHETYPE_LABEL[c.archetype] : "Unknown"}</div>
          {c && <span className={`dmg-chip dmg-${c.damage}`}>{DMG_LABEL[c.damage]}</span>}
        </div>
        {p.level > 1 && <span className="enemy-lvl">{p.level}</span>}
      </div>
      <div className="enemy-kda tnum">
        <span>{p.kills}</span>/<span className="bad">{p.deaths}</span>/<span>{p.assists}</span>
      </div>
      <div className="enemy-items">
        {Array.from({ length: 6 }, (_, i) => {
          const it = p.items[i];
          if (!it) return <span key={i} className="item-empty" />;
          const full = data.items.get(it.id);
          return (
            <ItemIcon key={i} item={full} name={it.name} size={26} />
          );
        })}
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ intel (scoreboard only)

const EMPTY_INTEL: IntelEvent[] = [];

function shortGold(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : gold(n);
}

function ValueRow({ p, max }: { p: PlayerValue; max: number }) {
  return (
    <li className={`tg-row tg-${p.side} ${p.isMe ? "tg-me" : ""}`}>
      <span className="tg-avatar">
        <GameIcon src={p.champion?.icon} name={p.championName} size={24} />
        <span className="tg-lvl tnum">{p.level}</span>
      </span>
      <span className="tg-who">
        <span className="tg-name">{p.isMe ? "You" : p.championName}</span>
        <span className="tg-kda tnum">
          {p.kills}/<span className="bad">{p.deaths}</span>/{p.assists}
        </span>
      </span>
      <span className="tg-bar" aria-hidden="true">
        <span style={{ width: `${max ? Math.max(3, (p.value / max) * 100) : 0}%` }} />
      </span>
      <span className="tg-val tnum">{shortGold(p.value)}</span>
    </li>
  );
}

function TeamGoldCard({ d, data }: { d: Derived; data: StaticData }) {
  // Team totals and the difference live in the Team power card above; this card is the per-player breakdown.
  const g = useMemo(() => teamGold(d.game!, data), [d.game, data]);
  const max = Math.max(1, ...g.perPlayer.map((p) => p.value));
  const allies = g.perPlayer.filter((p) => p.side === "ally");
  const enemies = g.perPlayer.filter((p) => p.side === "enemy");
  return (
    <Card
      title="Item gold per player"
      icon="coin"
      className="tg-card"
      extra={
        <Tip content={<div className="tt">Value of the items each player holds (completed items and components), from the scoreboard. Unspent gold isn't visible, so this is an estimate.</div>}>
          <span className="tg-verdict">How it's counted</span>
        </Tip>
      }
    >
      <div className="tg-cols">
        <ul className="tg-list" aria-label="Your team">
          {allies.map((p) => (
            <ValueRow key={p.riotId} p={p} max={max} />
          ))}
        </ul>
        <ul className="tg-list" aria-label="Enemy team">
          {enemies.map((p) => (
            <ValueRow key={p.riotId} p={p} max={max} />
          ))}
        </ul>
      </div>
    </Card>
  );
}

const SPIKE_TONE: Record<SpikeKind, string> = { none: "muted", item: "gold", "two-item": "orange", "three-item": "red", full: "red" };

function SpikeRow({ s }: { s: PowerSpike }) {
  const tone = s.big.length && s.spike === "item" ? "orange" : SPIKE_TONE[s.spike];
  return (
    <li className="sp-row">
      <span className="tg-avatar">
        <GameIcon src={s.champion?.icon} name={s.championName} size={30} />
        <span className="tg-lvl tnum">{s.level}</span>
      </span>
      <span className="sp-who">
        <span className="tg-name">{s.championName}</span>
        <span className="sp-pips" aria-label={`${s.legendaries} legendary items`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className={i < s.legendaries ? "on" : ""} />
          ))}
          <span className="sp-count tnum">{s.legendaries}</span>
        </span>
      </span>
      <span className="sp-newest">
        {s.newest ? <ItemIcon item={s.newest} size={26} /> : <span className="item-empty sp-empty" />}
      </span>
      <span className={`sp-badge sp-${tone}`}>
        {s.big.length > 0 && <Icon name="spark" size={11} />}
        {s.label}
      </span>
    </li>
  );
}

function SpikesCard({ d, data, intel }: { d: Derived; data: StaticData; intel: IntelEvent[] }) {
  const spikes = useMemo(() => powerSpikes(d.game!.enemies, data, intel), [d.game, data, intel]);
  const spiking = spikes.filter((s) => s.legendaries >= 2 || s.big.length).length;
  return (
    <Card
      title="Enemy power spikes"
      icon="spark"
      className="sp-card"
      extra={<span className="dim small">{spiking ? `${spiking} spiking` : "Completed items"}</span>}
    >
      <ul className="sp-list">
        {spikes.map((s) => (
          <SpikeRow key={s.riotId} s={s} />
        ))}
      </ul>
    </Card>
  );
}

function IntelRow({ d, data }: { d: Derived; data: StaticData }) {
  // `intel` is appended by the store on each live snapshot (see engine/intel.ts).
  const intel = useApp((s) => s.intel) ?? EMPTY_INTEL;
  return (
    <div className="intel-grid">
      <div className="intel-col">
        <TeamGoldCard d={d} data={data} />
        <SpikesCard d={d} data={data} intel={intel} />
      </div>
      <Card title="Game intel" icon="history" className="intel-card" extra={<span className="dim small">Scoreboard · newest first</span>}>
        <div className="intel-scroll">
          <IntelFeed events={intel} data={data} />
        </div>
      </Card>
    </div>
  );
}

/** OP.GG scouting for all 10 players (fetched during the loading screen). */
function Players({ d }: { d: Derived }) {
  const scout = useApp((s) => s.scout);
  const webOn = useApp((s) => s.settings.webStats);
  const game = d.game!;
  const players: ScoutPlayer[] = [game.me, ...game.allies, ...game.enemies].map((p) => ({
    riotId: p.riotId,
    championId: p.champion?.id,
    championName: p.champion?.name ?? p.championName,
    championIcon: p.champion?.icon,
    team: p.team,
    isMe: p.isMe,
  }));
  if (!webOn) return null;
  const pending = Object.values(scout.profiles).filter((v) => v === "loading").length;
  const status = !scout.region
    ? "Waiting for the League client to report your region…"
    : pending
      ? `Loading OP.GG profiles… ${players.length - pending}/${players.length}`
      : `OP.GG · ${scout.region.toUpperCase()}${game.loading ? " · loading screen" : ""}`;
  return <ScoutPanel players={players} profiles={scout.profiles} region={scout.region} status={status} queue={game.gameMode === "CLASSIC" ? "SOLORANKED" : game.gameMode} />;
}

/** Composition comparison: everyone is visible once the game loads. */
const PLAN_ICON = { win: "spark", spike: "build", watch: "shield" } as const;

/** Loading screen / first two minutes: win condition, first power spike, top threat. */
function GamePlanCard({ d }: { d: Derived }) {
  const game = d.game!;
  const points = useMemo(() => {
    const champs = (ps: typeof game.allies) => ps.map((p) => p.champion).filter((c): c is Champion => !!c);
    const first = d.plan?.order.find((r) => r.kind === "core" && !r.owned);
    return gamePlan({
      champion: d.champion,
      allies: champs([game.me, ...game.allies]),
      enemies: champs(game.enemies),
      threat: d.threat,
      mode: d.gameMode,
      firstItem: first ? { name: first.item.name, cost: first.item.cost } : undefined,
    });
  }, [game.me, game.allies, game.enemies, d.threat, d.gameMode, d.plan, d.champion]);
  if (!points.length) return null;
  return (
    <Card title="Game plan" icon="spark" className="gp-card" extra={<span className="dim small">For this game, before it starts</span>}>
      <ul className="gp-list">
        {points.map((pt) => (
          <li key={pt.kind} className={`gp-item gp-${pt.kind}`}>
            <span className="gp-icon">
              <Icon name={PLAN_ICON[pt.kind]} size={15} />
            </span>
            <span className="gp-text">
              <strong>{pt.title}</strong>
              <span>{pt.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TeamComps({ d }: { d: Derived }) {
  const game = d.game!;
  const allies = useMemo(() => [game.me, ...game.allies].map((p) => p.champion).filter((c): c is Champion => !!c), [game.me, game.allies]);
  const enemies = useMemo(() => game.enemies.map((p) => p.champion).filter((c): c is Champion => !!c), [game.enemies]);
  // Arena has many duos rather than one enemy team, so a two-team comparison doesn't apply.
  if (d.gameMode === "arena") return null;
  return <TeamCompVersusCard mode={d.gameMode} allies={allies} enemies={enemies} />;
}

export function EnemiesView({ d }: { d: Derived }) {
  const data = useApp((s) => s.data)!;
  const enemies = d.game?.enemies ?? [];
  if (!enemies.length) {
    return (
      <div className="view">
        <Card>
          <Empty
            title="No enemy team yet"
            icon="enemies"
            action={
              d.mode === "explore" && (
                <>
                  <button type="button" className="btn btn-sm" onClick={() => actions.setTab("build")}>
                    <Icon name="plus" size={13} />
                    Add enemies
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => actions.setDemo(true)}>
                    <Icon name="play" size={13} />
                    Try demo game
                  </button>
                </>
              )
            }
          >
            {d.mode === "champselect"
              ? "In ARAM the enemy team is revealed when the game loads. Threat analysis appears automatically."
              : "Add enemies on the Build tab or start a game to see threat analysis."}
          </Empty>
        </Card>
      </div>
    );
  }
  const meters = [...d.threat.meters].sort((a, b) => b.value - a.value);
  return (
    <div className="view view-enemies">
      {/* Loading screen: scouting first. Once the game runs, scoreboard intel leads. */}
      {(d.mode === "live" || d.mode === "demo") && d.game && (d.game.loading || d.game.gameTime < 120) && <GamePlanCard d={d} />}
      {(d.mode === "live" || d.mode === "demo") && d.game && <RolesCard d={d} />}
      {(d.mode === "live" || d.mode === "demo") && d.game && !d.game.loading && d.power && <TeamPowerCard power={d.power} />}
      {(d.mode === "live" || d.mode === "demo") && d.game && <TeamComps d={d} />}
      {(d.mode === "live" || d.mode === "demo") && d.game && !d.game.loading && <IntelRow d={d} data={data} />}
      {d.mode === "live" && d.game && <Players d={d} />}
      <div className="enemies-top">
        <DamageSplit d={d} />
        <Card title="Threats" icon="enemies" extra={<span className="dim small">Hover avatars for details</span>} className="threat-card">
          <div className="threat-grid">
            {meters.map((m) => (
              <MeterTile key={m.key} m={m} data={data} />
            ))}
          </div>
        </Card>
      </div>
      <Card title="Enemy team" icon="user" extra={<span className="dim small">{enemies.length} champions</span>}>
        <div className="roster">
          {enemies.map((p, i) => (
            <EnemyCard key={`${p.championName}-${i}`} p={p} data={data} />
          ))}
        </div>
      </Card>
    </div>
  );
}
