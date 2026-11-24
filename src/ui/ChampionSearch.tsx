// Type-to-search champion box with live results (guesses short names / typos, see
// engine/championSearch). ↑ / ↓ to move, Enter to pick, Esc to clear. Shows the current champion
// inside the box while nothing is typed.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchChampions } from "../engine/championSearch";
import type { Champion } from "../engine/types";
import { ARCHETYPE_LABEL } from "./format";
import { GameIcon } from "./GameIcon";
import { Icon } from "./icons";

interface Props {
  champions: Champion[];
  onPick: (c: Champion) => void;
  /** Shown inside the box while empty. */
  current?: Champion;
  placeholder?: string;
  exclude?: string[];
  label?: string;
  className?: string;
}

export function ChampionSearch({ champions, onPick, current, placeholder = "Search a champion…", exclude = [], label = "Search champion", className = "" }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const results = useMemo(() => (q.trim() ? searchChampions(q, champions.filter((c) => !exclude.includes(c.id)), 7) : []), [q, champions, exclude]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (c: Champion | undefined) => {
    if (!c) return;
    onPick(c);
    setQ("");
    setOpen(false);
  };
  const showList = open && q.trim().length > 0;

  return (
    <div className={`csearch ${className}`} ref={box}>
      <label className="search csearch-field">
        {current && !q ? <GameIcon src={current.icon} name={current.name} size={26} round className="csearch-current" /> : <Icon name="search" size={16} />}
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(results[sel]);
            } else if (e.key === "Escape" && q) {
              e.stopPropagation();
              setQ("");
            }
          }}
          placeholder={current ? `${current.name} · type to switch` : placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          spellCheck={false}
          autoComplete="off"
        />
        {q && (
          <button type="button" className="csearch-clear" onClick={() => setQ("")} aria-label="Clear">
            <Icon name="close" size={12} />
          </button>
        )}
      </label>
      {showList && (
        <ul className="csearch-list" id={listId} role="listbox" aria-label="Matching champions">
          {results.length ? (
            results.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === sel}
                className={`csearch-item ${i === sel ? "is-sel" : ""}`}
                onMouseEnter={() => setSel(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
              >
                <GameIcon src={c.icon} name={c.name} size={30} round />
                <span className="csearch-name">{c.name}</span>
                <span className="csearch-arch">{ARCHETYPE_LABEL[c.archetype]}</span>
                {i === sel && <span className="csearch-enter">Enter</span>}
              </li>
            ))
          ) : (
            <li className="csearch-empty">No champion matches “{q}”</li>
          )}
        </ul>
      )}
    </div>
  );
}
