import { describe, it, expect } from "vitest";
import { DEFAULT_BOARD, mergeVerdictComments, parseBoards, postingTarget, readTargets } from "../src/boards";
import { loadConfig } from "../src/config";
import { selectQuorum } from "../src/quorum";
import { bytesToHex, hexToBytes, type Hex } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import { assembleVerdict } from "../../app/src/chain/verdictCore";
import { verdictMessage } from "../../app/src/formats/messages";
import { BUNDLE_FORMAT, type VerdictBundle } from "../../app/src/formats/verdictBundle";
import { formatVerdictComment, parseVerdictComments } from "../../app/src/formats/verdictComment";
import { ESCROW, PAYEE } from "./fixtures";

const BOARD = { repo: "Ololadestephen/Postmark", number: 4 };

describe("verdict boards: config", () => {
  it("defaults to the public board and parses lists", () => {
    expect(DEFAULT_BOARD).toBe("Ololadestephen/Postmark#4");
    expect(parseBoards(undefined)).toEqual([BOARD]);
    expect(parseBoards("a/b#1, c/d#22 ,bad, a/b#1")).toEqual([{ repo: "a/b", number: 1 }, { repo: "c/d", number: 22 }]);
    expect(loadConfig({ GITHUB_REPOSITORY: "o/r" }).githubRepository).toBe("o/r");
    expect(loadConfig({}).boards).toEqual([BOARD]);
  });
});

describe("verdict boards: where to post and read", () => {
  const boards = [BOARD];
  it("posts on the bounty issue when the token's repo owns it (case-insensitive)", () => {
    const work = { repo: "ololadestephen/postmark", number: 7 };
    expect(postingTarget(work, boards, "Ololadestephen/Postmark")).toEqual(work);
  });
  it("posts on the board for a bounty in another repo", () => {
    expect(postingTarget({ repo: "acme/widgets", number: 7 }, boards, "ololadestephen/postmark")).toEqual(BOARD);
  });
  it("does not post when no board lives in the token's repo or there is no repo", () => {
    expect(postingTarget({ repo: "acme/widgets", number: 7 }, boards, "someone/else")).toBeNull();
    expect(postingTarget({ repo: "acme/widgets", number: 7 }, boards, undefined)).toBeNull();
  });
  it("reads the bounty issue and every board once", () => {
    const work = { repo: "acme/widgets", number: 7 };
    expect(readTargets(work, boards)).toEqual([work, BOARD]);
    expect(readTargets({ repo: "ololadestephen/postmark", number: 4 }, boards)).toHaveLength(1);
  });
});

describe("verdict boards: candidate signatures", () => {
  const pairs = [1, 2, 3].map((n) => mldsa87.keygen(new Uint8Array(32).fill(n)));
  const keys = pairs.map((p) => bytesToHex(p.publicKey) as Hex);
  const VERIFIERS = ["0x" + "a1".repeat(20), "0x" + "a2".repeat(20), "0x" + "a3".repeat(20)] as unknown as readonly [`0x${string}`, `0x${string}`, `0x${string}`];
  const ZERO = `0x${"0".repeat(64)}` as Hex;
  const bounty = { payee: PAYEE, nonce: 0n, claimRound: 1n, pendingVerdictHash: ZERO, disputeEvidenceHash: ZERO, verifiers: VERIFIERS };
  const verify = (pub: Hex, msg: Hex, sig: Hex) => mldsa87.verify(hexToBytes(pub), hexToBytes(msg), hexToBytes(sig));
  const signed = (index: number, over: { bountyId?: bigint; escrow?: `0x${string}` } = {}) => {
    const v = assembleVerdict({ bountyId: over.bountyId ?? 7n, bounty, phase: 0, outcome: 0, evidenceHash: `0x${"11".repeat(32)}`, payee: PAYEE, mergedAt: 1_700_000_000n });
    const escrow = over.escrow ?? ESCROW;
    const message = verdictMessage(v, 9800, escrow);
    const signature = bytesToHex(mldsa87.sign(pairs[index]!.secretKey, hexToBytes(message))) as Hex;
    const b: VerdictBundle = { format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: "qorechain-diana", escrow, verdict: v, message, signatures: { [index]: signature } };
    return parseVerdictComments([{ id: index + 1, user: { login: "bot" }, created_at: "", body: formatVerdictComment(b, { signerIndex: index, signer: VERIFIERS[index]!, kind: "bot" }) }])[0]!;
  };
  const run = (comments: ReturnType<typeof signed>[]) => selectQuorum({
    id: 7n, bounty, phase: 0, escrow: ESCROW, own: null, comments, keys, humans: new Set(), verify });

  it("a quorum can form from signatures spread over the bounty issue and a board", async () => {
    const merged = mergeVerdictComments([[signed(0)], [signed(2)]]);
    expect(await run(merged)).toMatchObject({ ok: true, quorum: { indices: [0, 2] } });
  });
  it("the same signature on the issue and the board counts once", async () => {
    const merged = mergeVerdictComments([[signed(0)], [signed(0)]]);
    expect(merged).toHaveLength(1);
    expect((await run(merged)).ok).toBe(false);
  });
  it("a board comment for a different bounty or escrow is ignored", async () => {
    const wrongBounty = mergeVerdictComments([[signed(0)], [signed(1, { bountyId: 8n })]]);
    expect((await run(wrongBounty)).ok).toBe(false);
    const wrongEscrow = mergeVerdictComments([[signed(0)], [signed(1, { escrow: "0x" + "9".repeat(40) as `0x${string}` })]]);
    expect((await run(wrongEscrow)).ok).toBe(false);
  });
});
