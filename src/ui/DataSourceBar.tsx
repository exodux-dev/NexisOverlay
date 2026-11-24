import { actions, useApp, type Derived } from "../app/store";
import { opggPosition } from "../engine/sources/opgg";
import { POSITION_LABEL } from "../engine/sources/tierlists";
import { DATA_SOURCE_LABEL, type DataSourceId } from "../engine/dataSource";
import { Pill, Segmented } from "./controls";

const HINT: Record<DataSourceId, string> = {
  auto: "Best available: your dataset → public stats → your games → baseline",
  riot: "Your own Riot API stats dataset (Settings → Stats URL)",
  hexmayhem: "Public ARAM: Mayhem stats from hexmayhem.com",
  opgg: "Public champion stats from op.gg",
  personal: "Only your own recorded games on this champion",
  baseline: "Nexis's template build, no stats",
};

const ACTIVE_LABEL: Record<string, string> = { riot: "My dataset", hexmayhem: "HexMayhem", opgg: "OP.GG", personal: "My games", none: "Baseline" };

function games(n: number) {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);
}

/** "Data source" picker: switches the whole recommendation (build, runes, skills, augments). */
export function DataSourceBar({ d }: { d: Derived }) {
  const s = d.source;
  if (!s) return null;
  const st = s.stats;
  const metric = d.gameMode === "arena" ? "top-4" : "WR";
  return (
    <div className="data-source-bar">
      {d.gameMode === "sr" && <RolePicker d={d} />}
      <span className="dim small">Data source</span>
      <Segmented<DataSourceId>
        size="sm"
        label="Data source"
        value={s.selected}
        onChange={(id) => void actions.setDataSource(d.gameMode, id)}
        options={s.available.map((id) => ({ value: id, label: DATA_SOURCE_LABEL[id], hint: HINT[id] }))}
      />
      <Pill tone={s.active === "none" ? "muted" : "teal"} dot title="Source driving the build, runes, skill order and augment ranking">
        Using {ACTIVE_LABEL[s.active]}
        {st && st.games > 0 ? ` · ${games(st.games)} games · ${((st.wins / st.games) * 100).toFixed(1)}% ${metric}` : ""}
      </Pill>
      {s.notice && (
        <Pill tone="gold" dot>
          {s.notice}
        </Pill>
      )}
    </div>
  );
}

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

/** Summoner's Rift: which role's build / runes / stats to show ("Auto" = champ select or main role). */
function RolePicker({ d }: { d: Derived }) {
  const picked = useApp((s) => s.settings.srRole);
  const auto = opggPosition(d.position);
  const value = (opggPosition(picked) ?? "") as "" | (typeof ROLES)[number];
  return (
    <>
      <span className="dim small">Role</span>
      <Segmented<"" | (typeof ROLES)[number]>
        size="sm"
        label="Role"
        value={value}
        onChange={(r) => void actions.setSrRole(r)}
        options={[
          { value: "", label: !value && auto ? `Auto · ${POSITION_LABEL[auto]}` : "Auto", hint: "Champ select's role, or the champion's main role" },
          ...ROLES.map((r) => ({ value: r, label: POSITION_LABEL[r], hint: `Show the ${POSITION_LABEL[r]} build, runes and stats` })),
        ]}
      />
    </>
  );
}
