import type { ChampionStats, Rune, StaticData, WinStat } from "../engine/types";
import { choiceIndex, resolveRuneChoice, runeKey, runeOptions, spellKey, spellOptions, winRateOf, type BuildChoice } from "../engine/options";
import { GameIcon } from "./GameIcon";
import { RuneTooltip, SHARDS, ShardTooltip, SummonerTooltip, shardIcon } from "./GameTips";
import { pct } from "./format";
import { OptionsHelp } from "./OptionsHelp";
import { Tip } from "./Tip";
import "./runes-spells.css";

export const gamesText = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString("en-US");
export const wrTone = (wr: number) => (wr >= 0.52 ? "rs-good" : wr < 0.48 ? "rs-bad" : "");

function Rates({ stat, label = "WR" }: { stat: WinStat; label?: string }) {
  const wr = winRateOf(stat);
  return (
    <div className="rs-rates">
      <span className={`rs-wr ${wrTone(wr)}`}>
        <b>{pct(wr, 1)}</b> {label}
      </span>
      <span className="rs-pr">
        {stat.pickRate !== undefined ? `${pct(stat.pickRate, 1)} pick · ` : ""}
        {gamesText(stat.games)} games
      </span>
    </div>
  );
}

/** Rune tree name → accent key (Precision gold, Domination red, Sorcery violet, Resolve green, Inspiration teal). */
const treeKey = (name?: string) => (name ?? "").toLowerCase().replace(/[^a-z]/g, "") || undefined;

function RuneLine({ id, r }: { id: number; r?: Rune }) {
  return (
    <Tip content={<RuneTooltip rune={r} id={id} />}>
      <div className="rs-line gt-focus" tabIndex={0}>
        <span className="rs-rune">
          <GameIcon src={r?.icon} name={r?.name ?? String(id)} size={28} round />
        </span>
        <span className="rs-line-name">{r?.name ?? `Rune ${id}`}</span>
      </div>
    </Tip>
  );
}

/**
 * Rune pages (a list when the source has several) and summoner spell pairs. The picked page / pair
 * is stored per champion + mode (`choice`); the picked page is what "Import to League" writes.
 */
export function RunesSpells({
  stats,
  data,
  choice,
  onChoose,
}: {
  stats?: ChampionStats;
  data: StaticData;
  choice?: BuildChoice;
  onChoose?: (patch: Partial<BuildChoice>) => void;
}) {
  const pages = runeOptions(stats);
  const pairs = spellOptions(stats);
  const pagePick = resolveRuneChoice(pages.map(runeKey), choice?.rune);
  const pageIdx = pagePick >= 0 ? pagePick : pages.length ? 0 : -1;
  const pairIdx = choiceIndex(pairs.map(spellKey), choice?.spells);
  const page = pages[pageIdx];
  if (!page && !pairs.length) return null;
  const wrLabel = stats?.mode === "arena" ? "Top 4" : "WR";

  const rune = (id: number) => data.runes.get(id);
  // `perks` = keystone + 3 primary-tree runes, then the 2 secondary-tree runes.
  const perks = page?.perks ?? [];
  const keystone = perks[0];
  const primaryRunes = perks.slice(1, 4);
  const secondaryRunes = perks.slice(4, 6);
  const shards = page?.shards ?? [];
  const canPick = !!onChoose;

  return (
    <section className="rs-card" aria-label="Runes and summoner spells">
      {page && (
        <div className="rs-block">
          <div className="rs-head">
            <h3 className="rs-title">
              Runes
              {pages.length > 1 && <OptionsHelp top4={stats?.mode === "arena"} note="Rune pages are listed most played first; the first page is the default." />}
            </h3>
            {stats?.runesSource === "opgg" && (
              <span className="rs-source" title="HexMayhem publishes no runes: these rune pages are OP.GG's ARAM: Mayhem stats">
                Runes: OP.GG
              </span>
            )}
            {pages.length > 1 && <span className="rs-hint">{canPick ? "Click a page to pick" : `${pages.length} pages`}</span>}
          </div>
          {pages.length > 1 ? (
            <ul className="rs-pages" role="radiogroup" aria-label="Rune pages">
              {pages.map((p, i) => {
                const ks = rune(p.perks[0]);
                const on = i === pageIdx;
                const pick = () => onChoose?.({ rune: i === 0 ? undefined : runeKey(p) });
                return (
                  <li
                    key={runeKey(p)}
                    role="radio"
                    aria-checked={on}
                    tabIndex={canPick ? 0 : undefined}
                    className={`rs-page-row ${on ? "is-on" : ""} ${canPick ? "rs-pickable" : ""}`}
                    onClick={canPick ? pick : undefined}
                    onKeyDown={(e) => {
                      if (canPick && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        pick();
                      }
                    }}
                    title={`${ks?.name ?? "Keystone"} + ${rune(p.sub)?.name ?? "secondary"}${p.shards?.length ? ` (${p.shards.map((id) => SHARDS[id]?.name ?? id).join(", ")})` : ""}`}
                    data-testid={`rune-tab-${i}`}
                  >
                    <span className="rs-page-icons">
                      <GameIcon src={ks?.icon} name={ks?.name ?? `Rune ${p.perks[0]}`} size={30} round />
                      <GameIcon className="rs-page-sub" src={rune(p.sub)?.icon} name={rune(p.sub)?.name ?? "Secondary"} size={16} round />
                    </span>
                    <span className="rs-page-text">
                      <span className="rs-page-name">{ks?.name ?? `Page ${i + 1}`}</span>
                      <span className="rs-page-trees">
                        {rune(p.primary)?.name ?? "Primary"} + {rune(p.sub)?.name ?? "Secondary"}
                      </span>
                    </span>
                    <Rates stat={p} label={wrLabel} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rs-single">
              <Rates stat={page} label={wrLabel} />
            </div>
          )}
          <div className="rs-sheet" role={pages.length > 1 ? "group" : undefined} aria-label="Selected rune page">
            <div className="rs-col" data-tree={treeKey(rune(page.primary)?.name)}>
              <Tip content={<RuneTooltip rune={rune(page.primary)} id={page.primary} />}>
                <div className="rs-col-head gt-focus" tabIndex={0}>
                  <GameIcon src={rune(page.primary)?.icon} name={rune(page.primary)?.name ?? "Primary"} size={20} round />
                  <span>{rune(page.primary)?.name ?? "Primary"}</span>
                </div>
              </Tip>
              <Tip content={<RuneTooltip rune={rune(keystone)} id={keystone} />}>
                <div className="rs-line rs-line-key gt-focus" tabIndex={0}>
                  <span className="rs-keystone">
                    <GameIcon src={rune(keystone)?.icon} name={rune(keystone)?.name ?? `Rune ${keystone}`} size={40} round />
                  </span>
                  <span className="rs-line-name">{rune(keystone)?.name ?? "Keystone"}</span>
                </div>
              </Tip>
              {primaryRunes.map((id) => (
                <RuneLine key={id} id={id} r={rune(id)} />
              ))}
            </div>
            <div className="rs-col rs-col-sub" data-tree={treeKey(rune(page.sub)?.name)}>
              <Tip content={<RuneTooltip rune={rune(page.sub)} id={page.sub} />}>
                <div className="rs-col-head gt-focus" tabIndex={0}>
                  <GameIcon src={rune(page.sub)?.icon} name={rune(page.sub)?.name ?? "Secondary"} size={20} round />
                  <span>{rune(page.sub)?.name ?? "Secondary"}</span>
                </div>
              </Tip>
              {secondaryRunes.map((id) => (
                <RuneLine key={id} id={id} r={rune(id)} />
              ))}
              {shards.length > 0 && (
                <div className="rs-shards" aria-label="Stat shards">
                  {shards.map((id, i) => (
                    <Tip key={`${id}-${i}`} content={<ShardTooltip id={id} />}>
                      <span className="rs-shard gt-focus" tabIndex={0}>
                        <GameIcon src={shardIcon(id)} name={SHARDS[id]?.name ?? String(id)} size={18} round />
                        <span>{SHARDS[id]?.name ?? id}</span>
                      </span>
                    </Tip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {pairs.length > 0 && (
        <div className="rs-block">
          <div className="rs-head">
            <h3 className="rs-title">
              Summoner spells
              {pairs.length > 1 && <OptionsHelp top4={stats?.mode === "arena"} note="Spell pairs are listed most played first; the first pair is the default." />}
            </h3>
            {pairs.length > 1 && <span className="rs-hint">{canPick ? "Click to pick" : `${pairs.length} options`}</span>}
          </div>
          <ul className="rs-spells" role={pairs.length > 1 ? "radiogroup" : undefined} aria-label="Summoner spells">
            {pairs.map((s, i) => {
              const pair = s.ids.map((id) => data.spells.get(id));
              const on = pairs.length > 1 && i === pairIdx;
              const pick = () => onChoose?.({ spells: i === 0 ? undefined : spellKey(s) });
              return (
                <li
                  key={s.ids.join("-")}
                  className={`rs-spell-row ${pairs.length > 1 ? "rs-pickable" : ""} ${on ? "is-on" : ""}`}
                  role={pairs.length > 1 ? "radio" : undefined}
                  aria-checked={pairs.length > 1 ? on : undefined}
                  tabIndex={pairs.length > 1 && canPick ? 0 : undefined}
                  onClick={pairs.length > 1 ? pick : undefined}
                  onKeyDown={(e) => {
                    if (pairs.length > 1 && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      pick();
                    }
                  }}
                  data-testid={`spell-row-${i}`}
                >
                  <span className="rs-spell-icons">
                    {pair.map((sp, k) => (
                      <Tip key={k} content={<SummonerTooltip spell={sp} id={s.ids[k]} />}>
                        <span className="rs-spell gt-focus" tabIndex={pairs.length > 1 ? undefined : 0}>
                          <GameIcon src={sp?.icon} name={sp?.name ?? `Spell ${s.ids[k]}`} size={28} />
                        </span>
                      </Tip>
                    ))}
                  </span>
                  <span className="rs-spell-names">{pair.map((sp, k) => sp?.name ?? `#${s.ids[k]}`).join(" + ")}</span>
                  <Rates stat={s} label={wrLabel} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
