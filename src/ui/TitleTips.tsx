// Styled hover tips for every `title` attribute in the main window: the browser's own tooltip looks
// like a plain Windows one. On hover the title moves to `data-nx-title` (so the native tip never
// shows) and a themed tip appears after a short delay, placed below (or above) the element.
// Icon-only controls keep their accessible name: the title becomes their aria-label if they had none.
import { t } from "../i18n";
import { useEffect, useState } from "react";

interface Tip {
  text: string;
  x: number;
  y: number;
  above: boolean;
}

const DELAY_MS = 350;
const MARGIN = 8;

/** While hovered, the title moves to data-nx-title (no native tooltip); `giveBack` restores it. */
function takeTitle(el: Element): string | undefined {
  const t = el.getAttribute("title");
  if (t === null || !t.trim()) return undefined;
  el.removeAttribute("title");
  el.setAttribute("data-nx-title", t);
  return t;
}
/** Put the title back on leave, so React stays the owner of it (a later change / removal works). */
function giveBack(el: Element | null) {
  if (!el) return;
  const t = el.getAttribute("data-nx-title");
  el.removeAttribute("data-nx-title");
  if (t !== null && !el.hasAttribute("title")) el.setAttribute("title", t);
}

export function TitleTips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: Element | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      giveBack(current);
      current = null;
      setTip(null);
    };
    const show = (el: Element) => {
      const text = el.getAttribute("data-nx-title");
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const above = r.bottom + 60 > window.innerHeight;
      setTip({ text, x: Math.min(Math.max(r.left + r.width / 2, 120), window.innerWidth - 120), y: above ? r.top - MARGIN : r.bottom + MARGIN, above });
    };
    const onOver = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.("[title], [data-nx-title]");
      if (!el || el === current) return;
      // A styled <Tip> (rich tooltip) already covers this element: leave it alone.
      if (el.closest(".tip-anchor, .nl-root")) return;
      window.clearTimeout(timer);
      giveBack(current);
      setTip(null);
      const text = takeTitle(el);
      current = el;
      if (text) timer = window.setTimeout(() => current === el && show(el), DELAY_MS);
    };
    const onOut = (e: MouseEvent) => {
      if (!current) return;
      const to = e.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      hide();
    };
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("focusin", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("mousedown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", hide, true);
    return () => {
      hide();
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("focusin", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("mousedown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div className={`nx-tip ${tip.above ? "nx-tip-above" : ""}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {t(tip.text)}
    </div>
  );
}
