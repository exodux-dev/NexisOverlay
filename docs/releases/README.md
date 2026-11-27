# Release notes

One file per release: `docs/releases/v<version>.md` (the version in `package.json`). The first
push to `main` with that version publishes the GitHub release with this file as its notes.

## Format

A banner on top (`docs/brand/releases/<tag>.svg`, made like the v1.1.0 one, linked by its raw
GitHub URL), then only these sections, in this order, and only the ones that have something:

```md
<img src="https://raw.githubusercontent.com/exodux-dev/NexisOverlay/main/docs/brand/releases/v1.2.0.svg" alt="Nexis Overlay v1.2.0: …" width="100%" />

## ✨ Features added

### Biggest feature, as a short title
Two or three plain sentences: what it does and why it helps. Credit people inline
(*Thanks to **Evo** for the idea!*).

**Also new**
- Smaller features, one short line each

## ⚡ Improvements
- **What changed:** short line

## 🐛 Bug fixes
- **What was broken** is fixed
```

Emoji only on the three section headings, never on individual lines. Friendly, plain sentences.
No other sections: no download instructions, thanks, fair play, requirements or disclaimers.
