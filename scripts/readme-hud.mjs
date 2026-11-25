// Captures docs/screenshots/hud.png: the in-game HUD + level-up arrow over a champion splash, with a
// drawn stand-in for League's ability bar (needs internet + `npx vite --port 1420`).
//   node scripts/readme-hud.mjs [outDir]
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
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
const W = 1280;
const H = 720;
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, ignoreHTTPSErrors: true });
await ctx.route("https://raw.githubusercontent.com/**", (r) => r.fulfill({ status: 404, body: "Not Found" }));
const settings = { hud: { idleDim: false, showFarm: true } };
await ctx.addInitScript((s) => {
  localStorage.setItem("nexis:onboarding.json", JSON.stringify({ done: true, version: 1 }));
  localStorage.setItem("nexis:whatsnew.json", JSON.stringify({ seen: "9999" }));
  localStorage.setItem("nexis:settings.json", JSON.stringify(s));
}, settings);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto((process.env.NEXIS_URL ?? "http://localhost:1420/") + "?view=hud");
await page.waitForFunction(() => window.__nexis?.getState().status === "ready", null, { timeout: 60000 });

// Backdrop: darkened splash + a plain stand-in for League's ability bar at the default calibration.
await page.evaluate(
  ({ splash, w, h }) => {
    const bg = document.createElement("div");
    bg.style.cssText = `position:fixed;inset:0;z-index:-1;background:linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.45)),url(https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${splash}.jpg) center/cover`;
    const gap = 0.05 * h;
    const bar = document.createElement("div");
    bar.style.cssText = `position:absolute;left:${0.497 * w - 2.6 * gap}px;top:${0.935 * h - gap * 0.62}px;width:${5.2 * gap}px;height:${gap * 1.24}px;border-radius:8px;background:rgba(8,10,18,.82);border:1px solid rgba(200,170,110,.45)`;
    bg.appendChild(bar);
    ["Q", "W", "E", "R"].forEach((k, i) => {
      const s = document.createElement("div");
      const size = gap * 0.85;
      s.style.cssText = `position:absolute;left:${0.497 * w + (i - 1.5) * gap - size / 2}px;top:${0.935 * h - size / 2}px;width:${size}px;height:${size}px;border-radius:4px;background:linear-gradient(160deg,#3b3f5c,#191b2b);border:1px solid rgba(200,170,110,.6);color:#d8d2c0;font:700 11px system-ui;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px;box-sizing:border-box`;
      s.textContent = k;
      bg.appendChild(s);
    });
    document.body.prepend(bg);
  },
  { splash: process.env.SPLASH ?? "Ahri_0", w: W, h: H },
);

const game = JSON.parse(readFileSync("e2e/fixtures/live-game.json", "utf8"));
game.gameData.gameMode = "CLASSIC";
game.gameData.gameTime = 840;
game.activePlayer.abilities = { Q: { abilityLevel: 5 }, W: { abilityLevel: 1 }, E: { abilityLevel: 2 }, R: { abilityLevel: 2 } };
game.allPlayers[0].position = "MIDDLE";
game.allPlayers[0].scores.creepScore = 112;
await page.evaluate((d) => window.dispatchEvent(new CustomEvent("nexis:live-game", { detail: d })), game);
await page.waitForSelector(".nl-lvl-arrow", { timeout: 15000 });
await page.waitForSelector(".nl-farm", { timeout: 15000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, "hud.png") });
console.log("wrote hud");
await browser.close();
