// The app runs in WebView2, whose built-in right-click menu offers browser actions (Print,
// Save as, Back, Refresh…) that make no sense in an overlay. Hide it everywhere except text
// fields (which keep Cut / Copy / Paste), and swallow the matching Ctrl+P / Ctrl+S shortcuts.

/** True when the browser's own menu should stay (editable text). */
export function keepNativeMenu(target: EventTarget | null): boolean {
  const el = target as { closest?: (sel: string) => unknown } | null;
  return !!el?.closest?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable=""], [contenteditable="true"]');
}

/** Ctrl+P (print) / Ctrl+S, Ctrl+Shift+S (save as). */
export function isBrowserShortcut(e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "key">): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key.toLowerCase();
  return k === "p" || k === "s";
}

export function installBrowserMenuGuard(doc: Document = document) {
  doc.addEventListener("contextmenu", (e) => {
    if (!keepNativeMenu(e.target)) e.preventDefault();
  });
  doc.addEventListener("keydown", (e) => {
    if (isBrowserShortcut(e)) e.preventDefault();
  });
}
