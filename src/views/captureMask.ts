// Where the HUD layer is drawing (badges, HUD panel, notices, arrows), as fractions of the screen.
// Sent to the backend so augment scans black these spots out: OCR never reads our own text, and
// our windows don't need the "exclude from capture" flag that switches off screen recorders.
import type { ScreenRect } from "../bridge";

/** Padding around each drawn box (px), for glows / shadows. */
export const MASK_PAD = 6;

const effectiveOpacity = (el: Element): number => {
  let o = 1;
  for (let e: Element | null = el; e && o > 0.04; e = e.parentElement) o *= Number(getComputedStyle(e).opacity || 1);
  return o;
};

/** Positioned, visible boxes under `root` (not full-screen containers), merged and padded. */
export function collectMask(root: Element, width: number, height: number): ScreenRect[] {
  const boxes: DOMRect[] = [];
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute" && cs.position !== "fixed") continue;
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.width > width * 0.9 && r.height > height * 0.9) continue; // full-screen wrappers
    if (effectiveOpacity(el) <= 0.04) continue;
    boxes.push(r);
  }
  return mergeRects(boxes, width, height);
}

/** Drop boxes inside another, pad, clamp to the screen, convert to fractions (max 64). */
export function mergeRects(boxes: Array<{ left: number; top: number; right: number; bottom: number }>, width: number, height: number): ScreenRect[] {
  const inside = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => a.left >= b.left && a.top >= b.top && a.right <= b.right && a.bottom <= b.bottom;
  const kept = boxes.filter((a, i) => !boxes.some((b, j) => j !== i && inside(a, b) && (!inside(b, a) || j < i)));
  return kept.slice(0, 64).map((r) => {
    const x0 = Math.max(0, r.left - MASK_PAD), y0 = Math.max(0, r.top - MASK_PAD);
    const x1 = Math.min(width, r.right + MASK_PAD), y1 = Math.min(height, r.bottom + MASK_PAD);
    const f = (v: number) => Math.round(v * 1000) / 1000;
    return { x: f(x0 / width), y: f(y0 / height), w: f((x1 - x0) / width), h: f((y1 - y0) / height) };
  });
}
