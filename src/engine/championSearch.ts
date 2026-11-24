// Champion search that guesses what you meant: common short names ("mf", "j4", "asol", "tk"),
// prefixes ("yas", "tahm", "shyv"), any word of the name ("kench", "fortune"), initials, letters in
// order ("jhn" → Jhin) and small typos ("yasou", "kaisa").
import { norm } from "./text";

/** Edit distance where swapping two neighbouring letters ("yasou") counts as one typo. */
export function typoDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Community short names → Data Dragon id. Prefixes of the real name don't need an entry. */
export const CHAMPION_ALIASES: Record<string, string> = {
  mf: "MissFortune", tf: "TwistedFate", j4: "JarvanIV", jarvan: "JarvanIV", asol: "AurelionSol", aurelion: "AurelionSol",
  kog: "KogMaw", cass: "Cassiopeia", heimer: "Heimerdinger", donger: "Heimerdinger", voli: "Volibear", mundo: "DrMundo",
  yi: "MasterYi", lee: "LeeSin", fiddle: "Fiddlesticks", noc: "Nocturne", kass: "Kassadin", vlad: "Vladimir",
  trist: "Tristana", ez: "Ezreal", cait: "Caitlyn", blitz: "Blitzcrank", morg: "Morgana", naut: "Nautilus",
  malz: "Malzahar", kha: "Khazix", k6: "Khazix", rek: "RekSai", ww: "Warwick", gp: "Gangplank", sej: "Sejuani",
  liss: "Lissandra", ori: "Orianna", tk: "TahmKench", xin: "XinZhao", wu: "MonkeyKing", wukong: "MonkeyKing",
  ali: "Alistar", raka: "Soraka", lb: "Leblanc", vel: "Velkoz", velkoz: "Velkoz", cho: "Chogath", kat: "Katarina",
  kennen: "Kennen", ksante: "KSante", bel: "Belveth", belveth: "Belveth", nid: "Nidalee", rene: "Renekton",
  aurora: "Aurora", hwei: "Hwei", smolder: "Smolder", ambessa: "Ambessa", mel: "Mel", yunara: "Yunara",
  kaisa: "Kaisa", "kai'sa": "Kaisa", nunu: "Nunu", glasc: "Renata", renata: "Renata", sett: "Sett",
  shaco: "Shaco", tahm: "TahmKench", ks: "KSante", drmundo: "DrMundo", dr: "DrMundo", reksai: "RekSai",
  kogmaw: "KogMaw", chogath: "Chogath", missfortune: "MissFortune", twisted: "TwistedFate", xinzhao: "XinZhao",
};

export interface SearchableChampion {
  id: string;
  name: string;
}

/** 0 = no match; higher = better. */
export function championMatchScore(query: string, c: SearchableChampion): number {
  const q = norm(query);
  if (!q) return 0;
  const name = norm(c.name);
  const id = norm(c.id);
  const alias = CHAMPION_ALIASES[q];
  if (alias && norm(alias) === id) return 100;
  if (name === q || id === q) return 98;
  if (name.startsWith(q) || id.startsWith(q)) return 90 - Math.min(10, name.length - q.length) * 0.5;
  const words = c.name.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean).map(norm);
  if (words.some((w) => w.startsWith(q))) return 80;
  const initials = words.map((w) => w[0]).join("");
  if (q.length >= 2 && initials.length >= 2 && initials.startsWith(q)) return 76;
  if (name.includes(q)) return 62;
  if (q.length >= 3) {
    // Every letter typed, in order, starting with the same letter ("jhn" → Jhin, "mrdkaiser").
    if (q[0] === name[0]) {
      let i = 0;
      for (const ch of name) if (ch === q[i]) i++;
      if (i === q.length) return 56 - Math.min(10, name.length - q.length);
    }
    // Typos (4+ letters: shorter queries are too short to tell a typo from another name).
    if (q.length < 4) return 0;
    const head = typoDistance(q, name.slice(0, q.length));
    if (head <= (q.length >= 6 ? 2 : 1)) return 44 - head * 4;
    const full = typoDistance(q, name);
    if (full <= Math.max(1, Math.floor(name.length / 4))) return 40 - full * 3;
  }
  return 0;
}

/** Champions matching `query`, best first (ties by name). */
export function searchChampions<T extends SearchableChampion>(query: string, champions: T[], limit = 8): T[] {
  return champions
    .map((c) => ({ c, s: championMatchScore(query, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}
