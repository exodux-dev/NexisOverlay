import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { gamePlan } from "./gamePlan";
import { findChampion } from "./staticData";
import { analyzeEnemies } from "./threat";
import type { PlayerState } from "./types";

const data = makeFixtureStaticData();
const c = (id: string) => findChampion(data, id)!;
const p = (id: string): PlayerState => ({ championName: id, champion: c(id), riotId: id, team: "CHAOS", level: 1, items: [], kills: 0, deaths: 0, assists: 0, isMe: false });

describe("loading-screen game plan", () => {
  const enemies = ["Zed", "Soraka", "Vladimir", "Aatrox", "Malphite"];
  const threat = analyzeEnemies(enemies.map(p));
  it("gives a win condition, the first spike and the top threat", () => {
    const plan = gamePlan({ allies: ["Ahri", "Jinx", "Leona", "Lux", "Darius"].map(c), enemies: enemies.map(c), threat, mode: "mayhem", firstItem: { name: "Luden's Echo", cost: 2750 } });
    expect(plan.map((x) => x.kind)).toEqual(["win", "spike", "watch"]);
    expect(plan[1].text).toBe("Luden's Echo (2,750g): fights get much easier once it's done.");
    expect(plan[2].text.length).toBeGreaterThan(20);
    expect(plan[2].text).not.toMatch(/\(.*\(|(\b\w+\b), \1\b/); // no "(item)" parts or repeated names
  });
  it("skips the comp point in Arena and without teams", () => {
    expect(gamePlan({ allies: [c("Ahri")], enemies: [c("Zed")], threat, mode: "arena" }).some((x) => x.kind === "win")).toBe(false);
    expect(gamePlan({ allies: [], enemies: [], threat: analyzeEnemies([]), mode: "sr" })).toEqual([]);
  });
});
