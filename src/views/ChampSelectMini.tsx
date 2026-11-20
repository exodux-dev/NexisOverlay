// Compact champ-select view: a small window at the side of the screen that doesn't cover champ
// select. Shows your champion, the build and skill order; Expand opens the full overlay.

import type { Derived } from "../app/store";
import * as bridge from "../bridge";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { Tip } from "../ui/Tip";
import { ItemTooltip } from "../ui/ItemIcon";
import "./champselect-mini.css";

export function ChampSelectMini({ d }: { d: Derived | null }) {
  const champ = d?.champion;
  const stats = d?.championStats;
  const wr = stats && stats.games > 0 ? (stats.wins / stats.games) * 100 : undefined;
  const order = d?.plan?.order ?? [];
  const max = d?.skillPlan?.max ?? [];
  return (
    <div className="csm" onMouseDown={(e) => {
      // Drag the window from anywhere that isn't a button / icon.
      if ((e.target as HTMLElement).closest("button, .csm-item")) return;
      void bridge.startDrag();
    }}>
      <header className="csm-head">
        {champ ? <GameIcon src={champ.icon} name={champ.name} size={34} round /> : <span className="csm-ph" />}
        <div className="csm-who">
          <div className="csm-name">{champ?.name ?? "Pick a champion"}</div>
          <div className="csm-sub">
            {d?.gameMode ? <span>{d.gameMode === "sr" ? "Rift" : d.gameMode === "mayhem" ? "Mayhem" : d.gameMode === "aram" ? "ARAM" : "Arena"}</span> : null}
            {wr !== undefined && <span className="csm-wr">{wr.toFixed(1)}%</span>}
          </div>
        </div>
        <button type="button" className="csm-btn" title="Close" aria-label="Close" onClick={() => void bridge.hideOverlay()}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {order.length > 0 && (
        <div className="csm-order" aria-label="Build order">
          {order.slice(0, 6).map((rec, i) => (
            <Tip key={`${rec.item.id}-${i}`} content={<ItemTooltip item={rec.item} rec={rec} />}>
              <span className="csm-item" tabIndex={0}>
                <GameIcon src={rec.item.icon} name={rec.item.name} size={34} />
              </span>
            </Tip>
          ))}
        </div>
      )}
      {max.length > 0 && (
        <div className="csm-skills">
          <span className="csm-label">Max</span>
          {max.map((k, i) => (
            <span key={k} className="csm-key-wrap">
              {i > 0 && <span className="csm-chev">›</span>}
              <span className="csm-key">{k}</span>
            </span>
          ))}
        </div>
      )}
      <button type="button" className="csm-expand" onClick={() => void bridge.setMiniMode(false)}>
        <Icon name="spark" size={13} /> Expand
      </button>
    </div>
  );
}
