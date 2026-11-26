// The "hud" window: a full-monitor, transparent, click-through layer drawn over the game.
// It renders (1) tier badges under the in-game augment cards detected by OCR and
// (2) the persistent mini HUD (MiniHud.tsx), which is also the only interactive part — and only
// while its layout editor is open.
//
// Riot policy: the HUD only shows static reference info (what to build next, the usual
// skill order). It never issues real-time combat prompts.

import { t as tx } from "../i18n";
import { setLanguage, t } from "../i18n";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { actions, devHooks, getState, registerDemo, useApp, useDerived } from "../app/store";
import { rerollAdvice, type AugmentScore } from "../engine/augments";
import type { OcrMatch } from "../engine/ocrMatch";
import { MiniHud, useHudModel } from "./MiniHud";
import { abilitySlot, hudOf } from "./hudSettings";
import * as bridge from "../bridge";
import { collectMask } from "./captureMask";
import "./layer.css";

export { HudCard, hudHasContent, sampleHudModel, useHudModel, type HudModel } from "./MiniHud";

// Only in the hud window: Settings imports HudCard from here and must not clobber main's hooks.
if (import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "hud") {
  (window as unknown as { __nexis: unknown }).__nexis = { devHooks, actions, registerDemo, getState };
}

const FADE_MS = 320;

/** Badge anchor: above the scan region (clear of the reroll buttons under the cards) or below it. */
function badgeAnchor(region: { y: number; h: number }, offset: number, placement: "above" | "below"): CSSProperties {
  return placement === "below"
    ? { top: `calc(${(region.y + region.h + offset) * 100}vh + 8px)` }
    : ({ top: `calc(${(region.y + offset) * 100}vh - 8px)`, "--nl-shift": "-100%" } as CSSProperties);
}

export default function Layer() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("nexis-layer");
    return () => root.classList.remove("nexis-layer");
  }, []);

  // The HUD window has its own copy of the settings: follow the language too (remount on change).
  const lang = useApp((s) => s.settings.language);
  setLanguage(lang);
  return (
    <div className="nl-root" aria-hidden="true" key={lang}>
      <CaptureMask />
      <AugmentBadges />
      <PickReminder />
      <PickedNotice />
      <LevelUpArrow />
      <CalibrationPreview />
      <MiniHud />
    </div>
  );
}

/** Tells the backend where we draw (a few times a second, only when it changed). */
function CaptureMask() {
  useEffect(() => {
    if (!bridge.isTauri) return;
    let last = "";
    const tick = () => {
      const root = document.querySelector(".nl-root");
      if (!root) return;
      const rects = collectMask(root, window.innerWidth, window.innerHeight);
      const key = JSON.stringify(rects);
      if (key !== last) {
        last = key;
        void bridge.setCaptureMask(rects).catch(() => {});
      }
    };
    tick();
    // Right away when something appears or moves (a new badge must be masked before the next
    // scan), plus a slow interval for animations that only change styles.
    let raf = 0;
    const soon = () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), tick()));
    };
    const obs = new MutationObserver(soon);
    const root = document.querySelector(".nl-root");
    if (root) obs.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    const id = window.setInterval(tick, 400);
    return () => {
      window.clearInterval(id);
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}

// ------------------------------------------------------------------ augment badges

interface Shown {
  key: string;
  cards: Array<{ card: OcrMatch; score?: AugmentScore }>;
  bestName?: string;
}

function AugmentBadges() {
  const cards = useApp((s) => s.cards);
  const region = useApp((s) => s.settings.scanRegion);
  const badgeOffset = useApp((s) => s.settings.badgeOffset);
  const placement = useApp((s) => s.settings.badgePlacement);
  const { offeredRanked } = useDerived();

  // Keep the last set of cards on screen while it fades out.
  const [shown, setShown] = useState<Shown | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (cards.length) {
      const byName = new Map(offeredRanked.map((r) => [r.augment.name, r]));
      const withScores = cards.map((card) => ({ card, score: byName.get(card.augment.name) }));
      const scored = withScores.filter((c) => c.score);
      const best = scored.length >= 2 ? scored.reduce((a, b) => (b.score!.score > a.score!.score ? b : a)) : undefined;
      setShown({ key: cards.map((c) => c.augment.name).join("|"), cards: withScores, bestName: best?.card.augment.name });
      setVisible(true);
    } else {
      setVisible(false);
      timer.current = window.setTimeout(() => setShown(null), FADE_MS);
    }
    return () => window.clearTimeout(timer.current);
  }, [cards, offeredRanked]);

  if (!shown) return null;
  const anchor = badgeAnchor(region, badgeOffset, placement);
  // Static evaluation of the offer on screen: Mayhem lets you reroll augment offers.
  const advice = rerollAdvice(shown.cards.map((c) => c.score).filter((x): x is AugmentScore => !!x));
  return (
    <div key={shown.key} className={`nl-badges ${visible ? "nl-in" : "nl-out"}`}>
      {advice?.reroll && (
        <TopNotice order={1}>
          <div className="nl-reroll">
            <RerollIcon />
            {t("Consider a reroll")}
            <small>{advice.reason.replace(/ — consider rerolling\.$| — a reroll will likely do better\.$/, "")}</small>
          </div>
        </TopNotice>
      )}
      {shown.cards.map(({ card, score }, i) => (
        <Badge
          key={card.augment.name}
          name={card.augment.name}
          score={score}
          best={card.augment.name === shown.bestName}
          style={{ left: `${(region.x + card.x * region.w) * 100}vw`, ...anchor, animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ top notices

/** Reroll hint + pick reminder: stacked at the top center, away from the cards and their buttons. */
function TopNotice({ children, order = 0 }: { children: ReactNode; order?: number }) {
  return (
    <div className="nl-top-notice" style={{ top: `calc(0.6vh + ${order * 2.4}em)` }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ pick reminder

/** How long the "mark your pick" reminder stays up after an augment offer is detected. */
export const PICK_REMINDER_MS = 8000;

/**
 * Nexis can't see which card you click (that would mean watching your mouse), so a new offer
 * shows a short reminder to mark the pick in the app. Once per offer (a reroll is a new offer).
 */
function PickReminder() {
  const cards = useApp((s) => s.cards);
  const enabled = useApp((s) => hudOf(s.settings).pickReminder);
  const hotkey = useApp((s) => s.settings.hotkeyToggle);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const last = useRef("");
  const timers = useRef<number[]>([]);
  const key = cards.map((c) => c.augment.name).sort().join("|");

  // Timers live in a ref: the cards leaving the screen must not cancel the hide (fixed duration).
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    if (!enabled || !key || key === last.current) return;
    last.current = key;
    timers.current.forEach((t) => window.clearTimeout(t));
    setShownFor(key);
    setVisible(true);
    timers.current = [window.setTimeout(() => setVisible(false), PICK_REMINDER_MS), window.setTimeout(() => setShownFor(null), PICK_REMINDER_MS + FADE_MS)];
  }, [key, enabled]);

  const picked = useApp((s) => !!shownFor && shownFor.split("|").some((n) => s.myAugments.includes(n)));
  if (!shownFor || picked) return null;
  return (
    <TopNotice>
      <div className={`nl-pick-reminder ${visible ? "nl-in" : "nl-out"}`} role="status">
        {t("Mark your augment pick in Nexis")} · <b>{hotkey}</b>
      </div>
    </TopNotice>
  );
}

// ------------------------------------------------------------------ picked notice

/** "✓ Picked <augment>" for a few seconds whenever an augment is added (detected or marked in the app). */
function PickedNotice() {
  const mine = useApp((s) => s.myAugments);
  const prev = useRef<string[] | null>(null);
  const [name, setName] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // The HUD window can start mid-game: the main window's first sync isn't a new pick.
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    const before = prev.current;
    prev.current = mine;
    if (!before || Date.now() - mountedAt.current < 3000) return; // first render / initial sync: nothing new
    const added = mine.find((a) => !before.includes(a));
    if (!added) return;
    setName(added);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setName(null), 4000);
  }, [mine]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!name) return null;
  return (
    <TopNotice>
      <div className="nl-pick-reminder nl-picked nl-in" role="status">
        ✓ {t("Picked")} <b>{name}</b>
      </div>
    </TopNotice>
  );
}

// ------------------------------------------------------------------ level-up arrow

/**
 * A glowing arrow over League's own ability bar on the ability your build levels next, while a
 * skill point is waiting (like other companion apps). Position from the calibration in Settings.
 */
function LevelUpArrow() {
  const settingsObj = useApp((s) => s.settings);
  const hud = useMemo(() => hudOf(settingsObj), [settingsObj]);
  const live = useApp((s) => s.live);
  const model = useHudModel();
  const key = model.skill?.levelUp;
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (!hud.levelArrows || !live || live.loading || !key) return null;
  return <AbilityArrow slot={abilitySlot(hud, key, size.w, size.h)} label={key} />;
}

function AbilityArrow({ slot, label, sample = false }: { slot: { x: number; y: number; size: number }; label: string; sample?: boolean }) {
  return (
    <div className={`nl-lvl-arrow ${sample ? "nl-lvl-sample" : ""}`} style={{ left: slot.x, top: slot.y, width: slot.size, height: slot.size }} aria-hidden="true">
      <span className="nl-lvl-ring" />
      <svg className="nl-lvl-chevron" viewBox="0 0 24 16">
        <path d="M2 2l10 11L22 2" />
      </svg>
      {sample && <span className="nl-lvl-key">{label}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ calibration preview

/** Where sample badges sit (centres of three cards across the scan region). */
const SAMPLE_CARDS = [1 / 6, 1 / 2, 5 / 6];

/**
 * Settings → Diagnostics "Preview on HUD": outlines the scan region and draws sample badges where
 * real ones would appear, so the region / badge offset can be tuned against the actual game screen.
 */
function CalibrationPreview() {
  const [on, setOn] = useState(false);
  const region = useApp((s) => s.settings.scanRegion);
  const badgeOffset = useApp((s) => s.settings.badgeOffset);
  const placement = useApp((s) => s.settings.badgePlacement);
  const settingsObj = useApp((s) => s.settings);
  const hud = useMemo(() => hudOf(settingsObj), [settingsObj]);
  const realCards = useApp((s) => s.cards.length > 0);
  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    void bridge
      .on<boolean>("hud-preview", (v) => setOn(!!v))
      .then((u) => {
        if (!alive) return u();
        off = u;
        void bridge.getHudPreview().then((v) => alive && setOn(v)).catch(() => {});
      });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  if (!on) return null;
  const anchor = badgeAnchor(region, badgeOffset, placement);
  return (
    <div className="nl-calib">
      <div className="nl-calib-region" style={{ left: `${region.x * 100}vw`, top: `${region.y * 100}vh`, width: `${region.w * 100}vw`, height: `${region.h * 100}vh` }}>
        <span>{tx("Nexis scan region \u2014 augment names must be inside")}</span>
      </div>
      {(["Q", "W", "E", "R"] as const).map((k) => (
        <AbilityArrow key={k} slot={abilitySlot(hud, k, window.innerWidth, window.innerHeight)} label={k} sample />
      ))}
      {!realCards &&
        SAMPLE_CARDS.map((x, i) => (
          <Badge key={i} name={`Sample augment ${i + 1}`} best={false} style={{ left: `${(region.x + x * region.w) * 100}vw`, ...anchor }} />
        ))}
    </div>
  );
}

function Badge({ name, score, best, style }: { name: string; score?: AugmentScore; best: boolean; style: CSSProperties }) {
  const grade = score?.grade ?? "?";
  const stat = score?.winRate ? (
    <>
      {(score.winRate.rate * 100).toFixed(1)}% {score.winRate.metric === "top4" ? "Top 4" : "WR"}{" "}
      <small>
        {score.winRate.pickRate !== undefined && <>· {(score.winRate.pickRate * 100).toFixed(1)}% pick </>}·{" "}
        {fmtGames(score.winRate.games)} {score.winRate.source === "personal" ? "of your games" : "games"}
      </small>
    </>
  ) : score ? (
    `Score ${Math.round(score.score * 100)}`
  ) : (
    "Not rated"
  );
  const reason = score?.reasons[0];
  return (
    <div className="nl-badge-pos" style={style}>
      <div className={`nl-badge nl-g-${grade.toLowerCase()} ${best ? "nl-best" : ""}`}>
        {best && (
          <div className="nl-ribbon">
            <Crown />
            #1 PICK
          </div>
        )}
        <div className="nl-grade">{grade}</div>
        <div className="nl-body">
          <div className="nl-name">{name}</div>
          <div className="nl-stat">
            {stat}
          </div>
          {reason && <div className="nl-reason">{reason}</div>}
        </div>
      </div>
    </div>
  );
}

function RerollIcon() {
  return (
    <svg className="nl-reroll-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" />
      <path d="M20 21v-5h-5" />
    </svg>
  );
}

function Crown() {
  return (
    <svg className="nl-crown" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10H4.8L3 8z" fill="currentColor" />
    </svg>
  );
}

function fmtGames(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
