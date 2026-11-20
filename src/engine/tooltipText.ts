// Turns Data Dragon rich text (ability tooltips, rune descriptions, summoner spells)
// into styled segments: tags such as <magicDamage> become a colour "kind", {{ }} and
// @…@ placeholders are resolved from the values Data Dragon publishes, and anything it
// leaves out renders as a tasteful "?" instead of raw template syntax.

export type SegKind =
  | "magic"
  | "physical"
  | "true"
  | "heal"
  | "shield"
  | "status"
  | "speed"
  | "key"
  | "scale"
  | "flavor"
  | "rules"
  | "unknown";

/** A run of text; `k` = styling kind. A segment with t === "\n" is a line break. */
export interface Seg {
  t: string;
  k?: SegKind;
}

/** Values a placeholder may resolve to: a display string, a number, or a per-rank list. */
export type PlaceholderValues = Record<string, string | number | ReadonlyArray<number> | undefined>;

const TAG_KIND: Record<string, SegKind> = {
  magicdamage: "magic",
  physicaldamage: "physical",
  truedamage: "true",
  healing: "heal",
  lifesteal: "heal",
  omnivamp: "heal",
  shield: "shield",
  status: "status",
  slow: "status",
  speed: "speed",
  attackspeed: "speed",
  keywordmajor: "key",
  keyword: "key",
  keywordname: "key",
  keywordstealth: "key",
  spellname: "key",
  "lol-uikit-tooltipped-keyword": "key",
  b: "key",
  attention: "key",
  gold: "key",
  statgood: "key",
  onhit: "key",
  recast: "key",
  spellpassive: "key",
  spellactive: "key",
  i: "flavor",
  flavortext: "flavor",
  rules: "rules",
  specialrules: "rules",
};
const isScaleTag = (tag: string) => tag.startsWith("scale");
/** Block-level tags that start a new line. */
const BLOCK = new Set(["li", "p", "maintext", "stats", "rules", "specialrules", "hr", "flavortext"]);

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

const fmtNum = (n: number) => {
  if (!Number.isFinite(n)) return "?";
  const r = Math.round(n * 100) / 100;
  return String(r);
};

/** "55/65/75" style list (collapsed to one value when every rank is the same). */
export function formatRanks(values: ReadonlyArray<number>): string {
  if (!values.length) return "?";
  const shown = values.map(fmtNum);
  return shown.every((v) => v === shown[0]) ? shown[0] : shown.join("/");
}

/**
 * Resolve one placeholder expression ("cost", "e2", "slowamount*100", "spell.briarp:x*100", "f1").
 * Returns undefined when Data Dragon does not publish the value.
 */
export function resolveExpression(expr: string, values: PlaceholderValues): string | undefined {
  const m = /^\s*([^*\s]+)\s*(?:\*\s*(-?[\d.]+))?\s*$/.exec(expr);
  if (!m) return undefined;
  const name = m[1].toLowerCase().replace(/^spell\.[^:]*:/, "");
  const mult = m[2] !== undefined ? Number(m[2]) : 1;
  // Own keys only: "{{ constructor }}" must not resolve to Object.prototype members.
  const v = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
  if (v === undefined || v === "") return undefined;
  if (typeof v === "string") {
    if (mult === 1) return v;
    // Per-rank burn strings ("10/20/30") can still be scaled.
    const parts = v.split("/").map(Number);
    return parts.every(Number.isFinite) ? formatRanks(parts.map((p) => p * mult)) : undefined;
  }
  if (typeof v === "number") return fmtNum(v * mult);
  if (!Array.isArray(v)) return undefined;
  return v.length ? formatRanks(v.map((x) => x * mult)) : undefined;
}

/** Placeholder-free text: substitutes {{ x }} / @x@ with resolved values or "?" (no styling). */
export function resolvePlaceholders(text: string, values: PlaceholderValues = {}): string {
  return segmentsToText(parseRichText(text, values));
}

/** Data Dragon rich text → styled segments (tags stripped, placeholders resolved). */
export function parseRichText(html: string, values: PlaceholderValues = {}): Seg[] {
  const out: Seg[] = [];
  const stack: SegKind[] = [];
  const push = (t: string, k?: SegKind) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.k === k && prev.t !== "\n" && t !== "\n") prev.t += t;
    else out.push(k ? { t, k } : { t });
  };
  const br = () => {
    const last = out[out.length - 1];
    // Allow at most one blank line in a row.
    if (!out.length) return;
    if (last.t === "\n" && out[out.length - 2]?.t === "\n") return;
    out.push({ t: "\n" });
  };
  /** Block boundary: a line break unless we're already at the start of a line. */
  const softBr = () => {
    if (out.length && out[out.length - 1].t !== "\n") out.push({ t: "\n" });
  };
  const current = () => stack[stack.length - 1];

  // Tokens: tags, {{ placeholders }}, @placeholders@, entities, plain text.
  const re = /<\s*(\/?)\s*([a-zA-Z][\w-]*)[^>]*?(\/?)\s*>|\{\{\s*([^}]*?)\s*\}\}|@([A-Za-z_][\w.:*-]*)@|(&[a-z#0-9]+;)|([^<{@&]+|[<{@&])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, closing, tagName, selfClose, ph, atPh, entity, text] = m;
    if (tagName) {
      const tag = tagName.toLowerCase();
      if (tag === "br") {
        br();
        continue;
      }
      if (tag === "hr") {
        softBr();
        continue;
      }
      if (BLOCK.has(tag)) softBr();
      const kind = TAG_KIND[tag] ?? (isScaleTag(tag) ? "scale" : undefined);
      if (selfClose) continue;
      if (closing) {
        if (kind || tag === "font" || tag === "span") stack.pop();
        if (BLOCK.has(tag)) softBr();
      } else if (kind) stack.push(kind);
      else if (tag === "font" || tag === "span") stack.push(current() as SegKind);
      continue;
    }
    if (ph !== undefined || atPh !== undefined) {
      const expr = (ph ?? atPh ?? "").trim();
      // Riot's own hooks for appended text (e.g. Arena/URF modifiers) render to nothing.
      if (/^spellmodifierdescriptionappend$/i.test(expr) || expr === "") continue;
      const v = resolveExpression(expr, values);
      if (v === undefined) push("?", "unknown");
      else push(v, current());
      continue;
    }
    if (entity) {
      push(ENTITIES[entity.toLowerCase()] ?? " ", current());
      continue;
    }
    if (text) push(text.replace(/[\r\n\t]+/g, " "), current());
  }
  return tidy(out);
}

/** Collapse whitespace, trim around line breaks, drop leading/trailing breaks. */
function tidy(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (s.t === "\n") {
      while (out.length && out[out.length - 1].t !== "\n" && !out[out.length - 1].t.trim()) out.pop();
      if (out.length && out[out.length - 1].t !== "\n") out[out.length - 1] = { ...out[out.length - 1], t: out[out.length - 1].t.trimEnd() };
      out.push(s);
      continue;
    }
    let t = s.t.replace(/ {2,}/g, " ");
    const prev = out[out.length - 1];
    if (!prev || prev.t === "\n") t = t.trimStart();
    else if (prev.t.endsWith(" ") && t.startsWith(" ")) t = t.slice(1);
    if (t) out.push({ ...s, t });
  }
  while (out.length && (out[0].t === "\n" || !out[0].t.trim())) out.shift();
  while (out.length && (out[out.length - 1].t === "\n" || !out[out.length - 1].t.trim())) out.pop();
  if (out.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, t: last.t.trimEnd() };
  }
  return out;
}

export function segmentsToText(segs: Seg[]): string {
  return segs.map((s) => s.t).join("");
}

/** Plain, tag-free text with resolved placeholders ("?" where unknown). */
export function cleanGameText(html: string, values: PlaceholderValues = {}): string {
  return segmentsToText(parseRichText(html, values));
}

export const countUnknown = (segs: Seg[]) => segs.filter((s) => s.k === "unknown").length;

// --------------------------------------------------------------- abilities

/** The bits of a Data Dragon champion spell the tooltip needs. */
export interface DDSpellLike {
  tooltip?: string;
  description?: string;
  cooldown?: number[];
  cooldownBurn?: string;
  cost?: number[];
  costBurn?: string;
  costType?: string;
  resource?: string;
  range?: number[];
  rangeBurn?: string;
  maxammo?: string;
  effectBurn?: Array<string | null>;
  datavalues?: Record<string, unknown>;
  vars?: Array<{ key: string; coeff: number | number[]; link?: string }>;
}

const VAR_LINK: Record<string, string> = {
  spelldamage: "% AP",
  attackdamage: "% AD",
  bonusattackdamage: "% bonus AD",
  armor: "% Armor",
  bonusarmor: "% bonus Armor",
  spellblock: "% MR",
  bonusspellblock: "% bonus MR",
  health: "% max Health",
  bonushealth: "% bonus Health",
  mana: "% max Mana",
};

/** Placeholder values Data Dragon publishes for one ability. */
export function abilityValues(sp: DDSpellLike, resourceName?: string): PlaceholderValues {
  const v: PlaceholderValues = {};
  if (sp.cost?.length) v.cost = sp.cost;
  else if (sp.costBurn) v.cost = sp.costBurn;
  if (sp.cooldown?.length) v.cooldown = sp.cooldown;
  else if (sp.cooldownBurn) v.cooldown = sp.cooldownBurn;
  if (sp.range?.length) v.range = sp.range;
  if (sp.maxammo && sp.maxammo !== "-1") v.maxammo = sp.maxammo;
  if (resourceName && resourceName !== "None") v.abilityresourcename = resourceName;
  sp.effectBurn?.forEach((e, i) => {
    if (i > 0 && e !== null && e !== undefined && e !== "") v[`e${i}`] = e;
  });
  for (const [k, val] of Object.entries(sp.datavalues ?? {})) {
    if (typeof val === "number" || typeof val === "string") v[k.toLowerCase()] = val;
    else if (Array.isArray(val) && val.every((x) => typeof x === "number")) v[k.toLowerCase()] = val as number[];
  }
  for (const vr of sp.vars ?? []) {
    const coeffs = Array.isArray(vr.coeff) ? vr.coeff : [vr.coeff];
    const label = vr.link ? VAR_LINK[vr.link.toLowerCase()] : undefined;
    v[vr.key.toLowerCase()] = label ? `${formatRanks(coeffs.map((c) => c * 100))}${label}` : formatRanks(coeffs);
  }
  return v;
}

/**
 * Ability cost line ("55/65/75 Mana", "No Cost", "?% of current Health").
 * Returns undefined when the ability is free.
 */
export function abilityCost(sp: DDSpellLike, resourceName?: string): string | undefined {
  const raw = (sp.resource ?? "").trim();
  const values = abilityValues(sp, resourceName);
  if (!raw) {
    const c = sp.costBurn && sp.costBurn !== "0" ? sp.costBurn : undefined;
    return c ? `${c}${resourceName && resourceName !== "None" ? ` ${resourceName}` : ""}` : undefined;
  }
  if (/^no cost$/i.test(raw) || /^passive$/i.test(raw)) return undefined;
  // "{{ cost }}" with an all-zero cost is free.
  if (/^\{\{\s*cost\s*\}\}(\s*\{\{\s*abilityresourcename\s*\}\})?$/i.test(raw) && (sp.cost ?? []).every((c) => c === 0) && (sp.cost?.length ?? 0) > 0)
    return undefined;
  const text = cleanGameText(raw, values).trim();
  return text || undefined;
}

/** "970" → "970", "25000" (global) → "Global", "self" → "Self". */
export function abilityRange(sp: DDSpellLike): string | undefined {
  const burn = sp.rangeBurn?.trim();
  if (!burn) return undefined;
  if (/^self$/i.test(burn)) return "Self";
  const parts = burn.split("/").map(Number);
  if (parts.every((p) => p >= 25000)) return "Global";
  if (parts.every((p) => p === 0)) return undefined;
  return burn;
}

/** Per-rank number list from a burn string ("9/8/7" → [9, 8, 7]). */
export function parseBurn(burn: string | undefined): number[] {
  if (!burn) return [];
  const parts = burn.split("/").map((p) => Number(p.trim()));
  return parts.every(Number.isFinite) ? parts : [];
}

/**
 * Which body text to show: the in-game tooltip when Data Dragon resolves every value in it,
 * otherwise the plain description (Data Dragon no longer publishes most tooltip numbers, and a
 * tooltip full of "?" reads worse than the prose description).
 */
export function abilityBody(sp: DDSpellLike, resourceName?: string): Seg[] {
  const values = abilityValues(sp, resourceName);
  if (sp.tooltip) {
    const tt = parseRichText(sp.tooltip, values);
    if (tt.length && countUnknown(tt) === 0) return tt;
  }
  if (sp.description) {
    const d = parseRichText(sp.description, values);
    if (d.length) return d;
  }
  return sp.tooltip ? parseRichText(sp.tooltip, values) : [];
}
