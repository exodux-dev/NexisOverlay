import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  /** Render the anchor as a block element (for grid/flex children). */
  block?: boolean;
}

/** Hover / focus tooltip rendered in a portal so scroll containers never clip it. */
export function Tip({ content, children, className = "", block = false }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = a.top - t.height - 10 < 8 && a.bottom + t.height + 10 < vh;
    const top = below ? a.bottom + 8 : a.top - t.height - 8;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - t.width / 2), vw - t.width - 8);
    // Keep the card inside the viewport even when neither side has room for all of it.
    setPos({ left: Math.max(8, left), top: Math.max(8, Math.min(top, vh - t.height - 8)), below });
  }, [open, content]);

  const show = () => setOpen(true);
  const hide = () => {
    setOpen(false);
    setPos(null);
  };

  return (
    <span
      ref={anchor}
      className={`tip-anchor ${block ? "tip-block" : ""} ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={
        open
          ? (e) => {
              if (e.key !== "Escape") return;
              // Close just the tooltip; don't let the global Esc hide the whole overlay.
              e.preventDefault();
              hide();
            }
          : undefined
      }
    >
      {children}
      {open &&
        content &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className={`tip ${pos ? "tip-in" : ""} ${pos?.below ? "tip-below" : ""}`}
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
