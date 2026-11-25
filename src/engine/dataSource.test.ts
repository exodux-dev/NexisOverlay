import { describe, expect, it } from "vitest";
import { fallbackNotice, resolveSource, selectedSource, sourcesForMode, type SourceCandidates } from "./dataSource";
import type { ChampionStats } from "./types";

const st = (games: number, source?: ChampionStats["source"]): ChampionStats => ({ games, wins: Math.round(games / 2), items: {}, source });
const hex = st(5000, "hexmayhem");
const opgg = st(8000, "opgg");
const mine = st(6, "personal");
const riot = st(900, "riot");
const all: SourceCandidates = { riot, web: { hexmayhem: hex, opgg }, personal: mine, webEnabled: true };

describe("sourcesForMode", () => {
  it("offers only the sources each mode has", () => {
    expect(sourcesForMode("mayhem", false)).toEqual(["auto", "hexmayhem", "personal", "baseline"]);
    expect(sourcesForMode("mayhem", true)).toContain("riot");
    expect(sourcesForMode("aram", false)).toEqual(["auto", "opgg", "personal", "baseline"]);
    expect(sourcesForMode("sr", false)).toEqual(["auto", "opgg", "personal", "baseline"]);
    expect(sourcesForMode("arena", false)).toEqual(["auto", "opgg", "personal", "baseline"]);
  });
  it("sanitizes stored picks per mode", () => {
    expect(selectedSource("aram", "hexmayhem", false)).toBe("auto");
    expect(selectedSource("mayhem", "opgg", false)).toBe("auto");
    expect(selectedSource("mayhem", "riot", false)).toBe("auto");
    expect(selectedSource("mayhem", "riot", true)).toBe("riot");
    expect(selectedSource("sr", 42, false)).toBe("auto");
    expect(selectedSource("sr", undefined, false)).toBe("auto");
    expect(selectedSource("sr", "personal", false)).toBe("personal");
  });
});

describe("resolveSource", () => {
  it("auto keeps the priority order: dataset → web → games → baseline", () => {
    expect(resolveSource("mayhem", "auto", all).active).toBe("riot");
    expect(resolveSource("mayhem", "auto", { ...all, riot: undefined }).active).toBe("hexmayhem");
    expect(resolveSource("aram", "auto", { ...all, riot: undefined }).active).toBe("opgg");
    expect(resolveSource("mayhem", "auto", { ...all, riot: undefined, web: {} }).active).toBe("personal");
    const base = resolveSource("mayhem", "auto", { web: {}, webEnabled: true, personal: st(2) });
    expect(base).toMatchObject({ active: "none", statsSource: "none" });
    expect(base.fallback).toBeUndefined();
  });
  it("uses the picked source when it has data", () => {
    expect(resolveSource("aram", "opgg", all)).toMatchObject({ selected: "opgg", active: "opgg", stats: opgg, statsSource: "global" });
    expect(resolveSource("mayhem", "personal", all)).toMatchObject({ active: "personal", stats: mine, statsSource: "personal" });
    expect(resolveSource("mayhem", "baseline", all)).toMatchObject({ active: "none", statsSource: "none" });
    expect(resolveSource("mayhem", "riot", all).active).toBe("riot");
  });
  it("falls back to Auto (never empty) with a reason", () => {
    const loading = resolveSource("aram", "opgg", { ...all, riot: undefined, web: { opgg: "loading" } });
    expect(loading).toMatchObject({ selected: "opgg", active: "personal", fallback: { reason: "loading" } });
    expect(fallbackNotice(loading, "Ahri")).toMatch(/Loading OP.GG/);
    const err = resolveSource("mayhem", "hexmayhem", { ...all, riot: undefined, web: { hexmayhem: "error" } });
    expect(err.fallback?.reason).toBe("error");
    const none = resolveSource("aram", "personal", { ...all, personal: st(2) });
    expect(none).toMatchObject({ active: "riot", fallback: { reason: "nodata" } });
    expect(fallbackNotice(none, "Ahri")).toBe("My games has no data for Ahri — using Auto");
    const off = resolveSource("sr", "opgg", { ...all, webEnabled: false });
    expect(off.fallback?.reason).toBe("disabled");
    expect(resolveSource("sr", "riot", { ...all, riot: undefined }).fallback?.reason).toBe("nodata");
  });
  it("treats empty web stats as no data", () => {
    expect(resolveSource("sr", "opgg", { web: { opgg: st(0) }, webEnabled: true }).fallback?.reason).toBe("nodata");
  });
});

describe("missing builds warning (site format change)", () => {
  it("warns when a web source has games but no builds", async () => {
    const { missingBuildsWarning } = await import("./dataSource");
    expect(missingBuildsWarning({ active: "opgg", stats: st(5000, "opgg") })).toMatch(/OP\.GG sent no builds/);
    expect(missingBuildsWarning({ active: "opgg", stats: { ...st(5000, "opgg"), builds: [{ items: [1, 2, 3], games: 10, wins: 5 }] } })).toBeUndefined();
    expect(missingBuildsWarning({ active: "hexmayhem", stats: { ...st(5000, "hexmayhem"), bestBuild: [1, 2, 3] } })).toBeUndefined();
    expect(missingBuildsWarning({ active: "personal", stats: st(5) })).toBeUndefined();
  });
});
