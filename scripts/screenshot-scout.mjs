// Screenshots of the loading-screen scouting panel (src/views/Scout.tsx) with SYNTHETIC profiles.
//   node scripts/screenshot-scout.mjs [outDir]
// Starts `npx vite --port 1423 --strictPort` itself, mounts the panel through a temporary dev entry
// under scripts/ (removed afterwards), and writes scout-*.png.
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const req = createRequire(join(execSync("npm root -g").toString().trim(), "noop.js"));
  ({ chromium } = req("playwright"));
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? "docs/screenshots");
mkdirSync(out, { recursive: true });
const PORT = 1423;
const HTML = join(root, "scripts", ".scout-dev.html");
const TSX = join(root, "scripts", ".scout-dev.tsx");

// ---------------------------------------------------------------- temporary dev entry
writeFileSync(
  HTML,
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Scout dev</title></head>
<body><div id="root"></div><script type="module" src="/scripts/.scout-dev.tsx"></script></body></html>`,
);
writeFileSync(
  TSX,
  String.raw`
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "../src/ui/theme.css";
import { ScoutPanel, ScoutStrip, type ScoutPlayer, type ProfileState } from "../src/views/Scout";
import type { PlayerProfile, RecentGame, RankEntry } from "../src/engine/sources/opggProfile";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") ?? "league";
const PRESETS: Record<string, Record<string, string>> = {
  league: { "--bg-rgb": "1,10,19", "--panel-rgb": "9,20,40", "--text": "#f0e6d2", "--muted": "#a09b8c", "--accent": "#c8aa6e", "--accent-2": "#0ac8b9", "--radius": "2px" },
  midnight: { "--bg-rgb": "10,13,22", "--panel-rgb": "19,24,38", "--text": "#e8ecf4", "--muted": "#8b95a8", "--accent": "#2dd4bf", "--accent-2": "#facc15", "--radius": "10px" },
};
const html = document.documentElement;
html.classList.add("nx-main");
html.dataset.theme = theme;
for (const [k, v] of Object.entries(PRESETS[theme] ?? PRESETS.league)) html.style.setProperty(k, v);
html.style.setProperty("--opacity", "0.9");

const V = "16.23.1";
const icon = (id: string) => "https://ddragon.leagueoflegends.com/cdn/" + V + "/img/champion/" + id + ".png";
const NOW = Date.now();
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function games(spec: { form: string; champs: string[]; d: number; k?: number; a?: number; pos?: string; queue?: string; startH?: number; op?: number }): RecentGame[] {
  return [...spec.form].map((r, i) => {
    const c = spec.champs[i % spec.champs.length];
    const jitter = () => Math.round((rnd() - 0.5) * 4);
    return {
      result: r === "W" ? "WIN" : "LOSE",
      champion: c,
      championKey: c.toLowerCase(),
      kills: Math.max(0, (spec.k ?? 6) + jitter()),
      deaths: Math.max(0, spec.d + jitter()),
      assists: Math.max(0, (spec.a ?? 7) + jitter()),
      queue: spec.queue ?? "SOLORANKED",
      queueName: spec.queue === "ARAM" ? "ARAM" : "Ranked Solo/Duo",
      position: spec.pos,
      opScore: Math.round(((spec.op ?? 6) + (rnd() - 0.5) * 2) * 10) / 10,
      playedAt: ago((spec.startH ?? 5) + i * 9),
    };
  });
}
const rank = (tier: string, division: number | undefined, lp: number, wins: number, losses: number, queue = "SOLORANKED"): RankEntry => ({
  queue, tier, division, lp, wins, losses, winRate: Math.round((wins / (wins + losses)) * 100),
});
function prof(riotId: string, o: Partial<PlayerProfile>): PlayerProfile {
  return { riotId, ranks: o.rank ? [o.rank, ...(o.ranks ?? [])] : [], recent: [], topChampions: [], source: "json", latestGameAt: o.recent?.[0]?.playedAt, ...o };
}

const players: ScoutPlayer[] = [
  { riotId: "Lantern Keeper#EUW", championId: "Ahri", championName: "Ahri", team: "ORDER", isMe: true, position: "MID" },
  { riotId: "Grubsnack#2077", championId: "LeeSin", championName: "Lee Sin", team: "ORDER", isMe: false, position: "JUNGLE" },
  { riotId: "tiny pebble#PEB", championId: "Garen", championName: "Garen", team: "ORDER", isMe: false, position: "TOP" },
  { riotId: "Hextech Hopeful#EUW", championId: "Jinx", championName: "Jinx", team: "ORDER", isMe: false, position: "ADC" },
  { riotId: "warded river#0001", championId: "Thresh", championName: "Thresh", team: "ORDER", isMe: false, position: "SUPPORT" },
  { riotId: "Midlane Maestro#KR9", championId: "Yasuo", championName: "Yasuo", team: "CHAOS", isMe: false, position: "MID" },
  { riotId: "Quiet Bramble#EUW", championId: "Ivern", championName: "Ivern", team: "CHAOS", isMe: false, position: "JUNGLE" },
  { riotId: "Very Long Summoner Name#LONGTAG", championId: "Darius", championName: "Darius", team: "CHAOS", isMe: false, position: "TOP" },
  { riotId: "Ash Gale#NEW", championId: "Kaisa", championName: "Kai'Sa", team: "CHAOS", isMe: false, position: "ADC" },
  { riotId: "Lulu Lover#BOT", championId: "Lulu", championName: "Lulu", team: "CHAOS", isMe: false, position: "SUPPORT" },
];
for (const p of players) p.championIcon = icon(p.championId!);

const profiles: Record<string, ProfileState> = {
  "Lantern Keeper#EUW": prof("Lantern Keeper#EUW", {
    level: 412, rank: rank("Emerald", 2, 54, 88, 79), recent: games({ form: "WLWWLWLWWL", champs: ["Ahri", "Syndra", "Ahri", "Orianna"], d: 4, pos: "MID" }),
    topChampions: [{ name: "Ahri", key: "ahri", wins: 30, losses: 22, winRate: 58 }, { name: "Syndra", key: "syndra", wins: 12, losses: 14, winRate: 46 }],
  }),
  "Grubsnack#2077": prof("Grubsnack#2077", {
    level: 233, rank: rank("Platinum", 1, 12, 61, 70), recent: games({ form: "LLLLWLWW", champs: ["Lee Sin", "Viego", "Kha'Zix"], d: 9, pos: "JUNGLE", op: 4.6 }),
    topChampions: [{ name: "Lee Sin", key: "leesin", wins: 22, losses: 25, winRate: 47 }],
  }),
  "tiny pebble#PEB": "loading",
  "Hextech Hopeful#EUW": prof("Hextech Hopeful#EUW", {
    level: 88, recent: games({ form: "WLWLLW", champs: ["Caitlyn", "Ezreal"], d: 5, pos: "ADC", queue: "NORMAL" }),
    topChampions: [{ name: "Caitlyn", key: "caitlyn", wins: 9, losses: 8, winRate: 53 }],
  }),
  "warded river#0001": prof("warded river#0001", {
    level: 640, rank: rank("Diamond", 4, 23, 102, 96), ranks: [rank("Platinum", 2, 40, 20, 18, "FLEXRANKED")],
    recent: games({ form: "WWWWLWLW", champs: ["Thresh", "Nautilus", "Thresh", "Rakan"], d: 5, k: 2, a: 16, pos: "SUPPORT", op: 7.4 }),
    topChampions: [{ name: "Thresh", key: "thresh", wins: 60, losses: 41, winRate: 59 }, { name: "Nautilus", key: "nautilus", wins: 20, losses: 22, winRate: 48 }],
  }),
  "Midlane Maestro#KR9": prof("Midlane Maestro#KR9", {
    level: 921, rank: rank("Master", undefined, 312, 210, 171), recent: games({ form: "WWWWWLWWLW", champs: ["Yasuo", "Yasuo", "Yone", "Yasuo"], d: 6, k: 10, a: 5, pos: "MID", op: 7.6 }),
    topChampions: [{ name: "Yasuo", key: "yasuo", wins: 140, losses: 101, winRate: 58 }, { name: "Yone", key: "yone", wins: 30, losses: 31, winRate: 49 }],
  }),
  "Quiet Bramble#EUW": prof("Quiet Bramble#EUW", {
    level: 301, rank: rank("Gold", 2, 66, 40, 52), recent: games({ form: "LWLLWLWLLW", champs: ["Graves", "Kindred", "Nidalee"], d: 7, pos: "JUNGLE", startH: 24 * 41 }),
    topChampions: [{ name: "Graves", key: "graves", wins: 18, losses: 22, winRate: 45 }],
  }),
  "Very Long Summoner Name#LONGTAG": "error",
  "Ash Gale#NEW": prof("Ash Gale#NEW", {
    level: 41, rank: rank("Platinum", 3, 80, 34, 9), recent: games({ form: "WWWWWWLWWW", champs: ["Kai'Sa", "Ezreal", "Xayah"], d: 3, k: 11, a: 8, pos: "ADC", op: 8.1 }),
    topChampions: [{ name: "Kai'Sa", key: "kaisa", wins: 20, losses: 4, winRate: 83 }],
  }),
  "Lulu Lover#BOT": "private",
};

const mode = params.get("mode") ?? "panel";
const w = Number(params.get("w") ?? 0);
const root = createRoot(document.getElementById("root")!);
if (mode === "strip") {
  root.render(
    <div className="shell" style={{ width: w || 460, height: "auto", padding: 12 }}>
      <ScoutStrip players={players} profiles={profiles} />
    </div>,
  );
} else {
  root.render(
    <div className="shell">
      <div style={{ height: 56, flex: "none", borderBottom: "1px solid var(--border)" }} />
      <div className="body">
        <nav className="nav" />
        <main className="content">
          <div className="view">
            <ScoutPanel players={players} profiles={profiles} region="EUW" status={params.get("status") ?? undefined} queue="SOLORANKED" />
          </div>
        </main>
      </div>
    </div>,
  );
}
`,
);

// ---------------------------------------------------------------- vite + playwright
const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true });
const cleanup = () => {
  try {
    process.kill(-vite.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  rmSync(HTML, { force: true });
  rmSync(TSX, { force: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error("vite did not start")), 60000);
  const on = (b) => {
    if (/Local:|ready in/i.test(b.toString())) {
      clearTimeout(t);
      ok();
    }
  };
  vite.stdout.on("data", on);
  vite.stderr.on("data", (b) => process.stderr.write(b));
});

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {});
try {
  const base = `http://localhost:${PORT}/scripts/.scout-dev.html`;
  const shoot = async (name, { width, height, query = "", hover, scroll = false }) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    page.on("console", (m) => m.type() === "error" && console.error("console", m.text()));
    await page.goto(`${base}?${query}`);
    await page.addStyleTag({
      content: `html { background: linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg) center/cover fixed !important; }
        .sc-skel-bar { animation: none !important; }`,
    });
    await page.waitForSelector(".sc-panel, .sc-strip");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    if (scroll) await page.evaluate(() => document.querySelector(".content")?.scrollTo(0, 1e5));
    if (hover) {
      await page.hover(hover);
      await page.waitForTimeout(300);
    }
    const file = join(out, `${name}.png`);
    if (query.includes("mode=strip")) await page.locator(".shell").screenshot({ path: file });
    else await page.screenshot({ path: file });
    console.log("wrote", file);
    await ctx.close();
  };
  await shoot("scout-1180", { width: 1180, height: 760 });
  await shoot("scout-900", { width: 900, height: 600 });
  await shoot("scout-900-scrolled", { width: 900, height: 600, scroll: true });
  await shoot("scout-tooltip", { width: 1180, height: 760, hover: ".sc-col-enemy .sc-card:nth-child(1) .sc-form" });
  await shoot("scout-midnight", { width: 1180, height: 760, query: "theme=midnight&status=Updated just now" });
  await shoot("scout-strip", { width: 700, height: 400, query: "mode=strip&w=480" });
} finally {
  await browser.close();
  cleanup();
}
