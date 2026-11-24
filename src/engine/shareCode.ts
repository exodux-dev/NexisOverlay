// "Share a build": a short, self-contained code (no server) with a champion's picked rune page,
// spells, core, starter and boots for a mode (+ role on the Rift and build style). Pasting it into
// Nexis saves those picks under the same champion + mode key.
import type { GameModeKind } from "./mode";
import { CHOICE_PARTS, type BuildChoice } from "./options";

export interface SharedBuild {
  champion: string;
  mode: GameModeKind;
  position?: string;
  style?: string;
  choice: BuildChoice;
}

const PREFIX = "NX1-";
const MODES: GameModeKind[] = ["mayhem", "aram", "sr", "arena"];

const toB64Url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64Url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function encodeBuild(b: SharedBuild): string {
  const c: Record<string, string> = {};
  // Only stable option keys travel (legacy index picks mean nothing on another PC).
  for (const k of CHOICE_PARTS) {
    const v = b.choice[k];
    if (typeof v === "string" && v) c[k] = v;
  }
  return PREFIX + toB64Url(JSON.stringify({ c: b.champion, m: b.mode, ...(b.position ? { p: b.position } : {}), ...(b.style ? { s: b.style } : {}), o: c }));
}

/** Parse a pasted code (whitespace and surrounding text tolerated); undefined when invalid. */
export function decodeBuild(text: string): SharedBuild | undefined {
  const m = /NX1-([A-Za-z0-9_-]+)/.exec(text ?? "");
  if (!m) return undefined;
  try {
    const raw = JSON.parse(fromB64Url(m[1])) as { c?: unknown; m?: unknown; p?: unknown; s?: unknown; o?: unknown };
    if (typeof raw.c !== "string" || !/^[A-Za-z0-9]{2,30}$/.test(raw.c)) return undefined;
    if (!MODES.includes(raw.m as GameModeKind)) return undefined;
    const choice: BuildChoice = {};
    if (raw.o && typeof raw.o === "object")
      for (const k of CHOICE_PARTS) {
        const v = (raw.o as Record<string, unknown>)[k];
        if (typeof v === "string" && v.length <= 200) choice[k] = v;
      }
    return {
      champion: raw.c,
      mode: raw.m as GameModeKind,
      ...(typeof raw.p === "string" && raw.p.length <= 20 ? { position: raw.p } : {}),
      ...(typeof raw.s === "string" && raw.s.length <= 40 ? { style: raw.s } : {}),
      choice,
    };
  } catch {
    return undefined;
  }
}
