// OP.GG — public per-summoner profile data, used to scout the 10 players on the loading screen.
//
// Primary source: `https://op.gg/lol/summoners/<region>/<Name-TAG>/ai.json`, a compact,
// machine-readable snapshot (rank entries, most-played champions, last ~10 games).
// Fallback: the HTML profile page, which carries the same snapshot as schema.org JSON-LD
// (recent games) plus a `<meta name="description">` line (main rank + top 5 champions).
//
// Everything here is pure (no I/O) except `loadProfile`, which takes the fetcher as an argument
// so the desktop app can route it through its native HTTP + cache layer.

export const OPGG = "https://op.gg";

// ---------------------------------------------------------------- regions

const PLATFORM_TO_REGION: Record<string, string> = {
  NA1: "na",
  NA: "na",
  EUW1: "euw",
  EUW: "euw",
  EUN1: "eune",
  EUNE: "eune",
  OC1: "oce",
  OCE: "oce",
  KR: "kr",
  KR1: "kr",
  JP1: "jp",
  JP: "jp",
  BR1: "br",
  BR: "br",
  LA1: "lan",
  LAN: "lan",
  LA2: "las",
  LAS: "las",
  RU: "ru",
  RU1: "ru",
  TR1: "tr",
  TR: "tr",
  ME1: "me",
  ME: "me",
  SG2: "sea",
  PH2: "sea",
  TH2: "sea",
  SEA: "sea",
  SG: "sea",
  PH: "sea",
  TH: "sea",
  TW2: "tw",
  TW: "tw",
  VN2: "vn",
  VN: "vn",
};

/** OP.GG region slug ("na", "euw", …) for a Riot platform id ("NA1", "EUW1", "LA2", …) or region name ("EUW"). */
export function opggRegionFromPlatform(id: string): string | undefined {
  const k = (id ?? "").trim().toUpperCase().replace(/[\s_-]/g, "");
  return k ? PLATFORM_TO_REGION[k] : undefined;
}

// ---------------------------------------------------------------- URLs

/** Split "Name#TAG" (also accepts "Name-TAG" when there is no '#'). */
export function splitRiotId(riotId: string): { name: string; tag: string } | undefined {
  const s = (riotId ?? "").trim();
  let i = s.lastIndexOf("#");
  if (i < 0) i = s.lastIndexOf("-");
  if (i <= 0 || i === s.length - 1) return undefined;
  return { name: s.slice(0, i).trim(), tag: s.slice(i + 1).trim() };
}

/** The path segment OP.GG uses for a Riot ID: URL-encoded "GameName-TAG" (spaces → %20). */
export function profileSlug(riotId: string): string {
  const id = splitRiotId(riotId);
  if (!id) return encodeURIComponent(riotId.trim());
  return `${encodeURIComponent(id.name)}-${encodeURIComponent(id.tag)}`;
}

export function profileUrl(riotId: string, region: string): string {
  const r = opggRegionFromPlatform(region) ?? region.toLowerCase();
  return `${OPGG}/lol/summoners/${r}/${profileSlug(riotId)}`;
}

export function profileJsonUrl(riotId: string, region: string): string {
  return `${profileUrl(riotId, region)}/ai.json`;
}

// ---------------------------------------------------------------- model

export interface RankEntry {
  /** OP.GG queue type: SOLORANKED, FLEXRANKED, RANKED5S, … */
  queue: string;
  /** Title-cased tier: "Iron" … "Challenger". */
  tier: string;
  /** 1–4 (omitted for apex tiers). */
  division?: number;
  lp?: number;
  wins: number;
  losses: number;
  /** 0–100. */
  winRate: number;
}

export type GameResult = "WIN" | "LOSE" | "REMAKE";

export interface RecentGame {
  result: GameResult;
  champion: string;
  championKey: string;
  kills: number;
  deaths: number;
  assists: number;
  /** OP.GG queue type (SOLORANKED, ARAM, ARAM_MAYHEM, NORMAL, …). */
  queue: string;
  queueName?: string;
  /** TOP / JUNGLE / MID / ADC / SUPPORT (Summoner's Rift only). */
  position?: string;
  cs?: number;
  opScore?: number;
  opScoreRank?: number;
  /** ISO timestamp. */
  playedAt?: string;
}

export interface ChampionRecord {
  name: string;
  key: string;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayerProfile {
  riotId: string;
  level?: number;
  region?: string;
  /** Main entry (Solo/Duo, else Flex, else the first ranked queue). */
  rank?: RankEntry;
  ranks: RankEntry[];
  ladderRank?: number;
  /** Newest first. */
  recent: RecentGame[];
  /** Most-played champions (OP.GG: season totals when `topChampionsSource` is "most-champion-stats"). */
  topChampions: ChampionRecord[];
  topChampionsSource?: string;
  profileIcon?: string;
  /** When OP.GG last refreshed the summoner (ISO). */
  updatedAt?: string;
  /** Latest match OP.GG knows about (ISO). */
  latestGameAt?: string;
  source: "json" | "html";
}

// ---------------------------------------------------------------- parsing helpers

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(/,/g, "")))) return Number(v.replace(/,/g, ""));
  return undefined;
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const TIERS = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"];
const APEX = new Set(["master", "grandmaster", "challenger"]);

export function isApexTier(tier: string): boolean {
  return APEX.has(tier.toLowerCase());
}

/** "diamond 2" / "DIAMOND" / "Diamond" → "Diamond" (+ division parsed from the tier string if present). */
function normTier(raw: string): { tier: string; division?: number } | undefined {
  const m = /^([a-z]+)\s*([1-4]|i{1,3}|iv)?$/i.exec(raw.trim());
  if (!m) return undefined;
  const t = m[1].toLowerCase();
  if (!TIERS.includes(t)) return undefined;
  const romans: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
  const d = m[2] ? (num(m[2]) ?? romans[m[2].toLowerCase()]) : undefined;
  return { tier: t[0].toUpperCase() + t.slice(1), division: d };
}

function champKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseRankEntry(v: unknown): RankEntry | undefined {
  if (!isObj(v)) return undefined;
  const t = str(v.tier) && normTier(str(v.tier)!);
  if (!t) return undefined;
  const wins = num(v.wins) ?? 0;
  const losses = num(v.losses) ?? 0;
  const division = isApexTier(t.tier) ? undefined : (num(v.division) ?? t.division);
  return {
    queue: str(v.queueType)?.toUpperCase() ?? "SOLORANKED",
    tier: t.tier,
    division,
    lp: num(v.lp),
    wins,
    losses,
    winRate: num(v.winRate) ?? (wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0),
  };
}

function parseResult(v: unknown): GameResult | undefined {
  const s = str(v)?.toUpperCase();
  if (s === "WIN" || s === "VICTORY") return "WIN";
  if (s === "LOSE" || s === "LOSS" || s === "DEFEAT") return "LOSE";
  if (s && /REMAKE|EARLY|DRAW/.test(s)) return "REMAKE";
  return undefined;
}

function parseGame(v: unknown): RecentGame | undefined {
  if (!isObj(v)) return undefined;
  const champion = str(v.champion);
  const result = parseResult(v.result);
  if (!champion || !result) return undefined;
  return {
    result,
    champion,
    championKey: str(v.championKey) ?? champKey(champion),
    kills: num(v.kills) ?? 0,
    deaths: num(v.deaths) ?? 0,
    assists: num(v.assists) ?? 0,
    queue: str(v.queueType)?.toUpperCase() ?? "UNKNOWN",
    queueName: str(v.queueName),
    position: str(v.position)?.toUpperCase(),
    cs: num(v.cs),
    opScore: num(v.opScore),
    opScoreRank: num(v.opScoreRank),
    playedAt: str(v.playedAt),
  };
}

function parseChamp(v: unknown): ChampionRecord | undefined {
  if (!isObj(v)) return undefined;
  const name = str(v.name);
  if (!name) return undefined;
  const wins = num(v.wins) ?? 0;
  const losses = num(v.losses) ?? 0;
  return {
    name,
    key: str(v.key) ?? champKey(name),
    wins,
    losses,
    winRate: num(v.winRate) ?? (wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0),
  };
}

const QUEUE_PRIORITY = ["SOLORANKED", "FLEXRANKED"];
function mainRank(ranks: RankEntry[]): RankEntry | undefined {
  for (const q of QUEUE_PRIORITY) {
    const r = ranks.find((x) => x.queue === q);
    if (r) return r;
  }
  return ranks[0];
}

const time = (iso?: string) => (iso ? Date.parse(iso) : NaN);
function newestFirst(games: RecentGame[]): RecentGame[] {
  return games
    .map((g, i) => ({ g, i, t: time(g.playedAt) }))
    .sort((a, b) => (Number.isNaN(a.t) || Number.isNaN(b.t) ? a.i - b.i : b.t - a.t))
    .map((x) => x.g);
}

// ---------------------------------------------------------------- ai.json

/** Parse an OP.GG `ai.json` response. Returns undefined for errors / unknown shapes. */
export function parseProfileJson(json: unknown): PlayerProfile | undefined {
  let j = json;
  if (typeof j === "string") {
    try {
      j = JSON.parse(j);
    } catch {
      return undefined;
    }
  }
  if (!isObj(j) || "error" in j) return undefined;
  const identity = isObj(j.identity) ? j.identity : {};
  const riotId =
    str(identity.riotId) ??
    (str(identity.gameName) && str(identity.tagline) ? `${str(identity.gameName)}#${str(identity.tagline)}` : undefined);
  if (!riotId) return undefined;
  const rankObj = isObj(j.rank) ? j.rank : {};
  const ranks = arr(rankObj.entries).map(parseRankEntry).filter((x): x is RankEntry => !!x);
  const fresh = isObj(j.freshness) ? j.freshness : {};
  const ctx = isObj(j.context) ? j.context : {};
  return {
    riotId,
    level: num(identity.level),
    region: str(ctx.region),
    rank: mainRank(ranks),
    ranks,
    ladderRank: num(rankObj.ladderRank),
    recent: newestFirst(arr(j.recentGames).map(parseGame).filter((x): x is RecentGame => !!x)),
    topChampions: arr(j.recentChampions).map(parseChamp).filter((x): x is ChampionRecord => !!x),
    topChampionsSource: str(j.recentChampionsSource),
    profileIcon: str(identity.profileImageUrl),
    updatedAt: str(fresh.summonerUpdatedAt),
    latestGameAt: str(fresh.latestGameAt) ?? str(fresh.latestGamePlayedAt),
    source: "json",
  };
}

// ---------------------------------------------------------------- HTML fallback

function unescapeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Parse the profile page's meta description, e.g.
 *   "Name#TAG / Master 1,525 LP / 906Win 869Lose Win rate 51% / Sion - 210Win 160Lose Win rate 57%, …"
 *   "Name#TAG / Diamond 2 75 LP / …"   ·   "Name#TAG / Lv. 521" (unranked)
 */
export function parseProfileDescription(desc: string): Pick<PlayerProfile, "riotId" | "level" | "rank" | "topChampions"> | undefined {
  const parts = desc.split(" / ").map((p) => p.trim());
  const riotId = parts[0];
  if (!riotId || !riotId.includes("#")) return undefined;
  let level: number | undefined;
  let rank: RankEntry | undefined;
  let topChampions: ChampionRecord[] = [];
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const lv = /^Lv\.\s*(\d+)$/i.exec(p);
    if (lv) {
      level = Number(lv[1]);
      continue;
    }
    const rk = /^([A-Za-z]+)(?:\s+([1-4]))?\s+([\d,]+)\s*LP$/i.exec(p);
    if (rk) {
      const t = normTier(rk[1]);
      if (t) rank = { queue: "SOLORANKED", tier: t.tier, division: isApexTier(t.tier) ? undefined : num(rk[2]), lp: num(rk[3]), wins: 0, losses: 0, winRate: 0 };
      continue;
    }
    const wl = /^(\d[\d,]*)\s*Win\s+(\d[\d,]*)\s*Lose\s+Win rate\s+(\d+)%$/i.exec(p);
    if (wl && rank) {
      rank.wins = num(wl[1]) ?? 0;
      rank.losses = num(wl[2]) ?? 0;
      rank.winRate = num(wl[3]) ?? 0;
      continue;
    }
    const champs = [...p.matchAll(/(?:^|,\s*)(.+?)\s+-\s+(\d[\d,]*)Win\s+(\d[\d,]*)Lose\s+Win rate\s+(\d+)%/g)];
    if (champs.length) {
      topChampions = champs.map((m) => ({ name: m[1], key: champKey(m[1]), wins: num(m[2]) ?? 0, losses: num(m[3]) ?? 0, winRate: num(m[4]) ?? 0 }));
    }
  }
  return { riotId, level, rank, topChampions };
}

function ldGames(ld: unknown): RecentGame[] {
  const graph = isObj(ld) ? arr(ld["@graph"]) : arr(ld);
  const list = graph.find((n) => isObj(n) && n["@type"] === "ItemList" && /recent-games/.test(String(n["@id"] ?? "")));
  if (!isObj(list)) return [];
  const out: RecentGame[] = [];
  for (const el of arr(list.itemListElement)) {
    const item = isObj(el) && isObj(el.item) ? el.item : undefined;
    if (!item) continue;
    const qn = /\s-\s(.+)$/.exec(String(item.name ?? ""));
    const props: Obj = { playedAt: item.startTime, queueName: qn?.[1] };
    for (const p of arr(item.additionalProperty)) if (isObj(p) && typeof p.name === "string") props[p.name] = p.value;
    const g = parseGame(props);
    if (g) out.push(g);
  }
  return out;
}

/** Fallback: read what we can from the HTML profile page (JSON-LD recent games + meta description). */
export function parseProfileHtml(html: string): PlayerProfile | undefined {
  const meta = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html);
  const head = meta ? parseProfileDescription(unescapeHtml(meta[1])) : undefined;
  let recent: RecentGame[] = [];
  let updatedAt: string | undefined;
  let profileIcon: string | undefined;
  let riotId = head?.riotId;
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let ld: unknown;
    try {
      ld = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const games = ldGames(ld);
    if (games.length) recent = games;
    for (const n of isObj(ld) ? arr(ld["@graph"]) : []) {
      if (!isObj(n)) continue;
      if (n["@type"] === "ProfilePage") updatedAt ??= str(n.dateModified);
      if (n["@type"] === "Person") {
        riotId ??= str(n.name);
        profileIcon ??= str(n.image);
      }
    }
  }
  if (!riotId || (!head && !recent.length)) return undefined;
  const ranks = head?.rank ? [head.rank] : [];
  const sorted = newestFirst(recent);
  return {
    riotId,
    level: head?.level,
    rank: ranks[0],
    ranks,
    recent: sorted,
    topChampions: head?.topChampions ?? [],
    topChampionsSource: head?.topChampions.length ? "most-champion-stats" : undefined,
    profileIcon,
    updatedAt,
    latestGameAt: sorted[0]?.playedAt,
    source: "html",
  };
}

/**
 * Fetch + parse one profile: ai.json first, the HTML page as fallback.
 * `get` should throw on HTTP errors (404 = unknown summoner / no snapshot). Returns undefined
 * when neither source yields data.
 */
export async function loadProfile(riotId: string, region: string, get: (url: string) => Promise<string>): Promise<PlayerProfile | undefined> {
  try {
    const p = parseProfileJson(await get(profileJsonUrl(riotId, region)));
    if (p) return p;
  } catch {
    /* fall through to the HTML page */
  }
  try {
    return parseProfileHtml(await get(profileUrl(riotId, region)));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- summary

const ROMAN = ["", "I", "II", "III", "IV"];
const POSITION_LABEL: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bot", BOTTOM: "Bot", SUPPORT: "Support", UTILITY: "Support" };

export function positionLabel(p?: string): string | undefined {
  return p ? (POSITION_LABEL[p.toUpperCase()] ?? p[0].toUpperCase() + p.slice(1).toLowerCase()) : undefined;
}

/** "Master · 831 LP", "Diamond II · 75 LP", "Gold IV". */
export function rankLabel(r?: RankEntry): string {
  if (!r) return "Unranked";
  const div = r.division && !isApexTier(r.tier) ? ` ${ROMAN[r.division] ?? r.division}` : "";
  return `${r.tier}${div}${r.lp !== undefined ? ` · ${r.lp.toLocaleString("en-US")} LP` : ""}`;
}

/** Games on one champion, from the most-played list (season) or else the recent games. */
export interface ChampionExperience {
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  /** "season" = OP.GG most-played list, "recent" = last N games only. */
  source: "season" | "recent";
  /** Games on it within the recent sample. */
  recentGames: number;
  /** Position in the most-played list (0-based), if listed. */
  topIndex?: number;
}

function sameChamp(a: { key?: string; name?: string }, b: { id: string; name: string }): boolean {
  const k = champKey(a.key ?? a.name ?? "");
  return k === champKey(b.id) || k === champKey(b.name);
}

export function championExperience(profile: PlayerProfile, champ: { id: string; name: string }): ChampionExperience {
  const rec = profile.recent.filter((g) => g.result !== "REMAKE" && sameChamp({ key: g.championKey, name: g.champion }, champ));
  const rw = rec.filter((g) => g.result === "WIN").length;
  const idx = profile.topChampions.findIndex((c) => sameChamp(c, champ));
  const top = idx >= 0 ? profile.topChampions[idx] : undefined;
  if (top && top.wins + top.losses >= rec.length) {
    return { games: top.wins + top.losses, wins: top.wins, losses: top.losses, winRate: top.winRate, source: "season", recentGames: rec.length, topIndex: idx };
  }
  return {
    games: rec.length,
    wins: rw,
    losses: rec.length - rw,
    winRate: rec.length ? Math.round((rw / rec.length) * 100) : 0,
    source: "recent",
    recentGames: rec.length,
    topIndex: idx >= 0 ? idx : undefined,
  };
}

export interface ProfileSummary {
  /** "Master · 831 LP" / "Unranked". */
  rank: string;
  /** Lower-case tier for styling ("master"), undefined when unranked. */
  tier?: string;
  /** Ranked season record for the main queue. */
  seasonWinRate?: number;
  seasonGames: number;
  seasonRecord?: string;
  /** Recent games (remakes excluded), newest first. */
  form: GameResult[];
  recentWins: number;
  recentLosses: number;
  /** "7W 3L". */
  recentRecord: string;
  recentWinRate?: number;
  /** Average K / D / A over recent games. */
  avg?: { kills: number; deaths: number; assists: number; kda: number };
  avgOpScore?: number;
  /** Most common position in recent games (≥ 50% of games with a position). */
  mainRole?: string;
  champion?: ChampionExperience;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function summarizeProfile(profile: PlayerProfile, playingChampion?: { id: string; name: string }): ProfileSummary {
  const r = profile.rank;
  const games = profile.recent.filter((g) => g.result !== "REMAKE");
  const wins = games.filter((g) => g.result === "WIN").length;
  const losses = games.length - wins;
  let avg: ProfileSummary["avg"];
  if (games.length) {
    const k = games.reduce((s, g) => s + g.kills, 0);
    const d = games.reduce((s, g) => s + g.deaths, 0);
    const a = games.reduce((s, g) => s + g.assists, 0);
    avg = { kills: round1(k / games.length), deaths: round1(d / games.length), assists: round1(a / games.length), kda: round1((k + a) / Math.max(1, d)) };
  }
  const ops = games.map((g) => g.opScore).filter((x): x is number => typeof x === "number" && x > 0);
  const posCount = new Map<string, number>();
  for (const g of games) if (g.position) posCount.set(g.position, (posCount.get(g.position) ?? 0) + 1);
  const withPos = [...posCount.values()].reduce((s, n) => s + n, 0);
  const topPos = [...posCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    rank: rankLabel(r),
    tier: r?.tier.toLowerCase(),
    seasonWinRate: r && r.wins + r.losses ? r.winRate : undefined,
    seasonGames: r ? r.wins + r.losses : 0,
    seasonRecord: r && r.wins + r.losses ? `${r.wins}W ${r.losses}L` : undefined,
    form: games.map((g) => g.result),
    recentWins: wins,
    recentLosses: losses,
    recentRecord: `${wins}W ${losses}L`,
    recentWinRate: games.length ? Math.round((wins / games.length) * 100) : undefined,
    avg,
    avgOpScore: ops.length ? round1(ops.reduce((s, x) => s + x, 0) / ops.length) : undefined,
    mainRole: topPos && withPos >= 3 && topPos[1] / withPos >= 0.5 ? topPos[0] : undefined,
    champion: playingChampion ? championExperience(profile, playingChampion) : undefined,
  };
}

// ---------------------------------------------------------------- tags

export type ScoutTone = "good" | "bad" | "warn" | "info";
export interface ScoutTag {
  label: string;
  tone: ScoutTone;
  /** One-sentence explanation of what the tag is based on (tooltip). */
  detail: string;
}

export interface ScoutOptions {
  /** Position the player is in this game (TOP/JUNGLE/MID/ADC/SUPPORT), for the off-role tag. */
  position?: string;
  /** "Now" in ms (tests). */
  now?: number;
}

const isAram = (q?: string) => !!q && /ARAM/i.test(q);
const DAY = 86_400_000;

/**
 * Quick, honest scouting tags from the profile. Only states what the data supports: e.g. we
 * know average deaths per game, but not *when* they die (no timeline), so no "dies early".
 * Ordered most-important first.
 */
export function scoutTags(profile: PlayerProfile, playingChampion?: { id: string; name: string }, gameModeQueue?: string, opts: ScoutOptions = {}): ScoutTag[] {
  const tags: Array<ScoutTag & { w: number }> = [];
  const add = (w: number, tone: ScoutTone, label: string, detail: string) => tags.push({ w, tone, label, detail });

  const all = profile.recent.filter((g) => g.result !== "REMAKE");
  // Compare like with like: ARAM games are far bloodier than Summoner's Rift.
  const modeAram = gameModeQueue ? isAram(gameModeQueue) : undefined;
  const same = modeAram === undefined ? all : all.filter((g) => isAram(g.queue) === modeAram);
  const games = same.length >= 5 ? same : all;
  const scope = games === same && modeAram !== undefined && same.length !== all.length ? (modeAram ? " ARAM" : " Summoner's Rift") : "";
  const n = games.length;
  const s = summarizeProfile({ ...profile, recent: games }, playingChampion);

  // ---- deaths / KDA
  if (n >= 4 && s.avg) {
    const aramShare = games.filter((g) => isAram(g.queue)).length / n;
    const bump = 3 * aramShare; // ARAM averages ~3 more deaths than SR
    const d = s.avg.deaths;
    const detail = `Averages ${d} deaths per game over their last ${n}${scope} games (${s.avg.kills}/${d}/${s.avg.assists}).`;
    if (d >= 8 + bump) add(90, "bad", "Dies a lot", detail);
    else if (d >= 6 + bump) add(60, "warn", "Dies often", detail);
    else if (d <= 3.5 + bump * 0.8 && s.avg.kda >= 3) add(45, "good", "Plays safe", detail);
    if (s.avg.kda >= 4.5) add(55, "good", "High KDA", `${s.avg.kda} KDA over their last ${n}${scope} games.`);
    else if (s.avg.kda < 1.6 && d < 8 + bump) add(50, "warn", "Low KDA", `${s.avg.kda} KDA over their last ${n}${scope} games.`);
  }

  // ---- streaks (all queues, newest first)
  const first = all[0]?.result;
  let streak = 0;
  for (const g of all) {
    if (g.result !== first) break;
    streak++;
  }
  if (streak >= 3 && first === "LOSE") add(85, "bad", "Loss streak", `Lost their last ${streak} games.`);
  if (streak >= 3 && first === "WIN") add(80, "good", "Hot streak", `Won their last ${streak} games.`);
  if (streak < 3 && all.length >= 8) {
    const recWr = Math.round((all.filter((g) => g.result === "WIN").length / all.length) * 100);
    if (recWr >= 75) add(58, "good", "In form", `Won ${recWr}% of their last ${all.length} games.`);
    else if (recWr <= 25) add(58, "bad", "Struggling", `Won only ${recWr}% of their last ${all.length} games.`);
  }

  // ---- champion pool
  const counts = new Map<string, { name: string; key: string; n: number }>();
  for (const g of all) {
    const c = counts.get(g.championKey) ?? { name: g.champion, key: g.championKey, n: 0 };
    c.n++;
    counts.set(g.championKey, c);
  }
  const topRecent = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  const tc = profile.topChampions;
  const tcTotal = tc.reduce((s2, c) => s2 + c.wins + c.losses, 0);
  let otp: { name: string; key: string; detail: string } | undefined;
  if (topRecent && all.length >= 6 && topRecent.n / all.length >= 0.5) {
    otp = { name: topRecent.name, key: topRecent.key, detail: `${topRecent.name} in ${topRecent.n} of their last ${all.length} games` };
  } else if (tc[0] && tcTotal >= 30 && (tc[0].wins + tc[0].losses) / tcTotal >= 0.5) {
    const g = tc[0].wins + tc[0].losses;
    otp = { name: tc[0].name, key: tc[0].key, detail: `${tc[0].name} is ${Math.round((g / tcTotal) * 100)}% of their most-played games (${g} games, ${tc[0].winRate}% WR)` };
  }
  const onOtp = !!(otp && playingChampion && sameChamp({ key: otp.key, name: otp.name }, playingChampion));
  if (otp) {
    if (!playingChampion || onOtp) add(75, onOtp ? "warn" : "info", "One-trick", `${otp.detail}.`);
    else add(62, "info", `One-trick ${otp.name}`, `${otp.detail} — not playing it this game.`);
  }

  if (playingChampion && s.champion) {
    const c = s.champion;
    const nm = playingChampion.name;
    const sample = `their last ${all.length} games`;
    const listed = tc.length ? ` or their ${tc.length} most-played champions` : "";
    if (c.games === 0 && all.length >= 8) {
      add(88, isAram(gameModeQueue) ? "info" : "bad", `First time on ${nm}?`, `No ${nm} games in ${sample}${listed}. They may still have older games on it.`);
    } else if (c.games > 0 && c.games <= 2 && c.topIndex === undefined) {
      add(70, isAram(gameModeQueue) ? "info" : "warn", `New to ${nm}`, `Only ${c.games} ${nm} game${c.games > 1 ? "s" : ""} in ${sample}${listed}.`);
    } else if (!onOtp && c.source === "season" && c.games >= 20) {
      const strong = c.winRate >= 55;
      add(strong ? 72 : 52, strong ? "warn" : "info", strong ? `Strong ${nm}` : `${nm} main`, `${c.games} games on ${nm} this season, ${c.winRate}% win rate${c.topIndex === 0 ? " (most played)" : ""}.`);
    }
  }

  // ---- role
  if (s.mainRole && opts.position) {
    const cur = opts.position.toUpperCase().replace("BOTTOM", "ADC").replace("UTILITY", "SUPPORT");
    if (cur !== s.mainRole) add(65, "warn", "Off-role", `Usually plays ${positionLabel(s.mainRole)} recently; ${positionLabel(cur)} this game.`);
  }

  // ---- OP score
  if (s.avgOpScore !== undefined && n >= 5) {
    if (s.avgOpScore >= 7) add(50, "good", "High OP Score", `Average OP Score ${s.avgOpScore} over their last ${n}${scope} games.`);
    else if (s.avgOpScore <= 4.5) add(40, "warn", "Low OP Score", `Average OP Score ${s.avgOpScore} over their last ${n}${scope} games.`);
  }

  // ---- ranked record & account
  const r = profile.rank;
  const rg = r ? r.wins + r.losses : 0;
  const lowLevel = profile.level !== undefined && profile.level < 100;
  if (r && rg >= 20 && r.winRate >= 65 && (lowLevel || profile.level === undefined)) {
    add(78, "warn", "Smurf?", `${r.winRate}% win rate over ${rg} ranked games${profile.level !== undefined ? ` at level ${profile.level}` : ""}.`);
  } else if (r && rg >= 50 && r.winRate >= 60) {
    add(48, "good", "High win rate", `${r.winRate}% in ${rg} ${r.queue === "FLEXRANKED" ? "Flex" : "Solo/Duo"} games this season.`);
  } else if (r && rg >= 50 && r.winRate <= 44) {
    add(42, "bad", "Low win rate", `${r.winRate}% in ${rg} ${r.queue === "FLEXRANKED" ? "Flex" : "Solo/Duo"} games this season.`);
  }
  if (profile.level !== undefined && profile.level < 30) add(46, "info", "New account", `Summoner level ${profile.level}.`);

  // ---- activity
  const latest = time(profile.latestGameAt ?? all[0]?.playedAt);
  const now = opts.now ?? Date.now();
  if (!Number.isNaN(latest)) {
    const days = Math.floor((now - latest) / DAY);
    if (days > 30) add(56, "warn", "Inactive", `Last game OP.GG knows of was ${days} days ago — may be rusty (or OP.GG is out of date).`);
  } else if (!all.length) {
    add(30, "info", "No recent games", "OP.GG has no recent matches for this player.");
  }

  return tags.sort((a, b) => b.w - a.w).map(({ w: _w, ...t }) => t);
}
