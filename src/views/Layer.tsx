// The "hud" window: a full-monitor, transparent, click-through layer drawn over the game.
// It renders (1) tier badges under the in-game augment cards detected by OCR and
// (2) the persistent mini HUD (MiniHud.tsx), which is also the only interactive part — and only
// while its layout editor is open.
//
// Riot policy: the HUD only shows static reference info (what to build next, the usual
// skill order). It never issues real-time combat prompts.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { actions, devHooks, getState, registerDemo, useApp, useDerived } from "../app/store";
import { rerollAdvice, type AugmentScore } from "../engine/augments";
import type { OcrMatch } from "../engine/ocrMatch";
import { MiniHud } from "./MiniHud";
import { hudOf } from "./hudSettings";
import * as bridge from "../bridge";
import "./layer.css";

export { HudCard, hudHasContent, sampleHudModel, useHudModel, type HudModel } from "./MiniHud";

// Only in the hud window: Settings imports HudCard from here and must not clobber main's hooks.
if (import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "hud") {
  (window as unknown as { __nexis: unknown }).__nexis = { devHooks, actions, registerDemo, getState };
}

const FADE_MS = 320;

export default function Layer() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("nexis-layer");
    return () => root.classList.remove("nexis-layer");
  }, []);

  return (
    <div className="nl-root" aria-hidden="true">
      <AugmentBadges />
      <PickReminder />
      <CalibrationPreview />
      <MiniHud />
    </div>
  );
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
  const top = `calc(${(region.y + region.h + badgeOffset) * 100}vh + 8px)`;
  // Static evaluation of the offer on screen: Mayhem lets you reroll augment offers.
  const advice = rerollAdvice(shown.cards.map((c) => c.score).filter((x): x is AugmentScore => !!x));
  return (
    <div key={shown.key} className={`nl-badges ${visible ? "nl-in" : "nl-out"}`}>
      {advice?.reroll && (
        <div className="nl-reroll" style={{ left: `${(region.x + region.w / 2) * 100}vw`, top: `max(8px, calc(${region.y * 100}vh - 2.6em))` }}>
          <RerollIcon />
          Consider a reroll
          <small>{advice.reason.replace(/ — consider rerolling\.$| — a reroll will likely do better\.$/, "")}</small>
        </div>
      )}
      {shown.cards.map(({ card, score }, i) => (
        <Badge
          key={card.augment.name}
          name={card.augment.name}
          score={score}
          best={card.augment.name === shown.bestName}
          style={{ left: `${(region.x + card.x * region.w) * 100}vw`, top, animationDelay: `${i * 70}ms` }}
        />
      ))}
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
  const region = useApp((s) => s.settings.scanRegion);
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

  if (!shownFor) return null;
  return (
    <div
      className={`nl-pick-reminder ${visible ? "nl-in" : "nl-out"}`}
      role="status"
      style={{ left: `${(region.x + region.w / 2) * 100}vw`, top: `calc(${(region.y + region.h) * 100}vh + 7.5em)` }}
    >
      Augments detected: open Nexis (<b>{hotkey}</b>) and mark your pick so your stats stay accurate
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
  const top = `calc(${(region.y + region.h + badgeOffset) * 100}vh + 8px)`;
  return (
    <div className="nl-calib">
      <div className="nl-calib-region" style={{ left: `${region.x * 100}vw`, top: `${region.y * 100}vh`, width: `${region.w * 100}vw`, height: `${region.h * 100}vh` }}>
        <span>Nexis scan region — augment names must be inside</span>
      </div>
      {!realCards &&
        SAMPLE_CARDS.map((x, i) => (
          <Badge key={i} name={`Sample augment ${i + 1}`} best={false} style={{ left: `${(region.x + x * region.w) * 100}vw`, top }} />
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
