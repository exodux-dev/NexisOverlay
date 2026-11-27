import { describe, expect, it } from "vitest";
import { liveStats } from "./liveStats";
import type { GameSnapshot, PlayerState } from "./types";

const p = (o: Partial<PlayerState>): PlayerState => ({ championName: "X", riotId: "x", team: "ORDER", level: 10, items: [], kills: 0, deaths: 0, assists: 0, isMe: false, ...o });
const game = (me: Partial<PlayerState>, allies: Partial<PlayerState>[], enemies: Partial<PlayerState>[], t = 600): GameSnapshot => ({
  source: "live",
  gameMode: "CLASSIC",
  gameTime: t,
  gold: 0,
  me: p({ ...me, isMe: true }),
  allies: allies.map((a) => p(a)),
  enemies: enemies.map((e) => p({ team: "CHAOS", ...e })),
});

describe("liveStats", () => {
  it("compares you with the other players' average", () => {
    const g = game({ kills: 4, assists: 2, deaths: 1, creepScore: 72, level: 11 }, [{ kills: 2, assists: 4, deaths: 3, creepScore: 40, level: 9 }], [{ kills: 3, assists: 0, deaths: 4, creepScore: 56, level: 10 }]);
    const rows = Object.fromEntries(liveStats(g).map((r) => [r.key, r]));
    expect(rows.csm).toMatchObject({ mineText: "7.2", avgText: "4.8", tone: "up" });
    expect(rows.kp.mineText).toBe("100%"); // 6 of the team's 6 kills
    expect(rows.kda.mineText).toBe("6.0");
    expect(rows.lvl).toMatchObject({ mineText: "11", avgText: "10", tone: "up" });
  });

  it("waits for minions before CS/min, skips KP before any kill, nothing on the loading screen", () => {
    const early = liveStats(game({ creepScore: 5 }, [{}], [{}], 60));
    expect(early.map((r) => r.key)).toEqual(["kda", "lvl"]);
    expect(liveStats({ ...game({}, [{}], [{}]), loading: true })).toEqual([]);
  });

  it("marks near-equal values as even", () => {
    const rows = liveStats(game({ level: 10, deaths: 1, kills: 1 }, [{ level: 10, deaths: 1, kills: 1 }], [{ level: 10, deaths: 1, kills: 1 }]));
    expect(rows.find((r) => r.key === "lvl")?.tone).toBe("even");
    expect(rows.find((r) => r.key === "kda")?.tone).toBe("even");
  });
});
