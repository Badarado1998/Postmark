// Pure PR checklist — the verifier sees warnings, not blocks.
import type { GhPull } from "./client";

export interface PrCheckItem { label: string; ok: boolean }

export function mergedAtSeconds(pr: GhPull): bigint {
  return pr.merged_at ? BigInt(Math.floor(new Date(pr.merged_at).getTime() / 1000)) : 0n;
}

export function checkPull(pr: GhPull, opts: {
  expectedRepo: string; prRepo: string; deadline: bigint; identityLogin: string | null;
}): PrCheckItem[] {
  const mergedAt = mergedAtSeconds(pr);
  return [
    { label: "merged", ok: !!pr.merged && mergedAt > 0n },
    { label: "merged_at ≤ deadline", ok: mergedAt > 0n && mergedAt <= opts.deadline },
    { label: `PR author == identity login${opts.identityLogin ? ` (@${opts.identityLogin})` : ""}`,
      ok: opts.identityLogin !== null && pr.user.login.toLowerCase() === opts.identityLogin },
    { label: "same repository",
      ok: opts.prRepo.toLowerCase() === opts.expectedRepo.toLowerCase() },
    { label: "merge_commit_sha present", ok: !!pr.merge_commit_sha },
  ];
}
