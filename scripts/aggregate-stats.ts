#!/usr/bin/env node
// Crawl ARAM Mayhem matches from the official Riot Games API and aggregate
// them into a StatsDataset JSON (see src/engine/types.ts).
//
//   RIOT_API_KEY=RGAPI-... npx tsx scripts/aggregate-stats.ts [options]
//
// Riot API only (no third-party sites). Node built-ins only.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { StatsDataset } from "../src/engine/types";
import {
  aggregateMatches,
  DEFAULT_BOOTS_IDS,
  type RiotMatch,
  type RiotTimeline,
} from "./aggregate-core";

const HELP = `Usage: npx tsx scripts/aggregate-stats.ts [options]   (or: npm run stats:aggregate -- [options])

Requires env RIOT_API_KEY (developer or production key from https://developer.riotgames.com).

Options:
  --region <platform>       Platform routing value: na1, euw1, eun1, kr, jp1, br1, la1, la2,
                            oc1, tr1, ru, me1, ph2, sg2, th2, tw2, vn2   (default: na1)
  --matches <n>             Number of matching games to collect           (default: 300)
  --queue <id>              Queue id to keep. 2400 = ARAM Mayhem, 450 = classic ARAM (default: 2400)
  --out <file>              Output JSON path               (default: data/stats/aram-mayhem.json)
  --timelines               Also fetch match timelines (1 extra request per match) for
                            purchase-ordered builds, starters
                            and skill max orders
  --seed-riot-id <Name#TAG> Extra seed player (besides the region's Challenger ladder)
  --boots-ids <ids>         Comma-separated extra item ids to treat as boots (e.g. tier-3 boots)
  --augment-names <file>    JSON {"<augmentId>": "<name>"} merged over CommunityDragon names
  --no-ddragon              Don't use Data Dragon item data to drop components/consumables
  -h, --help                Show this help
`;

// ------------------------------------------------------------ args

const { values: args } = parseArgs({
  options: {
    region: { type: "string", default: "na1" },
    matches: { type: "string", default: "300" },
    queue: { type: "string", default: "2400" },
    out: { type: "string", default: "data/stats/aram-mayhem.json" },
    timelines: { type: "boolean", default: false },
    "seed-riot-id": { type: "string" },
    "boots-ids": { type: "string" },
    "augment-names": { type: "string" },
    "no-ddragon": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (args.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const API_KEY = process.env.RIOT_API_KEY?.trim();
if (!API_KEY) {
  process.stderr.write(
    "error: RIOT_API_KEY is not set.\n" +
      "Get a key at https://developer.riotgames.com (dev keys expire every 24h), then:\n" +
      "  RIOT_API_KEY=RGAPI-xxxx npm run stats:aggregate\n",
  );
  process.exit(1);
}

const PLATFORM = args.region.toLowerCase();
const REGIONAL: Record<string, "americas" | "europe" | "asia" | "sea"> = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe", me1: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};
const regional = REGIONAL[PLATFORM];
if (!regional) die(`unknown --region "${args.region}". Expected one of: ${Object.keys(REGIONAL).join(", ")}`);
// account-v1 is not served on "sea"; asia handles those accounts.
const accountRegional = regional === "sea" ? "asia" : regional;

const TARGET = toInt(args.matches, "--matches");
const QUEUE = toInt(args.queue, "--queue");
const OUT = path.resolve(args.out);
const CACHE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".cache");
const extraBoots = (args["boots-ids"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => toInt(s, "--boots-ids"));

function toInt(v: string, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) die(`${name} must be a non-negative integer, got "${v}"`);
  return n;
}

function die(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

const log = (msg: string) => process.stderr.write(msg + "\n");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ rate limiter

/** Sliding-window limiter: every window must allow another request. */
class RateLimiter {
  private stamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();
  constructor(private readonly windows: Array<{ count: number; ms: number }>) {}

  acquire(): Promise<void> {
    const next = this.chain.then(() => this.waitTurn());
    this.chain = next.catch(() => {});
    return next;
  }

  private async waitTurn(): Promise<void> {
    const maxMs = Math.max(...this.windows.map((w) => w.ms));
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < maxMs);
      let wait = 0;
      for (const w of this.windows) {
        const inWindow = this.stamps.filter((t) => now - t < w.ms);
        if (inWindow.length >= w.count) {
          // Oldest stamp in this window must expire.
          wait = Math.max(wait, inWindow[0] + w.ms - now + 5);
        }
      }
      if (wait <= 0) {
        this.stamps.push(now);
        return;
      }
      if (wait > 2000) log(`  rate limit: waiting ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

// Development key limits: 20 req / 1 s and 100 req / 120 s, per routing host.
const DEV_LIMITS = [
  { count: 20, ms: 1_000 },
  { count: 100, ms: 120_000 },
];
const limiters = new Map<string, RateLimiter>();
function limiterFor(host: string): RateLimiter {
  let l = limiters.get(host);
  if (!l) limiters.set(host, (l = new RateLimiter(DEV_LIMITS)));
  return l;
}

let requestCount = 0;

/** GET a Riot API path on a routing host. Returns null on 404. */
async function riot<T>(host: string, apiPath: string): Promise<T | null> {
  const url = `https://${host}.api.riotgames.com${apiPath}`;
  let serverErrors = 0;
  let throttles = 0;
  for (;;) {
    await limiterFor(host).acquire();
    requestCount++;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "X-Riot-Token": API_KEY! } });
    } catch (err) {
      if (++serverErrors > 3) throw new Error(`network error for ${apiPath}: ${String(err)}`);
      await sleep(1000 * 2 ** serverErrors);
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      die(`Riot API returned ${res.status} for ${apiPath}. The key is invalid or expired (dev keys last 24h).`);
    }
    if (res.status === 429) {
      if (++throttles > 10) throw new Error(`too many 429s for ${apiPath}`);
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitS = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10;
      log(`  429 (${res.headers.get("x-rate-limit-type") ?? "unknown"}): retrying in ${waitS}s`);
      await sleep(waitS * 1000);
      continue;
    }
    if (res.status >= 500) {
      if (++serverErrors > 3) throw new Error(`HTTP ${res.status} for ${apiPath} after 3 retries`);
      await sleep(1000 * 2 ** serverErrors);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${apiPath}: ${(await res.text()).slice(0, 200)}`);
  }
}

// ------------------------------------------------------------ cache

async function cached<T>(file: string, load: () => Promise<T | null>): Promise<T | null> {
  const p = path.join(CACHE_DIR, file);
  if (existsSync(p)) {
    try {
      return JSON.parse(await readFile(p, "utf8")) as T;
    } catch {
      /* corrupt cache entry: refetch */
    }
  }
  const data = await load();
  if (data != null) await writeAtomic(p, JSON.stringify(data));
  return data;
}

async function writeAtomic(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
}

// ------------------------------------------------------------ static data (non-Riot-API, public CDNs)

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function loadAugmentNames(): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const cd = await fetchJson<{ augments?: Array<{ id: number; name: string }> }>(
    "https://raw.communitydragon.org/latest/cdragon/arena/en_us.json",
  );
  for (const a of cd?.augments ?? []) if (a?.id != null && a.name) names.set(Number(a.id), a.name);
  if (!cd) log("warning: could not load CommunityDragon augment names; unknown ids will be stored as #<id>");
  const file = args["augment-names"];
  if (file) {
    const extra = JSON.parse(await readFile(file, "utf8")) as Record<string, string>;
    for (const [id, name] of Object.entries(extra)) names.set(Number(id), name);
  }
  log(`augment names: ${names.size}`);
  return names;
}

interface DDragonItem {
  into?: string[];
  tags?: string[];
  gold?: { total?: number };
}

/** Item filter + boots ids from Data Dragon (latest version). */
async function loadItemData(): Promise<{ isCompleted?: (id: number) => boolean; boots: number[] }> {
  if (args["no-ddragon"]) return { boots: [] };
  const versions = await fetchJson<string[]>("https://ddragon.leagueoflegends.com/api/versions.json");
  const v = versions?.[0];
  const data = v
    ? await fetchJson<{ data: Record<string, DDragonItem> }>(
        `https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/item.json`,
      )
    : null;
  if (!data) {
    log("warning: Data Dragon unavailable; counting every final-inventory item as completed");
    return { boots: [] };
  }
  const items = data.data;
  const boots = Object.entries(items)
    .filter(([, it]) => it.tags?.includes("Boots"))
    .map(([id]) => Number(id));
  // Unknown ids (e.g. mode-specific items) are kept rather than dropped.
  const isCompleted = (id: number): boolean => {
    const it = items[String(id)];
    if (!it) return true;
    if (it.tags?.some((t) => t === "Consumable" || t === "Trinket")) return false;
    if (it.into && it.into.length > 0) return false; // builds into something -> component
    return (it.gold?.total ?? 0) >= 1000;
  };
  log(`item data: Data Dragon ${v}`);
  return { isCompleted, boots };
}

// ------------------------------------------------------------ crawl

interface LeagueList {
  entries: Array<{ puuid?: string }>;
}

async function seedPuuids(): Promise<string[]> {
  const seeds: string[] = [];
  const riotId = args["seed-riot-id"];
  if (riotId) {
    const [name, tag] = riotId.split("#");
    if (!name || !tag) die(`--seed-riot-id must look like "Name#TAG", got "${riotId}"`);
    const acc = await riot<{ puuid: string }>(
      accountRegional,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
    );
    if (acc) seeds.push(acc.puuid);
    else log(`warning: Riot ID ${riotId} not found`);
  }
  const league = await riot<LeagueList>(PLATFORM, "/lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5");
  const ladder = (league?.entries ?? []).map((e) => e.puuid).filter((p): p is string => !!p);
  // Shuffle so repeated runs don't always start from the same players.
  for (let i = ladder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ladder[i], ladder[j]] = [ladder[j], ladder[i]];
  }
  seeds.push(...ladder);
  log(`seeds: ${seeds.length} players`);
  return seeds;
}

async function crawl(): Promise<{ matches: RiotMatch[]; timelines: Map<string, RiotTimeline> }> {
  const queue = await seedPuuids();
  if (!queue.length) die("no seed players found (try --seed-riot-id)");
  const seenPuuids = new Set(queue);
  const seenMatches = new Set<string>();
  const matches: RiotMatch[] = [];
  const timelines = new Map<string, RiotTimeline>();
  let playersVisited = 0;

  while (queue.length && matches.length < TARGET) {
    const puuid = queue.shift()!;
    playersVisited++;
    const ids =
      (await riot<string[]>(
        regional,
        `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?queue=${QUEUE}&count=20`,
      )) ?? [];
    for (const id of ids) {
      if (matches.length >= TARGET) break;
      if (seenMatches.has(id)) continue;
      seenMatches.add(id);
      const m = await cached<RiotMatch>(`${id}.json`, () =>
        riot<RiotMatch>(regional, `/lol/match/v5/matches/${encodeURIComponent(id)}`),
      );
      if (!m?.info || m.info.queueId !== QUEUE) continue;
      matches.push(m);
      if (args.timelines) {
        const tl = await cached<RiotTimeline>(`${id}.timeline.json`, () =>
          riot<RiotTimeline>(regional, `/lol/match/v5/matches/${encodeURIComponent(id)}/timeline`),
        );
        if (tl) timelines.set(id, tl);
      }
      for (const p of m.metadata.participants ?? []) {
        if (!seenPuuids.has(p)) {
          seenPuuids.add(p);
          queue.push(p);
        }
      }
      if (matches.length % 10 === 0 || matches.length === TARGET) {
        log(
          `  matches ${matches.length}/${TARGET}  players visited ${playersVisited}  queued ${queue.length}  requests ${requestCount}`,
        );
      }
    }
  }
  if (matches.length < TARGET) log(`warning: ran out of players after ${matches.length} matches`);
  return { matches, timelines };
}

// ------------------------------------------------------------ main

async function main(): Promise<void> {
  log(`region ${PLATFORM} (${regional})  queue ${QUEUE}  target ${TARGET} matches${args.timelines ? "  +timelines" : ""}`);
  const [augmentNames, itemData] = await Promise.all([loadAugmentNames(), loadItemData()]);
  const { matches, timelines } = await crawl();
  if (!matches.length) die(`no matches found for queue ${QUEUE}; nothing written`);

  const dataset: StatsDataset = aggregateMatches(matches, timelines, augmentNames, {
    queueId: QUEUE,
    bootsIds: [...DEFAULT_BOOTS_IDS, ...itemData.boots, ...extraBoots],
    isCompletedItem: itemData.isCompleted,
  });
  await writeAtomic(OUT, JSON.stringify(dataset, null, 2) + "\n");
  log(
    `wrote ${path.relative(process.cwd(), OUT)}: ${dataset.totalGames} games, ` +
      `${Object.keys(dataset.champions).length} champions, patch ${dataset.patch}, ${requestCount} API requests`,
  );
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
