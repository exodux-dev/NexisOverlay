import { createPortal } from "react-dom";
import { searchChampions } from "../engine/championSearch";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Champion } from "../engine/types";
import { norm } from "../engine/text";
import { ARCHETYPE_LABEL } from "./format";
import { GameIcon } from "./GameIcon";
import { Icon } from "./icons";

interface Props {
  title: string;
  champions: Champion[];
  exclude?: string[];
  onPick: (c: Champion) => void;
  onClose: () => void;
}

/** Searchable champion grid in a modal sheet. Enter picks the first match, Esc closes. */
export function ChampionPicker({ title, champions, exclude = [], onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const n = norm(q);
    const pool = champions.filter((c) => !exclude.includes(c.id));
    if (!n) return pool;
    const byName = searchChampions(q, pool, pool.length);
    return byName.length ? byName : pool.filter((c) => norm(ARCHETYPE_LABEL[c.archetype]).includes(n));
  }, [q, champions, exclude]);

  // Portal to <body>: inside the scrolling view a "fixed" scrim is positioned against the page,
  // not the window, so the dialog could open off-screen.
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <label className="search">
          <Icon name="search" size={16} />
          <input
            ref={input}
            value={q}
            placeholder="Search champion or role…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && list[0]) onPick(list[0]);
            }}
          />
        </label>
        <div className="picker-grid">
          {list.map((c) => (
            <button key={c.id} type="button" className="picker-cell" onClick={() => onPick(c)} title={`${c.name} · ${ARCHETYPE_LABEL[c.archetype]}`}>
              <GameIcon src={c.icon} name={c.name} size={48} />
              <span>{c.name}</span>
            </button>
          ))}
          {!list.length && <div className="picker-empty">No champion matches “{q}”.</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
