import type { ChampionStats, StaticData, WinStat } from "../engine/types";
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

/**
 * Rune pages (tabs when the source has several) and summoner spell pairs. The picked page / pair
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
            <Rates stat={page} label={wrLabel} />
          </div>
          {pages.length > 1 && (
            <div className="rs-tabs" role="tablist" aria-label="Rune pages" style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }}>
              {pages.map((p, i) => {
                const wr = winRateOf(p);
                const ks = rune(p.perks[0]);
                return (
                  <button
                    key={runeKey(p)}
                    type="button"
                    role="tab"
                    aria-selected={i === pageIdx}
                    className={`rs-tab ${i === pageIdx ? "is-on" : ""}`}
                    disabled={!canPick}
                    onClick={() => onChoose?.({ rune: i === 0 ? undefined : runeKey(p) })}
                    title={`Rune page ${i + 1}: ${ks?.name ?? "Keystone"} + ${rune(p.sub)?.name ?? "secondary"}${p.shards?.length ? ` (${p.shards.map((id) => SHARDS[id]?.name ?? id).join(", ")})` : ""} · ${pct(wr, 1)} ${wrLabel} · ${gamesText(p.games)} games`}
                    data-testid={`rune-tab-${i}`}
                  >
                    <span className="rs-tab-icons">
                      <GameIcon src={ks?.icon} name={ks?.name ?? `Rune ${p.perks[0]}`} size={24} round />
                      <GameIcon className="rs-tab-sub" src={rune(p.sub)?.icon} name={rune(p.sub)?.name ?? "Secondary"} size={13} round />
                    </span>
                    <span className="rs-tab-text">
                      <span className="rs-tab-label">Page {i + 1}</span>
                      <span className={`rs-tab-wr ${wrTone(wr)}`}>{pct(wr, 1)}</span>
                      <span className="rs-tab-pr">{p.pickRate !== undefined ? `${pct(p.pickRate, p.pickRate < 0.1 ? 1 : 0)} pick` : `${gamesText(p.games)} games`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="rs-page" role={pages.length > 1 ? "tabpanel" : undefined}>
            <Tip content={<RuneTooltip rune={rune(keystone)} id={keystone} />}>
              <div className="rs-keystone gt-focus" tabIndex={0}>
                <GameIcon src={rune(keystone)?.icon} name={rune(keystone)?.name ?? `Rune ${keystone}`} size={52} round />
              </div>
            </Tip>
            <div className="rs-trees">
              <div className="rs-tree">
                <Tip content={<RuneTooltip rune={rune(page.primary)} id={page.primary} />}>
                  <GameIcon className="rs-style" src={rune(page.primary)?.icon} name={rune(page.primary)?.name ?? "Primary"} size={18} round />
                </Tip>
                {primaryRunes.map((id) => (
                  <Tip key={id} content={<RuneTooltip rune={rune(id)} id={id} />}>
                    <span className="rs-rune gt-focus" tabIndex={0}>
                      <GameIcon src={rune(id)?.icon} name={rune(id)?.name ?? String(id)} size={30} round />
                    </span>
                  </Tip>
                ))}
              </div>
              <div className="rs-tree rs-tree-sub">
                <Tip content={<RuneTooltip rune={rune(page.sub)} id={page.sub} />}>
                  <GameIcon className="rs-style" src={rune(page.sub)?.icon} name={rune(page.sub)?.name ?? "Secondary"} size={18} round />
                </Tip>
                {secondaryRunes.map((id) => (
                  <Tip key={id} content={<RuneTooltip rune={rune(id)} id={id} />}>
                    <span className="rs-rune gt-focus" tabIndex={0}>
                      <GameIcon src={rune(id)?.icon} name={rune(id)?.name ?? String(id)} size={26} round />
                    </span>
                  </Tip>
                ))}
                {shards.length > 0 && (
                  <span className="rs-shards">
                    {shards.map((id, i) => (
                      <Tip key={`${id}-${i}`} content={<ShardTooltip id={id} />}>
                        <span className="rs-shard gt-focus" tabIndex={0}>
                          <GameIcon src={shardIcon(id)} name={SHARDS[id]?.name ?? String(id)} size={16} round />
                        </span>
                      </Tip>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="rs-names">
            <b>{rune(keystone)?.name ?? "Keystone"}</b>
            {rune(page.primary) && rune(page.sub) && (
              <span>
                {rune(page.primary)!.name} + {rune(page.sub)!.name}
              </span>
            )}
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
