// Daily health check of the stats sites Nexis reads (run by .github/workflows/sources.yml):
// fetches a few real pages and runs the app's own parsers on them. Fails (and GitHub emails the
// repo owner) when a site changes its page format so builds would silently stop loading — like
// OP.GG writing "games" instead of "Games" in Nov 2026.
//
//   npx tsx scripts/check-sources.ts
import { parseArenaChampionPage } from "../src/engine/sources/arena";
import { parseChampionPage } from "../src/engine/sources/hexmayhem";
import { mergeOpggChampion, parseOpggChampionPage, parseOpggSynergies } from "../src/engine/sources/opgg";

const UA = "NexisOverlay/0.1 (+open-source)";
/** The site couldn't be reached (blocked, rate-limited, down): not a format change, so it only warns. */
class Unreachable extends Error {}
const get = async (url: string) => {
  let r: Response;
  try {
    r = await fetch(url, { headers: { "User-Agent": UA } });
  } catch (e) {
    throw new Unreachable(`network error for ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (r.status === 403 || r.status === 429 || r.status >= 500) throw new Unreachable(`HTTP ${r.status} for ${url}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
};

interface Check {
  name: string;
  run: () => Promise<string>; // returns a short summary; throws on failure
}

const need = (ok: boolean, what: string) => {
  if (!ok) throw new Error(what);
};

const checks: Check[] = [
  {
    name: "OP.GG Summoner's Rift (Ahri mid)",
    run: async () => {
      const pages = await Promise.all(["build", "items", "runes"].map((p) => get(`https://op.gg/lol/champions/ahri/${p}/mid`).then(parseOpggChampionPage)));
      const m = mergeOpggChampion(...pages);
      need(!!m && (m.games ?? 0) > 0, "no games");
      need(m!.coreBuilds.length > 0, "no core builds");
      need(m!.boots.length > 0, "no boots");
      need(m!.runes.length > 0, "no rune pages");
      need(m!.spells.length > 0, "no summoner spells");
      return `${m!.coreBuilds.length} core builds, ${m!.boots.length} boots, ${m!.runes.length} rune pages, ${m!.spells.length} spell pairs`;
    },
  },
  {
    name: "OP.GG ARAM (Jinx)",
    run: async () => {
      const m = parseOpggChampionPage(await get("https://op.gg/lol/modes/aram/jinx/build"));
      need(!!m && m.coreBuilds.length > 0, "no core builds");
      need(m!.boots.length > 0, "no boots");
      return `${m!.coreBuilds.length} core builds, ${m!.boots.length} boots`;
    },
  },
  {
    name: "OP.GG ARAM: Mayhem runes (Yasuo)",
    run: async () => {
      const m = parseOpggChampionPage(await get("https://op.gg/lol/modes/aram-mayhem/yasuo/runes"));
      need(!!m && m.runes.length > 0, "no rune pages");
      return `${m!.runes.length} rune pages`;
    },
  },
  {
    name: "OP.GG Arena (Jinx)",
    run: async () => {
      const a = parseArenaChampionPage(await get("https://op.gg/lol/modes/arena/jinx/build"));
      need(!!a && (a.coreBuilds?.length ?? 0) > 0, "no core builds");
      return `${a!.coreBuilds?.length} core builds, ${a!.augments?.length ?? 0} augments`;
    },
  },
  {
    name: "OP.GG Arena synergies (Jinx)",
    run: async () => {
      const r = parseOpggSynergies(await get("https://op.gg/lol/modes/arena/jinx/synergies"));
      need((r.all?.length ?? 0) >= 5, "fewer than 5 duo partners");
      return `${r.all.length} duo partners`;
    },
  },
  {
    name: "HexMayhem (Ahri)",
    run: async () => {
      const p = parseChampionPage(await get("https://hexmayhem.com/champions/ahri")) as { games?: number; bestBuild?: unknown[]; augments?: unknown[] } | undefined;
      need(!!p && (p.games ?? 0) > 0, "no games");
      need((p!.bestBuild?.length ?? 0) > 0, "no best build");
      need((p!.augments?.length ?? 0) > 0, "no augments");
      return `${p!.games} games, ${p!.augments!.length} augments`;
    },
  },
];

let failed = 0;
for (const c of checks) {
  try {
    console.log(`✔ ${c.name}: ${await c.run()}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Unreachable) {
      console.log(`⚠ ${c.name}: skipped, site unreachable (${msg})`);
      continue;
    }
    failed++;
    console.log(`✘ ${c.name}: ${msg}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // be gentle with the sites
}
if (failed) {
  console.log(`\n${failed} source check(s) failed: a site may have changed its page format. Builds for that source would fall back to the baseline.`);
  process.exit(1);
}
console.log("\nAll sources parse.");
