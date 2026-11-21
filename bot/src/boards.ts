// Verdict boards: issues where verifiers share signatures for bounties on repositories their own
// GITHUB_TOKEN can't comment on. A board is only a place to find candidate signatures; every signature
// is still verified against the live key and the current nonce/round/phase/escrow/bountyId.
import type { ParsedVerdictComment } from "../../app/src/formats/verdictComment";

export interface IssueRef { repo: string; number: number }

/** The public board on the Postmark repository. */
export const DEFAULT_BOARD = "Ololadestephen/Postmark#4";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const key = (r: IssueRef) => `${r.repo.toLowerCase()}#${r.number}`;

/** "owner/repo#4, owner/other#9" → refs; malformed entries are dropped. */
export function parseBoards(list: string | undefined): IssueRef[] {
  const out: IssueRef[] = [];
  for (const raw of (list?.trim() ? list : DEFAULT_BOARD).split(",")) {
    const m = raw.trim().match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
    if (m && !out.some((o) => key(o) === key({ repo: m[1]!, number: Number(m[2]) }))) out.push({ repo: m[1]!, number: Number(m[2]) });
  }
  return out;
}

/** Where to post: the bounty's own issue when the token's repo owns it, else the first board in the token's repo, else nowhere. */
export function postingTarget(work: IssueRef, boards: IssueRef[], githubRepository: string | undefined): IssueRef | null {
  if (!githubRepository) return null;
  if (same(work.repo, githubRepository)) return work;
  return boards.find((b) => same(b.repo, githubRepository)) ?? null;
}

/** Every issue to read verdict comments from: the bounty's own plus all boards, without repeats. */
export function readTargets(work: IssueRef, boards: IssueRef[]): IssueRef[] {
  const out: IssueRef[] = [];
  for (const r of [work, ...boards]) if (!out.some((o) => key(o) === key(r))) out.push(r);
  return out;
}

/** Merge verdict comments from several issues; the same signature seen twice counts once. */
export function mergeVerdictComments(lists: ParsedVerdictComment[][]): ParsedVerdictComment[] {
  const seen = new Set<string>();
  const out: ParsedVerdictComment[] = [];
  for (const c of lists.flat()) {
    const sigs = Object.entries(c.bundle.signatures).map(([i, s]) => `${i}:${s}`).join(",");
    const k = `${c.bundle.message}|${sigs}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
