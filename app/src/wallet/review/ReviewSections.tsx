import { useState, type ReactNode } from "react";
import { AddressLink, Card, Countdown, SectionLabel, shortAddr } from "../../components/ui";
import { githubItemLabel, githubItemUrl } from "../../github/parse";
import { REFUND_REASONS } from "../../formats/hashes";
import { pairingCode, setPairingCode, signerPort, setSignerPort } from "../../chain/localSigner";
import { explorerAddress } from "../../chain/config";
import type { Bounty } from "../../chain/client";
import type { BountyMeta } from "../../chain/indexer";
import type { BuiltVerdict } from "../../chain/verdict";
import type { SigStatus } from "./useVerdictBundle";
import type { ClaimIdentity, DisputeComment } from "./useIdentityCheck";
import type { PrCheck } from "./usePrCheck";

const GHOST_BTN = "rounded-lg border border-ink/15 text-gray hover:bg-ink/5 disabled:opacity-40";
const SOLID_BTN = "rounded-lg bg-deep font-medium text-paper hover:brightness-110 disabled:opacity-40";
const ACCENT_BTN = "rounded-lg border border-salmon/50 px-4 py-2 text-sm text-deep hover:bg-salmon/10 disabled:opacity-40";
const TEXT_INPUT = "rounded-lg border border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink";
const COMMENT_LINK = "underline decoration-dotted hover:text-deep";

const Alert = ({ children }: { children: ReactNode }) =>
  <p role="alert" className="mt-2 text-sm text-orange">{children}</p>;

export function ClaimUnderReview({ bounty, disputed }: { bounty: Bounty; disputed: boolean }) {
  return (
    <Card>
      <SectionLabel>{disputed ? "disputed claim" : "claim under review"}</SectionLabel>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 font-mono text-sm">
        <div><div className="text-[10px] uppercase text-gray">claimant</div>
          <AddressLink address={bounty.payee} className="text-ink hover:text-deep" /></div>
        <div><div className="text-[10px] uppercase text-gray">round</div><span className="text-ink">{bounty.claimRound.toString()}</span></div>
        <div><div className="text-[10px] uppercase text-gray">{disputed ? "challenge ends" : "claim expires"}</div>
          <Countdown to={disputed ? bounty.challengeEndsAt : bounty.claimExpiresAt} /></div>
        <div><div className="text-[10px] uppercase text-gray">identity hash</div>
          <span className="text-ink">{bounty.payeeIdentityHash.slice(0, 18)}…</span></div>
      </div>
      {disputed && (
        <p className="mt-3 text-xs text-gray">
          The initial verdict ({bounty.initialOutcome === 0 ? "PAY" : "REFUND"}) is frozen.
          A DISPUTE verdict that changes the outcome <em>upholds</em> the dispute — the disputer
          gets bond + challenge reward. One that repeats it <em>rejects</em> the dispute — the bond
          goes to the payee (or funder if none) and the reward to the funder.
        </p>
      )}
    </Card>
  );
}

export function IdentityCard({ meta, disputed, status, error, identity, disputeComment, onScan }: {
  meta: BountyMeta; disputed: boolean; status: string; error: string | null;
  identity: ClaimIdentity | null; disputeComment: DisputeComment | null; onScan: () => void;
}) {
  return (
    <Card>
      <SectionLabel>identity check</SectionLabel>
      <p className="mt-2 text-sm text-gray">
        Scan <a className="text-deep underline underline-offset-4" href={githubItemUrl(meta)} target="_blank" rel="noreferrer">
          {githubItemLabel(meta)}</a> comments for
        the claimant's <code className="text-ink">postmark-claim v1</code> line
        {disputed && " and the disputer's postmark-dispute line"}.
      </p>
      <button type="button" onClick={onScan} disabled={status === "scanning"}
        className={`mt-3 ${ACCENT_BTN}`}>
        {status === "scanning" ? "Scanning…" : "Scan comments"}
      </button>
      {error && <Alert>{error}</Alert>}
      {identity && (
        <p className="mt-2 text-sm">
          {identity.matches
            ? <span className="text-deep">identity matches — @{identity.login}, comment {identity.commentId.toString()}</span>
            : <span className="text-orange">identity mismatch — recomputed hash ≠ stored payeeIdentityHash (@{identity.login})</span>}
          {" "}<a className={COMMENT_LINK} href={identity.url} target="_blank" rel="noreferrer">comment</a>
        </p>
      )}
      {disputed && status === "done" && (
        disputeComment
          ? <p className="mt-2 text-sm text-gray">dispute comment by @{disputeComment.login} ·{" "}
              <a className={COMMENT_LINK} href={disputeComment.url} target="_blank" rel="noreferrer">comment {disputeComment.commentId.toString()}</a></p>
          : <p className="mt-2 text-sm text-orange">No comment re-hashes to the stored disputeEvidenceHash — resolution evidence can't be built.</p>
      )}
    </Card>
  );
}

export function PrCheckCard({ meta, pr }: { meta: BountyMeta; pr: {
  prUrl: string; setPrUrl: (v: string) => void; prCheck: PrCheck | null; error: string | null;
  busy: boolean; candidates: number[] | null; check: (repo: string, n: number) => Promise<void>;
  loadCandidates: () => Promise<void>; checkPastedUrl: () => void;
} }) {
  const failed = pr.prCheck?.checks.filter((c) => !c.ok).length ?? 0;
  return (
    <Card>
      <SectionLabel>pull request check</SectionLabel>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void pr.loadCandidates()} disabled={pr.busy}
          className={`${GHOST_BTN} px-3 py-2 text-sm`}>
          {meta.kind === 1 ? "Check this PR" : "Find linked PRs"}
        </button>
        {meta.kind === 0 && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-gray">
            or
            <input value={pr.prUrl} onChange={(e) => pr.setPrUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/pull/9"
              className={`min-w-0 w-full sm:w-72 ${TEXT_INPUT}`} />
            <button type="button" onClick={pr.checkPastedUrl} disabled={pr.busy}
              className={`${GHOST_BTN} px-3 py-2 text-sm`}>check</button>
          </span>
        )}
      </div>
      {pr.candidates && meta.kind === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pr.candidates.length === 0 && <p className="text-sm text-gray">No cross-referenced PRs — paste one.</p>}
          {pr.candidates.map((n) => (
            <button key={n} type="button" onClick={() => void pr.check(meta.ownerRepo, n)}
              className="rounded-full border border-ink/15 px-3 py-1 font-mono text-xs text-ink hover:border-salmon/50">
              #{n}
            </button>
          ))}
        </div>
      )}
      {pr.error && <Alert>{pr.error}</Alert>}
      {pr.prCheck && (
        <ul className="mt-3 space-y-1 text-sm">
          {pr.prCheck.checks.map((c) => (
            <li key={c.label} className={c.ok ? "text-deep" : "text-orange"}>
              {c.ok ? "✓" : "✗"} {c.label}
            </li>
          ))}
          <li className="text-gray font-mono text-xs pt-1">
            {pr.prCheck.repo}#{pr.prCheck.number} · by @{pr.prCheck.pr.user.login}
            {pr.prCheck.pr.merged_at && ` · merged ${new Date(pr.prCheck.pr.merged_at).toLocaleString()}`}
          </li>
        </ul>
      )}
      {failed > 0 && (
        <p className="mt-2 text-xs text-orange">{failed} check{failed > 1 ? "s" : ""} failed — warnings only; the verdict is your judgment.</p>
      )}
    </Card>
  );
}

export function DecisionCard({ disputed, canPay, canResolve, scanDone, builder, built }: {
  disputed: boolean; canPay: boolean; canResolve: boolean; scanDone: boolean;
  builder: {
    decision: "pay" | "refund" | null; error: string | null;
    refundReason: string; setRefundReason: (v: string) => void;
    refundUrl: string; setRefundUrl: (v: string) => void;
    buildDecision: (k: "pay" | "refund") => Promise<void>;
  };
  built: BuiltVerdict | null;
}) {
  return (
    <Card>
      <SectionLabel>{disputed ? "resolution verdict" : "verdict"}</SectionLabel>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void builder.buildDecision("pay")} disabled={!canPay}
          className={`${SOLID_BTN} px-4 py-2 text-sm`}>
          {disputed ? "Resolve PAY" : "PAY"}
        </button>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <select value={builder.refundReason} onChange={(e) => builder.setRefundReason(e.target.value)}
            className="rounded-lg border border-ink/10 bg-paper px-2 py-2 font-mono text-xs text-ink">
            {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input value={builder.refundUrl} onChange={(e) => builder.setRefundUrl(e.target.value)} placeholder="details URL (optional)"
            className={`min-w-0 w-full sm:w-56 ${TEXT_INPUT}`} />
          <button type="button" onClick={() => void builder.buildDecision("refund")} disabled={!canResolve}
            className={`${GHOST_BTN} px-4 py-2 text-sm`}>
            {disputed ? "Resolve REFUND" : "REFUND"}
          </button>
        </span>
      </div>
      {disputed && !canResolve && !scanDone && (
        <p className="mt-2 text-xs text-gray">Scan comments first — the dispute comment id feeds the resolution evidence.</p>
      )}
      {builder.error && <Alert>{builder.error}</Alert>}
      {built && (
        <div className="mt-3 rounded-lg border border-ink/10 bg-paper p-3 font-mono text-xs text-gray break-all">
          <div>phase {disputed ? "DISPUTE" : "INITIAL"} · outcome {builder.decision === "pay" ? "PAY" : "REFUND"}</div>
          <div>payee {built.verdict.payee} · mergedAt {built.verdict.mergedAt.toString()}</div>
          <div className="break-all">evidenceHash {built.verdict.evidenceHash}</div>
          <div>nonce {built.verdict.nonce.toString()} · claimRound {built.verdict.claimRound.toString()}</div>
          {disputed && <div className="break-all">binds dispute {built.verdict.disputedVerdictHash.slice(0, 18)}… + {built.verdict.disputeEvidenceHash.slice(0, 18)}…</div>}
          <div className="text-deep">message matches escrow.verdictMessage</div>
        </div>
      )}
    </Card>
  );
}

export function SignCard({ myVerifierIndex, usesQorex, signing, error, signedIndex, onSign }: {
  myVerifierIndex: number; usesQorex: boolean; signing: boolean;
  error: string | null; signedIndex: number | null; onSign: () => void;
}) {
  const [pair, setPair] = useState(pairingCode() ?? "");
  const [port, setPort] = useState(String(signerPort()));
  return (
    <Card tone="accent">
      <SectionLabel tone="accent">sign the verdict</SectionLabel>
      {myVerifierIndex >= 0 && (
        <p className="mt-2 text-xs text-gray">You are verifier #{myVerifierIndex}.</p>
      )}
      {!usesQorex && (
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-xs text-gray">
          <label>Pairing code
            <input value={pair} onChange={(e) => { setPair(e.target.value); setPairingCode(e.target.value); }}
              placeholder="8-char code"
              className="ml-2 w-32 rounded border border-ink/10 bg-paper px-2 py-1 text-ink" /></label>
          <label>port
            <input value={port} onChange={(e) => { setPort(e.target.value); setSignerPort(Number(e.target.value)); }}
              className="ml-2 w-20 rounded border border-ink/10 bg-paper px-2 py-1 text-ink" /></label>
          <span className="text-gray">the signer's address must be one of this bounty's verifiers</span>
        </div>
      )}
      <button type="button" onClick={onSign} disabled={signing} className={`mt-3 ${ACCENT_BTN}`}>
        {signing ? "Signing…" : "Sign with the local signer"}
      </button>
      {error && <Alert>{error}</Alert>}
      {signedIndex !== null && (
        <p className="mt-2 text-sm text-deep">Signature #{signedIndex} verified locally against the live key.</p>
      )}
    </Card>
  );
}

const SIG_STATUS_TONE: Record<SigStatus, string> = {
  valid: "text-deep", invalid: "text-orange", "key not live": "text-orange", pending: "text-gray",
};

export function BundleCard({ bounty, disputed, bundleView, onSubmit, onCopy, children }: {
  bounty: Bounty; disputed: boolean;
  bundleView: {
    bundle: { signatures: Record<number, string> } | null; bundleJson: string;
    sigStatus: Record<number, SigStatus>; validIndices: number[];
    importText: string; setImportText: (v: string) => void; importErr: string | null;
    importBundle: () => Promise<void>; download: () => void;
  };
  onSubmit: () => void; onCopy: () => void; children: ReactNode;
}) {
  const v = bundleView;
  const validCount = v.validIndices.length;
  return (
    <Card>
      <SectionLabel>verdict bundle</SectionLabel>
      <div className="mt-2 space-y-1 font-mono text-xs">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <a className="text-ink hover:text-deep" href={explorerAddress(bounty.verifiers[i]!)} target="_blank" rel="noreferrer">
              verifier {i} · {shortAddr(bounty.verifiers[i])}</a>
            <span className={v.sigStatus[i] ? SIG_STATUS_TONE[v.sigStatus[i]!] : "text-gray"}>
              {v.bundle?.signatures[i] ? (v.sigStatus[i] ?? "pending") : "—"}
            </span>
          </div>
        ))}
      </div>
      {v.bundle && (
        <>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-ink/10 bg-paper p-3 font-mono text-[10px] text-gray">{v.bundleJson}</pre>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onCopy} className={`${GHOST_BTN} px-3 py-1.5 text-xs`}>Copy JSON</button>
            <button type="button" onClick={v.download} className={`${GHOST_BTN} px-3 py-1.5 text-xs`}>Download .json</button>
          </div>
        </>
      )}
      <div className="mt-4">
        <textarea value={v.importText} onChange={(e) => v.setImportText(e.target.value)}
          placeholder="paste another verifier's bundle JSON to merge"
          className="h-24 w-full rounded-lg border border-ink/10 bg-paper p-3 font-mono text-xs text-ink" />
        <button type="button" onClick={() => void v.importBundle()}
          className={`mt-2 ${GHOST_BTN} px-3 py-1.5 text-xs`}>Import & merge</button>
        {v.importErr && <Alert>{v.importErr}</Alert>}
      </div>
      <button type="button" onClick={onSubmit} disabled={validCount < 2}
        className={`mt-4 ${SOLID_BTN} px-5 py-2 text-sm`}>
        {disputed ? `Submit resolution (${validCount}/3 valid)` : `Submit verdict (${validCount}/3 valid)`}
      </button>
      {validCount >= 2 && (
        <p className="mt-1 text-xs text-gray">Anyone can relay this — signatures prove themselves.</p>
      )}
      {children}
    </Card>
  );
}
