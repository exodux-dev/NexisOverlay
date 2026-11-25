// Captures README screenshots with REAL Data Dragon assets (needs internet + `npx vite --port 1420`).
//   node scripts/readme-shots.mjs [outDir]
//   NEXIS_URL=http://localhost:1425/ node scripts/readme-shots.mjs   # point at another dev server
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const req = createRequire(join(execSync("npm root -g").toString().trim(), "noop.js"));
  ({ chromium } = req("playwright"));
}

const out = process.argv[2] ?? "docs/screenshots";
mkdirSync(out, { recursive: true });
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {});
const ctx = await browser.newContext({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
await ctx.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ status: 404, body: "Not Found" }));
// In a plain browser the HexMayhem pages lack CORS headers (the desktop app fetches them natively).
await ctx.route("https://hexmayhem.com/**", async (r) => {
  const res = await r.fetch();
  await r.fulfill({ response: res, headers: { ...res.headers(), "access-control-allow-origin": "*" } });
});
// Skip the first-run welcome tour and "What's new" so they don't cover the screenshots.
await ctx.addInitScript(() => {
  localStorage.setItem("nexis:onboarding.json", JSON.stringify({ done: true, version: 1 }));
  localStorage.setItem("nexis:whatsnew.json", JSON.stringify({ seen: "9999" }));
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(process.env.NEXIS_URL ?? "http://localhost:1420/");
await page.waitForFunction(() => window.__nexis?.getState().status === "ready", null, { timeout: 60000 });
const act = (fn) => page.evaluate((f) => new Function("n", f)(window.__nexis), fn);
const settle = () => page.waitForLoadState("networkidle").then(() => page.waitForTimeout(2500)).then(() => page.waitForLoadState("networkidle"));
const shot = async (name) => {
  await settle();
  await page.waitForFunction(() => window.__nexis.getState().web.status !== "loading", null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log("wrote", name);
};

// Show the overlay over a game-like backdrop so its transparency is visible.
await page.addStyleTag({
  content: `html.nx-browser, html { background: linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${process.env.SPLASH ?? "Ahri_0"}.jpg) center/cover fixed !important; }`,
});
await act("n.actions.updateSettings({ hotkeyToggle: 'Ctrl+Shift+Space' }); n.actions.setDemo(true); n.actions.setTab('build')");
await shot("build");
await act("n.actions.setTab('augments')");
await shot("augments");
await act("n.actions.setTab('enemies')");
await shot("enemies");
await act("n.actions.setDemo(false); n.actions.setExploreChampion('Aphelios'); n.actions.setTab('guide')");
await shot("guide");
await act("n.actions.setExploreChampion('Varus'); n.actions.setBuildStyle('Varus', 'ap'); n.actions.setTab('build')");
await shot("build-styles");
await act("n.actions.setBuildStyle('Varus', 'lethality'); n.actions.setTab('settings')");
await shot("settings");
await browser.close();
