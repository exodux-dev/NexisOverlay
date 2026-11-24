// "What's new" entries, newest first. Add one per update the user downloads (short, user-facing).
export interface ChangelogEntry {
  /** Unique, sortable id: YYYY-MM-DD.n */
  id: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-11-24.3",
    title: "Builds match OP.GG again",
    items: [
      "Fixed: OP.GG builds, boots, starters, items and spells weren't being read (OP.GG changed its page), so builds fell back to a generic template. All champions and modes.",
      "The default core build is now the most played one, in the same order OP.GG lists it; the highest win-rate build is one click away.",
      "Nexis no longer stays on top of every window by default. Turn it back on in Settings → General → Keep Nexis on top.",
      "Summoner's Rift: pick your role (Top / Jungle / Mid / ADC / Support) on the Build tab to see that role's build, runes and stats.",
    ],
  },
  {
    id: "2026-11-24.2",
    title: "Streamer mode, spreadsheet export and this popup",
    items: [
      "Streamer mode (Settings → General) hides every player name and Riot ID.",
      "History: Export CSV, or Copy for spreadsheet to paste into Excel / Google Sheets.",
      "This “What's new” popup after each update.",
      "In-game overlay: “Separate layout per mode” gives Mayhem, ARAM, Arena and Rift their own HUD.",
      "Post-game summary: Save image / Copy image makes a recap picture to post on Discord.",
    ],
  },
  {
    id: "2026-11-24.1",
    title: "New look, faster augments, pick detection, share codes",
    items: [
      "New default theme (graphite + violet) for the app and the in-game HUD; the old look is “Classic” in Appearance.",
      "Augment badges appear about half a second after the cards, above them so the reroll buttons stay clear.",
      "Your augment pick is detected from the screen and shown as “✓ Picked”.",
      "Share / Paste code on the Build order card to swap builds with friends.",
      "Roles card: click two teammates to swap lanes. HUD: Minimal / Full preset.",
    ],
  },
];

/** Entries newer than `seen` (all of them when `seen` is unknown to this build). */
export function entriesSince(seen: string | undefined): ChangelogEntry[] {
  if (!seen) return CHANGELOG;
  return CHANGELOG.filter((e) => e.id > seen);
}
