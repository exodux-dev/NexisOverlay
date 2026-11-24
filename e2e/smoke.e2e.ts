// Smoke tests: one pass through every main surface of the app with network fixtures in place.
// Fast and deterministic — they assert structure (things render, flows connect), not numbers.

import type { Page } from "@playwright/test";
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
  const page = await start({ settings: { hud: { showPower: true } } });
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
  // Esc closes the summary (and doesn't hide the overlay).
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
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

test("HUD Minimal / Full preset", async ({ start }) => {
  const page = await start();
  await tab(page, "settings").click();
  await page.locator('[data-section="overlay"]').click();
  const preset = page.getByRole("radiogroup", { name: "HUD preset" });
  await expect(preset.getByRole("radio", { name: "Full" })).toHaveAttribute("aria-checked", "true");
  await preset.getByRole("radio", { name: "Minimal" }).click();
  await expect(preset.getByRole("radio", { name: "Minimal" })).toHaveAttribute("aria-checked", "true");
  expect(await storeValue<Record<string, boolean>>(page, "(s) => s.settings.hud")).toMatchObject({ compact: true, showBuildPath: false, showThreats: false, showNextItem: true, showSkillOrder: true });
  await preset.getByRole("radio", { name: "Full" }).click();
  expect(await storeValue<boolean>(page, "(s) => s.settings.hud.showBuildPath")).toBe(true);
});
