import { describe, expect, it } from "vitest";
import { makeFixtureStaticData } from "../dev/fixture";
import { searchChampions } from "./championSearch";

const champs = makeFixtureStaticData().champions;
const top = (q: string) => searchChampions(q, champs, 3).map((c) => c.id);

describe("champion search guesses what you meant", () => {
  it("prefixes", () => {
    expect(top("yas")[0]).toBe("Yasuo");
    expect(top("tahm")[0]).toBe("TahmKench");
    expect(top("shyv")[0]).toBe("Shyvana");
    expect(top("cait")[0]).toBe("Caitlyn");
  });
  it("short names and initials", () => {
    expect(top("mf")[0]).toBe("MissFortune");
    expect(top("tf")[0]).toBe("TwistedFate");
    expect(top("j4")[0]).toBe("JarvanIV");
    expect(top("asol")[0]).toBe("AurelionSol");
    expect(top("ww")[0]).toBe("Warwick");
    expect(top("yi")[0]).toBe("MasterYi");
  });
  it("any word of the name, punctuation-insensitive", () => {
    expect(top("kench")[0]).toBe("TahmKench");
    expect(top("fortune")[0]).toBe("MissFortune");
    expect(top("kaisa")[0]).toBe("Kaisa");
    expect(top("khazix")[0]).toBe("Khazix");
  });
  it("small typos and letters in order", () => {
    expect(top("yasou")[0]).toBe("Yasuo");
    expect(top("ezrael")[0]).toBe("Ezreal");
    expect(top("jhn")[0]).toBe("Jhin");
  });
  it("nothing for junk", () => {
    expect(top("zzzzzz")).toEqual([]);
    expect(top("")).toEqual([]);
  });
});
