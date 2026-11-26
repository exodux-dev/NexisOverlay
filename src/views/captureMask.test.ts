import { describe, expect, it } from "vitest";
import { MASK_PAD, mergeRects } from "./captureMask";

const r = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("capture mask", () => {
  it("drops boxes inside others, pads and converts to screen fractions", () => {
    const out = mergeRects([r(100, 100, 300, 200), r(120, 120, 200, 180), r(1500, 50, 1900, 400)], 1920, 1080);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ x: Math.round(((100 - MASK_PAD) / 1920) * 1000) / 1000, y: Math.round(((100 - MASK_PAD) / 1080) * 1000) / 1000, w: Math.round(((200 + 2 * MASK_PAD) / 1920) * 1000) / 1000, h: Math.round(((100 + 2 * MASK_PAD) / 1080) * 1000) / 1000 });
  });
  it("keeps one of two identical boxes and clamps to the screen", () => {
    const out = mergeRects([r(0, 0, 50, 50), r(0, 0, 50, 50), r(1900, 1060, 1930, 1090)], 1920, 1080);
    expect(out).toHaveLength(2);
    expect(out[0].x).toBe(0);
    const last = out[1];
    expect(last.x + last.w).toBeLessThanOrEqual(1.0005);
    expect(last.y + last.h).toBeLessThanOrEqual(1.0005);
  });
  it("caps the list", () => {
    const many = Array.from({ length: 100 }, (_, i) => r(i * 10, 0, i * 10 + 5, 5));
    expect(mergeRects(many, 1920, 1080)).toHaveLength(64);
  });
});
