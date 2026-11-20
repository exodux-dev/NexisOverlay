import { describe, expect, it } from "vitest";
import { ago, buildReport, providerStatus, redact, windowModeLevel } from "./diagnostics";

describe("diagnostics redaction", () => {
  it("strips Riot IDs, player names, user paths, ids and URL paths", () => {
    const text = [
      "player Faker#KR1 joined",
      "Someone Else is on the enemy team",
      String.raw`data C:\Users\Jane Doe\Nexis\data`,
      "/home/bob/nexis/data",
      "puuid 9f1c2b7e-1d2a-4c3b-8e9f-0a1b2c3d4e5f",
      "HTTP 404 for https://op.gg/summoners/euw/Some-One-EUW",
    ].join("\n");
    const out = redact(text, ["Someone Else"]);
    expect(out).not.toContain("Faker");
    expect(out).not.toContain("Someone Else");
    expect(out).not.toContain("Jane");
    expect(out).not.toContain("bob");
    expect(out).not.toContain("9f1c2b7e");
    expect(out).not.toContain("Some-One");
    expect(out).toContain(String.raw`C:\Users\<user>\Nexis\data`);
    expect(out).toContain("https://op.gg/…");
  });

  it("leaves ordinary text and hotkeys alone", () => {
    expect(redact("Ctrl+Shift+X registered; phase InProgress")).toBe("Ctrl+Shift+X registered; phase InProgress");
  });
});

describe("diagnostics status", () => {
  it("rates window modes", () => {
    expect(windowModeLevel("borderless")).toBe("ok");
    expect(windowModeLevel("windowed")).toBe("ok");
    expect(windowModeLevel("fullscreen")).toBe("bad");
    expect(windowModeLevel(null)).toBe("off");
  });

  it("formats relative times", () => {
    expect(ago(null)).toBe("never");
    expect(ago(1000, 6000)).toBe("5s ago");
    expect(ago(0 + 1, 1 + 120_000)).toBe("2 min ago");
  });

  it("merges hosts into providers; a newer error wins, cached copies only warn", () => {
    const now = 1_000_000;
    const rows = providerStatus(
      {
        "www.hexmayhem.com": { okAt: now - 5000, fromCache: false, cacheAgeSecs: 0, count: 3 },
        "op.gg": { okAt: now - 50_000, errAt: now - 1000, error: "HTTP 403", fromCache: true, cacheAgeSecs: 7200, count: 2 },
        "www.op.gg": { errAt: now - 2000, error: "timeout", fromCache: false, count: 1 },
      },
      now,
    );
    const hex = rows.find((r) => r.id === "hexmayhem")!;
    const opgg = rows.find((r) => r.id === "opgg")!;
    expect(hex.level).toBe("ok");
    expect(opgg.level).toBe("warn");
    expect(opgg.value).toContain("HTTP 403");
    expect(rows.find((r) => r.id === "ddragon")!.level).toBe("off");
  });

  it("builds a redacted plain-text report", () => {
    const report = buildReport({
      version: "0.1.0",
      sha: "abcdef0123456789",
      platform: "windows x86_64",
      rows: [{ id: "lcu", label: "League client", level: "ok", value: "connected · phase Lobby · EUW" }],
      providers: [],
      log: [{ t: 0, level: "warn", area: "fetch", msg: String.raw`C:\Users\Jane\x failed for Faker#KR1` }],
      names: [],
      now: 0,
    });
    expect(report).toContain("[OK  ] League client: connected");
    expect(report).toContain("build abcdef012345");
    expect(report).not.toContain("Jane");
    expect(report).not.toContain("Faker");
  });
});
