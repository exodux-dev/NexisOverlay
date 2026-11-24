// Star toggle for a champion (Settings → favorites), shown on Home.

import type { MouseEvent } from "react";
import { actions, useApp } from "../app/store";
import { Icon } from "./icons";
import "./fav-star.css";

export function useIsFavorite(id: string | undefined): boolean {
  return useApp((s) => !!id && (s.settings.favorites ?? []).includes(id));
}

export function FavStar({ id, name, size = 16, className = "" }: { id: string; name?: string; size?: number; className?: string }) {
  const on = useIsFavorite(id);
  const label = on ? `Remove ${name ?? id} from favorites` : `Add ${name ?? id} to favorites`;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void actions.toggleFavorite(id);
  };
  return (
    <button type="button" className={`fav-star ${on ? "is-on" : ""} ${className}`} onClick={onClick} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} aria-pressed={on} aria-label={label} title={label}>
      <Icon name="star" size={size} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
