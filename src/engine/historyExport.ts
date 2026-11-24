// Match history export: CSV (file) or tab-separated text (paste straight into Excel / Sheets).
import { matchMode } from "./mode";
import type { MatchRecord, StaticData } from "./types";

const MODE_NAME: Record<string, string> = { mayhem: "ARAM: Mayhem", aram: "ARAM", sr: "Summoner's Rift", arena: "Arena" };
export const EXPORT_HEADERS = ["Date", "Mode", "Champion", "Result", "Kills", "Deaths", "Assists", "KDA", "Minutes", "Items", "Augments", "Enemies"];

export function historyRows(history: MatchRecord[], data?: StaticData | null): string[][] {
  const champ = (id: string) => data?.champions.find((c) => c.id === id)?.name ?? id;
  const item = (id: number) => data?.items.get(id)?.name ?? String(id);
  return [...history]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => {
      const mode = matchMode(m);
      return [
        m.date.slice(0, 16).replace("T", " "),
        mode ? MODE_NAME[mode] : m.gameMode || "",
        champ(m.champion),
        m.result === "Win" ? "Win" : "Loss",
        String(m.kills),
        String(m.deaths),
        String(m.assists),
        ((m.kills + m.assists) / Math.max(1, m.deaths)).toFixed(2),
        (m.durationSec / 60).toFixed(1),
        m.items.map(item).join("; "),
        m.augments.join("; "),
        m.enemies.map(champ).join("; "),
      ];
    });
}

const csvCell = (v: string) => {
  // Quote when needed; neutralise spreadsheet formulas (=, +, -, @ at the start).
  const safe = /^[=+@-]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function historyCsv(history: MatchRecord[], data?: StaticData | null): string {
  return [EXPORT_HEADERS, ...historyRows(history, data)].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Tab-separated, for pasting into a spreadsheet. */
export function historyTsv(history: MatchRecord[], data?: StaticData | null): string {
  const cell = (v: string) => csvCell(v.replace(/[\t\r\n]+/g, " ")).replace(/^"(.*)"$/s, "$1");
  return [EXPORT_HEADERS, ...historyRows(history, data)].map((r) => r.map(cell).join("\t")).join("\n");
}
