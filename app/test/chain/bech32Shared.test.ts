import { describe, it, expect } from "vitest";
import { bech32Decode, convertBits, evmToQor, qorToEvm } from "../../../scripts/lib/bech32.mjs";

const QOR = "qor1n47s7ymy6mehz9w36klpezfkyk2jsucnhgk58p";
const EVM = "0x9d7d0f1364d6f37115d1d5be1c89362595287313";

describe("shared bech32", () => {
  it("round-trips a qor1 address", () => {
    expect(qorToEvm(QOR)).toBe(EVM);
    expect(evmToQor(EVM)).toBe(QOR);
  });
  it("rejects bad checksums, case, prefixes and padding", () => {
    expect(() => bech32Decode(QOR.slice(0, -1) + "q")).toThrow(/checksum/);
    expect(() => bech32Decode(QOR.toUpperCase())).toThrow(/case/);
    expect(() => bech32Decode("nosep")).toThrow(/separator/);
    expect(() => qorToEvm(evmToQor(EVM).replace(/^qor/, "abc"))).toThrow();
    expect(() => convertBits([31], 5, 8, false)).toThrow(/padding/);
  });
});
