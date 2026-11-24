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
