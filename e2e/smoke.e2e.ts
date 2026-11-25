// Smoke tests: one pass through every main surface of the app with network fixtures in place.
// Fast and deterministic — they assert structure (things render, flows connect), not numbers.

import type { Page } from "@playwright/test";
import { encodeBuild } from "../src/engine/shareCode";
import { act, champSelect, emit, expect, liveGame, storeValue, test } from "./support";

const tab = (page: Page, t: string) => page.locator(`[data-tab="${t}"]`);
const modeSelect = (page: Page) => page.getByRole("combobox", { name: "Game mode" });

test("boots to Home without errors", async ({ start }) => {
  const page = await start();
  await expect(tab(page, "home")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("combobox", { name: "Search champions" })).toBeVisible();
  await expect(page.locator(".nav-version")).toHaveText("Patch 26.23");
});

test("champion search opens Build with build order, shop card and runes", async ({ start }) => {
  const page = await start();
  await page.getByRole("combobox", { name: "Search champions" }).fill("ahr");
  await page.getByRole("option", { name: /Ahri/ }).click();
  await expect(tab(page, "build")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".order-card .order .slot-icon").first()).toBeVisible();
  await expect(page.locator(".order-source")).toContainText("HexMayhem");
  await expect(page.locator(".shop-card")).toBeVisible();
  await expect(page.getByRole("region", { name: "Runes and summoner spells" })).toBeVisible();
  // HexMayhem has no runes: OP.GG's Mayhem rune pages fill them in.
  await expect(page.getByRole("region", { name: "Runes and summoner spells" })).toContainText("Runes: OP.GG");
});

test("mode switch changes the stats provider", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "build");
  // "Data: <provider>" pill on the Build order card.
  const source = page.locator(".order-card .card-head");
  for (const [mode, label] of [
    ["mayhem", "Data: HexMayhem"],
    ["aram", "Data: OP.GG"],
    ["sr", "Data: OP.GG"],
    ["arena", "Data: OP.GG"],
  ] as const) {
    await modeSelect(page).selectOption(mode);
    await expect(source).toContainText(label);
    await expect(page.locator(".order-card .order .slot-icon").first()).toBeVisible();
    const status = await storeValue<string>(page, `(s) => { const v = Object.entries(s.web.champions).find(([k]) => k.startsWith("${mode}:"))?.[1]; return typeof v === "string" ? v : "ok"; }`);
    expect(status, `${mode} stats`).toBe("ok");
  }
});

test("champ select switches to Build with pick helper and team comp", async ({ start }) => {
  const page = await start();
  await emit(page, "client-info", { phase: "ChampSelect", gameMode: "KIWI", queueId: 2400 });
  await emit(page, "champ-select", champSelect);
  await expect(tab(page, "build")).toHaveAttribute("aria-current", "page");
  const helper = page.getByRole("region", { name: "Pick helper" });
  await expect(helper).toBeVisible();
  await expect(helper.locator('[aria-label="Team composition"]')).toBeVisible();
  await expect(page.locator(".tb-champ-name")).toHaveText("Ahri");
});

test("live game shows the HUD mini panel and team power", async ({ start, context }) => {
  const game = liveGame();
  const page = await start({ settings: { hud: { showPower: true, showFarm: true } } });
  await emit(page, "live-game", game);
  await expect(tab(page, "build")).toHaveAttribute("aria-current", "page");
  await tab(page, "enemies").click();
  await expect(page.locator(".tp-card")).toBeVisible();
  await expect(page.locator(".tp-card")).toContainText("Team power");

  // The in-game HUD window (separate webview: ?view=hud) gets the same events.
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  await emit(hud, "live-game", game);
  await expect(hud.locator(".nl-hud")).toBeVisible();
  await expect(hud.locator(".nl-power")).toBeVisible();
  // Farming: 44 CS at 12:22 (Mayhem: no role target, so no color / goal).
  await expect(hud.locator(".nl-farm")).toContainText("3.6");
  await expect(hud.locator(".nl-farm")).toContainText("44 CS");
  await expect(hud.locator(".nl-farm-goal")).toHaveCount(0);
});

test("augment offer (Mayhem) shows ranked augments", async ({ start }) => {
  const page = await start();
  await emit(page, "live-game", liveGame());
  const offer = ["Back To Basics", "Clown College", "Draw Your Sword"];
  await emit(page, "augment-scan", {
    ok: true,
    scan: { millis: 40, lines: offer.map((text, i) => ({ text, x: 200 + i * 300, y: 300, w: 180, h: 24 })) },
  });
  await expect(tab(page, "augments")).toHaveAttribute("aria-current", "page");
  const cards = page.locator("article.offer");
  await expect(cards).toHaveCount(3);
  await expect(cards.locator(".grade-big")).toHaveCount(3);
  await expect(page.locator(".offer-best .ribbon")).toHaveText("#1 Pick");
  const names = await page.locator(".offer-name").allInnerTexts();
  expect([...names].sort()).toEqual([...offer].sort());
});

test("game end shows the post-game summary with timeline", async ({ start }) => {
  const page = await start();
  await emit(page, "client-info", { phase: "InProgress", gameMode: "KIWI", queueId: 2400 });
  // Replay a short game through the Live Client API events: items bought over time, then GameEnd.
  await page.evaluate((base) => {
    const prog: Array<[number, number[]]> = [[0, [1056, 2003]], [240, [1056, 1052]], [540, [6655, 1001]], [690, [6655, 3020]], [930, [6655, 3020, 4645]], [1200, [6655, 3020, 4645, 3089]]];
    const end = 1300;
    const snap = (t: number, ended = false) => {
      const g = structuredClone(base) as unknown as { allPlayers: Array<{ items: unknown[]; level: number; scores: Record<string, number> }>; gameData: { gameTime: number }; events: unknown };
      g.gameData.gameTime = t;
      const me = g.allPlayers[0];
      me.items = prog.filter(([pt]) => pt <= t).at(-1)![1].map((itemID) => ({ itemID, displayName: String(itemID) }));
      me.level = Math.min(18, 1 + Math.floor(t / 95));
      me.scores = { kills: Math.floor(t / 180), deaths: Math.floor(t / 400), assists: Math.floor(t / 150), creepScore: Math.floor(t / 20), wardScore: 0 };
      g.events = { Events: ended ? [{ EventName: "GameEnd", Result: "Win" }] : [] };
      return g;
    };
    const fire = (d: unknown) => window.dispatchEvent(new CustomEvent("nexis:live-game", { detail: d }));
    for (let t = 1.5; t < end; t += 10) fire(snap(t));
    fire(snap(end, true));
  }, liveGame());
  const dialog = page.getByRole("dialog").filter({ has: page.locator("#pg-title") });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#pg-title")).toBeVisible();
  await expect(dialog.locator(".gtl-plot svg[role=img]")).toBeVisible();
  const samples = await storeValue<number>(page, "(s) => s.history.at(-1)?.timeline?.samples.length ?? 0");
  expect(samples).toBeGreaterThan(5);
  // Shareable recap image (PNG).
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save image" }).click();
  const png = await download;
  expect(png.suggestedFilename()).toMatch(/^nexis-[a-z]+-\d{4}-\d\d-\d\d\.png$/);
  const bytes = await (await import("node:fs")).promises.readFile((await png.path())!);
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  if (process.env.SHOT) await (await import("node:fs")).promises.writeFile(process.env.SHOT, bytes);
  // Esc closes the summary (and doesn't hide the overlay).
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // History: CS/min from the recorded timeline (1 CS every 20 s → 3.0).
  await tab(page, "history").click();
  await expect(page.locator(".hi-sum-cs")).toContainText("3.0");
  await expect(page.locator(".hi-m-kda").first()).toContainText("3.0 CS/m");
});

test("settings sections render, including mocked diagnostics", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  for (const s of ["general", "hotkeys", "appearance", "overlay", "data", "about"]) {
    await page.locator(`[data-section="${s}"]`).click();
    await expect(page.locator(`[data-section="${s}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`.settings-grid.settings-${s} .card`).first()).toBeVisible();
  }
  await page.locator('[data-section="diagnostics"]').click();
  await expect(page.locator(".diag-row").first()).toBeVisible();
  await expect(page.locator(".diag-log")).toContainText("Nexis started (e2e)");
  await expect(page.locator(".diag-row", { hasText: "League client" })).toContainText("Connected");
  await expect(page.locator(".diag-row", { hasText: "Hotkeys" })).toContainText("1/2 registered");
});

test("tier list renders for each mode", async ({ start }) => {
  const page = await start();
  await tab(page, "tiers").click();
  for (const mode of ["mayhem", "aram", "sr", "arena"]) {
    await modeSelect(page).selectOption(mode);
    await expect(page.locator(".tl-row .tl-champ").first(), mode).toBeVisible();
    const status = await storeValue<string>(page, `(s) => s.tierLists["${mode}"]?.status`);
    expect(status, mode).toBe("ok");
  }
});

test("command palette (Ctrl+K) jumps to a champion build", async ({ start }) => {
  const page = await start();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("ahri");
  await expect(palette.getByRole("option").first()).toContainText("Ahri");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(tab(page, "build")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".tb-champ-name")).toHaveText("Ahri");
});

test("Esc closes palette / clears search first, then hides the overlay", async ({ start }) => {
  const page = await start();
  // Count hide() calls (a no-op in the browser; the desktop app hides the window).
  await page.evaluate(() => {
    const w = window as unknown as { __hides: number; __nexis: { actions: { hide: () => void } } };
    w.__hides = 0;
    w.__nexis.actions.hide = () => void w.__hides++;
  });
  const hides = () => page.evaluate(() => (window as unknown as { __hides: number }).__hides);

  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeHidden();
  expect(await hides()).toBe(0);

  const search = page.getByRole("combobox", { name: "Search champions" });
  await search.fill("lux");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  expect(await hides()).toBe(0);

  await search.blur();
  await page.locator("body").press("Escape");
  await expect.poll(hides).toBe(1);
});

test("data source picker switches the recommendation and falls back", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "build");
  await modeSelect(page).selectOption("mayhem");
  const bar = page.locator(".view-build .data-source-bar");
  await expect(bar.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
  await expect(bar).toContainText("Using HexMayhem");
  await bar.getByRole("radio", { name: "Baseline" }).click();
  await expect(bar).toContainText("Using Baseline");
  await expect(page.locator(".order-card .order .slot-icon").first()).toBeVisible();
  // No recorded games: "My games" falls back to Auto with a notice, never an empty build.
  await bar.getByRole("radio", { name: "My games" }).click();
  await expect(bar).toContainText("My games has no data for Ahri — using Auto");
  await expect(page.locator(".order-card .order .slot-icon").first()).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await bar.getByRole("radio", { name: "Auto" }).click();
  await expect(bar).toContainText("Using HexMayhem");
  // ARAM has no HexMayhem.
  await modeSelect(page).selectOption("aram");
  await expect(bar.getByRole("radio", { name: "HexMayhem" })).toHaveCount(0);
});

test("SR roles: click two teammates to swap, Team power follows, Reset restores", async ({ start }) => {
  const POS: Record<string, string> = {
    Ahri: "MIDDLE", Jinx: "BOTTOM", Leona: "UTILITY", Lux: "JUNGLE", Darius: "TOP",
    Soraka: "UTILITY", Aatrox: "TOP", Vladimir: "JUNGLE", Zed: "MIDDLE", Malphite: "BOTTOM",
  };
  const game = liveGame() as ReturnType<typeof liveGame> & { allPlayers: Array<{ championName: string; position?: string }> };
  game.gameData.gameMode = "CLASSIC";
  for (const p of game.allPlayers) p.position = POS[p.championName];
  const page = await start();
  await emit(page, "live-game", game);
  await tab(page, "enemies").click();
  const roles = page.locator(".roles-card");
  const row = (lane: string) => roles.locator(".rb-row", { has: page.locator(".rb-lane", { hasText: new RegExp(`^${lane}$`) }) });
  const chip = (name: string) => roles.getByRole("button", { name: new RegExp(`^${name}`) });
  await expect(row("Jungle")).toContainText("Vladimir");
  // Vladimir then Zed: they swap (Vladimir Mid, Zed Jungle).
  await chip("Vladimir").click();
  await expect(chip("Ahri")).toBeDisabled(); // other team can't be swapped with
  await chip("Zed").click();
  await expect(row("Mid")).toContainText("Vladimir");
  await expect(row("Jungle")).toContainText("Zed");
  // Lane rows are in LANES order (Top, Jungle, Mid, ...): Mid is now Ahri vs Vladimir.
  await expect(page.locator(".tp-lanes > li").nth(2)).toContainText("Vladimir");
  await expect(page.locator(".tp-lanes > li").nth(1)).toContainText("Zed");
  expect(await storeValue<string>(page, "(s) => s.settings.roleOverrides.roles['CHAOS:Vladimir']")).toBe("MIDDLE");
  // Your own role: Darius ↔ you.
  await chip("Darius").click();
  await chip("Ahri").click();
  await expect(row("Top")).toContainText("Ahri");
  await roles.getByRole("button", { name: "Reset" }).click();
  await expect(row("Jungle")).toContainText("Vladimir");
  await expect(row("Mid")).toContainText("Ahri");
  expect(await storeValue<unknown>(page, "(s) => s.settings.roleOverrides")).toBeNull();
});

test("role editor is hidden outside Summoner's Rift", async ({ start }) => {
  const page = await start();
  await emit(page, "live-game", liveGame());
  await expect(page.locator(".context-bar")).toBeVisible();
  await tab(page, "enemies").click();
  await expect(page.locator(".roles-card")).toHaveCount(0);
});

test("keys typed right after Ctrl+K land in the palette, even on a slow machine", async ({ start }) => {
  const page = await start();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 20 });
  await page.keyboard.press("Control+k");
  await page.keyboard.type("ahri");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByRole("textbox", { name: "Search commands" })).toHaveValue("ahri");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});

test("HUD shows a pick reminder for ~8 s when augment cards are detected", async ({ start, context }) => {
  await start();
  const hud = await context.newPage();
  await hud.clock.install();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  await emit(hud, "live-game", liveGame());
  const offer = ["Back To Basics", "Clown College", "Draw Your Sword"];
  const scan = { ok: true, auto: true, scan: { millis: 40, lines: offer.map((text, i) => ({ text, x: 200 + i * 300, y: 300, w: 180, h: 24 })) } };
  // Background detection needs the same cards twice in a row.
  await emit(hud, "augment-scan", scan);
  await emit(hud, "augment-scan", scan);
  const reminder = hud.locator(".nl-pick-reminder");
  await expect(reminder).toContainText("Mark your augment pick");
  await expect(reminder).toContainText("Ctrl+Shift+Space");
  await hud.clock.fastForward(5000);
  await expect(reminder).toHaveClass(/nl-in/);
  await hud.clock.fastForward(4000);
  await expect(reminder).toHaveCount(0);
});

test("HUD Minimal / Standard / Full preset", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  await page.locator('[data-section="overlay"]').click();
  const preset = page.getByRole("radiogroup", { name: "HUD preset" });
  await expect(preset.getByRole("radio", { name: "Standard" })).toHaveAttribute("aria-checked", "true");
  await preset.getByRole("radio", { name: "Minimal" }).click();
  await expect(preset.getByRole("radio", { name: "Minimal" })).toHaveAttribute("aria-checked", "true");
  expect(await storeValue<Record<string, boolean>>(page, "(s) => s.settings.hud")).toMatchObject({ compact: true, showBuildPath: false, showThreats: false, showNextItem: true, showSkillOrder: true });
  await preset.getByRole("radio", { name: "Full" }).click();
  expect(await storeValue<boolean>(page, "(s) => s.settings.hud.showBuildPath")).toBe(true);
  expect(await storeValue<boolean>(page, "(s) => s.settings.hud.showTips")).toBe(true);
});

test("detects the augment pick from the screen and shows it on the HUD", async ({ start, context }) => {
  const scanOf = (names: string[]) => ({ ok: true, auto: true, scan: { millis: 40, lines: names.map((text, i) => ({ text, x: 200 + i * 300, y: 300, w: 180, h: 24 })) } });
  const offer = ["Back To Basics", "Clown College", "Draw Your Sword"];
  // Main window: records the pick.
  const page = await start();
  await emit(page, "live-game", liveGame());
  await emit(page, "augment-scan", scanOf(offer));
  await emit(page, "augment-scan", scanOf(["Clown College"]));
  await emit(page, "augment-scan", scanOf(["Clown College"]));
  await emit(page, "augment-scan", scanOf(["Clown College"]));
  await expect.poll(() => storeValue<string[]>(page, "(s) => s.myAugments")).toContain("Clown College");
  // HUD window: receives the synced list (sync-augments) and shows "✓ Picked".
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  await emit(hud, "live-game", liveGame());
  await emit(hud, "sync-augments", []);
  // A pick mid-game (the first seconds after the HUD opens are its initial sync, not a pick).
  await hud.waitForTimeout(3200);
  await emit(hud, "sync-augments", ["Clown College"]);
  await expect(hud.locator(".nl-picked")).toContainText("Picked Clown College");
});

test("share a build code and import one", async ({ start, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "build");
  await page.getByRole("button", { name: "Share" }).click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toMatch(/^NX1-/);
  // Import a friend's Jinx ARAM code.
  const friend = encodeBuild({ champion: "Jinx", mode: "aram", choice: { core: "3031,3094,3036" } });
  await page.getByRole("button", { name: "Paste code" }).click();
  await page.getByRole("textbox", { name: "Build code" }).fill(friend);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect.poll(() => storeValue<unknown>(page, "(s) => s.settings.buildChoices['aram:Jinx']")).toEqual({ core: "3031,3094,3036" });
  expect(await storeValue<string>(page, "(s) => s.explore.champion")).toBe("Jinx");
});

test("streamer mode hides player names on the Players tab", async ({ start }) => {
  const page = await start();
  await emit(page, "live-game", liveGame());
  await tab(page, "enemies").click();
  const view = page.locator(".view-enemies");
  await expect(view).toContainText("Powder");
  await act(page, "updateSettings", { streamerMode: true });
  await expect(view).not.toContainText("Powder");
  await expect(view).not.toContainText("#NA1");
  await expect(view).toContainText("Jinx player");
});

test("history exports as CSV and copies for a spreadsheet", async ({ start, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await start();
  const rec = { id: "e2e-1", date: "2026-11-20T21:05:00Z", champion: "Ahri", result: "Win", kills: 9, deaths: 2, assists: 11, durationSec: 1230, items: [], augments: ["Eureka"], enemies: ["Zed"], gameMode: "KIWI" };
  await act(page, "importHistory", [rec]);
  await tab(page, "history").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^nexis-history-\d{4}-\d\d-\d\d\.csv$/);
  const csv = await (await import("node:fs")).promises.readFile((await file.path())!, "utf8");
  expect(csv).toContain("Date,Mode,Champion,Result");
  expect(csv).toContain("ARAM: Mayhem,Ahri,Win,9,2,11");
  await page.getByRole("button", { name: "Copy for spreadsheet" }).click();
  const tsv = await page.evaluate(() => navigator.clipboard.readText());
  expect(tsv.split("\n")[1].split("\t").slice(1, 4)).toEqual(["ARAM: Mayhem", "Ahri", "Win"]);
});

test("What's new shows once after an update", async ({ start }) => {
  const page = await start({ settings: { __whatsNew: true } });
  const dialog = page.getByRole("dialog", { name: "What's new in Nexis" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Got it" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  await page.waitForTimeout(300);
  await expect(dialog).toHaveCount(0);
});

test("HUD layout per mode follows the mode switch", async ({ start }) => {
  const page = await start({ settings: { mode: "mayhem", hudPerMode: true } });
  const compact = () => storeValue<boolean>(page, "(s) => s.settings.hud.compact");
  await act(page, "updateSettings", { hud: { ...(await storeValue<Record<string, unknown>>(page, "(s) => s.settings.hud")), compact: true } });
  await modeSelect(page).selectOption("aram");
  await expect.poll(() => storeValue<boolean>(page, "(s) => !!s.settings.hudByMode.mayhem")).toBe(true);
  await act(page, "updateSettings", { hud: { ...(await storeValue<Record<string, unknown>>(page, "(s) => s.settings.hud")), compact: false } });
  await modeSelect(page).selectOption("mayhem");
  await expect.poll(compact).toBe(true);
  await modeSelect(page).selectOption("aram");
  await expect.poll(compact).toBe(false);
});

test("Summoner's Rift role picker loads that role's build", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "build");
  await modeSelect(page).selectOption("sr");
  const role = page.getByRole("radiogroup", { name: "Role" });
  await expect(role.getByRole("radio", { name: /^Auto/ })).toHaveAttribute("aria-checked", "true");
  await role.getByRole("radio", { name: "Top" }).click();
  await expect.poll(() => storeValue<string>(page, "(s) => s.settings.srRole")).toBe("top");
  await expect.poll(() => storeValue<boolean>(page, "(s) => typeof s.web.champions['sr:Ahri:top'] === 'object'")).toBe(true);
  await expect(page.locator(".order-card .order .slot-icon").first()).toBeVisible();
  // Other modes have no roles.
  await modeSelect(page).selectOption("aram");
  await expect(page.getByRole("radiogroup", { name: "Role" })).toHaveCount(0);
});

test("Guide: change champion", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "guide");
  await page.getByRole("button", { name: "Change champion" }).click();
  await page.keyboard.type("Jinx");
  await page.keyboard.press("Enter");
  await expect(page.locator(".gd-hero-name")).toContainText("Jinx");
});

test("Augments: Look for next lists the best picks left per rarity", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await modeSelect(page).selectOption("mayhem");
  await act(page, "setTab", "augments");
  const card = page.locator(".lfn-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".lfn-item").first()).toBeVisible();
  const first = (await card.locator(".lfn-name").first().innerText()).trim();
  // Taking it removes it from the list.
  await act(page, "takeAugment", first);
  await expect(card.locator(".lfn-name", { hasText: new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })).toHaveCount(0);
  if (process.env.SHOT) await card.screenshot({ path: process.env.SHOT });
});

test("HUD opens a shop view while you're dead", async ({ start, context }) => {
  await start({ settings: { hud: { collapsed: true } } });
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  const game = liveGame() as ReturnType<typeof liveGame> & { allPlayers: Array<Record<string, unknown>> };
  await emit(hud, "live-game", game);
  await expect(hud.locator(".nl-collapsed")).toBeVisible();
  game.allPlayers[0].isDead = true;
  game.allPlayers[0].respawnTimer = 12.4;
  await emit(hud, "live-game", game);
  await expect(hud.locator(".nl-dead")).toHaveText("Dead · 13s · shop now");
  await expect(hud.locator(".nl-collapsed")).toHaveCount(0);
  await expect(hud.locator(".nl-sec").first()).toHaveClass(/nl-sec-shop/);
  game.allPlayers[0].isDead = false;
  await emit(hud, "live-game", game);
  await expect(hud.locator(".nl-dead")).toHaveCount(0);
  await expect(hud.locator(".nl-collapsed")).toBeVisible();
});

test("hover text uses the styled tip, not the plain browser tooltip", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "build");
  const share = page.getByRole("button", { name: "Share" });
  await share.hover();
  const tip = page.locator(".nx-tip");
  await expect(tip).toHaveText("Copy a code with this build's picks to share");
  await expect(share).not.toHaveAttribute("title", /.+/);
  await page.mouse.move(5, 700);
  await expect(tip).toHaveCount(0);
  // The title is given back when the mouse leaves (React keeps owning it).
  await expect(share).toHaveAttribute("title", "Copy a code with this build's picks to share");
  if (process.env.SHOT) {
    await share.hover();
    await expect(tip).toBeVisible();
    await page.screenshot({ path: process.env.SHOT, clip: { x: 500, y: 520, width: 680, height: 160 } });
  }
});

test("loading screen shows a game plan on the Players tab", async ({ start }) => {
  const page = await start();
  const game = liveGame();
  game.gameData.gameTime = 0;
  await emit(page, "live-game", game);
  await expect(tab(page, "enemies")).toHaveAttribute("aria-current", "page");
  const card = page.locator(".gp-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Win condition");
  await expect(card).toContainText("First power spike");
  if (process.env.SHOT) await card.screenshot({ path: process.env.SHOT });
  // Later in the game it's gone.
  game.gameData.gameTime = 600;
  await emit(page, "live-game", game);
  await expect(card).toHaveCount(0);
});

test("champ select scouts teammates when their names are visible", async ({ start }) => {
  const page = await start({ settings: { champSelectFull: true } });
  await emit(page, "client-info", { phase: "ChampSelect", gameMode: "ARAM", queueId: 450, platformId: "NA1" });
  const named = {
    ...champSelect,
    myTeam: champSelect.myTeam.map((m, i) => ({ ...m, gameName: ["Me", "Powder", "Dawnbringer", "LadyOfLight", "Noxus Hand"][i], tagLine: "NA1", nameVisibilityType: "VISIBLE" })),
  };
  await emit(page, "champ-select", named);
  await act(page, "setTab", "build");
  await expect(page.locator(".view-build .sc-card")).toHaveCount(5);
  await expect(page.locator(".view-build")).toContainText("Powder");
  // Hidden names (ranked solo / duo): a short note instead.
  await emit(page, "champ-select", { ...named, myTeam: named.myTeam.map((m) => ({ ...m, nameVisibilityType: "HIDDEN" })) });
  await expect(page.locator(".cs-scout-hidden")).toContainText("Names are hidden");
});

test("champ select lists your best picks from your own games", async ({ start }) => {
  const page = await start({ settings: { champSelectFull: true } });
  const rec = (champion: string, result: string, i: number) => ({ id: `yp-${champion}-${i}`, date: "2026-11-20T21:05:00Z", champion, result, kills: 5, deaths: 3, assists: 9, durationSec: 1100, items: [], augments: [], enemies: [], gameMode: "ARAM" });
  await act(page, "importHistory", [rec("Jinx", "Win", 1), rec("Jinx", "Win", 2), rec("Jinx", "Lose", 3), rec("Lux", "Win", 4)]);
  await emit(page, "client-info", { phase: "ChampSelect", gameMode: "ARAM", queueId: 450, platformId: "NA1" });
  // Jinx is on the bench (id 222 is in the team list; use the bench for her).
  await emit(page, "champ-select", { ...champSelect, myTeam: champSelect.myTeam.filter((m) => m.championId !== 222), benchChampions: [{ championId: 222 }] });
  await act(page, "setTab", "build");
  const card = page.locator(".ybp-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Jinx");
  await expect(card).toContainText("You're 2–1");
});

test("Duo partners: Arena partners from OP.GG synergies", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Jinx");
  await modeSelect(page).selectOption("arena");
  await act(page, "setTab", "build");
  const card = page.locator(".duo-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".duo-list li").first()).toBeVisible();
  await expect(card.locator(".duo-list li")).toHaveCount(5);
  // Rift: only for bot lane roles.
  await modeSelect(page).selectOption("sr");
  await page.getByRole("radiogroup", { name: "Role" }).getByRole("radio", { name: "ADC" }).click();
  await expect(card).toContainText("bot lane");
  await page.getByRole("radiogroup", { name: "Role" }).getByRole("radio", { name: "Mid" }).click();
  await expect(page.locator(".duo-card")).toHaveCount(0);
});

test("champion search guesses short names and typos", async ({ start }) => {
  const page = await start();
  const search = page.getByRole("combobox", { name: "Search champions" });
  for (const [q, name] of [["mf", "Miss Fortune"], ["tahm", "Tahm Kench"], ["yasou", "Yasuo"], ["shyv", "Shyvana"]] as const) {
    await search.fill(q);
    await expect(page.locator(".home-search-item").first()).toContainText(name);
  }
});

test("Build tab: type to pick a champion, or open the full list", async ({ start }) => {
  const page = await start();
  await act(page, "setTab", "build");
  const search = page.getByRole("combobox", { name: "Search champions for a build" });
  await search.fill("tahm");
  await page.keyboard.press("Enter");
  await expect.poll(() => storeValue<string>(page, "(s) => s.explore.champion")).toBe("TahmKench");
  await page.getByRole("button", { name: "All champions" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Demo switch in the sidebar turns off when champ select starts", async ({ start }) => {
  const page = await start();
  const demo = page.locator(".nav-demo");
  await demo.click();
  await expect(demo).toHaveAttribute("aria-pressed", "true");
  expect(await storeValue<boolean>(page, "(s) => s.demo")).toBe(true);
  await emit(page, "champ-select", champSelect);
  await expect.poll(() => storeValue<boolean>(page, "(s) => s.demo")).toBe(false);
  await expect(demo).toHaveCount(0); // hidden during champ select
});

test("Home: Grow your pool suggests champions in your style", async ({ start }) => {
  const page = await start({ settings: { mode: "mayhem" } });
  const rec = (i: number, result: string) => ({ id: `pool-${i}`, date: "2026-11-20T21:05:00Z", champion: "Ahri", result, kills: 5, deaths: 3, assists: 9, durationSec: 1100, items: [], augments: ["Eureka"], enemies: [], gameMode: "KIWI" });
  await act(page, "importHistory", [rec(1, "Win"), rec(2, "Win"), rec(3, "Lose"), rec(4, "Win"), rec(5, "Win"), rec(6, "Lose")]);
  await act(page, "setTab", "home");
  const card = page.locator(".home-pool");
  await expect(card).toBeVisible();
  await expect(card.locator(".pool-item").first()).toBeVisible();
  await expect(card).not.toContainText(/^Ahri$/);
});

test("Home: Patch changes for you compares with the previous patch", async ({ start }) => {
  const page = await start({ settings: { favorites: ["Ahri"] } });
  const card = page.locator(".home-digest");
  await expect(card).toBeVisible();
  await expect(card).toContainText("26.23 vs 26.22");
  // The test copies of both patches are identical.
  await expect(card).toContainText("No changes to your favorites");
});

test("language: Spanish translates the menus and settings", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  await page.getByRole("combobox", { name: "Language" }).selectOption("es");
  await expect(tab(page, "settings")).toContainText("Ajustes");
  await expect(tab(page, "home")).toContainText("Inicio");
  await expect(page.locator(".view-settings")).toContainText("Comportamiento del overlay");
  await expect(page.locator(".view-settings")).toContainText("Modo streamer");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.getByRole("combobox", { name: "Language" }).selectOption("en");
  await expect(tab(page, "settings")).toContainText("Settings");
});

test("Discord status settings: off by default, app ID validated", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  const id = page.getByRole("textbox", { name: "Discord application ID" });
  await expect(id).toHaveValue("");
  expect(await storeValue<boolean>(page, "(s) => s.settings.discord.enabled")).toBe(false);
  await id.fill("abc");
  await expect(page.locator(".view-settings")).toContainText("doesn't look like an application ID");
  await id.fill("123456789012345678");
  await id.blur();
  await expect.poll(() => storeValue<string>(page, "(s) => s.settings.discord.appId")).toBe("123456789012345678");
});

test("About: check for updates reports a result", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  await page.locator('[data-section="about"]').click();
  await page.getByRole("button", { name: "Check for updates" }).click();
  // Local dev builds skip the check; CI builds carry a real version and the test network blocks
  // GitHub, so either answer is a correct result here.
  await expect(page.locator(".view-settings")).toContainText(/Development build|Couldn't reach GitHub|newest build|newer build/);
});

test("in-game HUD follows the language", async ({ start, context }) => {
  await start({ settings: { language: "es" } });
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  await emit(hud, "live-game", liveGame());
  await expect(hud.locator(".nl-hud")).toContainText(/COMPRAR YA|SIGUIENTE OBJETO/);
});

test("Build tab: '/' focuses the champion search", async ({ start }) => {
  const page = await start();
  await act(page, "setTab", "build");
  await page.locator("body").click({ position: { x: 5, y: 700 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("combobox", { name: "Search champions for a build" })).toBeFocused();
});

test("a role picked by hand doesn't leak into the next champ select (same assigned role)", async ({ start }) => {
  const page = await start({ settings: { mode: "sr" } });
  const mid = { ...champSelect, myTeam: champSelect.myTeam.map((m, i) => (i === 0 ? { ...m, assignedPosition: "middle" } : m)) };
  await emit(page, "champ-select", mid);
  await emit(page, "champ-select", null);
  await act(page, "setSrRole", "support");
  await expect.poll(() => storeValue<string>(page, "(s) => s.settings.srRole")).toBe("support");
  await emit(page, "champ-select", mid);
  await expect.poll(() => storeValue<string>(page, "(s) => s.settings.srRole")).toBe("");
});

test("Build tab: type to add enemies", async ({ start }) => {
  const page = await start();
  await act(page, "setExploreChampion", "Ahri");
  await act(page, "setTab", "build");
  const add = page.getByRole("combobox", { name: "Add an enemy champion" });
  await add.fill("zed");
  await page.keyboard.press("Enter");
  await add.fill("mf");
  await page.keyboard.press("Enter");
  await expect.poll(() => storeValue<string[]>(page, "(s) => s.explore.enemies")).toEqual(["Zed", "MissFortune"]);
});

test("Settings search finds settings across tabs", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  const search = page.getByRole("textbox", { name: "Search settings" });
  await search.fill("streamer");
  await expect(page.getByText("Streamer mode", { exact: true })).toBeVisible();
  await expect(page.getByText("Start hidden in the tray", { exact: true })).toBeHidden();
  await search.fill("badge position");
  await expect(page.getByText("Badge position", { exact: true })).toBeVisible();
  await search.fill("zzzzqq");
  await expect(page.locator(".view-settings")).toContainText("No settings match");
  await search.fill("");
  await expect(page.locator('[data-section="general"]')).toHaveAttribute("aria-selected", "true");
});

test("HUD fades during play and wakes when there's a reason to look", async ({ start, context }) => {
  await start();
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  const game = liveGame() as ReturnType<typeof liveGame> & { activePlayer: Record<string, unknown> };
  game.gameData.gameTime = 600;
  game.activePlayer.currentGold = 0;
  delete game.activePlayer.abilities; // no live ability ranks: no "skill point waiting"
  await emit(hud, "live-game", game);
  const wrap = hud.locator(".nl-hover");
  await expect(wrap).toHaveClass(/nl-idle/);
  // Enough gold for the next item: fully visible.
  game.activePlayer.currentGold = 5000;
  await emit(hud, "live-game", game);
  await expect(wrap).not.toHaveClass(/nl-idle/);
});

test("HUD highlights the ability to level up next", async ({ start, context }) => {
  await start();
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  const game = liveGame() as ReturnType<typeof liveGame> & { activePlayer: Record<string, unknown> };
  // Level 11 with 10 points spent: one point waiting.
  game.activePlayer.abilities = { Q: { abilityLevel: 5 }, W: { abilityLevel: 1 }, E: { abilityLevel: 2 }, R: { abilityLevel: 2 } };
  await emit(hud, "live-game", game);
  const skill = hud.locator(".nl-skill");
  await expect(skill).toContainText("LEVEL UP");
  await expect(skill.locator(".nl-ab-hot")).toHaveCount(1);
  await expect(skill.locator(".nl-ab")).toHaveCount(4);
});

test("level-up arrow over League's ability bar when a point is waiting", async ({ start, context }) => {
  await start();
  const hud = await context.newPage();
  await hud.goto("/?view=hud");
  await hud.waitForFunction(() => (window as unknown as { __nexis?: { getState(): { status: string } } }).__nexis?.getState().status === "ready");
  const game = liveGame() as ReturnType<typeof liveGame> & { activePlayer: Record<string, unknown> };
  game.activePlayer.abilities = { Q: { abilityLevel: 5 }, W: { abilityLevel: 1 }, E: { abilityLevel: 2 }, R: { abilityLevel: 2 } };
  await emit(hud, "live-game", game);
  await expect(hud.locator(".nl-lvl-arrow")).toHaveCount(1);
  if (process.env.SHOT) await hud.screenshot({ path: process.env.SHOT });
  // Point spent: no arrow.
  game.activePlayer.abilities = { Q: { abilityLevel: 5 }, W: { abilityLevel: 2 }, E: { abilityLevel: 2 }, R: { abilityLevel: 2 } };
  await emit(hud, "live-game", game);
  await expect(hud.locator(".nl-lvl-arrow")).toHaveCount(0);
});
