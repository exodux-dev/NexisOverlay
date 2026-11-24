// Duo partners (OP.GG synergies): Arena — your 2v2 partner; Summoner's Rift — your bot-lane partner
// (ADC ↔ support). Shows your current partner's numbers when known, and the best partners.
import { useEffect, useState } from "react";
import { useApp, type Derived } from "../app/store";
import * as bridge from "../bridge";
import { OPGG_SITE, opggPosition, opggSlug, parseOpggSynergies, type OpggSynergy } from "../engine/sources/opgg";
import { Card } from "../ui/controls";
import { GameIcon } from "../ui/GameIcon";

type Load = OpggSynergy[] | "loading" | "error";

export function DuoCard({ d }: { d: Derived }) {
  const webOn = useApp((s) => s.settings.webStats);
  const data = useApp((s) => s.data);
  const cs = useApp((s) => s.champSelect);
  const champ = d.baseChampion;
  const pos = opggPosition(d.position);
  const arena = d.gameMode === "arena";
  const srLane: string[] | undefined = d.gameMode !== "sr" ? undefined : pos === "adc" ? ["support"] : pos === "support" ? ["bottom", "adc"] : undefined;
  const applies = !!champ && webOn && (arena || !!srLane);
  const [rows, setRows] = useState<Load>("loading");

  useEffect(() => {
    if (!applies || !champ) return;
    let alive = true;
    setRows("loading");
    const url = arena ? `${OPGG_SITE}/lol/modes/arena/${opggSlug(champ.id)}/synergies` : `${OPGG_SITE}/lol/champions/${opggSlug(champ.id)}/synergies`;
    void bridge
      .fetchText(url, `opgg-syn-${d.gameMode}-${champ.id.toLowerCase()}.html`, 6)
      .then((html) => {
        const r = parseOpggSynergies(html);
        const list = arena ? r.all : (srLane ?? []).map((l) => r[l]).find((x) => x?.length);
        if (alive) setRows(list ?? []);
      })
      .catch(() => alive && setRows("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applies, champ?.id, d.gameMode, pos]);

  if (!applies || !champ || rows === "error" || (Array.isArray(rows) && !rows.length)) return null;

  // Your current partner: Arena teammate, or your bot-lane partner on the Rift.
  const game = d.game;
  const partnerLane = pos === "adc" ? "UTILITY" : "BOTTOM";
  const partner =
    (arena ? game?.allies[0]?.champion : game?.allies.find((p) => (p.position ?? "").toUpperCase() === partnerLane)?.champion) ??
    (cs && arena ? cs.team.find((c) => c.id !== cs.me?.id) : undefined);
  const list = Array.isArray(rows) ? rows : [];
  const mine = partner ? list.find((r) => r.championKey === partner.id) : undefined;
  const minGames = arena ? 150 : 500;
  const best = list.filter((r) => r.games >= minGames).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
  const metric = arena ? "win" : "WR";
  const fmt = (r: OpggSynergy) =>
    `${(r.winRate * 100).toFixed(1)}% ${metric}${r.avgPlace !== undefined ? ` · avg place ${r.avgPlace.toFixed(2)}` : ""} · ${r.games.toLocaleString("en-US")} games`;

  return (
    <Card title="Duo partners" icon="user" className="duo-card" extra={<span className="dim small">OP.GG {arena ? "Arena" : "bot lane"}</span>}>
      {rows === "loading" ? (
        <span className="dim small">Loading partners…</span>
      ) : (
        <>
          {partner && (
            <div className={`duo-now ${mine ? "" : "duo-none"}`}>
              <GameIcon src={partner.icon} name={partner.name} size={30} round />
              <span>
                <strong>
                  {champ.name} + {partner.name}
                </strong>
                <span className="dim small">{mine ? fmt(mine) : "Not enough games together for numbers"}</span>
              </span>
            </div>
          )}
          <ul className="duo-list">
            {best.map((r) => {
              const c = data?.championsById.get(r.championKey);
              return (
                <li key={r.championKey} className={partner?.id === r.championKey ? "duo-is-partner" : ""}>
                  <GameIcon src={c?.icon} name={c?.name ?? r.championKey} size={24} round />
                  <span className="duo-name">{c?.name ?? r.championKey}</span>
                  <span className="duo-wr">{(r.winRate * 100).toFixed(1)}%</span>
                  <span className="dim small">{r.games.toLocaleString("en-US")}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
