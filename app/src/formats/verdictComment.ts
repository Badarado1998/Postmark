// The comment protocol: a verifier (bot or human) posts its single signed verdict as a GitHub comment,
// so anyone can collect two of them and relay the quorum. Pure; shared by the app and the verifier bot.
import { parseBundle, type VerdictBundle } from "./verdictBundle";
import type { GhComment } from "../github/comments";

export const VERDICT_COMMENT_MARKER = "<!-- postmark-verdict v1 -->";

const bigintToString = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
const OUTCOME_LABEL = ["PAY", "REFUND"] as const;
const FENCE = /```json\s*\n([\s\S]*?)\n```/;

export interface VerdictCommentOptions {
  signerIndex: number;
  signer: string;
  kind: "bot" | "human";
}

/** Markdown comment holding exactly one signature (the signer's own) in a postmark-verdict-bundle-v1. */
export function formatVerdictComment(bundle: VerdictBundle, opts: VerdictCommentOptions): string {
  const signature = bundle.signatures[String(opts.signerIndex)];
  if (!signature) throw new Error(`bundle has no signature for verifier ${opts.signerIndex}`);
  const single: VerdictBundle = { ...bundle, signatures: { [String(opts.signerIndex)]: signature } };
  const v = bundle.verdict;
  const summary = `**${OUTCOME_LABEL[v.outcome] ?? "?"}** · bounty #${v.bountyId} · round ${v.claimRound}`
    + ` · nonce ${v.nonce} · verifier ${opts.signerIndex} \`${opts.signer}\` (${opts.kind})`;
  return `${VERDICT_COMMENT_MARKER}\n${summary}\n\n\`\`\`json\n${JSON.stringify(single, bigintToString, 2)}\n\`\`\`\n`;
}

export interface ParsedVerdictComment { commentId: number; login: string; bundle: VerdictBundle }

/** Verdict bundles found in comments; comments without the marker, or malformed ones, are skipped. */
export function parseVerdictComments(comments: GhComment[]): ParsedVerdictComment[] {
  const out: ParsedVerdictComment[] = [];
  for (const c of comments) {
    if (!c.body?.includes(VERDICT_COMMENT_MARKER)) continue;
    const json = c.body.match(FENCE)?.[1];
    if (!json) continue;
    try {
      out.push({ commentId: c.id, login: c.user.login.toLowerCase(), bundle: parseBundle(json) });
    } catch { /* malformed: ignore */ }
  }
  return out;
}
