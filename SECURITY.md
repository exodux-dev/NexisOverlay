# Security

Nexis runs locally on your PC. This page says what it touches and how it is locked down.

## What Nexis accesses

- **Riot Live Client Data API** (`https://127.0.0.1:2999`, read-only) for in-game data.
- **League client API** (127.0.0.1, credentials from the client's lockfile/process): GET only for
  champ select / game flow / region. Writes happen only with *Import to League* turned on, and only
  to rune pages and item sets (named `Nexis: …`). There is no generic LCU passthrough.
- **Screen capture + Windows OCR** of the augment region, only in augment modes while the game is in
  front (or on the scan hotkey). Nexis's own overlay is blacked out of
  that screenshot before OCR (its windows are *not* hidden from capture, so recorders like GeForce
  Instant Replay, OBS and Discord keep working). Full-screen previews
  are taken only for Settings → Diagnostics → *Test augment detection*.
- **Public web data** over HTTPS from an allow-list: Data Dragon, CommunityDragon, HexMayhem, OP.GG,
  GitHub (update check, default stats dataset) and the stats URL you set in Settings.
- **Its own data folder** (`data/` next to the exe) for settings, history and caches.

Nexis does **not** read or write game memory, inject code, send input to the game, run downloads,
auto-update, or collect telemetry. The update check only shows a link.

## Hardening

- Strict CSP: scripts only from the app bundle; no remote scripts; network access only via the backend.
- Webview commands are validated in Rust: `open_url` only opens `https://` links to a host allow-list;
  `fetch_json` / `fetch_text` only reach allow-listed hosts; local files can only be read as the
  configured `.json` stats dataset; stored files must be plain `name.json` inside the data folder.
- Certificate checks are disabled only for the loopback client used for Riot's self-signed local
  APIs; that client ignores proxies and never follows redirects. All public requests use normal TLS.
- No Tauri shell/fs plugins; capabilities are limited to window management.

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Report a vulnerability) rather than a
public issue. Include steps to reproduce; we aim to respond within a week.
