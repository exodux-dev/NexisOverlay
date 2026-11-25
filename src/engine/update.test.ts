import { describe, expect, it } from "vitest";
import { pickUpdate } from "./update";

const run = { head_sha: "new", html_url: "https://github.com/exodux-dev/NexisOverlay/actions/runs/1", created_at: "2026-11-25T10:00:00Z", head_commit: { message: "Add thing\n\nbody" } };

describe("update check", () => {
  it("offers the newest successful build with its changes", () => {
    const u = pickUpdate({ buildSha: "old", buildDate: "2026-11-24T10:00:00Z", run, changes: ["Fix a\nmore", "Add b"] });
    expect(u).toEqual({ sha: "new", date: run.created_at, message: "Add thing", url: run.html_url, kind: "build", changes: ["Fix a", "Add b"] });
  });
  it("prefers a newer release zip (downloads without logging in)", () => {
    const release = { html_url: "x", published_at: "2026-11-25T11:00:00Z", assets: [{ name: "NexisOverlay-portable.zip", browser_download_url: "https://github.com/exodux-dev/NexisOverlay/releases/download/v1/NexisOverlay-portable.zip" }] };
    expect(pickUpdate({ buildSha: "old", buildDate: "2026-11-24T10:00:00Z", run, release })?.kind).toBe("release");
  });
  it("nothing when up to date, older, or a dev build", () => {
    expect(pickUpdate({ buildSha: "new", buildDate: "2026-11-24T10:00:00Z", run })).toBeUndefined();
    expect(pickUpdate({ buildSha: "old", buildDate: "2026-11-26T10:00:00Z", run })).toBeUndefined();
    expect(pickUpdate({ buildSha: "dev", buildDate: "", run })).toBeUndefined();
    expect(pickUpdate({ buildSha: "old", buildDate: "2026-11-24T10:00:00Z" })).toBeUndefined();
  });
});
