// Home: "Patch changes for you" — this patch vs the previous one (Data Dragon) for your favorite
// champions (base stats, ability cooldowns / costs) and the items you build most.
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/store";
import { fetchJson } from "../bridge";
import { diffChampion, diffItem, previousVersion, type DDChampionDetailLite, type DDItemLite, type DigestEntry } from "../engine/patchDigest";
import { DD } from "../engine/staticData";
import type { StaticData } from "../engine/types";
import { Card } from "../ui/controls";
import { GameIcon } from "../ui/GameIcon";
import { displayPatch } from "../ui/format";

type State = { status: "loading" } | { status: "ok"; prev: string; entries: DigestEntry[] } | { status: "none" };

const fmt = (x: number) => (Number.isInteger(x) ? x.toLocaleString("en-US") : String(x));

export function PatchDigest({ data }: { data: StaticData }) {
  const favorites = useApp((s) => s.settings.favorites);
  const last = useApp((s) => s.settings.lastChampion);
  const history = useApp((s) => s.history);
  const champs = useMemo(() => (favorites.length ? favorites : last ? [last] : []).slice(0, 6), [favorites, last]);
  const items = useMemo(() => {
    const count = new Map<number, number>();
    for (const m of history.slice(-30)) for (const id of m.items) if ((data.items.get(id)?.cost ?? 0) >= 1600) count.set(id, (count.get(id) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => String(id));
  }, [history, data]);
  const [st, setSt] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!champs.length && !items.length) return setSt({ status: "none" });
    let alive = true;
    void (async () => {
      try {
        const versions = await fetchJson<string[]>(`${DD}/api/versions.json`, "versions.json", 6);
        const prev = previousVersion(versions, data.version);
        if (!prev) return alive && setSt({ status: "none" });
        const detail = (v: string, id: string) =>
          fetchJson<{ data: Record<string, DDChampionDetailLite> }>(`${DD}/cdn/${v}/data/en_US/champion/${id}.json`, `champ-${v}-${id}.json`, 24 * 30).then((j) => j.data[id]);
        const champEntries = await Promise.all(
          champs.map(async (id) => {
            try {
              const [a, b] = await Promise.all([detail(prev, id), detail(data.version, id)]);
              return a && b ? diffChampion(a, b) : undefined;
            } catch {
              return undefined;
            }
          }),
        );
        let itemEntries: DigestEntry[] = [];
        if (items.length) {
          const [pi, ci] = await Promise.all([
            fetchJson<{ data: Record<string, DDItemLite> }>(`${DD}/cdn/${prev}/data/en_US/item.json`, `item-${prev}.json`, 24 * 30),
            fetchJson<{ data: Record<string, DDItemLite> }>(`${DD}/cdn/${data.version}/data/en_US/item.json`, `item-${data.version}.json`, 24 * 30),
          ]);
          itemEntries = items.filter((id) => pi.data[id] && ci.data[id]).map((id) => diffItem(id, pi.data[id], ci.data[id]));
        }
        const entries = [...champEntries, ...itemEntries].filter((e): e is DigestEntry => !!e && e.changes.length > 0);
        if (alive) setSt({ status: "ok", prev, entries });
      } catch {
        if (alive) setSt({ status: "none" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [champs, items, data.version]);

  if (st.status === "none") return null;
  return (
    <Card title="Patch changes for you" icon="refresh" className="home-digest" extra={st.status === "ok" ? <span className="home-sub">{displayPatch(data.version)} vs {displayPatch(st.prev)}</span> : undefined}>
      {st.status === "loading" ? (
        <span className="dim small">Comparing with the last patch…</span>
      ) : !st.entries.length ? (
        <span className="dim small">No changes to your favorites or the items you build this patch.</span>
      ) : (
        <ul className="digest-list">
          {st.entries.map((e) => {
            const icon = e.kind === "champion" ? data.championsById.get(e.id)?.icon : data.items.get(Number(e.id))?.icon;
            return (
              <li key={`${e.kind}-${e.id}`} className="digest-entry">
                <GameIcon src={icon} name={e.name} size={30} round={e.kind === "champion"} />
                <span className="digest-body">
                  <strong>{e.name}</strong>
                  <span className="digest-changes">
                    {e.changes.map((c) => (
                      <span key={c.label} className={`digest-chip ${c.buff ? "is-buff" : "is-nerf"}`}>
                        {c.label} {fmt(c.from)} → {fmt(c.to)}
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
