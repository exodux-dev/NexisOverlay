import { describe, expect, it } from "vitest";
import { autoImportDue } from "./store";

describe("auto-import in champ select", () => {
  it("writes once per champion, not on every poll", () => {
    expect(autoImportDue(undefined, "Ahri")).toBe(true);
    expect(autoImportDue("Ahri", "Ahri")).toBe(false);
    expect(autoImportDue(undefined, undefined)).toBe(false);
  });

  it("re-imports after swapping back to a champion (only one Nexis page exists)", () => {
    // Ahri → Lux (Lux page replaces Ahri's) → Ahri again must write Ahri's page again.
    let last: string | undefined;
    const seq = ["Ahri", "Ahri", "Lux", "Lux", "Ahri"];
    const writes: string[] = [];
    for (const id of seq) if (autoImportDue(last, id)) writes.push((last = id));
    expect(writes).toEqual(["Ahri", "Lux", "Ahri"]);
  });
});
