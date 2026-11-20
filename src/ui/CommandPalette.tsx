// Ctrl+K command palette: jump to any champion, tab, mode or setting from the keyboard.

import { useEffect, useMemo, useRef, useState } from "react";
import { MODE_LABEL, THEME_PRESETS, actions, useApp, type GameModeKind, type Tab, type ThemePreset } from "../app/store";
import { norm } from "../engine/text";
import { GameIcon } from "./GameIcon";
import { Icon, type IconName } from "./icons";
import "./command-palette.css";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "Champions" | "Go to" | "Mode" | "Actions" | "Theme";
  icon?: IconName;
  image?: string;
  keywords?: string;
  run: () => void;
}

const TABS: Array<{ tab: Tab; label: string; icon: IconName }> = [
  { tab: "home", label: "Home", icon: "home" },
  { tab: "build", label: "Build", icon: "build" },
  { tab: "augments", label: "Augments", icon: "augments" },
  { tab: "guide", label: "Guide", icon: "book" },
  { tab: "tiers", label: "Tier list", icon: "tiers" },
  { tab: "enemies", label: "Players", icon: "enemies" },
  { tab: "history", label: "History", icon: "history" },
  { tab: "settings", label: "Settings", icon: "settings" },
];

function score(cmd: Command, q: string): number {
  if (!q) return cmd.group === "Champions" ? 0 : 1;
  const label = norm(cmd.label);
  const kw = norm(cmd.keywords ?? "");
  if (label === q) return 100;
  if (label.startsWith(q)) return 80 - label.length * 0.01;
  if (label.includes(q)) return 60;
  if (kw.includes(q)) return 40;
  // subsequence match ("mlph" → malphite)
  let i = 0;
  for (const ch of label) if (ch === q[i]) i++;
  return i === q.length ? 20 : -1;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const champions = useApp((s) => s.data?.champions ?? []);
  const demo = useApp((s) => s.demo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const close = (fn: () => void) => () => {
      fn();
      setOpen(false);
    };
    const out: Command[] = [];
    for (const t of TABS) out.push({ id: `tab:${t.tab}`, group: "Go to", label: t.label, icon: t.icon, run: close(() => actions.setTab(t.tab)) });
    const modes: Array<["auto" | GameModeKind, string]> = [
      ["auto", "Auto-detect mode"],
      ...(Object.keys(MODE_LABEL) as GameModeKind[]).map((m) => [m, MODE_LABEL[m]] as ["auto" | GameModeKind, string]),
    ];
    for (const [m, label] of modes)
      out.push({ id: `mode:${m}`, group: "Mode", label: `Mode: ${label}`, icon: "spark", keywords: "queue game mode aram mayhem normal ranked rift", run: close(() => void actions.setMode(m)) });
    out.push({ id: "act:refresh", group: "Actions", label: "Refresh stats now", icon: "history", keywords: "update data reload", run: close(() => void actions.refreshData()) });
    out.push({ id: "act:demo", group: "Actions", label: demo ? "Turn off demo game" : "Try the demo game", icon: "play" as IconName, keywords: "sample example", run: close(() => actions.setDemo(!demo)) });
    out.push({ id: "act:scan", group: "Actions", label: "Scan screen for augments", icon: "augments", keywords: "ocr detect", run: close(() => void actions.scan()) });
    out.push({ id: "act:hide", group: "Actions", label: "Hide overlay", icon: "close", run: close(() => actions.hide()) });
    for (const [key, p] of Object.entries(THEME_PRESETS))
      out.push({ id: `theme:${key}`, group: "Theme", label: `Theme: ${p.label}`, icon: "spark", keywords: "appearance color", run: close(() => void actions.updateTheme({ preset: key as ThemePreset })) });
    for (const c of champions)
      out.push({
        id: `champ:${c.id}`,
        group: "Champions",
        label: c.name,
        image: c.icon,
        keywords: c.id,
        hint: "Show build",
        run: close(() => {
          actions.setDemo(false);
          actions.setExploreChampion(c.id);
          actions.setTab("build");
        }),
      });
    return out;
  }, [champions, demo]);

  const results = useMemo(() => {
    const nq = norm(q);
    const scored = commands.map((c) => ({ c, s: score(c, nq) })).filter((x) => x.s >= 0);
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, nq ? 12 : 9).map((x) => x.c);
  }, [commands, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[sel]?.run();
    }
  };

  let lastGroup = "";
  return (
    <div className="cp-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="cp" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cp-search">
          <Icon name="search" size={16} className="dim" />
          <input
            ref={input}
            value={q}
            placeholder="Search champions, tabs, modes, actions…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search commands"
          />
          <kbd className="cp-esc">Esc</kbd>
        </div>
        <div className="cp-list" ref={list} role="listbox">
          {results.length === 0 && <div className="cp-empty">No matches for “{q}”</div>}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="cp-group">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  data-i={i}
                  className={`cp-item ${i === sel ? "is-sel" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={c.run}
                >
                  {c.image ? <GameIcon src={c.image} name={c.label} size={24} round /> : <span className="cp-ico">{c.icon && <Icon name={c.icon} size={15} />}</span>}
                  <span className="cp-label">{c.label}</span>
                  {c.hint && <span className="cp-hint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cp-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>Enter</kbd> run
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}
