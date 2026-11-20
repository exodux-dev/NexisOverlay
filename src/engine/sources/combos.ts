// HexMayhem "God-Tier Combos" (hexmayhem.com/must-play): the best champion + augment +
// core-build combinations of the patch, ranked by sample-adjusted win rate.
//
// The page is a Next.js app; the table is embedded in the RSC payload as
// `"rows":[{ cid, aid, arch, items:[{id,name,icon}], n, wr, lift, cold, rank,
//            champ:{name,slug}, aug:{name,icon,rarity} }, …]`.
// The parser is deliberately tolerant: unknown/missing fields are skipped, and if the layout
// changes it returns [] so the app simply runs without combo data.

import { decodeRsc, grabJson, HEXMAYHEM } from "./hexmayhem";

/** "God-Tier Combos" in the site nav points here. */
export const COMBOS_URL = `${HEXMAYHEM}/must-play`;

export interface AugmentCombo {
  /** Augment names (HexMayhem combos have one; multi-augment combos are supported for other sources). */
  augments: string[];
  /** Core build item ids (Mayhem variants such as 123430 are kept as published). */
  items?: number[];
  /** Champion ids. HexMayhem publishes lower-case slugs (e.g. "masteryi"); compare with norm(). */
  champions?: string[];
  /** Display names matching `champions`, when published. */
  championNames?: string[];
  winRate?: number; // 0..1
  games?: number;
  /** Win-rate lift vs. the champion's own baseline, in percentage points. */
  lift?: number;
  /** Build archetype label as published ("crit", "bruiser", "on_hit", …). */
  build?: string;
  /** Few people play it ("Hidden" on the site). */
  hidden?: boolean;
  rank?: number;
  note?: string;
}

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : undefined);
const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x.trim() : undefined);

const BUILD_LABEL: Record<string, string> = {
  crit: "Crit",
  on_hit: "On-hit",
  onhit: "On-hit",
  bruiser: "Bruiser",
  lethality: "Lethality",
  ap: "AP",
  tank: "Tank",
  utility: "Utility",
};

export function buildLabel(build: string | undefined): string | undefined {
  if (!build) return undefined;
  return BUILD_LABEL[build.toLowerCase()] ?? build.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function nameOf(x: unknown): string | undefined {
  return str(x) ?? str((x as { name?: unknown } | null)?.name);
}

function toCombo(raw: unknown): AugmentCombo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const augs = [r.aug, r.augment, ...(Array.isArray(r.augs) ? r.augs : []), ...(Array.isArray(r.augments) ? r.augments : [])]
    .map(nameOf)
    .filter((x): x is string => !!x);
  const augments = [...new Set(augs)];
  if (!augments.length) return undefined;

  const items = (Array.isArray(r.items) ? r.items : [])
    .map((it) => num(it) ?? num((it as { id?: unknown } | null)?.id))
    .filter((x): x is number => x !== undefined && x > 0);

  const champs = [r.champ, r.champion, ...(Array.isArray(r.champs) ? r.champs : [])].filter((c) => c != null);
  const champions: string[] = [];
  const championNames: string[] = [];
  for (const c of champs) {
    const slug = str((c as { slug?: unknown }).slug) ?? str((c as { id?: unknown }).id) ?? str(c);
    if (!slug) continue;
    champions.push(slug);
    championNames.push(str((c as { name?: unknown }).name) ?? slug);
  }

  const wrRaw = num(r.wr) ?? num(r.winRate);
  const winRate = wrRaw === undefined ? undefined : wrRaw > 1 ? wrRaw / 100 : wrRaw;
  if (winRate !== undefined && (winRate < 0 || winRate > 1)) return undefined;
  const games = num(r.n) ?? num(r.games);
  const lift = num(r.lift);
  const build = str(r.arch) ?? str(r.build);
  const hidden = typeof r.cold === "boolean" ? r.cold : typeof r.hidden === "boolean" ? r.hidden : undefined;
  const rank = num(r.rank);

  const noteBits = [
    buildLabel(build) ? `${buildLabel(build)} build` : undefined,
    lift !== undefined ? `${lift >= 0 ? "+" : ""}${lift.toFixed(1)}% vs. champion average` : undefined,
    hidden ? "hidden gem" : undefined,
  ].filter(Boolean);

  return {
    augments,
    ...(items.length ? { items } : {}),
    ...(champions.length ? { champions, championNames } : {}),
    ...(winRate !== undefined ? { winRate } : {}),
    ...(games !== undefined ? { games } : {}),
    ...(lift !== undefined ? { lift } : {}),
    ...(build ? { build } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
    ...(rank !== undefined ? { rank } : {}),
    ...(noteBits.length ? { note: noteBits.join(" · ") } : {}),
  };
}

/** Parse the God-Tier Combos page. Returns [] if the page has no recognisable combo table. */
export function parseCombos(html: string): AugmentCombo[] {
  if (!html) return [];
  const rsc = decodeRsc(html) || html;
  // Every `"rows":[…]` array on the page; keep the one(s) that look like combo rows.
  const out: AugmentCombo[] = [];
  const re = /"rows":(?=\[)/g;
  for (let m: RegExpExecArray | null; (m = re.exec(rsc)); ) {
    const rows = grabJson<unknown[]>(rsc.slice(m.index), '"rows":');
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const c = toCombo(r);
      if (c) out.push(c);
    }
    if (out.length) break;
  }
  return out;
}

/** Patch the combos were computed on (e.g. "16.22"), if shown. */
export function parseCombosPatch(html: string): string | undefined {
  const rsc = decodeRsc(html) || html;
  return /"Patch"\s*,\s*"\s*"\s*,\s*"(\d+\.\d+)"/.exec(rsc)?.[1] ?? /God-Tier Combos (\d+\.\d+)/.exec(rsc)?.[1];
}
