// Lightweight toast notifications with a self-contained module-level store.
//
//   toast("Stats refreshed", "good");
//   <Toasts />   // mounted once in App.tsx

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./icons";

export type ToastTone = "info" | "good" | "warn" | "bad";

export interface ToastOptions {
  /** Auto-dismiss delay in ms (0 = stay until closed). Defaults by tone. */
  duration?: number;
  /** Secondary line under the message. */
  detail?: string;
  /** Replaces a visible toast with the same id instead of stacking a duplicate. */
  id?: string;
}

interface ToastItem {
  id: string;
  message: string;
  detail?: string;
  tone: ToastTone;
  duration: number;
  leaving: boolean;
  /** Bumps when a toast is replaced so its timer restarts. */
  rev: number;
}

const MAX_VISIBLE = 4;
const EXIT_MS = 180;
const DEFAULT_MS: Record<ToastTone, number> = { info: 3200, good: 3200, warn: 5200, bad: 6500 };

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit(next: ToastItem[]) {
  items = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Show a toast. Returns its id (pass it to `dismissToast` to close early). */
export function toast(message: string, tone: ToastTone = "info", opts: ToastOptions = {}): string {
  const id = opts.id ?? `t${++seq}`;
  const duration = opts.duration ?? DEFAULT_MS[tone];
  const existing = items.find((t) => t.id === id);
  if (existing) {
    emit(items.map((t) => (t.id === id ? { ...t, message, detail: opts.detail, tone, duration, leaving: false, rev: t.rev + 1 } : t)));
  } else {
    const next = [...items, { id, message, detail: opts.detail, tone, duration, leaving: false, rev: 0 }];
    emit(next.slice(-MAX_VISIBLE));
  }
  return id;
}

export function dismissToast(id: string) {
  if (!items.some((t) => t.id === id && !t.leaving)) return;
  emit(items.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  window.setTimeout(() => emit(items.filter((t) => t.id !== id || !t.leaving)), EXIT_MS);
}

const ICON: Record<ToastTone, IconName> = { info: "info", good: "check", warn: "warning", bad: "warning" };

function ToastRow({ t }: { t: ToastItem }) {
  const timer = useRef<number | undefined>(undefined);
  const remaining = useRef(t.duration);
  const started = useRef(0);

  const arm = () => {
    if (!t.duration) return;
    started.current = Date.now();
    timer.current = window.setTimeout(() => dismissToast(t.id), remaining.current);
  };
  const pause = () => {
    window.clearTimeout(timer.current);
    remaining.current = Math.max(800, remaining.current - (Date.now() - started.current));
  };

  useEffect(() => {
    remaining.current = t.duration;
    arm();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.rev, t.duration]);

  return (
    <div
      className={`toast toast-${t.tone} ${t.leaving ? "toast-out" : ""}`}
      role={t.tone === "bad" || t.tone === "warn" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={arm}
    >
      <span className="toast-icon">
        <Icon name={ICON[t.tone]} size={15} strokeWidth={2.2} />
      </span>
      <div className="toast-text">
        <span className="toast-msg">{t.message}</span>
        {t.detail && <span className="toast-detail">{t.detail}</span>}
      </div>
      <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
        <Icon name="close" size={13} />
      </button>
      {t.duration > 0 && !t.leaving && <span key={t.rev} className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} />}
    </div>
  );
}

export function Toasts() {
  const list = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <ToastRow key={t.id} t={t} />
      ))}
    </div>
  );
}
