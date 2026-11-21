import { describe, it, expect } from "vitest";
import { exactQor, formatQor } from "../../src/components/qor";

describe("formatQor", () => {
  it("shows up to four decimals without trailing zeros", () => {
    expect(formatQor(1_500_000_000_000_000_000n)).toBe("1.5");
    expect(formatQor(250_000_000_000_000_000n)).toBe("0.25");
    expect(formatQor(1_234_567_000_000_000_000n)).toBe("1.2345");
    expect(formatQor(3n * 10n ** 18n)).toBe("3");
  });
  it("shows dust as <0.0001 and zero as 0", () => {
    expect(formatQor(2n)).toBe("<0.0001");
    expect(formatQor(99_999_999_999_999n)).toBe("<0.0001");
    expect(formatQor(100_000_000_000_000n)).toBe("0.0001");
    expect(formatQor(0n)).toBe("0");
  });
  it("keeps the exact value for the tooltip", () => {
    expect(exactQor(2n)).toBe("0.000000000000000002 QOR (2 wei)");
  });
});
