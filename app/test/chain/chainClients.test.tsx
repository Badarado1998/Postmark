import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { encodeEventTopics, encodeAbiParameters as enc } from "viem";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { newQueryClient, ZERO_ADDR } from "../fixtures";
import { postmarkEscrowAbi } from "../../src/chain/abi";
import { ESCROW_ADDRESS, explorerAddress, explorerBlock, explorerTx } from "../../src/chain/config";
import { workHashOf } from "../../src/formats/hashes";

const rpc = vi.hoisted(() => ({
  request: vi.fn(), getLogs: vi.fn(), getBlockNumber: vi.fn(),
  nextBountyId: vi.fn(), getBounty: vi.fn(),
}));
vi.mock("../../src/chain/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/chain/client")>()),
  httpClient: rpc, nextBountyId: rpc.nextBountyId, getBounty: rpc.getBounty,
}));

import { pqcKeyStatus, livePqcKey, pqcRestStatus } from "../../src/chain/pqc";
import { decodeLogs, getLogsChunked, indexEvents } from "../../src/chain/indexer";
import { useBountyRoute } from "../../src/hooks/useBountyRoute";

const word = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");
function keyStatusReturn(registered: boolean, algo: number, pubkeyBytes: number, proven: boolean) {
  const pk = "ab".repeat(pubkeyBytes);
  const padded = pk.padEnd(Math.ceil(pubkeyBytes / 32) * 64, "0");
  return `0x${word(registered ? 1 : 0)}${word(algo)}${word(0x80)}${word(proven ? 1 : 0)}${word(pubkeyBytes)}${padded}`;
}

describe("pqcKeyStatus", () => {
  beforeEach(() => rpc.request.mockReset());

  it("decodes a live ML-DSA-87 registration", async () => {
    rpc.request.mockResolvedValue(keyStatusReturn(true, 1, 2592, true));
    const s = await pqcKeyStatus(ZERO_ADDR);
    expect(s).toMatchObject({ registered: true, algorithmId: 1, possessionProven: true, live: true });
    expect(rpc.request.mock.calls[0]![0].params[0].data).toMatch(/^0x850dfe51/);
  });

  it.each([
    ["not registered", keyStatusReturn(false, 1, 2592, true)],
    ["wrong algorithm", keyStatusReturn(true, 2, 2592, true)],
    ["wrong key size", keyStatusReturn(true, 1, 32, true)],
    ["no possession proof", keyStatusReturn(true, 1, 2592, false)],
  ])("is not live when %s", async (_n, ret) => {
    rpc.request.mockResolvedValue(ret);
    expect((await pqcKeyStatus(ZERO_ADDR)).live).toBe(false);
  });

  it("fails closed on an empty precompile return", async () => {
    rpc.request.mockResolvedValue("0x");
    await expect(pqcKeyStatus(ZERO_ADDR)).rejects.toThrow(/returned empty/);
  });

  it("livePqcKey returns the key, or null on failure or an inactive key", async () => {
    rpc.request.mockResolvedValueOnce(keyStatusReturn(true, 1, 2592, true));
    expect(await livePqcKey(ZERO_ADDR)).toMatch(/^0xabab/);
    rpc.request.mockResolvedValueOnce(keyStatusReturn(false, 1, 2592, true));
    expect(await livePqcKey(ZERO_ADDR)).toBeNull();
    rpc.request.mockRejectedValueOnce(new Error("down"));
    expect(await livePqcKey(ZERO_ADDR)).toBeNull();
  });
});

describe("pqcRestStatus", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null for an unknown account and throws on server errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ status: 404, ok: false }));
    expect(await pqcRestStatus("qor1x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ status: 500, ok: false }));
    await expect(pqcRestStatus("qor1x")).rejects.toThrow("pqc REST 500");
  });

  it("returns the REST record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ algorithm_id: 1 }) }));
    expect(await pqcRestStatus("qor1x")).toEqual({ algorithm_id: 1 });
  });
});

describe("explorer links", () => {
  it("point at the diana explorer", () => {
    expect(explorerTx("0x1")).toMatch(/\/explorer\/tx\/0x1$/);
    expect(explorerAddress("0x2")).toMatch(/\/explorer\/address\/0x2$/);
    expect(explorerBlock(5n)).toMatch(/\/explorer\/block\/5$/);
  });
});

function escrowLog(eventName: string, args: Record<string, unknown>, block = 10n) {
  const abiItem = postmarkEscrowAbi.find((e) => e.type === "event" && e.name === eventName)!;
  const indexed = (abiItem.inputs as readonly { name: string; indexed: boolean; type: string }[]);
  const topics = encodeEventTopics({ abi: [abiItem], eventName, args } as never);
  const data = enc(indexed.filter((i) => !i.indexed) as never,
    indexed.filter((i) => !i.indexed).map((i) => args[i.name]) as never);
  return { address: ESCROW_ADDRESS, topics, data, blockNumber: block, transactionHash: `0x${"11".repeat(32)}`,
    logIndex: 0, blockHash: `0x${"22".repeat(32)}`, transactionIndex: 0, removed: false };
}

describe("indexer", () => {
  it("folds BountyCreated and BountyWork events into ids and metadata", () => {
    const workHash = workHashOf("o/r", 0, 4);
    const logs = [
      escrowLog("BountyCreated", { bountyId: 4n, funder: ZERO_ADDR, amount: 1n, reward: 1n, workHash,
        deadline: 9n, claimTimeout: 1n, verifiers: [ZERO_ADDR, ZERO_ADDR, ZERO_ADDR], bondAmount: 1n }),
      escrowLog("BountyWork", { bountyId: 4n, workHash, ownerRepo: "o/r", kind: 0, number: 4n }),
    ];
    const state = indexEvents(decodeLogs(logs as never), 99n);
    expect(state.bountyIds).toEqual([4n]);
    expect(state.lastBlock).toBe(99n);
    expect(state.metaById.get(4n)).toMatchObject({ ownerRepo: "o/r", number: 4n, workHashMismatch: false });
  });

  it("flags work metadata that does not hash back to the stored workHash", () => {
    const logs = [escrowLog("BountyWork", { bountyId: 1n, workHash: `0x${"00".repeat(32)}`,
      ownerRepo: "o/r", kind: 0, number: 4n })];
    expect(indexEvents(decodeLogs(logs as never), 1n).metaById.get(1n)?.workHashMismatch).toBe(true);
  });

  it("pages getLogs and halves the range when the RPC refuses", async () => {
    rpc.getLogs.mockReset();
    rpc.getLogs.mockRejectedValueOnce(new Error("range too large")).mockResolvedValue([{ n: 1 }]);
    const out = await getLogsChunked(0n, 100n);
    expect(out.length).toBeGreaterThan(0);
    expect(rpc.getLogs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("useBountyRoute", () => {
  const wrapper = (route: string) => ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={newQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="/bounty/:id" element={children} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>);

  beforeEach(() => {
    rpc.nextBountyId.mockResolvedValue(3n);
    rpc.getBounty.mockResolvedValue(undefined);
    rpc.getBlockNumber.mockResolvedValue(5n);
    rpc.getLogs.mockResolvedValue([]);
  });

  it("parses the id and reports not-found beyond nextBountyId", async () => {
    const { result } = renderHook(() => useBountyRoute(), { wrapper: wrapper("/bounty/9") });
    expect(result.current.id).toBe(9n);
    await waitFor(() => expect(result.current.notFound).toBe(true));
  });

  it("leaves the id undefined for a malformed route", () => {
    const { result } = renderHook(() => useBountyRoute(), { wrapper: wrapper("/bounty/abc") });
    expect(result.current.id).toBeUndefined();
    expect(result.current.notFound).toBe(false);
  });
});

