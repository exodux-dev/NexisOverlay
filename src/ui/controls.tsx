// Small shared building blocks: cards, toggles, segmented controls, meters…

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Card({
  title,
  icon,
  extra,
  children,
  className = "",
  pad = true,
}: {
  title?: ReactNode;
  icon?: IconName;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card ${pad ? "" : "card-flush"} ${className}`}>
      {(title || extra) && (
        <header className="card-head">
          {title && (
            <h3 className="card-title">
              {icon && <Icon name={icon} size={15} />}
              {title}
            </h3>
          )}
          {extra && <div className="card-extra">{extra}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; sub?: ReactNode }) {
  const sw = (
    <button type="button" role="switch" aria-checked={checked} className={`switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span className="switch-knob" />
    </button>
  );
  if (!label) return sw;
  return (
    <label className="toggle-row">
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {sub && <span className="toggle-sub">{sub}</span>}
      </span>
      {sw}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  label,
}: {
  options: Array<{ value: T; label: ReactNode; hint?: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div className={`seg seg-${size}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.hint}
          className={`seg-btn ${o.value === value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Tone = "teal" | "gold" | "green" | "red" | "orange" | "blue" | "purple" | "muted";

export function Meter({ value, tone = "teal", height = 6 }: { value: number; tone?: Tone; height?: number }) {
  return (
    <div className="meter" style={{ height }}>
      <div className={`meter-fill tone-${tone}`} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Kbd({ children }: { children: string }) {
  const parts = children.split("+").filter(Boolean);
  if (!parts.length) return <span className="kbd-none">Not set</span>;
  return (
    <span className="kbd-group">
      {parts.map((p, i) => (
        <kbd key={i} className="kbd">
          {p}
        </kbd>
      ))}
    </span>
  );
}

export function Pill({ children, tone = "muted", dot = false, title }: { children: ReactNode; tone?: Tone; dot?: boolean; title?: string }) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {dot && <span className="pill-dot" />}
      {children}
    </span>
  );
}

/**
 * Empty / error state: icon + title + one-line explanation + optional action button(s).
 * `compact` is the inline variant used inside a card body (icon left of the text).
 */
export function Empty({
  icon = "info",
  title,
  children,
  action,
  tone,
  compact = false,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "error";
  compact?: boolean;
}) {
  return (
    <div className={`empty${compact ? " empty-compact" : ""}${tone ? ` empty-${tone}` : ""}`} role={tone === "error" ? "alert" : undefined}>
      <span className="empty-icon">
        <Icon name={icon} size={compact ? 16 : 20} />
      </span>
      <div className="empty-text">
        <div className="empty-title">{title}</div>
        {children && <div className="empty-body">{children}</div>}
      </div>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Human-readable explanation for a failed fetch (never show a raw "TypeError: Failed to fetch"). */
export function friendlyError(error: string | undefined | null): string {
  const e = (error ?? "").trim();
  if (!e || /failed to fetch|networkerror|network request failed|load failed|internet|offline|ENOTFOUND|ECONNREFUSED|timed? ?out/i.test(e))
    return "Couldn't reach the stats site. Check your internet connection and try again.";
  const http = /HTTP (\d{3})/.exec(e);
  if (http) {
    const code = Number(http[1]);
    if (code === 403 || code === 429) return "The stats site is rate-limiting requests right now. Try again in a minute.";
    if (code >= 500) return "The stats site is having trouble right now. Try again in a few minutes.";
    if (code === 404) return "The stats page wasn't found — the site may have changed. Try again later.";
  }
  return e.replace(/^(Type|Syntax)?Error:\s*/i, "");
}

export const LEVEL_TONE: Record<"low" | "medium" | "high" | "extreme", Tone> = {
  low: "muted",
  medium: "gold",
  high: "orange",
  extreme: "red",
};

export const LEVEL_LABEL: Record<"low" | "medium" | "high" | "extreme", string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  extreme: "Extreme",
};

/** Shimmering placeholder block shown while data loads. */
export function Skeleton({ w = "100%", h = 12, round = false, className = "" }: { w?: number | string; h?: number | string; round?: boolean; className?: string }) {
  return <span className={`skel ${round ? "skel-round" : ""} ${className}`} style={{ width: w, height: h }} aria-hidden="true" />;
}

/** A card-shaped loading placeholder: title + a few lines / icon rows. */
export function SkeletonCard({
  title,
  icon,
  rows = 3,
  icons = 0,
  className = "",
  label = "Loading",
}: {
  title?: ReactNode;
  icon?: IconName;
  rows?: number;
  icons?: number;
  className?: string;
  label?: string;
}) {
  return (
    <Card title={title} icon={icon} className={`skel-card ${className}`} extra={<span className="skel-label">{label}</span>}>
      <div className="skel-body" role="status" aria-label={label}>
        {icons > 0 && (
          <div className="skel-icons">
            {Array.from({ length: icons }, (_, i) => (
              <span key={i} className="skel-icon-col">
                <Skeleton w={48} h={48} />
                <Skeleton w={56} h={9} />
              </span>
            ))}
          </div>
        )}
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skel-row">
            <Skeleton w={36} h={36} />
            <span className="skel-lines">
              <Skeleton w={`${62 - ((i * 13) % 30)}%`} h={11} />
              <Skeleton w={`${38 + ((i * 17) % 28)}%`} h={9} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
