# Release notes

One file per release: `docs/releases/v<version>.md` (the version in `package.json`). The first
push to `main` with that version publishes the GitHub release with this file as its notes.

## Format

A banner on top (`docs/brand/releases/<tag>.svg`, made like the v1.1.0 one, linked by its raw
GitHub URL), then only these sections, in this order, and only the ones that have something:

```md
<img src="https://raw.githubusercontent.com/exodux-dev/NexisOverlay/main/docs/brand/releases/v1.2.0.svg" alt="Nexis Overlay v1.2.0: …" width="100%" />

## ✨ Features added
- **🧭 Feature name** short line. Credit people inline (*Thanks to **Evo** for the idea!*).

## ⚡ Improvements
- **🔎 What changed** short line.

## 🐛 Bug fixes
- **🎬 What was broken** is fixed.
```

Big `##` headings, one emoji + bold name per line, one short sentence each. No other sections:
no download instructions, thanks, fair play, requirements or disclaimers.
