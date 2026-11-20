import { describe, expect, it } from "vitest";
import { isBrowserShortcut, keepNativeMenu } from "./browserMenu";

const at = (match: boolean) => ({ closest: () => (match ? {} : null) }) as unknown as EventTarget;

describe("browser menu guard", () => {
  it("keeps the native menu only in text fields", () => {
    expect(keepNativeMenu(at(true))).toBe(true);
    expect(keepNativeMenu(at(false))).toBe(false);
    expect(keepNativeMenu(null)).toBe(false);
  });
  it("blocks print / save shortcuts, not app hotkeys", () => {
    const k = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ ctrlKey: false, metaKey: false, altKey: false, key, ...mods });
    expect(isBrowserShortcut(k("p", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(k("S", { ctrlKey: true }))).toBe(true);
    expect(isBrowserShortcut(k("p"))).toBe(false);
    expect(isBrowserShortcut(k("k", { ctrlKey: true }))).toBe(false);
    expect(isBrowserShortcut(k("s", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
