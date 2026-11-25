// Champ select: your teammates' OP.GG profiles (rank, recent form, mains, "off-role" style tags),
// when the League client shows their names. Ranked solo / duo hides names until the game loads.
import { t as tx } from "../i18n";
import { useApp } from "../app/store";
import { Card } from "../ui/controls";
import { ScoutPanel, type ScoutPlayer } from "./Scout";

export function ChampSelectScout() {
  const cs = useApp((s) => s.champSelect);
  const scout = useApp((s) => s.scout);
  const webOn = useApp((s) => s.settings.webStats);
  if (!cs?.mates?.length || !webOn) return null;
  const visible = cs.mates.filter((m) => m.riotId);
  if (!visible.length)
    return (
      <Card title="Teammates" icon="user" className="cs-scout-hidden">
        <span className="dim small">{tx("Names are hidden in this queue's champ select (ranked solo / duo). Scouting starts at the loading screen.")}</span>
      </Card>
    );
  const players: ScoutPlayer[] = visible.map((m) => ({
    riotId: m.riotId!,
    championId: m.champion?.id,
    championName: m.champion?.name ?? "Picking…",
    championIcon: m.champion?.icon,
    team: "ORDER",
    isMe: m.isMe,
    position: m.position,
  }));
  const pending = players.filter((p) => scout.profiles[p.riotId] === "loading").length;
  const status = !scout.region ? "Waiting for the League client to report your region…" : pending ? `Loading OP.GG profiles… ${players.length - pending}/${players.length}` : `OP.GG · ${scout.region.toUpperCase()} · champ select`;
  return <ScoutPanel players={players} profiles={scout.profiles} region={scout.region} status={status} />;
}
