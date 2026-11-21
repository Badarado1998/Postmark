import { GithubRateLimitError, type GhPull } from "../github/client";
import { githubItemLabel, type GithubRef } from "../github/parse";
import { useGithubItem } from "../hooks/queries";

export function VerifierInput({ i, value, onChange, live, checking, error, reveal = false }:
  { reveal?: boolean; i: number; value: string; onChange: (v: string) => void;
    live: boolean | undefined; checking: boolean; error?: string | undefined }) {
  const show = reveal || value.trim().length > 0;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={show && !!error}
          aria-label={`Verifier ${i + 1}`}
          placeholder={`Verifier ${i + 1} — 0x… or qor1…`}
          className={`w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-gray focus:outline-none focus:ring-1 focus:ring-deep ${
            show && error ? "border-salmon/60" : "border-ink/10"}`} />
        {checking && <span className="shrink-0 text-xs text-gray">checking…</span>}
        {live === true && <span className="shrink-0 rounded-full border border-leaf/60 px-2 py-0.5 text-[10px] text-deep">PQ live</span>}
        {live === false && <span className="shrink-0 rounded-full border border-salmon px-2 py-0.5 text-[10px] text-orange">no key</span>}
      </div>
      {show && error && <p role="alert" className="mt-1 text-xs text-orange">{error}</p>}
      {show && !error && live === false && (
        <p role="alert" className="mt-1 text-xs text-orange">No live ML-DSA-87 key registered — ineligible as a verifier.</p>
      )}
    </div>
  );
}

export function ItemPreview({ gref }: { gref: GithubRef }) {
  const q = useGithubItem(gref, { staleTime: 60_000 });
  if (q.isPending) return <div className="mt-3 animate-pulse rounded-lg bg-ink/5 p-4 text-sm text-gray">Fetching from GitHub…</div>;
  if (q.error) {
    return <div role="alert" className="mt-3 rounded-lg border border-salmon/40 bg-salmon/5 p-4 text-sm text-ink">
      {q.error instanceof GithubRateLimitError ? q.error.message : "Couldn't fetch that item — check the URL."}
    </div>;
  }
  const d = q.data;
  const warn = gref.kind === 0 && d.state !== "open"
    ? "This issue is closed — contributors usually can't merge against it."
    : gref.kind === 1 && (d as GhPull).merged
      ? "This PR is already merged — a verdict may be signed immediately."
      : gref.kind === 1 && d.state !== "open" ? "This PR is closed without merging." : null;
  return (
    <div className="mt-3 rounded-lg border border-ink/10 bg-white/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{d.title}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${d.state === "open" ? "border-leaf/60 text-deep" : "border-gray/50 text-gray"}`}>{d.state}</span>
        {gref.kind === 1 && (d as GhPull).merged && <span className="rounded-full border border-mustard px-2 py-0.5 text-[10px] text-orange">merged</span>}
      </div>
      <p className="mt-1 font-mono text-xs text-gray">{githubItemLabel(gref)} · {d.user?.login}</p>
      {warn && <p role="alert" className="mt-2 text-sm text-orange">{warn}</p>}
    </div>
  );
}
