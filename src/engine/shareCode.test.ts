import { describe, expect, it } from "vitest";
import { decodeBuild, encodeBuild } from "./shareCode";

describe("share build code", () => {
  it("round-trips champion, mode, role, style and picks", () => {
    const b = { champion: "Ahri", mode: "sr" as const, position: "middle", style: "ap-burst", choice: { rune: "8112:8226", core: "3089,6655,3157", boots: "3020" } };
    const code = encodeBuild(b);
    expect(code).toMatch(/^NX1-[A-Za-z0-9_-]+$/);
    expect(decodeBuild(code)).toEqual(b);
    // Pasted with surrounding text / whitespace.
    expect(decodeBuild(`  my build: ${code}\n`)).toEqual(b);
  });
  it("drops legacy index picks and rejects junk", () => {
    const code = encodeBuild({ champion: "Jinx", mode: "aram", choice: { rune: 2, core: "3031,3094" } });
    expect(decodeBuild(code)).toEqual({ champion: "Jinx", mode: "aram", choice: { core: "3031,3094" } });
    expect(decodeBuild("hello")).toBeUndefined();
    expect(decodeBuild("NX1-!!!")).toBeUndefined();
    expect(decodeBuild("NX1-" + btoa(JSON.stringify({ c: "Ahri", m: "urf", o: {} })))).toBeUndefined();
    expect(decodeBuild("NX1-" + btoa(JSON.stringify({ c: "<script>", m: "sr", o: {} })))).toBeUndefined();
  });
});
