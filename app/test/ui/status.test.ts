import { describe, it, expect } from "vitest";
import { STATE_NAMES, STATUS_STYLES, stateName, statusStyle } from "../../src/components/status";

describe("status colour system", () => {
  it("maps each state to its colour", () => {
    expect(STATE_NAMES).toEqual(["Open", "Claimed", "Pending", "Disputed", "Paid", "Refunded"]);
    expect(STATUS_STYLES.Open.pill).toContain("bg-leaf");
    expect(STATUS_STYLES.Claimed.pill).toContain("bg-mustard");
    expect(STATUS_STYLES.Pending.pill).toContain("bg-orange");
    expect(STATUS_STYLES.Disputed.pill).toContain("bg-salmon");
    expect(STATUS_STYLES.Paid.pill).toContain("bg-deep");
    expect(STATUS_STYLES.Refunded.pill).toContain("bg-olive");
  });

  it("uses ink text on the light fills and paper on deep green", () => {
    for (const n of ["Open", "Claimed", "Pending", "Disputed", "Refunded"] as const) {
      expect(STATUS_STYLES[n].pill).toContain("text-ink");
    }
    expect(STATUS_STYLES.Paid.pill).toContain("text-paper");
  });

  it("looks states up by index and ignores unknown ones", () => {
    expect(stateName(2)).toBe("Pending");
    expect(statusStyle(4)?.hex).toBe("#23663F");
    expect(statusStyle(9)).toBeUndefined();
  });
});
