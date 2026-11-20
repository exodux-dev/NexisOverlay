// Compact timeline of scoreboard intel (items, levels, fights, build updates), newest first.

import type { IntelEvent, IntelKind } from "../engine/intel";
import { visibleIntel } from "../engine/intel";
import type { StaticData } from "../engine/types";
import { clock } from "./format";
import { GameIcon } from "./GameIcon";
import { Icon, type IconName } from "./icons";
import { ItemIcon } from "./ItemIcon";
import "./intel-feed.css";

const KIND_ICON: Record<IntelKind, IconName> = {
  "enemy-item": "coin",
  "ally-item": "coin",
  "enemy-level": "spark",
  "enemy-fed": "warning",
  fight: "enemies",
  build: "build",
};

const KIND_LABEL: Record<IntelKind, string> = {
  "enemy-item": "Enemy item",
  "ally-item": "Ally item",
  "enemy-level": "Level",
  "enemy-fed": "Fed",
  fight: "Fight",
  build: "Build",
};

function Glyph({ e, data }: { e: IntelEvent; data: StaticData }) {
  const champ = e.championId ? data.championsById.get(e.championId) : undefined;
  const item = e.itemId ? data.items.get(e.itemId) : undefined;
  if (item) {
    return (
      <span className="ifeed-glyph">
        <ItemIcon item={item} size={28} />
        {champ && e.kind !== "build" && (
          <span className="ifeed-badge">
            <GameIcon src={champ.icon} name={champ.name} size={16} round />
          </span>
        )}
      </span>
    );
  }
  if (champ) {
    return (
      <span className="ifeed-glyph">
        <GameIcon src={champ.icon} name={champ.name} size={28} round />
      </span>
    );
  }
  return (
    <span className="ifeed-glyph ifeed-glyph-icon">
      <Icon name={KIND_ICON[e.kind]} size={15} />
    </span>
  );
}

/**
 * @param events the intel log (oldest → newest, as stored); filtered/limited via visibleIntel.
 */
export function IntelFeed({ events, data, max = 30, empty }: { events: IntelEvent[]; data: StaticData; max?: number; empty?: string }) {
  const list = visibleIntel(events, max);
  if (!list.length) {
    return (
      <div className="ifeed-empty">
        <Icon name="history" size={16} />
        <span>{empty ?? "Item completions, level 6/11/16 and fights will show up here as the scoreboard changes."}</span>
      </div>
    );
  }
  return (
    <ol className="ifeed" aria-label="Game intel, newest first">
      {list.map((e) => (
        <li key={e.id} className={`ifeed-row ifeed-${e.tone} ifeed-k-${e.kind}`}>
          <time className="ifeed-time tnum" title={`Game time ${clock(e.at)}`}>
            {clock(e.at)}
          </time>
          <Glyph e={e} data={data} />
          <div className="ifeed-text">
            <span className="ifeed-title">
              {e.kind === "build" && <span className="ifeed-tag">{KIND_LABEL.build}</span>}
              {e.kind === "build" ? e.title.replace(/^Build update:\s*/, "") : e.title}
            </span>
            {e.detail && <span className="ifeed-detail">{e.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
