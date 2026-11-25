// Champion guide: skill order, matchup coach, mechanics, combos and how-to-play notes.
// A pre-fight reference only — Nexis never prompts ability usage in real time (Riot third-party policy).

import { t as tx } from "../i18n";
import { Fragment, useState, type CSSProperties } from "react";
import { actions, useApp, useChampionSpells, useDerived, type Derived } from "../app/store";
import { ChampionPicker } from "../ui/ChampionPicker";
import type { ChampionGuide, CoachAdvice, SkillKey } from "../engine/guide";
import type { Archetype, ChampionSpell } from "../engine/types";
import { Card, Empty, Pill, Segmented, type Tone } from "../ui/controls";
import { ARCHETYPE_LABEL, gold } from "../ui/format";
import { GameIcon } from "../ui/GameIcon";
import { Icon } from "../ui/icons";
import { AbilityTip } from "../ui/GameTips";
import { ArenaPlacement } from "../ui/arenaText";
import { STACK_PLANS } from "../data/stackGoals";
import { APHELIOS_INFO, STANDARD_BURNS, pairNote, simulateBurns } from "../data/aphelios";
import type { ApheliosWeapon } from "../engine/live";
import type { GameModeKind } from "../engine/mode";
import "./guide.css";

// ------------------------------------------------------------------ guide helpers

type FightKind = keyof NonNullable<ChampionGuide["fights"]>;
type MechSection = NonNullable<ChampionGuide["mechanics"]>[number];
const FIGHTS: Array<{ id: FightKind; label: string }> = [
  { id: "teamfight", label: "Teamfight" },
  { id: "poke", label: "Poke" },
  { id: "dive", label: "Dive" },
  { id: "skirmish", label: "Skirmish" },
];

/** "A → B → C" (also tolerates "->"). */
const splitKeys = (keys: string) =>
  keys
    .split(/\s*(?:→|->)\s*/)
    .map((k) => k.trim())
    .filter(Boolean);

/** Sentence-split a short paragraph into scannable lines. */
const sentences = (t: string) =>
  t
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter(Boolean);

// ------------------------------------------------------------------ generic archetype tips

const ARCHETYPE_TIPS: Record<Archetype, string[]> = {
  mage_burst: [
    "Hold your full combo for a priority target — burst is wasted on the frontline.",
    "ARAM is a narrow lane: land your longest-range spell first, then commit.",
    "Mana and cooldowns are your health bar; back off between rotations instead of trading autos.",
  ],
  mage_poke: [
    "Win the fight before it starts — chip HP from max range while the enemy walks up.",
    "Stand behind your frontline and never be the closest champion to the enemy team.",
    "Health relics swing poke wars; deny the enemy's by zoning with your spells.",
  ],
  mage_dps: [
    "You scale with fight length — stay alive in the middle of the brawl rather than all-in early.",
    "Position on the flank so your area damage hits multiple targets at once.",
    "Build at least one defensive item: your damage only counts while you're standing.",
  ],
  ap_assassin: [
    "Wait for the key crowd control to be used before diving the backline.",
    "Target the squishiest carry — enchanters and marksmen die to a single rotation.",
    "Plan the exit before you jump in; ARAM gives very little room to escape.",
  ],
  ap_bruiser: [
    "Engage when your sustain and damage-over-time can outlast their burst.",
    "Stick to the closest high-value target instead of chasing deep into their team.",
    "Your survivability ramps with items — play patient early, dominant late.",
  ],
  ap_onhit: [
    "Auto-attacks are your damage: stay in range of a target and keep attacking.",
    "Kite backwards while hitting divers — on-hit rewards uptime over burst.",
    "Pick fights after the enemy's engage cooldowns are down.",
  ],
  adc_crit: [
    "Hit the closest safe target — damage on the frontline still wins fights.",
    "Stay at max range and let your frontline absorb the first wave of crowd control.",
    "Your power spikes on each crit item; avoid coin-flip fights before them.",
  ],
  adc_onhit: [
    "Keep attacking whatever is in range — on-hit damage shreds tanks over time.",
    "Kite back while auto-attacking divers instead of running away.",
    "Peel for yourself with positioning; you have no burst to save you.",
  ],
  adc_caster: [
    "Weave spells between auto-attacks for maximum damage on every rotation.",
    "Poke with abilities in the downtime, then commit with your full kit.",
    "Spells give you range — use it to deal damage without stepping forward.",
  ],
  ad_assassin: [
    "Look for picks on isolated targets coming back from the fountain.",
    "Wait for the enemy's peel and crowd control before going in.",
    "Lethality falls off against tanks — end fights by deleting a carry.",
  ],
  bruiser: [
    "You're a front-to-back fighter: engage the closest target and keep sustaining.",
    "Don't go in first against heavy crowd control — follow your tank's engage.",
    "Healing reduction from the enemy is your biggest weakness — respect it.",
  ],
  tank: [
    "Start the fights: your engage creates the space your carries need.",
    "Peel for your backline when divers jump in — that matters more than chasing.",
    "Absorb the enemy's skillshots and crowd control so your carries don't have to.",
  ],
  enchanter: [
    "Your shields and heals win fights — stay close to your highest-damage ally.",
    "Hold crowd control for divers rather than using it to start fights.",
    "Ability haste and heal/shield power multiply your impact; avoid all-damage builds.",
  ],
};

// ------------------------------------------------------------------ Aphelios weapons

const WEAPONS = [
  { name: "Calibrum", kind: "Rifle", color: "#4ade80", light: "#15803d", role: "Long-range marks — poke and finish from afar." },
  { name: "Severum", kind: "Scythe pistol", color: "#f87171", light: "#b91c1c", role: "Lifesteal and rapid fire — survive dives." },
  { name: "Gravitum", kind: "Cannon", color: "#a78bfa", light: "#6d28d9", role: "Slows, then roots everything it marked." },
  { name: "Infernum", kind: "Flamethrower", color: "#60a5fa", light: "#1d4ed8", role: "Cone splash — your teamfight AoE." },
  { name: "Crescendum", kind: "Chakram", color: "#e5e7eb", light: "#475569", role: "Sentry turret and point-blank DPS." },
] as const;
type Weapon = (typeof WEAPONS)[number];

const WEAPON_RE = new RegExp(`\\b(${WEAPONS.map((w) => w.name).join("|")})\\b`, "g");
const weaponNamed = (name: string) => WEAPONS.find((w) => name.startsWith(w.name));

function weaponStyle(w: Weapon): CSSProperties {
  return { "--w": w.color, "--w-light": w.light } as CSSProperties;
}

/** Color Aphelios weapon names inside free text. */
function Rich({ text, weapons }: { text: string; weapons: boolean }) {
  if (!weapons) return <>{text}</>;
  return (
    <>
      {text.split(WEAPON_RE).map((p, i) => {
        const w = WEAPONS.find((x) => x.name === p);
        return w ? (
          <span key={i} className="gd-wname" style={weaponStyle(w)}>
            {p}
          </span>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </>
  );
}

/** The five weapons in rotation order, using the knowledge-base descriptions when present. */
function WeaponWheel({ section }: { section?: MechSection }) {
  return (
    <div className="gd-weapons">
      <div className="gd-wstrip">
        {WEAPONS.map((w, i) => {
          const kb = section?.items.find((it) => it.name.startsWith(w.name));
          return (
            <Fragment key={w.name}>
              {i > 0 && <Icon name="chevron" size={14} className="gd-warrow" />}
              <div className="gd-weapon" style={weaponStyle(w)}>
                <div className="gd-whead">
                  <span className="gd-wdot" />
                  <div className="gd-wtext">
                    <span className="gd-wtitle">{w.name}</span>
                    <span className="gd-wkind">{w.kind}</span>
                  </div>
                  <span className="gd-wnum">{i + 1}</span>
                </div>
                <p className="gd-wrole">{kb?.text ?? w.role}</p>
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="gd-wloop">
        <Icon name="swap" size={12} />
        Rotation loops back to Calibrum — the emptied main-hand goes to the back of the queue.
      </div>
    </div>
  );
}

function Pairings({ section }: { section: MechSection }) {
  return (
    <div className="gd-pairs">
      <div className="gd-sec-title">{section.title}</div>
      <ul>
        {section.items.map((it) => {
          const [pairs, ...rest] = it.text.split(/\s+-\s+/);
          return (
            <li key={it.name}>
              <span className="gd-pair-label">{it.name}</span>
              <span className="gd-pair-body">
                <span className="gd-pair-chips">
                  <Rich text={pairs} weapons />
                </span>
                {rest.length > 0 && <span className="gd-pair-text">{rest.join(" - ")}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ skill order

const KEYS: SkillKey[] = ["Q", "W", "E", "R"];
const SOURCE: Record<"stats" | "curated" | "generic", { label: string; tone: Tone; title: string }> = {
  stats: { label: "Data", tone: "teal", title: "Most common order in aggregated match data" },
  curated: { label: "Curated", tone: "gold", title: "Hand-curated order for this champion / build style" },
  generic: { label: "Generic", tone: "muted", title: "No curated order yet — a safe default" },
};

function SpellIcon({ spell, k, size = 40, rank }: { spell?: ChampionSpell; k: string; size?: number; rank?: number }) {
  return (
    <AbilityTip spell={spell} rank={rank}>
      <span className={`gd-spell ${k === "R" ? "gd-spell-r" : ""}`} tabIndex={spell ? 0 : undefined}>
        <GameIcon src={spell?.icon} name={spell?.name ?? k} size={size} />
        <span className="gd-spell-key">{k}</span>
      </span>
    </AbilityTip>
  );
}

function SkillOrder({ d, spells }: { d: Derived; spells: ChampionSpell[] }) {
  const plan = d.skillPlan;
  if (!plan) return null;
  const byKey = new Map(spells.map((s) => [s.key, s]));
  const src = SOURCE[plan.source];
  const live = d.mode === "live" || d.mode === "demo";
  const level = live ? d.game?.me.level ?? 0 : 0;
  const rankOf = (k: string) => (live ? d.game?.skills?.[k as SkillKey] : undefined);
  return (
    <Card
      title="Skill order"
      icon="spark"
      className="gd-skills"
      extra={
        <Pill tone={src.tone} title={src.title} dot>
          {src.label}
        </Pill>
      }
    >
      <div className="gd-skill-top">
        <div className="gd-abilities">
          {(["P", "Q", "W", "E", "R"] as const).map((k) => {
            const s = byKey.get(k);
            return (
              <div key={k} className="gd-ability">
                <SpellIcon spell={s} k={k} size={42} rank={k === "P" ? undefined : rankOf(k)} />
                <span className="gd-ability-name" title={s?.name}>
                  {s?.name ?? (k === "P" ? "Passive" : "—")}
                </span>
              </div>
            );
          })}
        </div>
        <div className="gd-max">
          <span className="eyebrow">{tx("Max order")}</span>
          <div className="gd-max-row">
            {plan.max.map((k, i) => (
              <Fragment key={k}>
                {i > 0 && <Icon name="chevron" size={14} className="gd-max-arrow" />}
                <span className={`gd-max-chip ${i === 0 ? "first" : ""}`}>
                  <SpellIcon spell={byKey.get(k)} k={k} size={30} rank={rankOf(k)} />
                  <span className="gd-max-key">{k}</span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="gd-grid-wrap">
        <div className="gd-grid" role="table" aria-label="Ability level order">
          <div className="gd-row gd-row-head" role="row">
            <span className="gd-rowlabel" />
            {d.levelOrder.map((_, i) => (
              <span key={i} role="columnheader" className={`gd-lvl ${level === i + 1 ? "gd-now" : ""}`}>
                {i + 1}
              </span>
            ))}
          </div>
          {KEYS.map((k) => (
            <div key={k} className={`gd-row gd-row-${k}`} role="row">
              <AbilityTip spell={byKey.get(k)} rank={rankOf(k)} className="gd-rowlabel-tip">
                <span className="gd-rowlabel gt-focus" role="rowheader" tabIndex={byKey.get(k) ? 0 : undefined}>
                  <GameIcon src={byKey.get(k)?.icon} name={byKey.get(k)?.name ?? k} size={22} />
                  <b>{k}</b>
                </span>
              </AbilityTip>
              {d.levelOrder.map((pick, i) => {
                const on = pick === k;
                const cell = (
                  <span
                    key={i}
                    role="cell"
                    className={`gd-cell ${on ? "on" : ""} ${on && k === "R" ? "ult" : ""} ${level === i + 1 ? "gd-now" : ""} ${level && i + 1 < level ? "past" : ""}`}
                  >
                    {on ? k : ""}
                  </span>
                );
                // Level-up cells show the ability card too (rank = how many points it has by that level).
                const spell = on ? byKey.get(k) : undefined;
                if (!spell) return cell;
                const rankAt = d.levelOrder.slice(0, i + 1).filter((p) => p === k).length;
                return (
                  <AbilityTip key={i} spell={spell} rank={rankAt} className="gd-cell-tip">
                    {cell}
                  </AbilityTip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="gd-skill-note">
        <Icon name="info" size={13} />
        <span>
          {plan.note?.replace(/\b(\d{4,})(?= games)/g, (n) => gold(Number(n))) ?? `Max ${plan.max.join(" → ")} · ultimate at 6, 11 and 16.`}
          {level > 0 && <span className="gd-now-note"> · You are level {level}</span>}
        </span>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ matchup coach

const TONE_ICON: Record<CoachAdvice["tone"], "check" | "info" | "warning"> = { good: "check", info: "info", warn: "warning" };

function SwitchBtn({ d, a }: { d: Derived; a: CoachAdvice }) {
  if (!a.variantId || !d.baseChampion) return null;
  const target = d.variants.find((v) => v.id === a.variantId);
  if (!target) return null;
  if (d.variant?.id === a.variantId)
    return (
      <span className="gd-current">
        <Icon name="check" size={13} strokeWidth={3} /> Current build style
      </span>
    );
  return (
    <button type="button" className="btn btn-sm btn-primary" onClick={() => void actions.setBuildStyle(d.baseChampion!.id, a.variantId!)}>
      <Icon name="swap" size={13} />
      Switch to {target.label}
    </button>
  );
}

function KaynForms({ d, a }: { d: Derived; a: CoachAdvice }) {
  const forms = [
    { id: "red", name: "Rhaast", sub: "Darkin · drain tank", cls: "red", vs: "Charges vs melee" },
    { id: "blue", name: "Shadow Assassin", sub: "Backline assassin", cls: "blue", vs: "Charges vs ranged" },
  ];
  return (
    <div className="gd-kayn">
      {forms.map((f, i) => {
        const rec = a.variantId === f.id;
        return (
          <Fragment key={f.id}>
            {i === 1 && <span className="gd-kayn-vs">VS</span>}
            <div className={`gd-kayn-form gd-kayn-${f.cls} ${rec ? "rec" : ""}`}>
              <div className="gd-kayn-head">
                <span className="gd-kayn-orb" />
                <div>
                  <div className="gd-kayn-name">{f.name}</div>
                  <div className="gd-kayn-sub">
                    {f.sub} · {f.vs}
                  </div>
                </div>
                {rec && <span className="gd-kayn-badge">{tx("Recommended")}</span>}
              </div>
              {rec ? <p className="gd-kayn-text">{a.text}</p> : <p className="gd-kayn-text dim">{tx("Not favoured by this enemy team.")}</p>}
              {rec && <SwitchBtn d={d} a={a} />}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function Coach({ d }: { d: Derived }) {
  const enemies = d.game?.enemies.length ?? 0;
  const isKayn = d.baseChampion?.id === "Kayn";
  const kaynAdvice = isKayn ? d.advice.find((a) => a.variantId === "red" || a.variantId === "blue") : undefined;
  const rest = d.advice.filter((a) => a !== kaynAdvice);
  return (
    <Card title="Matchup coach" icon="shield" extra={<span className="dim small">{enemies ? `vs ${enemies} enemies` : "Add enemies to get matchup advice"}</span>}>
      {!d.advice.length ? (
        <div className="gd-calm">
          <Icon name="check" size={14} />
          {enemies ? "Nothing in their composition changes your plan — play the standard game below." : "Pick the enemy team on the Build tab to see matchup-specific advice."}
        </div>
      ) : (
        <>
          {kaynAdvice && <KaynForms d={d} a={kaynAdvice} />}
          {rest.length > 0 && (
            <div className="gd-advice">
              {rest.map((a, i) => (
                <div key={i} className={`gd-adv gd-adv-${a.tone}`}>
                  <span className="gd-adv-icon">
                    <Icon name={TONE_ICON[a.tone]} size={15} />
                  </span>
                  <div className="gd-adv-body">
                    <div className="gd-adv-title">{a.title}</div>
                    <div className="gd-adv-text">
                      <Rich text={a.text} weapons={d.baseChampion?.id === "Aphelios"} />
                    </div>
                    <SwitchBtn d={d} a={a} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Aphelios burn order (reference)

function Gun({ w }: { w: ApheliosWeapon }) {
  return (
    <span className="gd-gun" style={{ color: APHELIOS_INFO[w].color }}>
      ● {w}
    </span>
  );
}

function ApheliosBurnOrder() {
  const steps = simulateBurns(STANDARD_BURNS);
  return (
    <Card title="Weapon burn order" icon="spark" extra={<span className="dim small">{tx("Standard opening rotation \u00b7 reference")}</span>}>
      <ol className="gd-burn">
        {steps.map((st, i) => (
          <li key={i} className="gd-burn-step">
            <div className="gd-burn-pair">
              <Gun w={st.main} /> <span className="dim">+</span> <Gun w={st.off} />
            </div>
            <div className="gd-burn-note">{st.note}</div>
            <div className="gd-burn-next small">
              {i < steps.length - 1 ? (
                <>
                  Burn <Gun w={st.burn} /> → <Gun w={st.queue[0]!} /> comes in
                </>
              ) : (
                <span className="dim">Then keep burning whichever gun the fight doesn't need; queue: {st.queue.join(" → ")}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="dim small no-margin">
        A gun that runs out goes to the back of the queue and the next one takes its place. The game shows your next gun under your ammo; the mini HUD shows your
        current main hand. Pairs that fight well: {pairNote("Crescendum", "Infernum").toLowerCase()} (Infernum + Crescendum).
      </p>
    </Card>
  );
}

// ------------------------------------------------------------------ stack goals (stacking champions)

const MODE_COL: Array<[GameModeKind, string]> = [
  ["sr", "Rift"],
  ["aram", "ARAM"],
  ["mayhem", "Mayhem"],
];

function StackGoals({ champ, mode }: { champ: string; mode: GameModeKind }) {
  const plan = STACK_PLANS[champ];
  if (!plan) return null;
  const cols = MODE_COL.filter(([m]) => plan.goals.some((g) => g.by[m] !== undefined));
  return (
    <Card title={`Stack goals · ${plan.name}`} icon="spark" extra={<span className="dim small">{tx("Rough pace to aim for")}</span>}>
      <table className="gd-stacks">
        <thead>
          <tr>
            <th>Stacks</th>
            <th>Unlocks</th>
            {cols.map(([m, label]) => (
              <th key={m} className={m === mode ? "is-cur" : ""}>
                By {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.goals.map((g) => (
            <tr key={g.stacks}>
              <td className="tnum gd-stack-n">{g.stacks}</td>
              <td>{g.unlock}</td>
              {cols.map(([m]) => (
                <td key={m} className={`tnum ${m === mode ? "is-cur" : ""}`}>
                  {g.by[m] !== undefined ? `~${g.by[m]}:00` : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim small no-margin">{plan.tip} The in-game HUD shows the next goal for the game time — League doesn't share your stack count with apps, so it's a pace, not a counter.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ mechanics, combos, how to play

/** Per-item accent for champions with two-sided systems (Kayn forms). */
function itemTone(champ: string, name: string): string {
  if (champ !== "Kayn") return "";
  if (/rhaast|\(red\)/i.test(name)) return "gd-mi-red";
  if (/shadow assassin|\(blue\)/i.test(name)) return "gd-mi-blue";
  return "";
}

function MechSectionView({ s, champ, weapons }: { s: MechSection; champ: string; weapons: boolean }) {
  return (
    <div className="gd-sec">
      <div className="gd-sec-title">{s.title}</div>
      <div className="gd-mech">
        {s.items.map((it) => (
          <div key={it.name} className={`gd-mech-item ${itemTone(champ, it.name)}`}>
            <div className="gd-mech-title">
              <Rich text={it.name} weapons={weapons} />
            </div>
            <p className="gd-mech-text">
              <Rich text={it.text} weapons={weapons} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mechanics({ g, champ }: { g: ChampionGuide; champ: string }) {
  const sections = g.mechanics ?? [];
  const aphelios = champ === "Aphelios";
  if (!sections.length && !aphelios) return null;
  const weaponSec = aphelios ? sections.find((s) => /^weapons/i.test(s.title)) : undefined;
  const pairSec = aphelios ? sections.find((s) => /pairing/i.test(s.title)) : undefined;
  const others = sections.filter((s) => s !== weaponSec && s !== pairSec);
  return (
    <Card title="Champion mechanics" icon="spark" className="gd-mech-card">
      {aphelios && <WeaponWheel section={weaponSec} />}
      {pairSec && <Pairings section={pairSec} />}
      {others.map((s) => (
        <MechSectionView key={s.title} s={s} champ={champ} weapons={aphelios} />
      ))}
    </Card>
  );
}

function KeyChip({ k, byKey, weapons }: { k: string; byKey: Map<string, ChampionSpell>; weapons: boolean }) {
  const spell = /^([QWER])(?![a-z])\s*(.*)$/.exec(k);
  if (spell) {
    const key = spell[1];
    const s = byKey.get(key);
    const chip = (
      <span className={`gd-key gd-key-spell ${key === "R" ? "gd-key-r" : ""}`}>
        <GameIcon src={s?.icon} name={s?.name ?? key} size={20} />
        <b>{key}</b>
        {spell[2] && (
          <span className="gd-key-extra">
            <Rich text={spell[2]} weapons={weapons} />
          </span>
        )}
      </span>
    );
    return (
      <AbilityTip spell={s}>
        {s ? (
          <span className="gt-focus" tabIndex={0}>
            {chip}
          </span>
        ) : (
          chip
        )}
      </AbilityTip>
    );
  }
  const w = weapons ? weaponNamed(k) : undefined;
  if (w)
    return (
      <span className="gd-key gd-key-weapon" style={weaponStyle(w)}>
        <span className="gd-wdot sm" />
        {k}
      </span>
    );
  if (/^\(.*\)$/.test(k)) return <span className="gd-key gd-key-note">{k.slice(1, -1)}</span>;
  return <span className={`gd-key ${/^(aa|auto)/i.test(k) ? "gd-key-aa" : ""}`}>{k}</span>;
}

function Combos({ g, spells, champ }: { g: ChampionGuide; spells: ChampionSpell[]; champ: string }) {
  if (!g.combos.length) return null;
  const byKey = new Map<string, ChampionSpell>(spells.map((s) => [s.key, s]));
  const weapons = champ === "Aphelios";
  return (
    <Card title="Combos" icon="play" extra={<span className="dim small">{tx("Pre-game reference")}</span>}>
      <ul className="gd-combos">
        {g.combos.map((c) => (
          <li key={c.name} className="gd-combo">
            <div className="gd-combo-name">{c.name}</div>
            <div className="gd-combo-keys">
              {splitKeys(c.keys).map((k, i) => (
                <span key={i} className="gd-step">
                  {i > 0 && <Icon name="chevron" size={12} className="gd-combo-arrow" />}
                  <KeyChip k={k} byKey={byKey} weapons={weapons} />
                </span>
              ))}
            </div>
            {c.when && <div className="gd-combo-when">{c.when}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type PlayTab = "overview" | FightKind;

function HowToPlay({ g, archetype, weapons }: { g?: ChampionGuide; archetype: Archetype; weapons: boolean }) {
  const fights = FIGHTS.filter((f) => g?.fights?.[f.id]);
  const [tab, setTab] = useState<PlayTab>("overview");
  const active: PlayTab = tab === "overview" || fights.some((f) => f.id === tab) ? tab : "overview";
  const generic = !g?.tips.length;
  const lines = active === "overview" ? (generic ? ARCHETYPE_TIPS[archetype] : g!.tips) : sentences(g?.fights?.[active] ?? "");
  return (
    <Card
      title="How to play"
      icon="info"
      className="gd-play"
      extra={
        fights.length > 0 && (
          <Segmented<PlayTab>
            size="sm"
            label="Situation"
            value={active}
            onChange={setTab}
            options={[{ value: "overview", label: "Overview" }, ...fights.map((f) => ({ value: f.id as PlayTab, label: f.label }))]}
          />
        )
      }
    >
      {active === "overview" && g?.summary && (
        <p className="gd-summary">
          <Rich text={g.summary} weapons={weapons} />
        </p>
      )}
      {active === "overview" && generic && <div className="eyebrow">{ARCHETYPE_LABEL[archetype]} fundamentals</div>}
      {active !== "overview" && <div className="eyebrow">{FIGHTS.find((f) => f.id === active)?.label} plan</div>}
      <ol className="gd-tips">
        {lines.map((t, i) => (
          <li key={i}>
            <span className="gd-tip-n">{i + 1}</span>
            <span>
              <Rich text={t} weapons={weapons} />
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ------------------------------------------------------------------ view

/** Champion picker for the guide (outside a game; in a game the guide follows your champion). */
function GuidePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const champions = useApp((s) => s.data?.champions ?? []);
  if (!open) return null;
  return (
    <ChampionPicker
      title="Show the guide for…"
      champions={champions}
      onPick={(c) => {
        actions.setExploreChampion(c.id);
        onClose();
      }}
      onClose={onClose}
    />
  );
}

function Hero({ d }: { d: Derived }) {
  const base = d.baseChampion!;
  const v = d.variant;
  const [picking, setPicking] = useState(false);
  return (
    <div className="gd-hero">
      {d.mode === "explore" && (
        <button type="button" className="btn btn-sm gd-hero-change" onClick={() => setPicking(true)} title="Show another champion's guide">
          Change champion
        </button>
      )}
      <GuidePicker open={picking} onClose={() => setPicking(false)} />
      <GameIcon src={base.icon} name={base.name} size={48} className="gd-hero-icon" />
      <div className="gd-hero-text">
        <span className="eyebrow">{tx("Champion guide")}</span>
        <div className="gd-hero-name">
          {base.name}
          <span className="gd-hero-arch">{ARCHETYPE_LABEL[(d.champion ?? base).archetype]}</span>
        </div>
        {d.gameMode === "arena" && <ArenaPlacement stats={d.championStats} className="gd-hero-arena small" />}
      </div>
      {v && d.variants.length > 1 && (
        <div className="gd-hero-style">
          <span className="eyebrow">{tx("Build style")}</span>
          <Segmented<string>
            size="sm"
            label="Build style"
            value={v.id}
            onChange={(id) => void actions.setBuildStyle(base.id, id)}
            options={d.variants.map((x) => ({ value: x.id, label: x.label, hint: x.blurb ?? ARCHETYPE_LABEL[x.archetype] }))}
          />
        </div>
      )}
    </div>
  );
}

export default function Guide() {
  const d = useDerived();
  const spells = useChampionSpells(d.baseChampion?.id);
  const base = d.baseChampion;
  const [picking, setPicking] = useState(false);

  if (!base) {
    return (
      <div className="view view-guide">
        <Card>
          <Empty
            title="Pick a champion to see a guide"
            icon="book"
            action={
              <>
                <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                  <Icon name="build" size={13} />
                  Choose a champion
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => actions.setDemo(true)}>
                  <Icon name="play" size={13} />
                  Try demo game
                </button>
              </>
            }
          >
            Skill order, combos and matchup tips for the champion you play.
          </Empty>
        </Card>
        <GuidePicker open={picking} onClose={() => setPicking(false)} />
      </div>
    );
  }

  const g = d.guide;
  const weapons = base.id === "Aphelios";
  const archetype = (d.champion ?? base).archetype;
  const showCoach = d.advice.length > 0 || (d.game?.enemies.length ?? 0) > 0;
  return (
    <div className="view view-guide">
      <Hero d={d} />
      <SkillOrder d={d} spells={spells} />
      {showCoach && <Coach d={d} />}
      <StackGoals champ={base.id} mode={d.gameMode} />
      {base.id === "Aphelios" && <ApheliosBurnOrder />}
      {g ? (
        <>
          <Mechanics g={g} champ={base.id} />
          <div className="gd-cols">
            <HowToPlay g={g} archetype={archetype} weapons={weapons} />
            <Combos g={g} spells={spells} champ={base.id} />
          </div>
        </>
      ) : (
        <>
          <div className="gd-nodata">
            <Icon name="info" size={14} />
            No detailed guide for {base.name} yet — showing {ARCHETYPE_LABEL[archetype].toLowerCase()} fundamentals.
          </div>
          <HowToPlay archetype={archetype} weapons={false} />
        </>
      )}
      <p className="gd-foot">
        <Icon name="shield" size={12} />
        Reference guide — Nexis never gives real-time in-fight prompts (Riot third-party policy).
      </p>
    </div>
  );
}
