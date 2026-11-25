// League-client-style hover cards for abilities, runes, stat shards, summoner spells and
// augments. They share the item tooltip's frame (`.tt` inside `Tip`) and render Data Dragon
// rich text through engine/tooltipText (tags → colors, unknown values → "?").

import { t as tx } from "../i18n";
import { Fragment, useMemo, type ReactNode } from "react";
import { useChampionSpells, useDerived } from "../app/store";
import { findAugment } from "../engine/augments";
import { abilityBody, parseRichText, type Seg } from "../engine/tooltipText";
import type { Augment, AugmentRarity, ChampionSpell, Rune, SummonerSpell } from "../engine/types";
import { RARITY_LABEL } from "./format";
import { GameIcon } from "./GameIcon";
import { Tip } from "./Tip";
import "./game-tips.css";

// ------------------------------------------------------------------ rich text

const UNKNOWN_TITLE = "Value not published by Data Dragon";

export function RichText({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.t === "\n" ? (
          <br key={i} />
        ) : s.k === "unknown" ? (
          <span key={i} className="rt-unknown" title={UNKNOWN_TITLE}>
            ?
          </span>
        ) : s.k ? (
          <span key={i} className={`rt-${s.k}`}>
            {s.t}
          </span>
        ) : (
          <Fragment key={i}>{s.t}</Fragment>
        ),
      )}
    </>
  );
}

/** "9/8/7/6/5" with the current rank emphasised (every "a/b/c" run in `text`). */
function RankValues({ text, rank }: { text: string; rank?: number }) {
  const parts = text.split(/(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)+)/);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0)
          return p ? (
            <Fragment key={i}>
              {p.split("?").map((t, j) => (
                <Fragment key={j}>
                  {j > 0 && (
                    <span className="rt-unknown" title={UNKNOWN_TITLE}>
                      ?
                    </span>
                  )}
                  {t}
                </Fragment>
              ))}
            </Fragment>
          ) : null;
        const vals = p.split("/");
        return (
          <span key={i} className="tt-ranks">
            {vals.map((v, j) => (
              <Fragment key={j}>
                {j > 0 && <span className="tt-rank-sep">/</span>}
                <span className={rank && j === rank - 1 ? "tt-rank-now" : undefined}>{v}</span>
              </Fragment>
            ))}
          </span>
        );
      })}
    </>
  );
}

function GameHead({ icon, name, round, sub, size = 40 }: { icon?: string; name: string; round?: boolean; sub?: ReactNode; size?: number }) {
  return (
    <div className="tt-game-head">
      <GameIcon src={icon} name={name} size={size} round={round} />
      <div className="tt-game-title">
        <strong>{name}</strong>
        {sub && <span className="tt-game-sub">{sub}</span>}
      </div>
    </div>
  );
}

function StatRows({ rows }: { rows: Array<[string, ReactNode] | false | undefined> }) {
  const shown = rows.filter((r): r is [string, ReactNode] => !!r);
  if (!shown.length) return null;
  return (
    <dl className="tt-game-stats">
      {shown.map(([k, v]) => (
        <Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ abilities

const KEY_LABEL: Record<ChampionSpell["key"], string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "Ultimate" };

/** Full ability card: icon, key, rank, cooldown / cost / range per rank, description. */
export function AbilityTooltip({ spell, rank }: { spell: ChampionSpell; rank?: number }) {
  const body = useMemo(() => (spell.detail ? abilityBody(spell.detail, spell.resource) : parseRichText(spell.description)), [spell]);
  const max = spell.maxRank;
  const sub = (
    <>
      <span className={`tt-keycap tt-key-${spell.key}`}>{spell.key}</span>
      <span>{KEY_LABEL[spell.key] === spell.key ? "Ability" : KEY_LABEL[spell.key]}</span>
      {spell.key !== "P" && rank !== undefined && max ? (
        <span className="tt-game-rank">
          Rank {rank}/{max}
        </span>
      ) : null}
    </>
  );
  return (
    <div className="tt tt-game tt-ability">
      <GameHead icon={spell.icon} name={spell.name} sub={sub} />
      {spell.key !== "P" && (
        <StatRows
          rows={[
            !!spell.cooldown && ["Cooldown", <RankValues key="cd" text={`${spell.cooldown}s`} rank={rank} />],
            ["Cost", spell.cost ? <RankValues key="cost" text={spell.cost} rank={rank} /> : <span className="dim">{tx("No cost")}</span>],
            !!spell.range && ["Range", spell.range],
          ]}
        />
      )}
      {body.length > 0 ? (
        <p className="tt-game-body">
          <RichText segs={body} />
        </p>
      ) : (
        <span className="dim">{tx("No description available.")}</span>
      )}
    </div>
  );
}

/** Wraps `children` (a focusable key / icon) with the ability card; renders children alone until the spell loads. */
export function AbilityTip({ spell, rank, children, block, className }: { spell?: ChampionSpell; rank?: number; children: ReactNode; block?: boolean; className?: string }) {
  if (!spell) return <>{children}</>;
  return (
    <Tip content={<AbilityTooltip spell={spell} rank={rank} />} block={block} className={className}>
      {children}
    </Tip>
  );
}

/**
 * Ability card for a bare Q/W/E/R key of the current champion (spells load lazily, cached per
 * champion). Used where a view only has the key letter, e.g. the mini HUD's skill row.
 */
export function KeyAbilityTip({ k, children, className }: { k: string; children: ReactNode; className?: string }) {
  const d = useDerived();
  const spells = useChampionSpells(d.baseChampion?.id);
  const spell = spells.find((s) => s.key === k);
  const live = d.mode === "live" || d.mode === "demo";
  const rank = live && k !== "P" ? d.game?.skills?.[k as "Q" | "W" | "E" | "R"] : undefined;
  return (
    <AbilityTip spell={spell} rank={rank} className={className}>
      {children}
    </AbilityTip>
  );
}

// ------------------------------------------------------------------ runes & shards

/** Stat shards are not in Data Dragon's runesReforged.json; names, art and values live here. */
const SHARD_ART = "https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods";
export const SHARDS: Record<number, { name: string; file: string; desc: string }> = {
  5001: { name: "Health Scaling", file: "StatModsHealthScalingIcon.png", desc: "+10–180 Health (based on level)" },
  5002: { name: "Armor", file: "StatModsArmorIcon.png", desc: "+6 Armor" },
  5003: { name: "Magic Resist", file: "StatModsMagicResIcon.MagicResist_Fix.png", desc: "+8 Magic Resist" },
  5005: { name: "Attack Speed", file: "StatModsAttackSpeedIcon.png", desc: "+10% Attack Speed" },
  5007: { name: "Ability Haste", file: "StatModsCDRScalingIcon.png", desc: "+8 Ability Haste" },
  5008: { name: "Adaptive Force", file: "StatModsAdaptiveForceIcon.png", desc: "+9 Adaptive Force (5.4 AD or 9 AP)" },
  5010: { name: "Move Speed", file: "StatModsMovementSpeedIcon.png", desc: "+2.5% Move Speed" },
  5011: { name: "Health", file: "StatModsHealthPlusIcon.png", desc: "+65 Health" },
  5012: { name: "Resist Scaling", file: "StatModsArmorIcon.png", desc: "+1–8 Armor and Magic Resist (based on level)" },
  5013: { name: "Tenacity and Slow Resist", file: "StatModsTenacityIcon.png", desc: "+15% Tenacity and Slow Resist" },
};
export const shardIcon = (id: number) => (SHARDS[id] ? `${SHARD_ART}/${SHARDS[id].file}` : undefined);

const SLOT_LABEL = ["Keystone", "Row 1", "Row 2", "Row 3"];

export function RuneTooltip({ rune, id }: { rune?: Rune; id?: number }) {
  const body = useMemo(() => (rune ? parseRichText(rune.longDesc ?? rune.shortDesc ?? "") : []), [rune]);
  if (!rune) return <span className="tt-plain">Rune {id ?? ""}</span>;
  const isPath = !rune.tree;
  const sub = isPath ? "Rune path" : `${rune.tree} · ${rune.slot !== undefined ? (SLOT_LABEL[rune.slot] ?? "Rune") : "Rune"}`;
  return (
    <div className={`tt tt-game tt-rune ${rune.slot === 0 ? "tt-keystone" : ""}`}>
      <GameHead icon={rune.icon} name={rune.name} round sub={sub} size={rune.slot === 0 ? 44 : 36} />
      {body.length > 0 && (
        <p className="tt-game-body">
          <RichText segs={body} />
        </p>
      )}
    </div>
  );
}

export function ShardTooltip({ id }: { id: number }) {
  const s = SHARDS[id];
  if (!s) return <span className="tt-plain">Stat shard {id}</span>;
  return (
    <div className="tt tt-game tt-shard">
      <GameHead icon={shardIcon(id)} name={s.name} round sub="Stat shard" size={28} />
      <p className="tt-game-body">
        <span className="rt-key">{s.desc}</span>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ summoner spells

export function SummonerTooltip({ spell, id }: { spell?: SummonerSpell; id?: number }) {
  if (!spell) return <span className="tt-plain">Summoner spell {id ?? ""}</span>;
  return (
    <div className="tt tt-game tt-summoner">
      <GameHead icon={spell.icon} name={spell.name} sub="Summoner spell" />
      <StatRows rows={[!!spell.cooldown && ["Cooldown", `${spell.cooldown}s`], !!spell.range && ["Range", spell.range]]} />
      {spell.description ? <p className="tt-game-body">{spell.description}</p> : <span className="dim">{tx("No description available.")}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ augments

export function AugmentTooltip({ augment, name, children }: { augment?: Augment; name?: string; children?: ReactNode }) {
  const aug = augment ?? (name ? findAugment(name) : undefined);
  const title = aug?.name ?? name ?? "Augment";
  const rarity: AugmentRarity | undefined = aug?.rarity;
  return (
    <div className="tt tt-game tt-augment">
      <div className="tt-head">
        <strong>{title}</strong>
        {rarity && <span className={`tt-aug-rar rar-text-${rarity}`}>{RARITY_LABEL[rarity]}</span>}
      </div>
      {aug?.desc ? <p className="tt-game-body">{aug.desc}</p> : <span className="dim">{tx("No description available.")}</span>}
      {children}
    </div>
  );
}

/** Wraps an augment chip with its description card. */
export function AugmentTip({ name, children, block, className }: { name: string; children: ReactNode; block?: boolean; className?: string }) {
  return (
    <Tip content={<AugmentTooltip name={name} />} block={block} className={className}>
      {children}
    </Tip>
  );
}
