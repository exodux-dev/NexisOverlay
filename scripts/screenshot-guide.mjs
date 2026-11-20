// Screenshots the Guide tab of the main window for a few champions (both themes).
// Prereq: `npx vite --port 1422 --strictPort` running. Usage:
//   node scripts/screenshot-guide.mjs [outDir]
// Env: GUIDE_URL (default http://localhost:1422/), FULL=1 also writes tall full-length shots.
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

const URL = process.env.GUIDE_URL ?? "http://localhost:1422/";
const OUT = process.argv[2] ?? "shots";
const FULL = process.env.FULL === "1";
mkdirSync(OUT, { recursive: true });

// Data Dragon fixture (sandbox has no internet).
const fixture = JSON.parse(
  execFileSync(
    "npx",
    ["tsx", "-e", 'import { fixtureResponses } from "./src/dev/fixture.ts"; process.stdout.write(JSON.stringify(fixtureResponses()))'],
    { encoding: "utf8", maxBuffer: 64 << 20 },
  ),
);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8v5ahHgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==",
  "base64",
);

// Fake champion detail (passive + Q/W/E/R) for data/en_US/champion/<Id>.json.
const SPELL_NAMES = {
  Kayn: ["The Darkin Scythe", "Reaping Slash", "Blade's Reach", "Shadow Step", "Umbral Trespass"],
  Aphelios: ["The Hitman and the Seer", "Weapon of the Faithful", "Phase", "Weapon Queue System", "Moonlight Vigil"],
  Ahri: ["Essence Theft", "Orb of Deception", "Fox-Fire", "Charm", "Spirit Rush"],
};
function championDetail(id) {
  const names = SPELL_NAMES[id] ?? ["Passive", `${id} Q`, `${id} W`, `${id} E`, `${id} R`];
  const desc = (n) => `${n}: deals magic damage to enemies hit and grants a brief bonus. (Fixture text — real Data Dragon descriptions appear in the app.)`;
  return {
    data: {
      [id]: {
        id,
        passive: { name: names[0], description: desc(names[0]), image: { full: `${id}_P.png` } },
        spells: names.slice(1).map((n, i) => ({
          id: `${id}${"QWER"[i]}`,
          name: n,
          description: desc(n),
          cooldownBurn: i === 3 ? "100/80/60" : "8/7/6/5/4",
          image: { full: `${id}${"QWER"[i]}.png` },
        })),
      },
    },
  };
}

async function newPage(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route("https://ddragon.leagueoflegends.com/**", (route) => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (/\.(png|jpe?g|webp)$/i.test(path)) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    const detail = /data\/en_US\/champion\/([A-Za-z]+)\.json$/.exec(path);
    if (detail) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(championDetail(detail[1])) });
    const hit = Object.entries(fixture).find(([suffix]) => path.endsWith(suffix));
    if (!hit) return route.fulfill({ status: 404, body: "not in fixture" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hit[1]) });
  });
  // Community stats dataset is unreachable here: 404 it (the app falls back to curated data).
  await page.route("https://raw.githubusercontent.com/**", (route) => route.fulfill({ status: 404, body: "not found" }));
  await page.goto(URL);
  await page.waitForFunction(() => window.__nexis, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__nexis.getState().status === "ready", null, { timeout: 15000 });
  return { page, errors };
}

async function shoot(browser, name, { champ, theme = "league", demo = false, style, width = 1180, height = 760 }) {
  const { page, errors } = await newPage(browser, width, height);
  await page.evaluate(
    async ({ champ, theme, demo, style }) => {
      const { actions } = window.__nexis;
      await actions.updateTheme({ preset: theme });
      actions.setDemo(demo);
      if (champ) actions.setExploreChampion(champ);
      if (style) await actions.setBuildStyle(style[0], style[1]);
      actions.setTab("guide");
    },
    { champ, theme, demo, style },
  );
  await page.waitForSelector(".view-guide .gd-grid", { timeout: 10000 });
  await page.waitForSelector(".gd-abilities img", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  // Layout sanity: nothing inside the guide may overflow horizontally.
  const overflow = await page.evaluate(() => {
    const root = document.querySelector(".view-guide");
    const max = root.getBoundingClientRect().right + 1;
    return [...root.querySelectorAll("*")]
      .filter((el) => !el.closest(".gd-grid-wrap") && el.getBoundingClientRect().right > max)
      .slice(0, 5)
      .map((el) => el.className || el.tagName);
  });
  if (overflow.length) errors.push(`overflow: ${overflow.join(", ")}`);
  const file = join(OUT, `guide-${name}.png`);
  await page.screenshot({ path: file });
  console.log("wrote", file);
  if (FULL) {
    const h = await page.evaluate(() => document.querySelector(".content").scrollHeight + 120);
    await page.setViewportSize({ width, height: Math.max(height, h) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `guide-${name}-full.png`) });
  }
  await page.close();
  const real = errors.filter((e) => !/raw\.githubusercontent|404|Failed to load resource/.test(e));
  if (real.length) throw new Error(`${name}: console errors:\n${real.join("\n")}`);
}

const browser = await chromium.launch();
try {
  await shoot(browser, "kayn", { champ: "Kayn" });
  await shoot(browser, "kayn-switch", { champ: "Kayn", style: ["Kayn", "blue"] });
  await shoot(browser, "aphelios", { champ: "Aphelios" });
  await shoot(browser, "ahri", { champ: "Ahri" });
  await shoot(browser, "annie-generic", { champ: "Annie" });
  await shoot(browser, "demo-live-level", { demo: true });
  await shoot(browser, "aphelios-light", { champ: "Aphelios", theme: "light" });
  await shoot(browser, "kayn-light", { champ: "Kayn", theme: "light" });
  await shoot(browser, "kayn-midnight", { champ: "Kayn", theme: "midnight" });
} finally {
  await browser.close();
}
