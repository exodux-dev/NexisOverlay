import { describe, expect, it } from "vitest";
import {
  championExperience,
  loadProfile,
  opggRegionFromPlatform,
  parseProfileDescription,
  parseProfileHtml,
  parseProfileJson,
  profileJsonUrl,
  profileUrl,
  rankLabel,
  scoutTags,
  summarizeProfile,
  type PlayerProfile,
  type RecentGame,
} from "./opggProfile";

// SYNTHETIC fixture shaped like OP.GG's real `ai.json` (made-up player, made-up numbers).
const NOW = Date.parse("2026-11-19T12:00:00+09:00");
const day = (d: number, h = 0) => new Date(NOW - d * 86_400_000 - h * 3_600_000).toISOString();

type G = Partial<RecentGame> & { r: "WIN" | "LOSE"; c: string; k: number; d: number; a: number };
function game({ r, c, k, d, a, ...rest }: G, i: number) {
  return {
    id: `m_${i}`,
    playedAt: day(1, i),
    queueType: rest.queue ?? "SOLORANKED",
    queueName: "Ranked Solo/Duo",
    result: r,
    champion: c,
    championKey: c.toLowerCase(),
    position: rest.position ?? "MID",
    role: "MAGE",
    kills: k,
    deaths: d,
    assists: a,
    kda: `${((k + a) / Math.max(1, d)).toFixed(2)}:1`,
    cs: 180,
    opScore: rest.opScore ?? 6,
    opScoreRank: 4,
    arenaPlacement: null,
  };
}

function aiJson(games: G[], over: Record<string, unknown> = {}) {
  return {
    summary: "Test Player#EUW is a League of Legends summoner…",
    context: { source: "OP.GG", region: "euw", queueType: "TOTAL", canonicalUrl: "https://op.gg/lol/summoners/euw/Test%20Player-EUW" },
    identity: { puuid: "x", gameName: "Test Player", tagline: "EUW", riotId: "Test Player#EUW", level: 312, profileImageUrl: "https://example/p.jpg" },
    freshness: { summonerUpdatedAt: day(0), latestGamePlayedAt: day(1) },
    rank: {
      ladderRank: 12345,
      ladderTopRatio: 1.2,
      entries: [
        { queueType: "FLEXRANKED", tier: "gold 3", division: 3, lp: 40, wins: 20, losses: 22, winRate: 48 },
        { queueType: "SOLORANKED", tier: "diamond 2", division: 2, lp: 75, wins: 120, losses: 100, winRate: 55 },
      ],
    },
    recentChampionsSource: "most-champion-stats",
    recentChampions: [
      { name: "Ahri", key: "ahri", wins: 40, losses: 30, winRate: 57 },
      { name: "Syndra", key: "syndra", wins: 20, losses: 20, winRate: 50 },
      { name: "Orianna", key: "orianna", wins: 10, losses: 12, winRate: 45 },
    ],
    recentGames: games.map(game),
    ...over,
  };
}

const MIXED: G[] = [
  { r: "WIN", c: "Ahri", k: 8, d: 2, a: 7 },
  { r: "LOSE", c: "Syndra", k: 3, d: 5, a: 4 },
  { r: "WIN", c: "Ahri", k: 10, d: 3, a: 5 },
  { r: "WIN", c: "Orianna", k: 4, d: 2, a: 12 },
  { r: "LOSE", c: "Ahri", k: 2, d: 6, a: 3 },
  { r: "WIN", c: "Syndra", k: 7, d: 4, a: 6 },
  { r: "LOSE", c: "Viktor", k: 5, d: 5, a: 5 },
  { r: "WIN", c: "Ahri", k: 9, d: 1, a: 8 },
  { r: "LOSE", c: "Azir", k: 3, d: 4, a: 4 },
  { r: "WIN", c: "Ahri", k: 6, d: 3, a: 9 },
];

function profile(games: G[], over: Record<string, unknown> = {}): PlayerProfile {
  const p = parseProfileJson(aiJson(games, over));
  if (!p) throw new Error("fixture failed to parse");
  return p;
}
const labels = (p: PlayerProfile, champ?: { id: string; name: string }, queue?: string, position?: string) =>
  scoutTags(p, champ, queue, { now: NOW, position }).map((t) => t.label);

describe("region mapping", () => {
  it("maps Riot platform ids and region names", () => {
    expect(opggRegionFromPlatform("NA1")).toBe("na");
    expect(opggRegionFromPlatform("EUW1")).toBe("euw");
    expect(opggRegionFromPlatform("EUN1")).toBe("eune");
    expect(opggRegionFromPlatform("OC1")).toBe("oce");
    expect(opggRegionFromPlatform("KR")).toBe("kr");
    expect(opggRegionFromPlatform("JP1")).toBe("jp");
    expect(opggRegionFromPlatform("BR1")).toBe("br");
    expect(opggRegionFromPlatform("LA1")).toBe("lan");
    expect(opggRegionFromPlatform("LA2")).toBe("las");
    expect(opggRegionFromPlatform("RU")).toBe("ru");
    expect(opggRegionFromPlatform("TR1")).toBe("tr");
    expect(opggRegionFromPlatform("ME1")).toBe("me");
    expect(opggRegionFromPlatform("SG2")).toBe("sea");
    expect(opggRegionFromPlatform("PH2")).toBe("sea");
    expect(opggRegionFromPlatform("TH2")).toBe("sea");
    expect(opggRegionFromPlatform("TW2")).toBe("tw");
    expect(opggRegionFromPlatform("VN2")).toBe("vn");
    expect(opggRegionFromPlatform("euw")).toBe("euw");
    expect(opggRegionFromPlatform("NA")).toBe("na");
    expect(opggRegionFromPlatform("eune")).toBe("eune");
    expect(opggRegionFromPlatform("PBE1")).toBeUndefined();
    expect(opggRegionFromPlatform("")).toBeUndefined();
  });
});

describe("URLs", () => {
  it("encodes spaces as %20 and keeps the tag after a dash", () => {
    expect(profileUrl("Some Name#EUW", "EUW1")).toBe("https://op.gg/lol/summoners/euw/Some%20Name-EUW");
    expect(profileJsonUrl("Some Name#EUW", "euw")).toBe("https://op.gg/lol/summoners/euw/Some%20Name-EUW/ai.json");
  });
  it("percent-encodes unicode names and tags", () => {
    expect(profileUrl("페이커#KR1", "KR")).toBe("https://op.gg/lol/summoners/kr/%ED%8E%98%EC%9D%B4%EC%BB%A4-KR1");
    expect(profileUrl("Zoë Fan#ÜBER", "EUN1")).toBe("https://op.gg/lol/summoners/eune/Zo%C3%AB%20Fan-%C3%9CBER");
  });
  it("encodes reserved characters in the name", () => {
    expect(profileJsonUrl("a/b?c#NA1", "NA1")).toBe("https://op.gg/lol/summoners/na/a%2Fb%3Fc-NA1/ai.json");
  });
});

describe("parseProfileJson", () => {
  it("reads identity, ranks, champions and games", () => {
    const p = profile(MIXED);
    expect(p.riotId).toBe("Test Player#EUW");
    expect(p.level).toBe(312);
    expect(p.region).toBe("euw");
    expect(p.ranks).toHaveLength(2);
    // Solo/Duo wins over Flex even when listed second; "diamond 2" tier string is normalised.
    expect(p.rank).toMatchObject({ queue: "SOLORANKED", tier: "Diamond", division: 2, lp: 75, wins: 120, losses: 100, winRate: 55 });
    expect(p.ranks[0]).toMatchObject({ tier: "Gold", division: 3 });
    expect(p.topChampions[0]).toEqual({ name: "Ahri", key: "ahri", wins: 40, losses: 30, winRate: 57 });
    expect(p.recent).toHaveLength(10);
    expect(p.recent[0]).toMatchObject({ result: "WIN", champion: "Ahri", kills: 8, deaths: 2, assists: 7, position: "MID", queue: "SOLORANKED" });
    expect(p.source).toBe("json");
  });
  it("drops division for apex tiers", () => {
    const p = profile(MIXED, { rank: { entries: [{ queueType: "SOLORANKED", tier: "master", division: 1, lp: 831, wins: 10, losses: 5, winRate: 67 }] } });
    expect(p.rank?.division).toBeUndefined();
    expect(rankLabel(p.rank)).toBe("Master · 831 LP");
  });
  it("is defensive about junk", () => {
    expect(parseProfileJson(undefined)).toBeUndefined();
    expect(parseProfileJson("not json")).toBeUndefined();
    expect(parseProfileJson({ error: "summoner_ai_snapshot_not_found" })).toBeUndefined();
    expect(parseProfileJson({ identity: {} })).toBeUndefined();
    const p = parseProfileJson({ identity: { gameName: "A", tagline: "B" }, rank: { entries: [{ tier: "wood" }, null] }, recentGames: [{ champion: "Ahri" }, 3] });
    expect(p).toMatchObject({ riotId: "A#B", ranks: [], recent: [], topChampions: [] });
    expect(p?.rank).toBeUndefined();
  });
  it("accepts a JSON string and sorts games newest first", () => {
    const raw = aiJson(MIXED);
    raw.recentGames.reverse();
    const p = parseProfileJson(JSON.stringify(raw))!;
    expect(p.recent[0].champion).toBe("Ahri");
    expect(p.recent[0].kills).toBe(8);
  });
});

describe("HTML fallback", () => {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "ProfilePage", "@id": "https://op.gg/x#profile-page", dateModified: "2026-11-19T10:00:00+09:00" },
      { "@type": "Person", "@id": "https://op.gg/x#summoner", name: "Test Player#EUW", image: "https://example/p.jpg" },
      {
        "@type": "ItemList",
        "@id": "https://op.gg/x#recent-games",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            item: {
              "@type": "PlayGameAction",
              name: "Ahri WIN - Ranked Solo/Duo",
              startTime: "2026-11-18T10:00:00+09:00",
              additionalProperty: [
                ["queueType", "SOLORANKED"],
                ["champion", "Ahri"],
                ["result", "WIN"],
                ["kills", 7],
                ["deaths", 4],
                ["assists", 6],
                ["opScore", 6.9],
              ].map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
            },
          },
        ],
      },
    ],
  };
  const html = `<html><head><meta name="description" content="Test Player#EUW / Diamond 2 1,075 LP / 120Win 100Lose Win rate 55% / Ahri - 40Win 30Lose Win rate 57%, Nunu &amp; Willump - 3Win 1Lose Win rate 75%"/>
    <script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;

  it("reads rank, champions and recent games", () => {
    const p = parseProfileHtml(html)!;
    expect(p.source).toBe("html");
    expect(p.riotId).toBe("Test Player#EUW");
    expect(p.rank).toMatchObject({ tier: "Diamond", division: 2, lp: 1075, wins: 120, losses: 100, winRate: 55 });
    expect(p.topChampions.map((c) => c.name)).toEqual(["Ahri", "Nunu & Willump"]);
    expect(p.recent[0]).toMatchObject({ champion: "Ahri", result: "WIN", kills: 7, deaths: 4, assists: 6, opScore: 6.9, queueName: "Ranked Solo/Duo" });
    expect(p.updatedAt).toBe("2026-11-19T10:00:00+09:00");
  });
  it("understands unranked descriptions", () => {
    expect(parseProfileDescription("Someone#NA1 / Lv. 521")).toEqual({ riotId: "Someone#NA1", level: 521, rank: undefined, topChampions: [] });
    expect(parseProfileHtml("<html>404</html>")).toBeUndefined();
  });
  it("loadProfile falls back to HTML when ai.json fails", async () => {
    const urls: string[] = [];
    const p = await loadProfile("Test Player#EUW", "EUW1", async (u) => {
      urls.push(u);
      if (u.endsWith("/ai.json")) throw new Error("404");
      return html;
    });
    expect(urls).toEqual(["https://op.gg/lol/summoners/euw/Test%20Player-EUW/ai.json", "https://op.gg/lol/summoners/euw/Test%20Player-EUW"]);
    expect(p?.source).toBe("html");
    const j = await loadProfile("Test Player#EUW", "euw", async () => JSON.stringify(aiJson(MIXED)));
    expect(j?.source).toBe("json");
  });
});

describe("summary", () => {
  it("summarises rank, form and averages", () => {
    const s = summarizeProfile(profile(MIXED), { id: "Ahri", name: "Ahri" });
    expect(s.rank).toBe("Diamond II · 75 LP");
    expect(s.tier).toBe("diamond");
    expect(s.seasonRecord).toBe("120W 100L");
    expect(s.recentRecord).toBe("6W 4L");
    expect(s.form.slice(0, 3)).toEqual(["WIN", "LOSE", "WIN"]);
    expect(s.avg).toEqual({ kills: 5.7, deaths: 3.5, assists: 6.3, kda: 3.4 });
    expect(s.mainRole).toBe("MID");
    expect(s.champion).toMatchObject({ games: 70, winRate: 57, source: "season", recentGames: 5, topIndex: 0 });
  });
  it("uses recent games for champions outside the most-played list", () => {
    const e = championExperience(profile(MIXED), { id: "Viktor", name: "Viktor" });
    expect(e).toMatchObject({ games: 1, wins: 0, losses: 1, source: "recent" });
    expect(rankLabel(undefined)).toBe("Unranked");
  });
});

describe("scoutTags", () => {
  it("flags heavy deaths and loss streaks", () => {
    const g: G[] = Array.from({ length: 10 }, (_, i) => ({ r: i < 4 ? "LOSE" : i % 2 ? "WIN" : "LOSE", c: "Ahri", k: 3, d: 9, a: 4 }));
    const tags = scoutTags(profile(g), undefined, "SOLORANKED", { now: NOW });
    expect(tags[0]).toMatchObject({ label: "Dies a lot", tone: "bad" });
    expect(tags.find((t) => t.label === "Loss streak")?.detail).toBe("Lost their last 5 games.");
    expect(tags.find((t) => t.label === "Dies a lot")?.detail).toMatch(/9 deaths per game/);
  });
  it("treats ARAM deaths on an ARAM scale", () => {
    const g: G[] = Array.from({ length: 10 }, (_, i) => ({ r: i % 2 ? "WIN" : "LOSE", c: `C${i}`, k: 8, d: 9, a: 20, queue: "ARAM" }));
    expect(labels(profile(g), undefined, "ARAM")).not.toContain("Dies a lot");
    expect(labels(profile(g), undefined, "ARAM")).toContain("Dies often");
  });
  it("hot streak and one-trick on their champion", () => {
    const g: G[] = Array.from({ length: 10 }, (_, i) => ({ r: i < 5 ? "WIN" : "LOSE", c: i < 7 ? "Ahri" : "Syndra", k: 6, d: 4, a: 6 }));
    const tags = scoutTags(profile(g), { id: "Ahri", name: "Ahri" }, "SOLORANKED", { now: NOW });
    expect(tags.map((t) => t.label)).toEqual(expect.arrayContaining(["Hot streak", "One-trick"]));
    expect(tags.find((t) => t.label === "One-trick")).toMatchObject({ tone: "warn", detail: "Ahri in 7 of their last 10 games." });
    expect(labels(profile(g), { id: "Zed", name: "Zed" })).toContain("One-trick Ahri");
  });
  it("first time / new on the champion", () => {
    expect(labels(profile(MIXED), { id: "Zed", name: "Zed" }, "SOLORANKED")).toContain("First time on Zed?");
    expect(labels(profile(MIXED), { id: "Viktor", name: "Viktor" }, "SOLORANKED")).toContain("New to Viktor");
    expect(labels(profile(MIXED), { id: "Syndra", name: "Syndra" }, "SOLORANKED")).toContain("Syndra main");
    const strong = profile(MIXED, { recentChampions: [{ name: "Syndra", key: "syndra", wins: 30, losses: 10, winRate: 75 }] });
    expect(labels(strong, { id: "Syndra", name: "Syndra" }, "SOLORANKED")).toContain("Strong Syndra");
    const t = scoutTags(profile(MIXED), { id: "Zed", name: "Zed" }, "ARAM", { now: NOW }).find((x) => x.label.startsWith("First time"));
    expect(t?.tone).toBe("info");
  });
  it("off-role, inactivity and OP score", () => {
    const p = profile(
      MIXED.map((g) => ({ ...g, opScore: 7.6 })),
      { freshness: { latestGamePlayedAt: day(45) } },
    );
    const l = labels(p, undefined, undefined, "SUPPORT");
    expect(l).toEqual(expect.arrayContaining(["Off-role", "Inactive", "High OP Score"]));
    expect(labels(p, undefined, undefined, "MID")).not.toContain("Off-role");
  });
  it("smurf-ish and new account", () => {
    const p = profile(MIXED, {
      identity: { riotId: "Fresh#NEW", level: 24 },
      rank: { entries: [{ queueType: "SOLORANKED", tier: "platinum 1", division: 1, lp: 50, wins: 30, losses: 8, winRate: 79 }] },
    });
    expect(labels(p)).toEqual(expect.arrayContaining(["Smurf?", "New account"]));
  });
  it("returns nothing alarming for an empty profile", () => {
    const p = profile([], { freshness: {}, rank: { entries: [] }, recentChampions: [] });
    expect(labels(p, { id: "Ahri", name: "Ahri" })).toEqual(["No recent games"]);
  });
});
