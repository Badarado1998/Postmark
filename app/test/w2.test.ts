import { describe, it, expect } from "vitest";
import { validateForm } from "../src/formats/createForm";
import { preflightTx } from "../src/chain/preflight";
import type { EvmWindow } from "../src/chain/window";

const V = "0x01B451550bEf4cc51Bb24B8C5E5b4b23a368a9cE";
const V2 = "0x8e815476f878b05a2a0E4BC452112311eAEcEa31";
const V3 = "0xFac4a64980C8777799ebae562a82825185e20558";
const FUNDER = "0x4Fe9f2B175f6D533c9b88902Dc257A34384873bD";
const ESCROW = "0xae80681E92b63eFEa78cB742dd612ecc940B896A" as const;

const base = {
  amount: "0.2", reward: "0.05", bond: "0.05",
  deadlineLocal: new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16),
  claimTimeoutSec: 3600,
  verifiers: [V, V2, V3],
  funder: FUNDER,
};

describe("validateForm", () => {
  it("accepts a valid form", () => {
    const r = validateForm(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parsed.amount).toBe(2n * 10n ** 17n);
      expect(r.parsed.claimTimeout).toBe(3600n);
      expect(r.parsed.verifiers).toHaveLength(3);
    }
  });
  it.each([
    ["0 amount", { amount: "0" }],
    ["0 reward", { reward: "0" }],
    ["0 bond", { bond: "0" }],
    ["non-decimal", { amount: "abc" }],
    [">18dp", { amount: "0.00000000000000000001" }],
    ["dup verifier", { verifiers: [V, V, V3] }],
    ["verifier = funder", { verifiers: [V, V2, FUNDER] }],
    ["bad address", { verifiers: [V, V2, "0xnotanaddress"] }],
    ["past deadline", { deadlineLocal: "2020-01-01T00:00" }],
    ["deadline < timeout+buffer", { deadlineLocal:
      new Date(Date.now() + 3600_000).toISOString().slice(0, 16), claimTimeoutSec: 3600 }],
    ["timeout < 1h", { claimTimeoutSec: 1800 }],
    ["timeout > 7d", { claimTimeoutSec: 700000 }],
  ])("rejects %s", (_n, patch) => {
    expect(validateForm({ ...base, ...patch }).ok).toBe(false);
  });
  it("accepts a qor1 verifier address", () => {
    const r = validateForm({ ...base, verifiers:
      ["qor1qx69z4gtaaxv2xajfwx9uk6tyw3k32wwjut3uw", V2, V3] });
    expect(r.ok).toBe(true);
  });
});

const liveWindow: EvmWindow = {
  found: true, live: true, remainingTxs: "5",
  remainingValue: "900000", allowedTargets: [ESCROW.toLowerCase()],
};
const ok = preflightTx({
  connected: true, chainId: 9800, pqcLive: true, window: liveWindow,
  valueWei: 2n * 10n ** 17n, maxFeeWei: 10n ** 17n, escrow: ESCROW,
});

describe("preflightTx", () => {
  it("passes with a live window", () => expect(ok.ok).toBe(true));
  it.each<[string, Partial<Parameters<typeof preflightTx>[0]>, RegExp]>([
    ["not connected", { connected: false }, /connect/i],
    ["wrong chain", { chainId: 1 }, /9800/],
    ["no pq key", { pqcLive: false }, /ML-DSA/],
    ["no window", { window: { found: false, live: false } }, /no open/i],
    ["dead window", { window: { ...liveWindow, live: false } }, /no open/i],
    ["no txs left", { window: { ...liveWindow, remainingTxs: "0" } }, /transactions left/i],
    ["low value", { window: { ...liveWindow, remainingValue: "100" }, valueWei: 2n * 10n ** 17n }, /remaining value/i],
    ["wrong scope", { window: { ...liveWindow, allowedTargets: ["0x" + "ab".repeat(20)] } }, /different targets/i],
  ])("blocks: %s", (_n, patch, re) => {
    const r = preflightTx({ connected: true, chainId: 9800, pqcLive: true,
      window: liveWindow, valueWei: 0n, maxFeeWei: 0n, escrow: ESCROW, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(re);
  });
  it("attaches the QoreX guide when the window fails", () => {
    const r = preflightTx({ connected: true, chainId: 9800, pqcLive: true,
      window: { found: false, live: false }, valueWei: 0n, maxFeeWei: 0n, escrow: ESCROW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.guide?.target).toBe(ESCROW);
  });
});
