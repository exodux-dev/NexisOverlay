// Visual check of the main overlay UI with offline fixture data.
//
//   npx vite --port 1420          (in another terminal)
//   node scripts/screenshot.mjs [outDir]
//
// Data Dragon is answered from src/dev/fixture.ts (dumped to scripts/.cache/fixture.json via tsx),
// images get generated placeholder tiles, and the stats URL returns 404 (handled by the store).
// Fails (exit 1) on any page error or console error.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node-tools/node_modules/playwright"));
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "scripts/.cache/shots"));
const base = process.env.NEXIS_URL ?? "http://localhost:1420/";
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- fixture
const cacheFile = join(root, "scripts/.cache/fixture.json");
mkdirSync(dirname(cacheFile), { recursive: true });
execFileSync(
  "npx",
  [
    "tsx",
    "--eval",
    `import("./src/dev/fixture.ts").then((m) => require("node:fs").writeFileSync(${JSON.stringify(cacheFile)}, JSON.stringify(m.fixtureResponses())))`,
  ],
  { cwd: root, stdio: "inherit" },
);
const fixture = JSON.parse(readFileSync(cacheFile, "utf8"));
const fixtureKeys = Object.keys(fixture).sort((a, b) => b.length - a.length);

function placeholder(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const label = name.replace(/\.(png|jpg|webp)$/i, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "?";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},45%,42%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},50%,20%)"/></linearGradient></defs>
<rect width="64" height="64" fill="url(#g)"/><circle cx="48" cy="14" r="18" fill="rgba(255,255,255,.08)"/>
<text x="32" y="40" font-family="Arial" font-weight="700" font-size="${label.length > 2 ? 15 : 20}" fill="rgba(255,255,255,.85)" text-anchor="middle">${label}</text></svg>`;
}

// ---------------------------------------------------------------- sample history
const CHAMPS = ["Ahri", "Jinx", "Lux", "Varus", "Malphite", "Ahri", "Ezreal", "Ahri", "Lux", "Jinx"];
const AUGS = ["Jeweled Gauntlet", "Eureka", "Infinite Recursion", "Goliath", "Draw Your Sword", "Back To Basics", "Mystic Punch", "Typhoon"];
const history = Array.from({ length: 14 }, (_, i) => ({
  id: `h${i}`,
  date: new Date(Date.now() - (14 - i) * 7.2e6).toISOString(),
  champion: CHAMPS[i % CHAMPS.length],
  result: [0, 2, 3, 5, 6, 9, 10, 12].includes(i) ? "Win" : "Lose",
  kills: (i * 7) % 13,
  deaths: (i * 5) % 9,
  assists: (i * 11) % 23,
  durationSec: 900 + i * 47,
  items: [6655, 3020, 3089, 3157, 4645, 3135].slice(0, 3 + (i % 4)),
  augments: [AUGS[i % AUGS.length], AUGS[(i + 3) % AUGS.length]],
  enemies: ["Zed", "Soraka"],
  gameMode: "KIWI",
}));

// ---------------------------------------------------------------- run
const errors = [];
const browser = await chromium.launch();

async function openPage({ width = 1180, height = 760, settings, withHistory = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.route("https://ddragon.leagueoflegends.com/**", (route) => {
    const url = route.request().url();
    if (/\.(png|jpg|webp)$/i.test(url)) {
      return route.fulfill({ status: 200, contentType: "image/svg+xml", body: placeholder(url.split("/").pop()) });
    }
    const key = fixtureKeys.find((k) => url.endsWith(k));
    if (!key) return route.fulfill({ status: 404, body: "not in fixture" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture[key]) });
  });
  await ctx.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 404, body: "Not Found" }));
  await ctx.addInitScript(
    ([h, s]) => {
      localStorage.clear();
      if (h) localStorage.setItem("nexis:history.json", JSON.stringify(h));
      if (s) localStorage.setItem("nexis:settings.json", JSON.stringify(s));
    },
    [withHistory ? history : null, settings ?? null],
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const loc = m.location()?.url ?? "";
    if (loc.includes("raw.githubusercontent.com")) return; // default stats URL 404s offline — expected
    if (/\/data\/en_US\/champion\/[^/]+\.json$/.test(loc)) return; // per-champion detail isn't in the fixture; the guide falls back
    errors.push(`console: ${m.text()} ${loc}`);
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__nexis?.getState().status === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(150);
  return page;
}

const act = (page, fn, arg) => page.evaluate(([f, a]) => new Function("n", "a", f)(window.__nexis, a), [fn, arg]);
async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log("saved", name);
}
async function tab(page, t) {
  await act(page, "n.actions.setTab(a)", t);
}

{
  const page = await openPage();
  await shot(page, "01-build-explore");
  await act(page, "n.actions.setDemo(true)");
  await shot(page, "02-build-demo");
  // item tooltip
  await page.hover(".order .slot:nth-child(3) .slot-icon");
  await shot(page, "02b-build-tooltip");
  await page.mouse.move(5, 300);
  await tab(page, "augments");
  await shot(page, "03-augments");
  await page.evaluate(() => document.querySelector(".content").scrollTo(0, 99999));
  await shot(page, "03b-augments-tierlist");
  await tab(page, "guide");
  await page.waitForTimeout(400);
  await shot(page, "04-guide");
  await tab(page, "enemies");
  await shot(page, "05-enemies");
  await tab(page, "history");
  await shot(page, "06-history");
  await tab(page, "settings");
  for (const s of ["general", "hotkeys", "appearance", "overlay", "data", "about"]) {
    await page.click(`[data-section=${s}]`);
    await shot(page, `07-settings-${s}`);
  }
  // keybind recording state
  await page.click("[data-section=hotkeys]");
  await page.click(".kb-btn");
  await page.keyboard.down("Alt");
  await shot(page, "07b-settings-recording");
  await page.keyboard.press("q");
  await page.keyboard.up("Alt");
  await shot(page, "07c-settings-conflict");
  // Varus build styles
  await act(page, "n.actions.setDemo(false); n.actions.setExploreChampion('Varus'); n.actions.setTab('build')");
  const styles = await page.$$eval(".style-bar .seg-btn", (els) => els.length);
  for (let i = 0; i < styles; i++) {
    await page.click(`.style-bar .seg-btn >> nth=${i}`);
    await shot(page, `08-varus-style-${i + 1}`);
  }
  await page.click(".champ-select-btn");
  await shot(page, "09-champion-picker");
  await page.keyboard.press("Escape");
  await page.context().close();
}

for (const preset of ["light", "void", "hextech"]) {
  const page = await openPage({ settings: { theme: { preset } } });
  await act(page, "n.actions.setDemo(true)");
  await shot(page, `10-theme-${preset}-build`);
  await tab(page, "augments");
  await shot(page, `10-theme-${preset}-augments`);
  await tab(page, "settings");
  await page.click("[data-section=appearance]");
  await shot(page, `10-theme-${preset}-settings`);
  await page.context().close();
}

{
  const page = await openPage({ width: 900, height: 600, withHistory: false });
  await act(page, "n.actions.setDemo(true)");
  await shot(page, "11-min-build");
  await tab(page, "enemies");
  await shot(page, "11-min-enemies");
  await tab(page, "history");
  await shot(page, "11-min-history-empty");
  await page.context().close();
}

{
  const page = await openPage({ settings: { theme: { density: "compact", scale: 0.9 } } });
  await act(page, "n.actions.setDemo(true)");
  await shot(page, "12-compact-scaled");
  await page.context().close();
}

await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} error(s):\n${[...new Set(errors)].join("\n")}`);
  process.exit(1);
}
console.log(`\nAll screenshots in ${outDir}`);
