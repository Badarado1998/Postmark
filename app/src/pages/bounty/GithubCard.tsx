import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "../../components/ui";
import { useGithubItem } from "../../hooks/queries";
import { getLinkedPrs, getPull, GithubRateLimitError, type GhIssue, type GhPull } from "../../github/client";
import { githubItemLabel, githubItemUrl, type WorkItem } from "../../github/parse";

const FIVE_MIN = 5 * 60_000;
const SLOW_GITHUB_MS = 10_000;

function MergeNote({ pr }: { pr: GhPull }) {
  return (
    <>
      {pr.merged ? `merged ${pr.merged_at ? new Date(pr.merged_at).toLocaleString() : ""}` : "not merged"}
    </>
  );
}

export function GithubCard(item: WorkItem) {
  const { kind } = item;
  const n = Number(item.number);
  const issue = useGithubItem(item, {
    retry: (count, err) => !(err instanceof GithubRateLimitError) && count < 2,
  });
  const linked = useQuery({
    queryKey: ["gh-linked", item.ownerRepo, n],
    queryFn: () => getLinkedPrs(item.ownerRepo, n),
    enabled: kind === 0 && !!issue.data,
    staleTime: FIVE_MIN, retry: false,
  });
  const linkedPr = useQuery({
    queryKey: ["gh", "pull", item.ownerRepo, linked.data?.[0]],
    queryFn: () => getPull(item.ownerRepo, linked.data![0]!),
    enabled: !!linked.data?.[0],
    staleTime: FIVE_MIN, retry: false,
  });

  // GitHub can hang on rate limits; never leave a skeleton up forever.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!issue.isPending) return;
    const t = setTimeout(() => setSlow(true), SLOW_GITHUB_MS);
    return () => clearTimeout(t);
  }, [issue.isPending]);

  if (issue.isPending && !slow) return <Skeleton className="h-32" />;
  if (issue.error || issue.isPending) {
    const msg = issue.error instanceof GithubRateLimitError
      ? issue.error.message
      : "GitHub unavailable (rate limit or private repo).";
    return (
      <div className="rounded-xl border border-ink/10 p-5 text-sm text-gray">
        {msg} <a className="text-deep underline underline-offset-4"
          href={githubItemUrl(item)} target="_blank" rel="noreferrer">Open on GitHub</a>
      </div>
    );
  }
  const d = issue.data as GhIssue & GhPull;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <a href={d.html_url} target="_blank" rel="noreferrer"
          className="font-sans text-lg text-ink hover:text-deep">
          {d.title}
        </a>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
          d.state === "open" ? "border-leaf/60 text-deep" : "border-gray/50 text-gray"}`}>
          {d.state}
        </span>
      </div>
      <p className="mt-2 font-mono text-xs text-gray">
        {githubItemLabel(item)} · by {d.user?.login}
      </p>
      {d.labels && d.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {d.labels.map((l) => (
            <span key={l.name} className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-gray">{l.name}</span>
          ))}
        </div>
      )}
      {kind === 1 && "merged" in d && (
        <p className="mt-3 text-sm">
          {d.merged
            ? <span className="text-deep">merged {d.merged_at ? new Date(d.merged_at).toLocaleString() : ""} {d.merge_commit_sha ? `· ${d.merge_commit_sha.slice(0, 10)}` : ""}</span>
            : <span className="text-orange">not merged</span>}
        </p>
      )}
      {kind === 0 && linkedPr.data && (
        <p className="mt-3 text-sm text-gray">
          linked PR <a className="text-deep underline underline-offset-4" href={linkedPr.data.html_url} target="_blank" rel="noreferrer">#{linkedPr.data.number}</a>
          {" "}<MergeNote pr={linkedPr.data} />
          {linkedPr.data.user?.login ? ` · by ${linkedPr.data.user.login}` : ""}
        </p>
      )}
    </Card>
  );
}
