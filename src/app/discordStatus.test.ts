import { describe, expect, it } from "vitest";
import { discordActivity } from "./discordStatus";

describe("Discord status text", () => {
  it("in game: champion, mode and elapsed time", () => {
    const a = discordActivity({ mode: "live", gameMode: "mayhem", baseChampion: { name: "Ahri" } as never, game: { gameTime: 125, me: { championName: "Ahri" } } as never }, 1_000_000_000);
    expect(a).toEqual({ details: "Playing Ahri", state: "ARAM: Mayhem · with Nexis", start: 1_000_000 - 125 });
  });
  it("champ select, and nothing otherwise", () => {
    expect(discordActivity({ mode: "champselect", gameMode: "sr", game: null } as never)?.details).toBe("In champ select");
    expect(discordActivity({ mode: "explore", gameMode: "sr", game: null } as never)).toBeNull();
    expect(discordActivity({ mode: "demo", gameMode: "sr", game: {} } as never)).toBeNull();
  });
});
