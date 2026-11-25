// "What's new" entries, newest first. Add one per update the user downloads (short, user-facing).
export interface ChangelogEntry {
  /** Unique, sortable id: YYYY-MM-DD.n */
  id: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-11-26.4",
    title: "CS per minute",
    items: [
      "New HUD line (off by default): your CS per minute, green at 7+ in lane or 6+ in jungle on Summoner's Rift, yellow when close, red when behind. Turn it on in Settings → In-game overlay → Farming, or pick the Full look.",
      "History: average CS/min and CS at 10 minutes in the summary, a sortable CS/min column per champion, and CS/min on each game.",
    ],
  },
  {
    id: "2026-11-26.3",
    title: "Level-up arrow on your ability bar",
    items: [
      "When you have a skill point, a glowing arrow appears over the ability to level on League's own ability bar.",
      "Line it up once: Settings → In-game overlay → Level-up arrow → Line up on the game screen, then move the sliders until the markers sit on Q W E R.",
    ],
  },
  {
    id: "2026-11-26.2",
    title: "A calmer in-game HUD",
    items: [
      "The HUD fades to see-through during normal play and comes back when you're dead, have gold for your next item, have a skill point, see augments, in the first 90 s, or hover it (Settings → In-game overlay → Fade during play). Thanks to Evo for the idea!",
      "Leaner HUD by default (Standard): next buy, skills and augments only. Core build, enemy damage, tips and the hint line are in the Full preset or their own switches.",
      "Skills: Q W E R with your points, and the one to level next highlighted (glowing when a point is waiting).",
    ],
  },
  {
    id: "2026-11-26.1",
    title: "Overnight polish and fixes",
    items: [
      "Most screens and the in-game HUD now follow the language setting (Español / Português).",
      "Build tab: type to add enemies; press / to jump to the champion search.",
      "A red notice appears if a stats site sends no builds (a sign it changed its pages), instead of quietly showing template items.",
      "Settings → Diagnostics → Report a problem: copies the report and opens a GitHub issue.",
      "Fixed: a role picked by hand could carry into the next champ select; old Rift picks keep working with the new role names.",
      "Fixed: pick detection is stricter (no false picks from a hover tooltip); the compact champ-select window stays visible.",
      "Discord status can never freeze the app if Discord stops responding.",
    ],
  },
  {
    id: "2026-11-25.3",
    title: "Español and Português",
    items: [
      "Updates: the Update button in the top bar shows what's new and opens the exact download; Settings → About → Check for updates.",
      "Settings → General → Discord status (off by default): shows “Playing Ahri · ARAM: Mayhem” on your Discord profile. One-time setup: create a free Discord application and paste its ID.",
      "Settings → General → Language: English, Español or Português (BR) for menus, cards and settings. Champion, item and augment names stay in English.",
    ],
  },
  {
    id: "2026-11-25.2",
    title: "Smarter search and a cleaner Build tab",
    items: [
      "Champion search guesses what you meant: short names (mf, tf, j4, asol, tk), prefixes (yas, tahm, shyv) and typos (yasou).",
      "Build tab: a centered search with live results replaces the Pick a champion button; “All champions” opens the full list.",
      "Search bars are rounder and clearer everywhere.",
      "Home: “Patch changes for you” lists this patch's base stat, cooldown and item changes for your favorites and the items you build.",
      "Home: “Grow your pool” suggests strong champions this patch that play like the ones you win with.",
      "The demo game is a small switch at the bottom left, and turns itself off when champ select or a game starts.",
    ],
  },
  {
    id: "2026-11-25.1",
    title: "Game plan at the loading screen",
    items: [
      "Players tab, at the loading screen: your win condition, your first power spike and the enemy threat to respect.",
      "In-game HUD (Team power widget): “Next spike” — your next item and gold left — and how many enemies are close to finishing an item.",
      "Build tab: “Duo partners” from OP.GG — Arena partners, and bot-lane partners on the Rift when you play ADC or support.",
      "Champ select: “Your best picks” ranks the champions you play (your record, tier and team fit); in ARAM only the bench / trades.",
      "Champ select (full overlay): your teammates' OP.GG rank, recent form and mains, when the queue shows their names.",
    ],
  },
  {
    id: "2026-11-24.4",
    title: "Smoother text boxes and clearer playstyles",
    items: [
      "Search boxes and text fields are softer, with a clear focus glow.",
      "Hover text now shows as a styled tooltip in the app's theme instead of the plain Windows one.",
      "Removed a background helper that antivirus could mistake for malware (Nexis finds the League client through its lockfile).",
      "Auto / Aggressive / Balanced / Safe / Frontline now explain in plain words what they change (hover them).",
      "In game: while you're dead the HUD opens up with the shop first and your respawn time, then goes back to your layout.",
      "Augments tab: “Look for next” shows the best augments still to take per rarity, and which pair with ones you own.",
    ],
  },
  {
    id: "2026-11-24.3",
    title: "Builds match OP.GG again",
    items: [
      "Fixed: OP.GG builds, boots, starters, items and spells weren't being read (OP.GG changed its page), so builds fell back to a generic template. All champions and modes.",
      "The default core build is now the most played one, in the same order OP.GG lists it; the highest win-rate build is one click away.",
      "Nexis no longer stays on top of every window by default. Turn it back on in Settings → General → Keep Nexis on top.",
      "Guide tab: “Change champion” shows any champion's guide (outside a game).",
      "American spelling throughout (Favorites, behavior, color…).",
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
