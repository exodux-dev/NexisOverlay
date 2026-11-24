// Loading-screen game plan: three short points for this game — your team's win condition, your
// first power spike, and the enemy threat to respect. Pre-game reference only (no real-time calls).
import { analyzeComp } from "./comp";
import type { GameModeKind } from "./mode";
import type { ThreatKey, ThreatReport } from "./threat";
import type { Champion } from "./types";

export interface GamePlanPoint {
  kind: "win" | "spike" | "watch";
  title: string;
  text: string;
}

const WATCH: Record<ThreatKey, (who: string) => string> = {
  burst: (who) => `${who} can burst you down: keep your escape or defensive spell for them.`,
  cc: (who) => `Lots of crowd control (${who}): stay behind your frontline; tenacity helps.`,
  heal: (who) => `Heavy healing (${who}): get anti-heal early and focus short, decisive fights.`,
  shield: (who) => `Big shields (${who}): burst through them or wait for them to drop.`,
  tankiness: (who) => `Very tanky (${who}): penetration and %-health damage pay off.`,
  crit: (who) => `Crit damage (${who}): armor and not getting caught alone keep you alive.`,
  attackSpeed: (who) => `Fast attackers (${who}): attack-speed slows and armor blunt them.`,
  poke: (who) => `Lots of poke (${who}): don't sit in range; sustain and engage beat it.`,
};

export function gamePlan(o: {
  champion?: Champion;
  allies: Champion[];
  enemies: Champion[];
  threat: ThreatReport;
  mode: GameModeKind;
  /** First core item and its cost, from the build plan. */
  firstItem?: { name: string; cost: number };
}): GamePlanPoint[] {
  const out: GamePlanPoint[] = [];
  if (o.allies.length && o.enemies.length && o.mode !== "arena") {
    const a = analyzeComp(o.allies, o.mode);
    const e = analyzeComp(o.enemies, o.mode);
    let text: string;
    if (a.curve.early - e.curve.early >= 0.08 && a.curve.late <= e.curve.late) text = "Your team is stronger early: group up and force fights before their carries finish items.";
    else if (a.curve.late - e.curve.late >= 0.08) text = "Your team scales better: avoid early coin-flips, farm up and fight after two or three items.";
    else if (a.scores.poke - e.scores.poke >= 0.2) text = "You have more poke: chip them down from range before committing to a fight.";
    else if (a.scores.engage - e.scores.engage >= 0.2) text = "You have more engage: look for picks and start fights on your terms.";
    else if (a.scores.frontline - e.scores.frontline >= 0.2) text = "You have the stronger frontline: fight head-on and let your tanks soak the damage.";
    else text = "Evenly matched comps: the team that groups and fights together will win; avoid getting caught alone.";
    out.push({ kind: "win", title: "Win condition", text });
  }
  if (o.firstItem) out.push({ kind: "spike", title: "First power spike", text: `${o.firstItem.name} (${o.firstItem.cost.toLocaleString("en-US")}g): fights get much easier once it's done.` });
  const top = [...o.threat.meters].sort((x, y) => y.value - x.value)[0];
  if (top && top.value >= 0.35) out.push({ kind: "watch", title: "Watch out for", text: WATCH[top.key]([...new Set(top.sources.map((x) => x.replace(/\s*\(.*\)\s*$/, "")))].slice(0, 2).join(", ") || "their team") });
  return out;
}
