import { describe, it, expect } from "vitest";
import { BUNDLE_FORMAT, type VerdictBundle } from "../../src/formats/verdictBundle";
import {
  VERDICT_COMMENT_MARKER, formatVerdictComment, parseVerdictComments,
} from "../../src/formats/verdictComment";

const SIG = (`0x${"ab".repeat(4627)}`) as `0x${string}`;
const ZERO = `0x${"0".repeat(64)}` as const;
const bundle: VerdictBundle = {
  format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: "qorechain-diana",
  escrow: "0x13De819fE37133d19287aAFE1991a921F84b9F45",
  verdict: { bountyId: 3n, phase: 0, outcome: 0, payee: "0x478F2A08a81be7CEa42bd34BD6900593fA56c4B6", mergedAt: 1_700_000_000n,
    evidenceHash: `0x${"11".repeat(32)}`, nonce: 0n, claimRound: 1n, disputedVerdictHash: ZERO, disputeEvidenceHash: ZERO },
  message: "0x1234", signatures: { "0": SIG, "1": `0x${"cd".repeat(4627)}` },
};
const comment = (id: number, body: string, login = "Bot") => ({ id, user: { login }, body, created_at: "2026-01-01T00:00:00Z" });

describe("verdict comments", () => {
  it("formats a marker, a summary and exactly one signature", () => {
    const text = formatVerdictComment(bundle, { signerIndex: 1, signer: "0xabc", kind: "bot" });
    expect(text.startsWith(`${VERDICT_COMMENT_MARKER}\n**PAY** · bounty #3 · round 1 · nonce 0 · verifier 1 \`0xabc\` (bot)`)).toBe(true);
    const parsed = parseVerdictComments([comment(1, text)]);
    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0]!.bundle.signatures)).toEqual(["1"]);
    expect(parsed[0]!.bundle.verdict).toEqual(bundle.verdict);
    expect(parsed[0]!.bundle.message).toBe("0x1234");
    expect(parsed[0]!.login).toBe("bot");
  });

  it("refuses to format a signature the bundle doesn't hold", () => {
    expect(() => formatVerdictComment(bundle, { signerIndex: 2, signer: "0x", kind: "human" })).toThrow(/no signature/);
  });

  it("skips malformed comments and ignores comments without the marker", () => {
    const good = formatVerdictComment(bundle, { signerIndex: 0, signer: "0xabc", kind: "human" });
    const comments = [
      comment(1, "plain chat"),
      comment(2, `${VERDICT_COMMENT_MARKER}\nno json here`),
      comment(3, `${VERDICT_COMMENT_MARKER}\n\`\`\`json\n{not json}\n\`\`\``),
      comment(4, good.replace(SIG.slice(2, 40), "zz")),
      comment(5, good.replace('"escrow"', '"escrowx"')),
      comment(6, good.replace(VERDICT_COMMENT_MARKER, "")),
      comment(7, good),
    ];
    const parsed = parseVerdictComments(comments);
    expect(parsed.map((p) => p.commentId)).toEqual([7]);
  });
});
