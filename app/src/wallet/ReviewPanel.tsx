// The verifier tool: check the claim, check the PR, build a verdict, sign it
// through a PqSigner, merge bundles and relay the quorum — all against chain
// truth (nonce, claimRound, dispute hashes are never user input).
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { hexToBytes, type Hex } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import WalletRoot from "./WalletRoot";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { Countdown, shortAddr } from "../components/ui";
import {
  getAllComments, findClaimComments, findDisputeComments, getPull, getLinkedPrs,
  GithubRateLimitError, type GhPull,
} from "../github/client";
import { parseGithubUrl } from "../github/parse";
import { checkPull, mergedAtSeconds } from "../github/prcheck";
import {
  identityHashOf, payEvidenceHashOf, refundEvidenceHashOf,
  resolutionEvidenceHashOf, disputeEvidenceHashOf, REFUND_REASONS,
} from "../formats/hashes";
import { buildVerdictFor, PHASE, OUTCOME, type BuiltVerdict } from "../chain/verdict";
import { parseBundle, mergeBundles, type VerdictBundle, BUNDLE_FORMAT } from "../formats/verdictBundle";
import { signerStatus, pairingCode, setPairingCode, signerPort, setSignerPort, SignerError } from "../chain/localSigner";
import { localSigner, qorexSigner } from "./pqSigner";
import { useQorex } from "./qorex";
import { pqcKeyStatus } from "../chain/pqc";
import { evmToQor } from "../chain/bech32";
import { ESCROW_ADDRESS, NATIVE_CHAIN_ID, explorerAddress } from "../chain/config";
import type { Bounty } from "../chain/client";
import type { BountyMeta } from "../chain/indexer";


interface PrCheck {
  pr: GhPull; repo: string; number: number;
  checks: { label: string; ok: boolean }[];
}

function sameVerdict(a: BuiltVerdict["verdict"], b: BuiltVerdict["verdict"]) {
  return a.bountyId === b.bountyId && a.phase === b.phase && a.outcome === b.outcome
    && a.payee.toLowerCase() === b.payee.toLowerCase() && a.mergedAt === b.mergedAt
    && a.evidenceHash === b.evidenceHash && a.nonce === b.nonce
    && a.claimRound === b.claimRound
    && a.disputedVerdictHash === b.disputedVerdictHash
    && a.disputeEvidenceHash === b.disputeEvidenceHash;
}

function Panel({ id, bounty, meta }: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  const { address } = useAccount();
  const qorex = useQorex();
  const tx = useTxAction();
  const toast = useToast();

  const phase = bounty.state === 3 ? PHASE.DISPUTE : PHASE.INITIAL;
  const disputed = phase === PHASE.DISPUTE;
  const itemUrl = `https://github.com/${meta.ownerRepo}/${meta.kind === 1 ? "pull" : "issues"}/${meta.number}`;

  // identity check
  const [idScan, setIdScan] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [idErr, setIdErr] = useState<string | null>(null);
  const [identity, setIdentity] = useState<{
    login: string; commentId: bigint; hash: Hex; url: string; matches: boolean;
  } | null>(null);
  // dispute comment (DISPUTE phase)
  const [disputeComment, setDisputeComment] = useState<{
    commentId: bigint; login: string; url: string } | null>(null);

  // PR check
  const [prUrl, setPrUrl] = useState("");
  const [prCheck, setPrCheck] = useState<PrCheck | null>(null);
  const [prErr, setPrErr] = useState<string | null>(null);
  const [prBusy, setPrBusy] = useState(false);
  const [candidates, setCandidates] = useState<number[] | null>(null);

  // decision + signature
  const [refundReason, setRefundReason] = useState<string>(REFUND_REASONS[0]);
  const [refundUrl, setRefundUrl] = useState("");
  const [built, setBuilt] = useState<BuiltVerdict | null>(null);
  const [decision, setDecision] = useState<"pay" | "refund" | null>(null);
  const [buildErr, setBuildErr] = useState<string | null>(null);
  const [sig, setSig] = useState<`0x${string}` | null>(null);
  const [sigIndex, setSigIndex] = useState<number | null>(null);
  const [sigErr, setSigErr] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [pair, setPair] = useState(pairingCode() ?? "");
  const [port, setPort] = useState(String(signerPort()));
  // merged bundle
  const storageKey = `pm-verdict-${ESCROW_ADDRESS}-${id}-${bounty.nonce}-${phase}`;
  const [bundle, setBundle] = useState<VerdictBundle | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? parseBundle(raw) : null;
    } catch { return null; }
  });
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [sigStatus, setSigStatus] = useState<Record<number, "valid" | "invalid" | "key not live" | "pending">>({});

  const myVerifierIndex = useMemo(() => {
    if (!address) return -1;
    return bounty.verifiers.findIndex((v) => v.toLowerCase() === address.toLowerCase());
  }, [address, bounty]);

  const persist = (b: VerdictBundle | null) => {
    setBundle(b);
    if (b) localStorage.setItem(storageKey, JSON.stringify(b, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v));
    else localStorage.removeItem(storageKey);
  };

  // ---- identity scan -------------------------------------------------------
  const scanIdentity = async () => {
    setIdScan("scanning"); setIdErr(null);
    try {
      const comments = await getAllComments(meta.ownerRepo, Number(meta.number));
      if (disputed) {
        // locate the comment that produced the stored disputeEvidenceHash
        for (const c of findDisputeComments(comments)) {
          if (c.escrow === ESCROW_ADDRESS.toLowerCase() && c.bountyId === Number(id)
              && disputeEvidenceHashOf(c.githubLogin, BigInt(c.commentId)) === bounty.disputeEvidenceHash) {
            setDisputeComment({ commentId: BigInt(c.commentId), login: c.githubLogin,
              url: `${itemUrl}#issuecomment-${c.commentId}` });
          }
        }
      }
      const hits = findClaimComments(comments).filter((c) =>
        c.claimant === bounty.payee.toLowerCase() && c.bountyId === Number(id)
        && c.escrow === ESCROW_ADDRESS.toLowerCase());
      if (hits.length === 0) {
        setIdentity(null);
        setIdErr("No claim line from this claimant on the item.");
      } else {
        const c = hits[0]!;
        const hash = identityHashOf(c.githubLogin, bounty.payee, BigInt(c.commentId));
        setIdentity({ login: c.githubLogin, commentId: BigInt(c.commentId), hash,
          url: `${itemUrl}#issuecomment-${c.commentId}`,
          matches: hash === bounty.payeeIdentityHash });
      }
      setIdScan("done");
    } catch (e) {
      setIdErr(e instanceof GithubRateLimitError ? e.message
        : e instanceof Error ? e.message : "GitHub lookup failed.");
      setIdScan("error");
    }
  };

  // ---- PR check ------------------------------------------------------------
  const runPrCheck = async (repo: string, prNumber: number) => {
    setPrBusy(true); setPrErr(null);
    try {
      const pr = await getPull(repo, prNumber);
      const checks = checkPull(pr, {
        expectedRepo: meta.ownerRepo, prRepo: repo, deadline: bounty.deadline,
        identityLogin: identity?.login ?? null });
      setPrCheck({ pr, repo, number: prNumber, checks });
    } catch (e) {
      setPrCheck(null);
      setPrErr(e instanceof GithubRateLimitError ? e.message
        : e instanceof Error ? e.message : "PR lookup failed.");
    } finally { setPrBusy(false); }
  };

  const loadCandidates = async () => {
    setPrBusy(true); setPrErr(null);
    try {
      if (meta.kind === 1) { setCandidates([Number(meta.number)]); await runPrCheck(meta.ownerRepo, Number(meta.number)); }
      else setCandidates(await getLinkedPrs(meta.ownerRepo, Number(meta.number)));
    } catch (e) {
      setPrErr(e instanceof GithubRateLimitError ? e.message
        : e instanceof Error ? e.message : "Timeline lookup failed.");
    } finally { setPrBusy(false); }
  };

  const parsePr = () => {
    const p = parseGithubUrl(prUrl);
    if (!p || p.kind !== 1) { setPrErr("Paste a GitHub pull-request URL."); return; }
    void runPrCheck(p.ownerRepo, p.number);
  };

  // ---- decision ------------------------------------------------------------
  const buildDecision = async (kind: "pay" | "refund") => {
    setBuildErr(null); setDecision(kind);
    try {
      let evidenceHash: Hex;
      if (kind === "pay") {
        if (!prCheck) throw new Error("Run the PR check first — its fields build the evidence hash.");
        const mergedAt = mergedAtSeconds(prCheck.pr);
        const basis = payEvidenceHashOf(prCheck.repo, prCheck.number,
          prCheck.pr.merge_commit_sha ?? "", mergedAt, prCheck.pr.user.login);
        evidenceHash = disputed
          ? resolutionEvidenceHashOf(disputeComment!.commentId, basis) : basis;
        setBuilt(await buildVerdictFor({
          bountyId: id, bounty, phase, outcome: OUTCOME.PAY, evidenceHash, mergedAt,
        }));
      } else {
        const basis = refundEvidenceHashOf(refundReason, refundUrl);
        evidenceHash = disputed
          ? resolutionEvidenceHashOf(disputeComment!.commentId, basis) : basis;
        setBuilt(await buildVerdictFor({
          bountyId: id, bounty, phase, outcome: OUTCOME.REFUND, evidenceHash,
        }));
      }
      setSig(null); setSigIndex(null);
    } catch (e) {
      setBuildErr(e instanceof Error ? e.message : String(e));
    }
  };

  // ---- signing -------------------------------------------------------------
  const sign = async () => {
    if (!built) return;
    setSigning(true); setSigErr(null);
    try {
      const signer = qorex.canSignArbitrary && qorex.native && qorex.qorAddress
        ? qorexSigner(qorex.native, qorex.qorAddress) : localSigner;
      let index = -1;
      if (signer.id === "local") {
        const st = await signerStatus();
        index = bounty.verifiers.findIndex((v) => v.toLowerCase() === st.address.toLowerCase());
        if (index < 0) throw new SignerError(422,
          `The local signer holds ${st.address}, which is not a verifier on this bounty.`);
        if (!st.live) throw new SignerError(422, "The signer's key is not live on diana.");
      } else {
        index = bounty.verifiers.findIndex((v) => evmToQor(v) === qorex.qorAddress);
        if (index < 0) throw new Error("The QoreX identity is not a verifier on this bounty.");
      }
      const signature = await signer.signVerdict({ verdict: built.verdict, message: built.message });
      const key = await pqcKeyStatus(bounty.verifiers[index]!);
      if (!key.live) throw new Error(`Verifier #${index}'s ML-DSA-87 key is not live on diana.`);
      const ok = await mldsa87.verify(hexToBytes(key.pubkey), hexToBytes(built.message), hexToBytes(signature));
      if (!ok) {
        throw new Error("The returned signature failed local ML-DSA-87 verification — refusing to record it.");
      }
      setSig(signature); setSigIndex(index);
      // record straight into the working bundle
      const b: VerdictBundle = {
        format: BUNDLE_FORMAT, chainId: 9800, nativeChainId: NATIVE_CHAIN_ID,
        escrow: ESCROW_ADDRESS, verdict: built.verdict, message: built.message,
        signatures: { ...(bundle?.signatures ?? {}), [index]: signature },
      };
      persist(b);
      void refreshSigStatus(b);
    } catch (e) {
      setSigErr(e instanceof Error ? e.message : String(e));
    } finally { setSigning(false); }
  };

  const refreshSigStatus = async (b: VerdictBundle | null) => {
    const next: typeof sigStatus = {};
    if (b) {
      for (const [i, s] of Object.entries(b.signatures)) {
        const idx = Number(i); next[idx] = "pending";
        try {
          const key = await pqcKeyStatus(bounty.verifiers[idx]!);
          next[idx] = !key.live ? "key not live"
            : (await mldsa87.verify(hexToBytes(key.pubkey), hexToBytes(b.message), hexToBytes(s)))
              ? "valid" : "invalid";
        } catch { next[idx] = "invalid"; }
      }
    }
    setSigStatus(next);
  };

  // ---- import / merge ------------------------------------------------------
  const importBundle = async () => {
    setImportErr(null);
    try {
      if (!built) throw new Error("Build a decision first — imports must match this exact verdict.");
      const b = parseBundle(importText);
      if (b.escrow.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) throw new Error("bundle targets a different escrow");
      if (b.message !== built.message) throw new Error("bundle signs different message bytes");
      if (!sameVerdict(b.verdict, built.verdict)) throw new Error("bundle verdict fields differ");
      const dups = Object.keys(b.signatures).filter((i) => bundle?.signatures[i]);
      const merged = mergeBundles([{ ...(bundle ?? b) , signatures: { ...(bundle?.signatures ?? {}) } }, b]);
      persist(merged);
      await refreshSigStatus(merged);
      toast({ kind: "info", text: `Bundle merged${dups.length ? ` (duplicate signer index ${dups.join(", ")} ignored)` : ""}.` });
      setImportText("");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : String(e));
    }
  };

  const bundleJson = bundle ? JSON.stringify(bundle, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2) : "";
  const validCount = Object.values(sigStatus).filter((s) => s === "valid").length;
  const download = () => {
    const blob = new Blob([bundleJson], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `postmark-verdict-${id}-${bounty.nonce}-${phase}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const submit = () => {
    if (!bundle) return;
    const indices = Object.keys(bundle.signatures).map(Number)
      .filter((i) => sigStatus[i] === "valid").sort((a, b) => a - b);
    const sigs = indices.map((i) => bundle.signatures[i]!);
    tx.run({
      functionName: disputed ? "resolveDispute" : "submitVerdict",
      args: [{
        bountyId: built!.verdict.bountyId, phase: built!.verdict.phase,
        outcome: built!.verdict.outcome, payee: built!.verdict.payee,
        mergedAt: built!.verdict.mergedAt, evidenceHash: built!.verdict.evidenceHash,
        nonce: built!.verdict.nonce, claimRound: built!.verdict.claimRound,
      }, indices, sigs],
      onConfirmed: () => {
        toast({ kind: "info", text: disputed ? "Dispute resolved on chain." : "Verdict stamped on chain." });
        persist(null);
      },
      invalidates: [["bounty", id.toString()], ["index"], ["bounties"], ["nextBountyId"]],
    });
  };

  const warningCount = prCheck?.checks.filter((c) => !c.ok).length ?? 0;

  return (
    <div className="space-y-6">
      {/* claim under review */}
      <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">
          {disputed ? "disputed claim" : "claim under review"}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 font-mono text-sm">
          <div><div className="text-[10px] uppercase text-gray">claimant</div>
            <a className="text-ink hover:text-deep" href={explorerAddress(bounty.payee)} target="_blank" rel="noreferrer">{shortAddr(bounty.payee)}</a></div>
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
      </div>

      {/* identity check */}
      <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">identity check</h2>
        <p className="mt-2 text-sm text-gray">
          Scan <a className="text-deep underline underline-offset-4" href={itemUrl} target="_blank" rel="noreferrer">
            {meta.ownerRepo}{meta.kind === 1 ? "/pull/" : "#"}{meta.number.toString()}</a> comments for
          the claimant's <code className="text-ink">postmark-claim v1</code> line
          {disputed && " and the disputer's postmark-dispute line"}.
        </p>
        <button type="button" onClick={() => void scanIdentity()} disabled={idScan === "scanning"}
          className="mt-3 rounded-lg border border-salmon/50 px-4 py-2 text-sm text-deep hover:bg-salmon/10 disabled:opacity-40">
          {idScan === "scanning" ? "Scanning…" : "Scan comments"}
        </button>
        {idErr && <p role="alert" className="mt-2 text-sm text-orange">{idErr}</p>}
        {identity && (
          <p className="mt-2 text-sm">
            {identity.matches
              ? <span className="text-deep">identity matches — @{identity.login}, comment {identity.commentId.toString()}</span>
              : <span className="text-deep">identity mismatch — recomputed hash ≠ stored payeeIdentityHash (@{identity.login})</span>}
            {" "}<a className="underline decoration-dotted hover:text-deep" href={identity.url} target="_blank" rel="noreferrer">comment</a>
          </p>
        )}
        {disputed && idScan === "done" && (
          disputeComment
            ? <p className="mt-2 text-sm text-gray">dispute comment by @{disputeComment.login} ·{" "}
                <a className="underline decoration-dotted hover:text-deep" href={disputeComment.url} target="_blank" rel="noreferrer">comment {disputeComment.commentId.toString()}</a></p>
            : <p className="mt-2 text-sm text-orange">No comment re-hashes to the stored disputeEvidenceHash — resolution evidence can't be built.</p>
        )}
      </div>

      {/* PR check */}
      <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">pull request check</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void loadCandidates()} disabled={prBusy}
            className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-gray hover:bg-ink/5 disabled:opacity-40">
            {meta.kind === 1 ? "Check this PR" : "Find linked PRs"}
          </button>
          {meta.kind === 0 && (
            <span className="flex flex-wrap items-center gap-2 text-sm text-gray">
              or
              <input value={prUrl} onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/9"
                className="min-w-0 w-full sm:w-72 rounded-lg border border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink" />
              <button type="button" onClick={parsePr} disabled={prBusy}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm text-gray hover:bg-ink/5 disabled:opacity-40">check</button>
            </span>
          )}
        </div>
        {candidates && meta.kind === 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {candidates.length === 0 && <p className="text-sm text-gray">No cross-referenced PRs — paste one.</p>}
            {candidates.map((n) => (
              <button key={n} type="button" onClick={() => void runPrCheck(meta.ownerRepo, n)}
                className="rounded-full border border-ink/15 px-3 py-1 font-mono text-xs text-ink hover:border-salmon/50">
                #{n}
              </button>
            ))}
          </div>
        )}
        {prErr && <p role="alert" className="mt-2 text-sm text-orange">{prErr}</p>}
        {prCheck && (
          <ul className="mt-3 space-y-1 text-sm">
            {prCheck.checks.map((c) => (
              <li key={c.label} className={c.ok ? "text-deep" : "text-orange"}>
                {c.ok ? "✓" : "✗"} {c.label}
              </li>
            ))}
            <li className="text-gray font-mono text-xs pt-1">
              {prCheck.repo}#{prCheck.number} · by @{prCheck.pr.user.login}
              {prCheck.pr.merged_at && ` · merged ${new Date(prCheck.pr.merged_at).toLocaleString()}`}
            </li>
          </ul>
        )}
        {warningCount > 0 && (
          <p className="mt-2 text-xs text-orange">{warningCount} check{warningCount > 1 ? "s" : ""} failed — warnings only; the verdict is your judgment.</p>
        )}
      </div>

      {/* decision */}
      <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">
          {disputed ? "resolution verdict" : "verdict"}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void buildDecision("pay")}
            disabled={!prCheck || (disputed && !disputeComment)}
            className="rounded-lg bg-deep px-4 py-2 text-sm font-medium text-paper hover:brightness-110 disabled:opacity-40">
            {disputed ? "Resolve PAY" : "PAY"}
          </button>
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <select value={refundReason} onChange={(e) => setRefundReason(e.target.value)}
              className="rounded-lg border border-ink/10 bg-paper px-2 py-2 font-mono text-xs text-ink">
              {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={refundUrl} onChange={(e) => setRefundUrl(e.target.value)} placeholder="details URL (optional)"
              className="min-w-0 w-full sm:w-56 rounded-lg border border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink" />
            <button type="button" onClick={() => void buildDecision("refund")}
              disabled={disputed && !disputeComment}
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-gray hover:bg-ink/5 disabled:opacity-40">
              {disputed ? "Resolve REFUND" : "REFUND"}
            </button>
          </span>
        </div>
        {disputed && !disputeComment && idScan !== "done" && (
          <p className="mt-2 text-xs text-gray">Scan comments first — the dispute comment id feeds the resolution evidence.</p>
        )}
        {buildErr && <p role="alert" className="mt-2 text-sm text-deep">{buildErr}</p>}
        {built && (
          <div className="mt-3 rounded-lg border border-ink/10 bg-paper p-3 font-mono text-xs text-gray break-all">
            <div>phase {disputed ? "DISPUTE" : "INITIAL"} · outcome {decision === "pay" ? "PAY" : "REFUND"}</div>
            <div>payee {built.verdict.payee} · mergedAt {built.verdict.mergedAt.toString()}</div>
            <div className="break-all">evidenceHash {built.verdict.evidenceHash}</div>
            <div>nonce {built.verdict.nonce.toString()} · claimRound {built.verdict.claimRound.toString()}</div>
            {disputed && <div className="break-all">binds dispute {built.verdict.disputedVerdictHash.slice(0, 18)}… + {built.verdict.disputeEvidenceHash.slice(0, 18)}…</div>}
            <div className="text-deep">message matches escrow.verdictMessage</div>
          </div>
        )}
      </div>

      {/* sign */}
      {built && (
        <div className="rounded-xl border border-salmon/30 bg-white/70 p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-deep">sign the verdict</h2>
          {myVerifierIndex >= 0 && (
            <p className="mt-2 text-xs text-gray">You are verifier #{myVerifierIndex}.</p>
          )}
          {!(qorex.canSignArbitrary && qorex.qorAddress) && (
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
          <button type="button" onClick={() => void sign()} disabled={signing}
            className="mt-3 rounded-lg border border-salmon/50 px-4 py-2 text-sm text-deep hover:bg-salmon/10 disabled:opacity-40">
            {signing ? "Signing…" : "Sign with the local signer"}
          </button>
          {sigErr && <p role="alert" className="mt-2 text-sm text-deep">{sigErr}</p>}
          {sig && sigIndex !== null && (
            <p className="mt-2 text-sm text-deep">Signature #{sigIndex} verified locally against the live key.</p>
          )}
        </div>
      )}

      {/* bundle */}
      {built && (
        <div className="rounded-xl border border-ink/10 bg-white/70 p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">verdict bundle</h2>
          <div className="mt-2 space-y-1 font-mono text-xs">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <a className="text-ink hover:text-deep" href={explorerAddress(bounty.verifiers[i]!)} target="_blank" rel="noreferrer">
                  verifier {i} · {shortAddr(bounty.verifiers[i])}</a>
                <span className={
                  sigStatus[i] === "valid" ? "text-deep"
                  : sigStatus[i] === "invalid" || sigStatus[i] === "key not live" ? "text-deep"
                  : bundle?.signatures[i] ? "text-gray" : "text-gray"}>
                  {bundle?.signatures[i] ? (sigStatus[i] ?? "pending") : "—"}
                </span>
              </div>
            ))}
          </div>
          {bundle && (
            <>
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-ink/10 bg-paper p-3 font-mono text-[10px] text-gray">{bundleJson}</pre>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => { void navigator.clipboard.writeText(bundleJson); toast({ kind: "info", text: "Bundle copied." }); }}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-gray hover:bg-ink/5">Copy JSON</button>
                <button type="button" onClick={download}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-gray hover:bg-ink/5">Download .json</button>
              </div>
            </>
          )}
          <div className="mt-4">
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
              placeholder="paste another verifier's bundle JSON to merge"
              className="h-24 w-full rounded-lg border border-ink/10 bg-paper p-3 font-mono text-xs text-ink" />
            <button type="button" onClick={() => void importBundle()}
              className="mt-2 rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-gray hover:bg-ink/5">Import & merge</button>
            {importErr && <p role="alert" className="mt-2 text-sm text-deep">{importErr}</p>}
          </div>
          <button type="button" onClick={submit} disabled={validCount < 2}
            className="mt-4 rounded-lg bg-deep px-5 py-2 text-sm font-medium text-paper hover:brightness-110 disabled:opacity-40">
            {disputed ? `Submit resolution (${validCount}/3 valid)` : `Submit verdict (${validCount}/3 valid)`}
          </button>
          {validCount >= 2 && (
            <p className="mt-1 text-xs text-gray">Anyone can relay this — signatures prove themselves.</p>
          )}
          <TxStatusPanel state={tx.state} />
        </div>
      )}
    </div>
  );
}

export default function ReviewPanel(props: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  return <WalletRoot><Panel {...props} /></WalletRoot>;
}
