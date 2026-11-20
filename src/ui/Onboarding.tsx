// First-run welcome tour. Shown once (persisted in onboarding.json via the bridge store),
// and on demand from Settings → About ("Show welcome tour").

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { useApp } from "../app/store";
import { loadStore, saveStore } from "../bridge";
import { Kbd } from "./controls";
import { Icon, type IconName } from "./icons";
import { LogoMark } from "./TopBar";

const STORE = "onboarding.json";
const TOUR_VERSION = 1;

interface OnboardingRecord {
  done: boolean;
  version: number;
  at?: string;
}

// ------------------------------------------------------------------ tiny module store

let open = false;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  open = v;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Re-open the welcome tour (e.g. from Settings → About). */
export function showOnboarding() {
  setOpen(true);
}

async function markDone() {
  const rec: OnboardingRecord = { done: true, version: TOUR_VERSION, at: new Date().toISOString() };
  await saveStore(STORE, rec);
}

// ------------------------------------------------------------------ steps

function Row({ icon, title, children }: { icon: IconName; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="ob-row">
      <span className="ob-row-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="ob-row-text">
        <span className="ob-row-title">{title}</span>
        {children && <span className="ob-row-sub">{children}</span>}
      </span>
    </li>
  );
}

function Welcome() {
  return (
    <>
      <div className="ob-hero ob-hero-brand">
        <LogoMark size={56} />
      </div>
      <h2 className="ob-title" id="ob-title">Welcome to Nexis</h2>
      <p className="ob-lead">A free, open-source companion for League of Legends. It sits on top of your game and tells you what to build and pick, without ads or an account.</p>
      <ul className="ob-rows">
        <Row icon="build" title="Builds that adapt to the enemy team">
          Core items, situational counters, boots, runes and next buy.
        </Row>
        <Row icon="augments" title="Augment tier badges in ARAM: Mayhem">
          A grade, win rate and reason under each card when the choice pops up.
        </Row>
        <Row icon="book" title="Skill orders, combos and champion guides" />
      </ul>
    </>
  );
}

function Setup({ hotkey }: { hotkey: string }) {
  return (
    <>
      <div className="ob-hero">
        <Icon name="settings" size={30} />
      </div>
      <h2 className="ob-title" id="ob-title">Quick setup</h2>
      <p className="ob-lead">Two things to know before your first game.</p>
      <ul className="ob-rows">
        <Row icon="play" title="Set League's Window Mode to Borderless">
          In game: <b>Settings → Video → Window Mode → Borderless</b> (Windowed works too). Exclusive Fullscreen can't show overlays.
        </Row>
        <Row icon="keyboard" title={<>Open and hide the overlay with {hotkey ? <Kbd>{hotkey}</Kbd> : <span className="dim">your shortcut</span>}</>}>
          <Kbd>Esc</Kbd> also hides it and puts you straight back in the game. Drag the top bar to move it, the edges to resize — size and spot are remembered.
        </Row>
        <Row icon="power" title="Lives in the system tray">
          Closing the window keeps Nexis running. Quit it from the tray icon or Settings → About.
        </Row>
      </ul>
    </>
  );
}

function DataStep() {
  return (
    <>
      <div className="ob-hero">
        <Icon name="spark" size={30} />
      </div>
      <h2 className="ob-title" id="ob-title">It figures things out for you</h2>
      <p className="ob-lead">No setup per game. Nexis follows the client and loads fresh stats as you play.</p>
      <ul className="ob-rows">
        <Row icon="user" title="Auto-detects your champion and queue">
          <span className="ob-modes">
            <span className="ob-mode">ARAM: Mayhem</span>
            <span className="ob-mode">ARAM</span>
            <span className="ob-mode">Summoner's Rift</span>
          </span>
        </Row>
        <Row icon="history" title="Live stats from HexMayhem and OP.GG">
          Win and pick rates, builds, runes, skill orders and augments, refreshed every few hours.
        </Row>
        <Row icon="enemies" title="Player scouting on the loading screen">
          Rank, recent form and champion win rate for all ten players, looked up on OP.GG.
        </Row>
      </ul>
    </>
  );
}

function FairPlay() {
  return (
    <>
      <div className="ob-hero ob-hero-good">
        <Icon name="shield" size={30} />
      </div>
      <h2 className="ob-title" id="ob-title">Fair play, by design</h2>
      <p className="ob-lead">Nexis only uses what Riot allows third-party apps to use.</p>
      <ul className="ob-rows ob-checks">
        <Row icon="check" title="Read-only">
          Game data comes from Riot's official Live Client Data API.
        </Row>
        <Row icon="check" title="No memory reading or injection">
          Nexis never touches the game process.
        </Row>
        <Row icon="check" title="No automation">
          It never sends inputs to the game. Augment detection only takes passive screenshots of your own screen.
        </Row>
      </ul>
    </>
  );
}

const STEPS = ["Welcome", "Setup", "Data", "Fair play"] as const;

// ------------------------------------------------------------------ dialog

export function Onboarding() {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => open);
  const hotkey = useApp((s) => s.settings.hotkeyToggle);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // First run: open unless the tour was completed before.
  useEffect(() => {
    let alive = true;
    void loadStore<OnboardingRecord>(STORE).then((rec) => {
      if (alive && !rec?.done) setOpen(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setDir("fwd");
    setClosing(false);
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => dialog.current?.querySelector<HTMLElement>(".ob-next")?.focus({ focusVisible: false } as FocusOptions), 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const close = useCallback(() => {
    void markDone();
    setClosing(true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => {
        setOpen(false);
        setClosing(false);
        restoreFocus.current?.focus?.();
      },
      reduce ? 0 : 160,
    );
  }, []);

  if (!isOpen) return null;

  const last = step === STEPS.length - 1;
  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length || to === step) return;
    setDir(to > step ? "fwd" : "back");
    setStep(to);
  };
  const next = () => (last ? close() : go(step + 1));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      go(step + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(step - 1);
    } else if (e.key === "Tab" && dialog.current) {
      // Keep focus inside the dialog.
      const f = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
      if (!f.length) return;
      const first = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const body = [<Welcome key="w" />, <Setup key="s" hotkey={hotkey} />, <DataStep key="d" />, <FairPlay key="f" />][step];

  return (
    <div className={`ob-scrim ${closing ? "ob-closing" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialog}
        className="ob-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        aria-describedby="ob-step-label"
        onKeyDown={onKeyDown}
      >
        <header className="ob-top">
          <span className="ob-step-label" id="ob-step-label">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
          <button type="button" className="ob-skip" onClick={close}>
            Skip tour <Kbd>Esc</Kbd>
          </button>
        </header>
        <div className={`ob-body ob-${dir}`} key={step}>
          {body}
        </div>
        <footer className="ob-foot">
          <div className="ob-dots" role="tablist" aria-label="Tour steps">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-label={`Step ${i + 1}: ${label}`}
                className={`ob-dot ${i === step ? "active" : ""} ${i < step ? "seen" : ""}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="ob-actions">
            {step > 0 && (
              <button type="button" className="btn btn-ghost ob-back" onClick={() => go(step - 1)}>
                Back
              </button>
            )}
            <button type="button" className="btn btn-primary ob-next" onClick={next}>
              {last ? "Ready, let's play" : "Next"}
              {!last && <Icon name="chevron" size={14} />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
