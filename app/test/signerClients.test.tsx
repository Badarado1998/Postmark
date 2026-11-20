import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const qx = vi.hoisted(() => ({
  installed: false, native: null as unknown, accounts: [] as { address: string }[], caps: new Set<string>(),
  eip1193: null as unknown,
}));
vi.mock("@qorechain/qorex-types", () => ({
  isQorexInstalled: () => qx.installed,
  discoverQorexEip1193: async () => qx.eip1193,
  getQorexNative: () => qx.native,
  hasCapability: (_n: unknown, cap: string) => qx.caps.has(cap),
}));

import {
  signerStatus, signClaim, signVerdict, signerPort, setSignerPort, signerUrl,
  pairingCode, setPairingCode, SignerError,
} from "../src/chain/localSigner";
import { localSigner, pickSigner, qorexSigner } from "../src/wallet/pqSigner";
import { useQorex, type QorexState } from "../src/wallet/qorex";

const SIG = `0x${"ab".repeat(8)}` as const;
const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("signer endpoint settings", () => {
  it("defaults to port 47321 and ignores invalid ports", () => {
    expect(signerPort()).toBe(47321);
    setSignerPort(47322);
    expect(signerPort()).toBe(47322);
    expect(signerUrl()).toBe("http://127.0.0.1:47322");
    setSignerPort(99999);
    expect(signerPort()).toBe(47321);
    setSignerPort(null);
    expect(signerPort()).toBe(47321);
  });

  it("stores and clears the pairing code", () => {
    expect(pairingCode()).toBeNull();
    setPairingCode("deadbeef");
    expect(pairingCode()).toBe("deadbeef");
    setPairingCode(null);
    expect(pairingCode()).toBeNull();
  });
});

describe("signer requests", () => {
  it("sends the pairing code and returns the status payload", async () => {
    setPairingCode("deadbeef");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { address: "0x1", live: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await signerStatus()).toMatchObject({ live: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:47321/status");
    expect(init.headers["x-postmark-pair"]).toBe("deadbeef");
  });

  it("explains an unreachable signer and a rejected pairing code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(signerStatus()).rejects.toThrow(/not reachable/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    await expect(signerStatus()).rejects.toMatchObject({ status: 401, message: expect.stringMatching(/Pairing code rejected/) });
  });

  it("surfaces the signer's refusal message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { error: "declined at the terminal" })));
    const err = await signClaim({ bountyId: 1n, identityHash: `0x${"11".repeat(32)}`, claimRound: 1n }).catch((e) => e);
    expect(err).toBeInstanceOf(SignerError);
    expect(err).toMatchObject({ status: 422, message: "declined at the terminal" });
  });

  it("posts claims and verdicts with bigints as decimal strings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { signature: SIG, signer: "0x1", pubkeySha256: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    await signClaim({ bountyId: 7n, identityHash: `0x${"11".repeat(32)}`, claimRound: 2n });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ kind: "claim", bountyId: "7", claimRound: "2" });
    await signVerdict({ bountyId: 7n, phase: 1, outcome: 0, payee: "0x1" as never, mergedAt: 9n,
      evidenceHash: `0x${"22".repeat(32)}`, nonce: 3n, claimRound: 2n });
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).verdict).toMatchObject({ bountyId: "7", mergedAt: "9", nonce: "3" });
  });
});

describe("PQ signers", () => {
  it("the local signer returns the signature from the local process", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { signature: SIG })));
    expect(await localSigner.sign({ bountyId: 1n, identityHash: `0x${"11".repeat(32)}`, claimRound: 1n, message: "0x00" })).toBe(SIG);
    expect(await localSigner.signVerdict({ message: "0x00", verdict: {
      bountyId: 1n, phase: 0, outcome: 0, payee: "0x1" as never, mergedAt: 0n,
      evidenceHash: `0x${"22".repeat(32)}`, nonce: 0n, claimRound: 1n } as never })).toBe(SIG);
    expect(localSigner.label).toContain("127.0.0.1");
  });

  it("the QoreX signer unwraps pq.signature or signature and prefixes 0x", async () => {
    const signArbitrary = vi.fn()
      .mockResolvedValueOnce({ pq: { signature: "abcd" } })
      .mockResolvedValueOnce({ signature: "0x1234" })
      .mockResolvedValueOnce({});
    const signer = qorexSigner({ signArbitrary } as never, "qor1x");
    const req = { bountyId: 1n, identityHash: `0x${"11".repeat(32)}` as const, claimRound: 1n, message: "0x00" as const };
    expect(await signer.sign(req)).toBe("0xabcd");
    expect(await signer.sign(req)).toBe("0x1234");
    await expect(signer.sign(req)).rejects.toThrow(/no PQ signature/);
    expect(signArbitrary).toHaveBeenCalledWith("qorechain-diana", "qor1x", expect.any(Uint8Array));
  });

  it("pickSigner uses QoreX only when it can sign arbitrary messages for an account", () => {
    const base = { installed: true, eip1193: null, native: { signArbitrary: vi.fn() }, accounts: [],
      evmCanSend: false } as unknown as QorexState;
    expect(pickSigner({ ...base, canSignArbitrary: false, qorAddress: "qor1x" }).id).toBe("local");
    expect(pickSigner({ ...base, canSignArbitrary: true, qorAddress: null }).id).toBe("local");
    expect(pickSigner({ ...base, canSignArbitrary: true, qorAddress: "qor1x" }).id).toBe("qorex");
  });
});

describe("useQorex", () => {
  beforeEach(() => Object.assign(qx, { installed: false, native: null, accounts: [], caps: new Set(), eip1193: null }));

  it("stays idle when QoreX is not installed", async () => {
    const { result } = renderHook(() => useQorex());
    await waitFor(() => expect(result.current.installed).toBe(false));
    expect(result.current.canSignArbitrary).toBe(false);
  });

  it("lights up capabilities and the active account when QoreX is present", async () => {
    qx.installed = true;
    qx.caps = new Set(["listAccounts", "signArbitrary"]);
    qx.native = { listAccounts: async () => ({ accounts: [{ address: "qor1a" }, { address: "qor1b" }], activeIndex: 1 }) };
    const { result } = renderHook(() => useQorex());
    await waitFor(() => expect(result.current.installed).toBe(true));
    expect(result.current).toMatchObject({ qorAddress: "qor1b", canSignArbitrary: true, evmCanSend: false });
  });

  it("tolerates a site that is not connected yet", async () => {
    qx.installed = true;
    qx.caps = new Set(["listAccounts", "evmTransactions"]);
    qx.native = { listAccounts: async () => { throw new Error("not connected"); } };
    const { result } = renderHook(() => useQorex());
    await waitFor(() => expect(result.current.installed).toBe(true));
    expect(result.current).toMatchObject({ qorAddress: null, evmCanSend: true });
  });
});
