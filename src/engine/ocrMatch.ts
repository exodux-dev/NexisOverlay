// Matches OCR'd text lines from the augment screen to known augment names.

import type { Augment } from "./types";
import { norm, similarity } from "./text";

export interface OcrLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrMatch {
  augment: Augment;
  confidence: number; // 0..1
  x: number; // horizontal center (0..1) – cards are ordered left→right
  y: number; // vertical center (0..1)
}

/** Short names are easy to hit by accident ("Thresh" → THRASH, "Left" → Deft): demand near-exact matches. */
function requiredConfidence(name: string, base: number): number {
  const len = norm(name).length;
  return len <= 6 ? Math.max(base, 0.9) : len <= 9 ? Math.max(base, 0.82) : base;
}

/**
 * For every OCR line, find the best augment name (whole line or a sliding window of words),
 * then keep the best match per horizontal card column. Returns matches left→right.
 */
export function matchAugments(lines: OcrLine[], augments: Augment[], minConfidence = 0.76): OcrMatch[] {
  const candidates: OcrMatch[] = [];
  for (const line of lines) {
    const words = line.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let best: OcrMatch | undefined;
    for (const aug of augments) {
      const n = aug.name.split(/\s+/).length;
      const windows = new Set<string>([line.text]);
      for (let len = Math.max(1, n - 1); len <= n + 1; len++)
        for (let i = 0; i + len <= words.length; i++) windows.add(words.slice(i, i + len).join(" "));
      for (const w of windows) {
        if (Math.abs(norm(w).length - norm(aug.name).length) > 6) continue;
        const s = similarity(w, aug.name);
        if (!best || s > best.confidence) best = { augment: aug, confidence: s, x: line.x + line.w / 2, y: line.y + line.h / 2 };
      }
    }
    if (best && best.confidence >= requiredConfidence(best.augment.name, minConfidence)) candidates.push(best);
  }
  // Cluster by x: lines within 10% of screen width belong to the same card.
  candidates.sort((a, b) => b.confidence - a.confidence);
  const picked: OcrMatch[] = [];
  for (const c of candidates) {
    if (picked.some((p) => p.augment.name === c.augment.name || Math.abs(p.x - c.x) < 0.1)) continue;
    picked.push(c);
  }
  // Augment cards sit side by side: keep the largest group of matches on the same row.
  const rows = picked.map((p) => picked.filter((o) => Math.abs(o.y - p.y) < 0.12));
  const row = rows.sort((a, b) => b.length - a.length)[0] ?? [];
  return row.sort((a, b) => a.x - b.x).slice(0, 4);
}
