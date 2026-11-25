// Item portrait + rich hover card (what the item does + why we recommend it).

import { t as tx } from "../i18n";
import type { ReactNode } from "react";
import type { ItemRec, WinInfo } from "../engine/build";
import type { Item } from "../engine/types";
import { gold } from "./format";
import { GameIcon } from "./GameIcon";
import { Icon } from "./icons";
import { Tip } from "./Tip";

const KIND_LABEL: Record<ItemRec["kind"], string> = { core: "Core", situational: "Situational", flex: "Flex", boots: "Boots" };

export function WinRate({ wr }: { wr?: WinInfo }) {
  if (!wr) return null;
  const good = wr.rate >= 0.52;
  const bad = wr.rate < 0.48;
  return (
    <span className={`wr ${good ? "wr-good" : bad ? "wr-bad" : ""}`} title={wr.metric === "top4" ? "Top-4 finish rate (Arena)" : undefined}>
      {(wr.rate * 100).toFixed(1)}%{wr.metric === "top4" && <span className="wr-meta"> top 4</span>}<span className="wr-meta"> · {gold(wr.games)} games · {wr.source === "global" ? "Global" : "You"}</span>
    </span>
  );
}

/** Splits "Active – Name" style effect names into a label + title. */
function effectLabel(name: string): { kind: "Active" | "Passive"; title: string } {
  const m = /^(active|passive)\s*[-–—:]\s*(.*)$/i.exec(name.trim());
  if (m) return { kind: m[1].toLowerCase() === "active" ? "Active" : "Passive", title: m[2] };
  return { kind: "Passive", title: name.trim() };
}

export function ItemTooltip({ item, rec, note, fallbackName }: { item?: Item; rec?: ItemRec; note?: ReactNode; fallbackName?: string }) {
  if (!item) return <span className="tt-plain">{fallbackName ?? "Unknown item"}</span>;
  const plaintext = item.plaintext?.trim();
  const stats = item.statLines ?? [];
  const effects = (item.effects ?? []).filter((e) => e.text?.trim() || e.name?.trim());
  return (
    <div className="tt tt-item">
      <div className="tt-item-head">
        <GameIcon src={item.icon} name={item.name} size={34} />
        <div className="tt-item-title">
          <strong>{item.name}</strong>
          <span className="tt-cost">
            <Icon name="coin" size={12} />
            {gold(item.cost)}
          </span>
        </div>
      </div>
      {plaintext && <p className="tt-plaintext">{plaintext}</p>}
      {stats.length > 0 && (
        <ul className="tt-stats">
          {stats.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      {effects.length > 0 && (
        <div className="tt-effects">
          {effects.map((e, i) => {
            const l = effectLabel(e.name ?? "");
            return (
              <p key={i} className="tt-effect">
                {(l.title || l.kind === "Active") && (
                  <span className={`tt-effect-name ${l.kind === "Active" ? "is-active" : ""}`}>
                    {l.kind === "Active" ? "Active" : ""}
                    {l.kind === "Active" && l.title ? " · " : ""}
                    {l.title}
                  </span>
                )}
                {e.text}
              </p>
            );
          })}
        </div>
      )}
      {!plaintext && !stats.length && !effects.length && !rec && !note && <span className="dim">{tx("No description available.")}</span>}
      {rec && (
        <div className="tt-rec">
          <div className={`tt-kind kind-${rec.kind}`}>
            Why: {KIND_LABEL[rec.kind]}
            {rec.owned ? " · Owned" : ""}
          </div>
          <ul className="tt-list">
            {rec.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <div className="tt-wrline">{rec.winRate ? <WinRate wr={rec.winRate} /> : <span className="dim">{tx("No win-rate data yet")}</span>}</div>
        </div>
      )}
      {note && <div className="tt-rec tt-note">{note}</div>}
    </div>
  );
}

/** Item icon with the rich tooltip. Pass `item` (resolved) or just a name for an unknown item. */
export function ItemIcon({
  item,
  name,
  size = 40,
  rec,
  note,
  className = "",
  children,
}: {
  item?: Item;
  name?: string;
  size?: number;
  rec?: ItemRec;
  note?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const label = item?.name ?? name ?? "Item";
  return (
    <Tip content={<ItemTooltip item={item} rec={rec} note={note} fallbackName={label} />}>
      <span className={`item-icon ${className}`} tabIndex={0}>
        <GameIcon src={item?.icon} name={label} size={size} />
        {children}
      </span>
    </Tip>
  );
}
