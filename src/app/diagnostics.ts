// Pure helpers for Settings → Diagnostics: status levels, privacy redaction and the plain-text
// report copied for bug reports. No React / no backend here (unit-tested in diagnostics.test.ts).

import type { Diagnostics } from "../bridge";

export type Level = "ok" | "warn" | "bad" | "off";

export interface StatusRow {
  id: string;
  label: string;
  level: Level;
  value: string;
  hint?: string;
}

/**
 * Remove personal data from free text: Riot IDs (name#tag), PUUID-like ids, known player names,
 * user names in home-folder paths, and URL paths (profile URLs contain Riot IDs).
 */
export function redact(text: string, names: string[] = []): string {
  let out = text;
  for (const n of names) {
    const name = n.trim();
    if (name.length < 2) continue;
    out = out.split(name).join("<player>");
  }
  return out
    .replace(/(https?:\/\/[^/\s"')]+)\/[^\s"')]*/g, "$1/…")
    .replace(/([\\/](?:Users|users|home)[\\/])[^\\/"'\n)]+/g, "$1<user>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b[A-Za-z0-9_-]{60,}\b/g, "<id>")
    .replace(/[^\s#"'<>()]{2,}#[A-Za-z0-9]{2,5}\b/g, "<riot-id>");
}

/** "12s ago", "3 min ago", "2 h ago", "never". */
export function ago(t: number | null | undefined, now = Date.now()): string {
  if (!t) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function age(secs: number | null | undefined): string {
  if (secs == null) return "–";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1)} h`;
  return `${(secs / 86400).toFixed(1)} d`;
}

/** League's display mode: Borderless / Windowed are fine, Fullscreen hides overlays. */
export function windowModeLevel(mode: string | null | undefined): Level {
  if (mode === "borderless" || mode === "windowed") return "ok";
  if (mode === "fullscreen") return "bad";
  return "off";
}

/** Stats providers grouped by host (several hosts can serve one provider). */
export const PROVIDERS: Array<{ id: string; label: string; hosts: string[] }> = [
  { id: "hexmayhem", label: "HexMayhem", hosts: ["hexmayhem.com", "www.hexmayhem.com"] },
  { id: "opgg", label: "OP.GG", hosts: ["op.gg", "www.op.gg"] },
  { id: "ddragon", label: "Data Dragon (Riot)", hosts: ["ddragon.leagueoflegends.com"] },
  { id: "cdragon", label: "CommunityDragon", hosts: ["raw.communitydragon.org"] },
  { id: "github", label: "GitHub (dataset / updates)", hosts: ["raw.githubusercontent.com", "api.github.com"] },
];

export interface ProviderStatus {
  id: string;
  label: string;
  level: Level;
  value: string;
}

/** Merge the per-host fetch status of each provider into one status row. */
export function providerStatus(fetch: Diagnostics["fetch"], now = Date.now()): ProviderStatus[] {
  const known = new Set(PROVIDERS.flatMap((p) => p.hosts));
  const extra = Object.keys(fetch)
    .filter((h) => !known.has(h) && h !== "local")
    .map((h) => ({ id: h, label: h, hosts: [h] }));
  return [...PROVIDERS, ...extra].map((p) => {
    const rows = p.hosts.map((h) => fetch[h]).filter(Boolean);
    if (!rows.length) return { id: p.id, label: p.label, level: "off" as Level, value: "not used yet" };
    const okAt = Math.max(0, ...rows.map((r) => r.okAt ?? 0));
    const errAt = Math.max(0, ...rows.map((r) => r.errAt ?? 0));
    const cacheAge = rows.map((r) => r.cacheAgeSecs).filter((a): a is number => a != null);
    const cache = cacheAge.length ? ` · cache ${age(Math.min(...cacheAge))} old` : "";
    if (errAt > okAt) {
      const err = rows.find((r) => r.errAt === errAt)?.error ?? "error";
      const cached = rows.some((r) => r.fromCache);
      return { id: p.id, label: p.label, level: (cached ? "warn" : "bad") as Level, value: `${err} (${ago(errAt, now)})${cached ? " · using cached copy" : ""}${cache}` };
    }
    return { id: p.id, label: p.label, level: "ok" as Level, value: okAt ? `OK ${ago(okAt, now)}${cache}` : `cached${cache}` };
  });
}

const LEVEL_TAG: Record<Level, string> = { ok: "OK  ", warn: "WARN", bad: "FAIL", off: "--  " };

/** Plain-text report for bug reports. Everything passes through `redact`. */
export function buildReport(opts: {
  version: string;
  sha: string;
  platform: string;
  rows: StatusRow[];
  providers: ProviderStatus[];
  log: Diagnostics["log"];
  extra?: string[];
  names?: string[];
  now?: number;
}): string {
  const now = opts.now ?? Date.now();
  const lines: string[] = [];
  lines.push(`Nexis Overlay diagnostics — ${new Date(now).toISOString()}`);
  lines.push(`Version ${opts.version} · build ${opts.sha.slice(0, 12)} · ${opts.platform}`);
  lines.push("");
  lines.push("== Status");
  for (const r of opts.rows) lines.push(`[${LEVEL_TAG[r.level]}] ${r.label}: ${r.value}${r.hint ? ` — ${r.hint}` : ""}`);
  lines.push("");
  lines.push("== Stats sources");
  for (const p of opts.providers) lines.push(`[${LEVEL_TAG[p.level]}] ${p.label}: ${p.value}`);
  if (opts.extra?.length) {
    lines.push("");
    lines.push("== Details");
    lines.push(...opts.extra);
  }
  lines.push("");
  lines.push(`== Log (last ${opts.log.length})`);
  for (const e of opts.log) lines.push(`${new Date(e.t).toISOString().slice(11, 19)} ${e.level.toUpperCase().padEnd(5)} ${e.area}: ${e.msg}`);
  return redact(lines.join("\n"), opts.names);
}
