import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./store";

// "Never wipe or mess with the user's settings": normalizing only fills in missing keys.
describe("settings normalization is additive", () => {
  const user = {
    hotkeyToggle: "Ctrl+Alt+O",
    playstyle: "aggressive",
    opacity: 0.9,
    lastChampion: "Ahri",
    leaguePath: "E:\\Games\\League of Legends",
    theme: { preset: "midnight", scale: 1.1 },
    buildStyles: { Ahri: "ap-burst" },
    leagueImport: { runes: true },
    windowLocked: true,
    someFutureKey: { kept: true },
    hotkeysMigrated: true,
  };

  it("keeps every user value, including keys it doesn't know", () => {
    for (const migrate of [false, true]) {
      const s = normalizeSettings(user, migrate) as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(user)) {
        if (k === "theme" || k === "leagueImport") continue;
        expect(s[k], k).toEqual(v);
      }
      expect((s.theme as { scale: number }).scale).toBe(1.1);
      expect(s.leagueImport).toEqual({ runes: true, itemSets: false, auto: false });
    }
  });

  it("adds missing keys with defaults", () => {
    const s = normalizeSettings({ playstyle: "safe" });
    expect(s.playstyle).toBe("safe");
    expect(s.hotkeyScan).toBe(DEFAULT_SETTINGS.hotkeyScan);
    expect(s.windowLocked).toBe(false);
    expect(s.theme.preset).toBe(DEFAULT_SETTINGS.theme.preset);
  });

  it("moves the old Alt+Z defaults once, never a deliberate choice afterwards", () => {
    const old = normalizeSettings({ hotkeyToggle: "Alt+Z", hotkeyScan: "Ctrl+Q" }, true) as unknown as Record<string, unknown>;
    expect(old.hotkeyToggle).toBe(DEFAULT_SETTINGS.hotkeyToggle);
    expect(old.hotkeyScan).toBe("Ctrl+Q");
    expect(old.hotkeysMigrated).toBe(true);
    const later = normalizeSettings({ hotkeyToggle: "Alt+Z", hotkeysMigrated: true }, true);
    expect(later.hotkeyToggle).toBe("Alt+Z");
  });

  it("doesn't mutate the stored object", () => {
    const raw = JSON.parse(JSON.stringify(user));
    normalizeSettings(raw, true);
    expect(raw).toEqual(user);
  });
});

describe("build option picks (settings.buildChoices)", () => {
  it("adds an empty map for old settings and keeps stored picks untouched", () => {
    expect(normalizeSettings({}).buildChoices).toEqual({});
    expect(DEFAULT_SETTINGS.buildChoices).toEqual({});
    const stored = { "sr:Ahri:mid": { rune: 1, core: 2 }, "aram:Jinx": { boots: 0 }, "sr:Jinx:adc": { core: "3031,3094,3036", spells: "4+7" } };
    expect(normalizeSettings({ buildChoices: stored }, true).buildChoices).toEqual(stored);
    expect(normalizeSettings({ buildChoices: "junk" } as unknown as Record<string, unknown>).buildChoices).toEqual({});
  });
});

describe("data source picks (settings.dataSources)", () => {
  it("adds an empty map for old settings and keeps stored picks untouched", () => {
    expect(normalizeSettings({}).dataSources).toEqual({});
    expect(DEFAULT_SETTINGS.dataSources).toEqual({});
    const stored = { mayhem: "opgg", sr: "personal" };
    expect(normalizeSettings({ dataSources: stored }, true).dataSources).toEqual(stored);
    expect(normalizeSettings({ dataSources: "bad" } as never).dataSources).toEqual({});
  });
});

describe("role overrides (settings.roleOverrides)", () => {
  it("adds null for old settings and keeps stored overrides", () => {
    expect(normalizeSettings({}).roleOverrides).toBeNull();
    const stored = { game: "CLASSIC|a|b", roles: { "CHAOS:Vladimir": "MIDDLE" as const } };
    expect(normalizeSettings({ roleOverrides: stored }, true).roleOverrides).toEqual(stored);
  });
});

describe("badge placement (settings.badgePlacement)", () => {
  it("defaults to above the cards and keeps a stored choice", () => {
    expect(normalizeSettings({}).badgePlacement).toBe("above");
    expect(normalizeSettings({ badgePlacement: "below" }).badgePlacement).toBe("below");
    expect(normalizeSettings({ badgePlacement: "sideways" } as never).badgePlacement).toBe("above");
  });
});

describe("theme v2 (Nexis default, League kept as Classic)", () => {
  it("new installs get the Nexis theme", () => {
    expect(normalizeSettings({}).theme.preset).toBe("nexis");
  });
  it("moves the old League default to Nexis once; a later pick of Classic is kept", () => {
    const old = normalizeSettings({ theme: { preset: "league" } } as never, true) as unknown as { theme: { preset: string }; themeV2: boolean };
    expect(old.theme.preset).toBe("nexis");
    expect(old.themeV2).toBe(true);
    const later = normalizeSettings({ theme: { preset: "league" }, themeV2: true } as never, true);
    expect(later.theme.preset).toBe("league");
    // Other presets are never touched.
    expect(normalizeSettings({ theme: { preset: "void" } } as never, true).theme.preset).toBe("void");
  });
});

describe("augment offer confirmation (faster detection)", () => {
  it("shows three recognized cards at once, needs two scans for a pair", async () => {
    const { offerConfirmed } = await import("./store");
    expect(offerConfirmed(3, "A|B|C", "")).toBe(true);
    expect(offerConfirmed(2, "A|B", "")).toBe(false);
    expect(offerConfirmed(2, "A|B", "A|B")).toBe(true);
  });
});

describe("HUD layout per mode (hudSwap)", () => {
  it("parks the active layout and brings in the new mode's", async () => {
    const { hudSwap } = await import("./store");
    const { normalizeHud } = await import("../views/hudSettings");
    const mayhemHud = normalizeHud({ x: 0.9, y: 0.1, compact: true });
    const s = { hudPerMode: true, hud: mayhemHud, hudByMode: {} };
    // First visit to Arena: keeps the current layout as its start, parks Mayhem's.
    const toArena = hudSwap(s, "mayhem", "arena")!;
    expect(toArena.hud).toEqual(mayhemHud);
    expect(toArena.hudByMode.mayhem).toEqual(mayhemHud);
    // Edit Arena's layout, then go back: Mayhem's comes back, Arena's is parked.
    const arenaHud = normalizeHud({ x: 0.1, y: 0.5 });
    const back = hudSwap({ hudPerMode: true, hud: arenaHud, hudByMode: toArena.hudByMode }, "arena", "mayhem")!;
    expect(back.hud).toEqual(mayhemHud);
    expect(back.hudByMode).toEqual({ arena: arenaHud });
    // Off, or same mode: nothing.
    expect(hudSwap({ ...s, hudPerMode: false }, "mayhem", "arena")).toBeUndefined();
    expect(hudSwap(s, "sr", "sr")).toBeUndefined();
  });
  it("old settings get the new keys, off", () => {
    expect(normalizeSettings({}).hudPerMode).toBe(false);
    expect(normalizeSettings({}).hudByMode).toEqual({});
  });
});

describe("SR role pick (settings.srRole)", () => {
  it("defaults to auto and is kept", () => {
    expect(normalizeSettings({}).srRole).toBe("");
    expect(normalizeSettings({ srRole: "jungle" }).srRole).toBe("jungle");
  });
});

describe("keep on top (settings.alwaysOnTop)", () => {
  it("is off by default and kept when on", () => {
    expect(normalizeSettings({}).alwaysOnTop).toBe(false);
    expect(normalizeSettings({ alwaysOnTop: true }).alwaysOnTop).toBe(true);
  });
});

describe("language (settings.language)", () => {
  it("defaults to English and keeps a supported choice", () => {
    expect(normalizeSettings({}).language).toBe("en");
    expect(normalizeSettings({ language: "pt" } as never).language).toBe("pt");
    expect(normalizeSettings({ language: "xx" } as never).language).toBe("en");
  });
});

describe("Discord status (settings.discord)", () => {
  it("is off with no app ID by default and keeps a stored one", () => {
    expect(normalizeSettings({}).discord).toEqual({ enabled: false, appId: "" });
    expect(normalizeSettings({ discord: { enabled: true, appId: "123" } } as never).discord).toEqual({ enabled: true, appId: "123" });
  });
});

describe("Rift role keys (mid / middle)", () => {
  it("adds the normalized key next to an old client-spelled one", () => {
    const s = normalizeSettings({ buildChoices: { "sr:Ahri:middle": { core: "a" }, "sr:Jinx:adc": { core: "b" } } } as never);
    expect(s.buildChoices["sr:Ahri:mid"]).toEqual({ core: "a" });
    expect(s.buildChoices["sr:Ahri:middle"]).toEqual({ core: "a" });
    expect(s.buildChoices["sr:Jinx:adc"]).toEqual({ core: "b" });
  });
});

describe("HUD v2: leaner default", () => {
  it("switches an untouched HUD to Standard once, keeps a customized one", () => {
    const untouched = normalizeSettings({ hud: { x: 0.9, y: 0.1 } } as never, true);
    expect(untouched.hud).toMatchObject({ showBuildPath: false, showThreats: false, showHint: false, showNextItem: true, x: 0.9 });
    const custom = normalizeSettings({ hud: { showThreats: false, showBuildPath: true } } as never, true);
    expect(custom.hud.showBuildPath).toBe(true);
    // Only once.
    const later = normalizeSettings({ hudV2: true, hud: { showBuildPath: true, showThreats: true, showHint: true } } as never, true);
    expect(later.hud.showBuildPath).toBe(true);
  });
});
