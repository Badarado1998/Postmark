import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeBounty } from "../fixtures";

const m = vi.hoisted(() => ({ live: true, ok: true, throwKey: false }));
vi.mock("../../src/chain/pqc", () => ({
  pqcKeyStatus: async () => { if (m.throwKey) throw new Error("rpc"); return { live: m.live, pubkey: "0x00" }; },
}));
vi.mock("@qorechain/pqc", () => ({ mldsa87: { verify: () => m.ok } }));

import { bigintToString, sameVerdict, signatureStatuses } from "../../src/wallet/review/bundleVerify";

const verdict = (over = {}) => ({ bountyId: 1n, phase: 0, outcome: 0, payee: "0xAB" as `0x${string}`, mergedAt: 1n,
  evidenceHash: "0x1" as `0x${string}`, nonce: 1n, claimRound: 1n,
  disputedVerdictHash: "0x0" as `0x${string}`, disputeEvidenceHash: "0x0" as `0x${string}`, ...over });
const bundle = { message: "0xabcd", signatures: { 0: "0x01" } } as never;

beforeEach(() => Object.assign(m, { live: true, ok: true, throwKey: false }));

describe("bundleVerify", () => {
  it("serialises bigints as strings", () => {
    expect(JSON.stringify({ n: 5n }, bigintToString)).toBe('{"n":"5"}');
  });

  it("compares verdict fields, ignoring payee case", () => {
    expect(sameVerdict(verdict(), verdict({ payee: "0xab" }))).toBe(true);
    expect(sameVerdict(verdict(), verdict({ nonce: 2n }))).toBe(false);
    expect(sameVerdict(verdict(), verdict({ outcome: 1 }))).toBe(false);
  });

  it("classifies each signature", async () => {
    const bounty = makeBounty();
    expect(await signatureStatuses(bounty, bundle)).toEqual({ 0: "valid" });
    m.ok = false;
    expect(await signatureStatuses(bounty, bundle)).toEqual({ 0: "invalid" });
    m.live = false;
    expect(await signatureStatuses(bounty, bundle)).toEqual({ 0: "key not live" });
    m.throwKey = true;
    expect(await signatureStatuses(bounty, bundle)).toEqual({ 0: "invalid" });
    expect(await signatureStatuses(bounty, null)).toEqual({});
  });
});
