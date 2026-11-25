# Testing on Windows + League

Automated tests (unit + end-to-end in a browser) cover the logic and the screens. These checks need
a real Windows PC with League running. Play League in **Borderless** (Settings → Video → Window
Mode). If something fails, send **Settings → Diagnostics → Copy diagnostics** with what you saw.

## 1. Before a game (League client open)

- [ ] The download isn't flagged by Defender / the browser.
- [ ] First start: the **What's new** popup appears once (not again after a restart).
- [ ] New graphite + violet look; Settings → Appearance → **Classic** brings back the gold look.
- [ ] Nexis goes behind other windows when you click them; Settings → General → **Keep Nexis on top** keeps it in front.
- [ ] Nexis detects the League client (Settings → Diagnostics). If not, set the League folder in Settings.
- [ ] **Build tab:** type `yas`, `tahm`, `shyv`, `mf` → Enter opens the right champion; **All champions** opens the list.
- [ ] Rift, role **Mid**: core build, boots, starter, runes, spells and skill order match op.gg for 2–3 champions (Settings → Data → **Refresh stats now** first). Switching the role loads another build.
- [ ] ARAM: build matches op.gg/lol/modes/aram/…; Mayhem: build from HexMayhem with **Runes: OP.GG**.
- [ ] Data source switch (Auto / OP.GG / My games / Baseline) changes the build.
- [ ] **Share** copies an `NX1-…` code; **Paste code** imports it.
- [ ] Guide → **Change champion**; History → **Export CSV** / **Backup** land in Downloads; **Copy for spreadsheet** pastes into Excel.
- [ ] Home: **Patch changes for you** (with favorites), **Grow your pool** (after 5+ games in a mode).
- [ ] Language: Settings → General → Español / Português, then back to English.
- [ ] Sidebar **Demo** pill turns the demo on; it switches off in champ select.
- [ ] Hover any button: styled tooltip (not the plain Windows one).
- [ ] **Launch with Windows** on → reboot → Nexis starts; off → it doesn't.
- [ ] Update: Settings → About → **Check for updates**.

## 2. Champ select

- [ ] The compact side window opens in a sensible spot (Keep on top off: it goes behind the client when you click it — say if that's a problem).
- [ ] Rift: the role picker shows **Auto · your assigned role**.
- [ ] Full overlay: **Teammates** OP.GG cards in normal queues (ranked solo/duo shows the "names hidden" note); **Your best picks** after a few games.
- [ ] Import to League (turn on in Settings): a "Nexis: …" rune page and item set appear in the client.
- [ ] Discord status (if set up): "In champ select" on your Discord profile.

## 3. ARAM: Mayhem game

- [ ] Ctrl+Shift+Space overlay, Ctrl+Shift+H HUD, Ctrl+Shift+L layout editor (Esc saves).
- [ ] Clicking in the game never loses focus to Nexis.
- [ ] Loading screen: Players tab with **Game plan** and scouting.
- [ ] Augment cards: badges ~0.5 s after they pop, **above** the cards, reroll buttons clear; **Mark your augment pick** reminder at the top for ~8 s.
- [ ] After choosing: **✓ Picked …** shows the right augment. If not, describe what the screen does right after your click.
- [ ] Augments tab: the pick is listed; **Look for next** updates.
- [ ] Dying: HUD opens with **Dead · Xs · shop now**, shop first; back to your layout after respawn.
- [ ] HUD Minimal / Full preset; **Separate layout per mode**; Team power widget with **Next spike** line.
- [ ] Streamer mode hides every player name.
- [ ] Discord status (if set up): "Playing <champion> · ARAM: Mayhem".
- [ ] After the game: summary, **Save image** / **Copy image** (pastes into Discord), game in History with augments.

## 4. Summoner's Rift game

- [ ] Players → **Roles**: the API roles look right; click two teammates to swap; Team power lanes, the HUD lane and Matchups follow; your own swap reloads your role's build; **Reset**; next game the swaps are gone.
- [ ] ADC / support: **Duo partners** card with your lane partner.

## 5. Arena

- [ ] OP.GG Arena build and augments; badges and pick detection; **Duo partners** with your partner.

## Older, never verified

- [ ] Aphelios: the HUD shows the right main-hand weapon.
- [ ] Augment OCR at your resolution: Settings → Diagnostics → **Test scan** with the cards on screen.
