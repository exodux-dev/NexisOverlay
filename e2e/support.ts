// Shared harness for the e2e smoke tests: offline network (every external request is answered
// from e2e/fixtures), a clean localStorage per test, console-error tracking and small helpers that
// drive the app the way the Tauri backend would (`nexis:*` CustomEvents, `window.__nexis` hooks).
// Fixtures are real responses (Nov 2026, patch 16.23) minimised to what the app's parsers read:
// each page was cut down until its parse output (src/engine/sources/*) stayed identical.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type BrowserContext, type Page, type Route } from "@playwright/test";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const cache = new Map<string, Buffer>();
const fixture = (name: string) => {
  let b = cache.get(name);
  if (!b) cache.set(name, (b = readFileSync(join(FIX, name))));
  return b;
};
export const fixtureJson = <T = unknown>(name: string): T => JSON.parse(fixture(name).toString("utf8")) as T;

// 1×1 transparent PNG for every icon / splash / augment image.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

type Reply = { file: string; type: "json" | "html" } | null;

/**
 * External URL → fixture. Champion pages are served for any champion slug (Ahri samples for
 * HexMayhem / OP.GG ARAM / SR, Jinx for Arena): the tests check that each provider parses and
 * renders, not champion-specific numbers.
 */
function resolve(url: URL): Reply {
  const p = url.pathname.replace(/\/+$/, "");
  const html = (file: string): Reply => ({ file, type: "html" });
  const json = (file: string): Reply => ({ file, type: "json" });
  switch (url.hostname) {
    case "ddragon.leagueoflegends.com": {
      if (p === "/api/versions.json") return json("ddragon/versions.json");
      const m = /^\/cdn\/[\d.]+\/data\/en_US\/(champion|item|runesReforged|summoner)\.json$/.exec(p);
      if (m) return json(`ddragon/${m[1]}.json`);
      if (/^\/cdn\/[\d.]+\/data\/en_US\/champion\/Ahri\.json$/.test(p)) return json("ddragon/champion-Ahri.json");
      return null;
    }
    case "hexmayhem.com":
    case "www.hexmayhem.com":
      if (p === "/augments") return html("hexmayhem-augments.html");
      if (p === "/must-play") return html("hexmayhem-must-play.html");
      if (p === "/champions") return html("hexmayhem-champions.html");
      if (/^\/champions\/[a-z0-9]+$/.test(p)) return html("hexmayhem-champion-ahri.html");
      return null;
    case "op.gg":
    case "www.op.gg": {
      if (p === "/lol/modes/aram") return html("opgg-aram-tierlist.html");
      if (p === "/lol/modes/arena") return html("opgg-arena-tierlist.html");
      if (p === "/lol/champions") return html("opgg-sr-tierlist.html");
      if (/^\/lol\/modes\/aram\/[a-z0-9]+\/build$/.test(p)) return html("opgg-aram-ahri-build.html");
      // ARAM: Mayhem rune pages (real, trimmed Yasuo page) fill HexMayhem's missing runes.
      if (/^\/lol\/modes\/aram-mayhem\/[a-z0-9]+\/runes$/.test(p)) return html("opgg-mayhem-yasuo-runes.html");
      const sr = /^\/lol\/champions\/[a-z0-9]+\/(build|items|runes)(\/[a-z]+)?$/.exec(p);
      if (sr) return html(`opgg-sr-ahri-${sr[1]}.html`);
      const arena = /^\/lol\/modes\/arena\/[a-z0-9]+\/(augments|build|items)$/.exec(p);
      if (arena) return html(`opgg-arena-jinx-${arena[1]}.html`);
      return null; // ARAM items/runes pages, player profiles: "not found" (the app copes)
    }
    case "raw.communitydragon.org":
      if (p === "/latest/cdragon/arena/en_us.json") return json("cdragon-arena.json");
      return null;
    default:
      return null; // github (stats dataset / update check) and anything else: 404
  }
}

async function routeExternal(context: BrowserContext, unexpected: string[]) {
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, async (route: Route) => {
    const url = new URL(route.request().url());
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname)) return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    const hit = resolve(url);
    const headers = { "access-control-allow-origin": "*" };
    if (!hit) {
      unexpected.push(url.href);
      return route.fulfill({ status: 404, contentType: "text/plain", body: "not found (e2e fixture)", headers });
    }
    return route.fulfill({
      status: 200,
      contentType: hit.type === "json" ? "application/json" : "text/html; charset=utf-8",
      body: fixture(hit.file),
      headers,
    });
  });
}

/** Backend snapshot for Settings → Diagnostics (normally from the Tauri `diagnostics` command). */
function installDiagnosticsMock() {
  const now = Date.now();
  (window as unknown as { __NEXIS_DIAG__: () => unknown }).__NEXIS_DIAG__ = () => ({
    log: [
      { t: now - 60_000, level: "info", area: "app", msg: "Nexis started (e2e)" },
      { t: now - 30_000, level: "warn", area: "fetch", msg: "op.gg: HTTP 403 (using cached copy)" },
    ],
    live: { lastOk: now - 1500, lastInGame: now - 1500, reachable: true, inGame: false, lastError: null },
    lcu: { connected: true, since: now - 500_000 },
    hotkeys: [
      { action: "Show / hide overlay", combo: "Ctrl+Shift+Space", registered: true, polled: true },
      { action: "Toggle HUD", combo: "Ctrl+Shift+H", registered: false, polled: true, error: "HotKey already registered" },
    ],
    pollerFallback: false,
    scan: { lastAt: null, lastAuto: false, lines: 0, millis: 0, count: 0, lastError: null },
    fetch: { "hexmayhem.com": { okAt: now - 60_000, fromCache: false, cacheAgeSecs: 0, count: 4 } },
    logFile: "C:\\Nexis\\data\\logs\\nexis.log",
    hud: { visible: false, editing: false, clickThrough: true, enabled: true, preview: false },
    augment: { autoDetect: true, modeHasAugments: true, inGame: false, gameInFront: false, ocrAvailable: true },
    storage: { writable: true, portable: true },
    platform: "windows x86_64",
  });
}

export interface StartOptions {
  /** Path + query to open, e.g. "/?view=hud". */
  path?: string;
  /** Partial settings saved before boot (localStorage `nexis:settings.json`). */
  settings?: Record<string, unknown>;
  /** Wait for the main window's `window.__nexis` hooks + static data (not for the HUD view). */
  waitReady?: boolean;
}

type Fixtures = {
  /** Console errors / uncaught exceptions collected for the test (asserted empty afterwards). */
  errors: string[];
  /** Open the app with fixtures in place. */
  start: (opts?: StartOptions) => Promise<Page>;
};

// Expected noise: requests that 404 on purpose (no published stats dataset, missing fixture pages).
const IGNORED_CONSOLE = [/Failed to load resource/i, /\[vite\]/i, /Download the React DevTools/i];

export const test = base.extend<Fixtures>({
  errors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
    expect(errors, "console errors / uncaught exceptions").toEqual([]);
  },
  start: async ({ page, context, errors }, use, testInfo) => {
    const unexpected: string[] = [];
    await routeExternal(context, unexpected);
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORED_CONSOLE.some((re) => re.test(m.text()))) errors.push(`console.error: ${m.text()}`);
    });
    await use(async ({ path = "/", settings, waitReady = true } = {}) => {
      await context.addInitScript(
        ([s, diag]) => {
          // Fresh profile on the first load of each test (not on in-test reloads).
          if (!sessionStorage.getItem("nexis-e2e")) {
            sessionStorage.setItem("nexis-e2e", "1");
            localStorage.clear();
            localStorage.setItem("nexis:onboarding.json", JSON.stringify({ done: true, version: 1 }));
            if (!(s as { __whatsNew?: boolean } | null)?.__whatsNew) localStorage.setItem("nexis:whatsnew.json", JSON.stringify({ seen: "9999" }));
            if (s) localStorage.setItem("nexis:settings.json", JSON.stringify(s));
          }
          new Function(`(${diag})()`)();
        },
        [settings ?? null, installDiagnosticsMock.toString()] as const,
      );
      // E2E_SLOW=6: run every test on a throttled CPU to shake out timing races.
      if (process.env.E2E_SLOW) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.E2E_SLOW) });
      await page.goto(path);
      if (waitReady) await page.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
      return page;
    });
    if (unexpected.length) await testInfo.attach("unmatched-external-requests", { body: [...new Set(unexpected)].join("\n") });
  },
});

export { expect };

// ------------------------------------------------------------------ app drivers

type NexisWindow = Window & { __nexis: { actions: Record<string, (...a: unknown[]) => unknown>; getState: () => Record<string, unknown> } };

/** Fire a backend event (`nexis:<name>`), as the Tauri bridge's browser fallback listens for. */
export const emit = (page: Page, name: string, detail: unknown) =>
  page.evaluate(([n, d]) => window.dispatchEvent(new CustomEvent(`nexis:${n}`, { detail: d })), [name, detail] as const);

/** Call a store action, e.g. `act(page, "setTab", "build")`. */
export const act = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([n, a]) => void (window as unknown as NexisWindow).__nexis.actions[n](...a), [name, args] as const);

/** Read a JSON-serialisable slice of the store. */
export const storeValue = <T>(page: Page, fn: string) => page.evaluate((f) => new Function("s", `return (${f})(s)`)((window as unknown as NexisWindow).__nexis.getState()) as T, fn);

/** Live Client API snapshot (`/liveclientdata/allgamedata`) — Mayhem game, 12:22 in, you are Ahri. */
export const liveGame = () => fixtureJson<Record<string, unknown> & { gameData: { gameMode: string; gameTime: number } }>("live-game.json");

/** Champ select session as the LCU reports it: you on Ahri, a bench to swap with. */
export const champSelect = {
  localPlayerCellId: 0,
  myTeam: [
    { cellId: 0, championId: 103, assignedPosition: "" },
    { cellId: 1, championId: 222 },
    { cellId: 2, championId: 99 },
    { cellId: 3, championId: 54 },
    { cellId: 4, championId: 81 },
  ],
  benchChampions: [{ championId: 238 }, { championId: 16 }, { championId: 86 }],
  benchEnabled: true,
};
