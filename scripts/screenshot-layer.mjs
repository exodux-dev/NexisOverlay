// Screenshots the in-game layer (hud window) over fake game art.
// Prereq: `npx vite --port 1421 --strictPort` running. Usage:
//   node scripts/screenshot-layer.mjs [outDir]
// Env: LAYER_URL (default http://localhost:1421/?view=hud)
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Playwright may be installed globally only: fall back to require() (honours NODE_PATH / global root).
const { chromium } = await import("playwright").catch(() => {
  const req = createRequire(import.meta.url);
  try {
    return req("playwright");
  } catch {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return req(`${root}/playwright`);
  }
});

const URL = process.env.LAYER_URL ?? "http://localhost:1421/?view=hud";
const OUT = process.argv[2] ?? "shots";
mkdirSync(OUT, { recursive: true });

// Data Dragon fixture (sandbox has no internet).
const fixture = JSON.parse(
  execFileSync(
    "npx",
    ["tsx", "-e", 'import { fixtureResponses } from "./src/dev/fixture.ts"; process.stdout.write(JSON.stringify(fixtureResponses()))'],
    { encoding: "utf8", maxBuffer: 64 << 20 },
  ),
);
// 1×1 gold-ish PNG for every image.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8v5ahHgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==",
  "base64",
);

const CARD_XS = [0.12, 0.45, 0.78]; // card centres, fraction of the scan region
const NAMES = ["Jeweled Gauntlet", "Infinite Recursion", "Draw Your Sword"];

// Optional realistic backdrop (e.g. a champion splash): BACKDROP_FILE=/path/to/image.jpg
const BACKDROP = process.env.BACKDROP_FILE
  ? `url(data:image/jpeg;base64,${(await import("node:fs")).readFileSync(process.env.BACKDROP_FILE).toString("base64")}) center/cover`
  : "";

// Busy, bright "game art" (or the backdrop) with three placeholder augment cards behind the layer.
const FAKE_GAME = `
(() => {
  const backdrop = ${JSON.stringify(BACKDROP)};
  const r = { x: 0.14, y: 0.16, w: 0.72, h: 0.46 };
  const bg = document.createElement("div");
  bg.id = "fake-game";
  bg.style.cssText = "position:fixed;inset:0;z-index:-1;background:" + (backdrop ? "linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45))," + backdrop + ";" : "") + (backdrop ? "" : [
    "radial-gradient(circle at 18% 78%, rgba(255,240,200,.95) 0 6%, transparent 22%)",
    "radial-gradient(circle at 82% 30%, rgba(120,220,255,.9) 0 5%, transparent 25%)",
    "radial-gradient(circle at 50% 95%, rgba(255,120,60,.85) 0 8%, transparent 30%)",
    "repeating-conic-gradient(from 10deg at 60% 60%, rgba(255,255,255,.18) 0 4deg, transparent 4deg 13deg)",
    "repeating-linear-gradient(35deg, rgba(40,90,40,.5) 0 22px, rgba(150,190,90,.55) 22px 50px)",
    "linear-gradient(160deg, #7fb069, #d9c38a 45%, #4c7a9a)"
  ].join(",") + ";");
  const names = ${JSON.stringify(NAMES)};
  ${JSON.stringify(CARD_XS)}.forEach((cx, i) => {
    const c = document.createElement("div");
    const w = 0.165, left = (r.x + cx * r.w - w / 2) * 100;
    c.style.cssText = "position:absolute;left:" + left + "vw;width:" + w * 100 + "vw;top:" + (r.y + 0.02) * 100 +
      "vh;height:" + (r.h - 0.04) * 100 + "vh;border-radius:10px;border:2px solid " + ["#b8c0cc", "#d9b45a", "#b07cf0"][i] +
      ";background:linear-gradient(180deg,rgba(14,18,34,.92),rgba(30,26,58,.92));box-shadow:0 0 40px rgba(0,0,0,.6);" +
      "color:#f2f2f7;font:600 1.15vw/1.3 system-ui,sans-serif;text-align:center;padding-top:3vh;box-sizing:border-box";
    c.textContent = names[i];
    bg.appendChild(c);
  });
  document.body.prepend(bg);
})();
`;

const lines = () =>
  CARD_XS.map((cx, i) => {
    const w = 0.16;
    return { text: NAMES[i], x: cx - w / 2, y: 0.08, w, h: 0.05 };
  });

async function shoot(browser, width, height, name, { stats = false, clear = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  await page.route("https://ddragon.leagueoflegends.com/**", (route) => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (/\.(png|jpe?g|webp)$/i.test(path)) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    const hit = Object.entries(fixture).find(([suffix]) => path.endsWith(suffix));
    if (!hit) return route.fulfill({ status: 404, body: "not in fixture" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hit[1]) });
  });
  // Default community stats dataset (unreachable here): serve an empty one.
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ patch: "16.23", queueId: 2400, generatedAt: "", totalGames: 0, champions: {} }),
    }),
  );
  await page.goto(URL);
  await page.waitForFunction(() => window.__nexis, null, { timeout: 15000 });
  await page.evaluate(FAKE_GAME);
  // Wait for static data to load.
  await page.waitForFunction(
    () => {
      let ready = false;
      window.__nexis.devHooks.set((s) => ((ready = s.status === "ready" && s.statsStatus !== "loading"), {}));
      return ready;
    },
    null,
    { timeout: 15000 },
  );
  await page.evaluate(
    ({ lines, stats }) => {
      const { devHooks } = window.__nexis;
      devHooks.set({ demo: true });
      if (stats)
        devHooks.set((s) => {
          const champions = {};
          for (const c of s.data.champions)
            champions[c.id] = {
              games: 20000,
              wins: 10200,
              items: {},
              augments: {
                "Jeweled Gauntlet": { games: 1234, wins: 690 },
                "Infinite Recursion": { games: 845, wins: 430 },
                "Draw Your Sword": { games: 320, wins: 142 },
              },
            };
          return { stats: { patch: "16.23", queueId: 2400, generatedAt: "", totalGames: 20000, champions } };
        });
      const payload = { ok: true, auto: true, scan: { millis: 40, lines } };
      devHooks.onScan(payload);
      devHooks.onScan(payload);
    },
    { lines: lines(), stats },
  );
  await page.waitForSelector(".nl-badge", { timeout: 5000 });
  if (clear) {
    await page.evaluate(() => {
      const p = { ok: true, auto: true, scan: { millis: 40, lines: [] } };
      window.__nexis.devHooks.onScan(p);
      window.__nexis.devHooks.onScan(p);
    });
    await page.waitForSelector(".nl-badge", { state: "detached", timeout: 3000 });
  }
  await page.waitForTimeout(900); // let animations settle
  const transparent = await page.evaluate(() =>
    [document.documentElement, document.body].every((el) => getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)"),
  );
  if (!transparent) errors.push("html/body background is not transparent");
  const file = join(OUT, `layer-${name}.png`);
  await page.screenshot({ path: file });
  await page.close();
  if (errors.length) throw new Error(`${name}: console errors:\n${errors.join("\n")}`);
  console.log("wrote", file);
}

const browser = await chromium.launch();
try {
  await shoot(browser, 1920, 1080, "1080p");
  await shoot(browser, 1920, 1080, "1080p-winrate", { stats: true });
  await shoot(browser, 2560, 1440, "1440p", { stats: true });
  await shoot(browser, 1920, 1080, "1080p-cleared", { clear: true });
} finally {
  await browser.close();
}
