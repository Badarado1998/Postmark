export interface GithubRef {
  ownerRepo: string;   // canonical "owner/repo", lowercase
  kind: 0 | 1;         // 0 issue, 1 PR
  number: number;
}

const OWNER_RE = /^[a-z0-9][a-z0-9-]*$/i;
const REPO_RE = /^[a-z0-9._-]+$/i;

/** Parse a github.com issue or PR URL into its canonical on-chain reference. */
export function parseGithubUrl(input: string): GithubRef | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/);
  if (!m) return null;
  const [, owner, repo, kindStr, numStr] = m;
  if (!owner || !repo || !OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  const number = parseInt(numStr!, 10);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return {
    ownerRepo: `${owner}/${repo}`.toLowerCase(),
    kind: kindStr === "pull" ? 1 : 0,
    number,
  };
}

export interface WorkItem { ownerRepo: string; kind: number; number: number | bigint }

/** github.com URL of an issue or pull request. */
export function githubItemUrl(w: WorkItem): string {
  return `https://github.com/${w.ownerRepo}/${w.kind === 1 ? "pull" : "issues"}/${w.number}`;
}

/** Short display form: `owner/repo#12` for issues, `owner/repo/pull/12` for PRs. */
export function githubItemLabel(w: WorkItem): string {
  return `${w.ownerRepo}${w.kind === 1 ? "/pull/" : "#"}${w.number}`;
}
