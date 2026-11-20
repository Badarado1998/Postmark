import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { hexToBytes } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import WalletRoot from "./WalletRoot";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { claimMessage } from "../formats/messages";
import { identityHashOf } from "../formats/hashes";
import { getAllComments, findClaimComments, GithubRateLimitError } from "../github/client";
import { pqcKeyStatus } from "../chain/pqc";
import { signerStatus, pairingCode, setPairingCode, SignerError } from "../chain/localSigner";
import { localSigner, qorexSigner } from "./pqSigner";
import { useQorex } from "./qorex";
import { usePqcStatus } from "../hooks/queries";
import { shortAddr } from "../components/ui";
import { ESCROW_ADDRESS } from "../chain/config";
import type { Bounty } from "../chain/client";
import type { BountyMeta } from "../chain/indexer";

const now = () => BigInt(Math.floor(Date.now() / 1000));

export function claimLine(bountyId: bigint, claimant: `0x${string}`, escrow: `0x${string}`) {
  return `postmark-claim v1 chain=9800 escrow=${escrow.toLowerCase()} bounty=${bountyId} claimant=${claimant.toLowerCase()}`;
}

type Step = "identity" | "scan" | "signature" | "send";

function Panel({ id, bounty, meta }: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  const { address } = useAccount();
  const qorex = useQorex();
  const myKey = usePqcStatus(address);
  const tx = useTxAction();
  const toast = useToast();

  const [step, setStep] = useState<Step>("identity");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [claim, setClaim] = useState<{
    login: string; commentId: bigint; identityHash: `0x${string}`; commentUrl: string;
  } | null>(null);
  const [pair, setPair] = useState(pairingCode() ?? "");
  const [sigStatus, setSigStatus] = useState<{
    ok: boolean; text: string } | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const line = useMemo(
    () => (address ? claimLine(id, address, ESCROW_ADDRESS) : ""), [id, address]);

  if (!address) return null;
  const me = address.toLowerCase();
  if (me === bounty.funder.toLowerCase()
      || bounty.verifiers.some((v) => v.toLowerCase() === me)) {
    return (
      <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5 text-sm text-ink-300">
        Funders and verifiers cannot claim their own bounty.
      </div>
    );
  }
  const t = now();
  if (t >= bounty.deadline) {
    return (
      <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5 text-sm text-ink-300">
        Claiming is closed — the deadline has passed.
      </div>
    );
  }
  if (bounty.claimTimeout > bounty.deadline - t) {
    return (
      <div className="rounded-xl border border-white/10 bg-ink-900/60 p-5 text-sm text-ink-300">
        The claim window no longer fits before the deadline.
      </div>
    );
  }

  const itemUrl = `https://github.com/${meta.ownerRepo}/${meta.kind === 1 ? "pull" : "issues"}/${meta.number}`;

  const scan = async () => {
    setScanning(true); setScanError(null);
    try {
      const comments = await getAllComments(meta.ownerRepo, Number(meta.number));
      const hits = findClaimComments(comments).filter((c) =>
        c.claimant === me && c.bountyId === Number(id)
        && c.escrow === ESCROW_ADDRESS.toLowerCase());
      if (hits.length === 0) {
        setScanError("No claim line from your address on this item yet — post the comment first, then rescan.");
        return;
      }
      // multiple matches: take the earliest comment (comments arrive chronologically)
      const c = hits[0]!;
      const extra = hits.length > 1 ? ` (${hits.length - 1} later claim line${hits.length > 2 ? "s" : ""} ignored)` : "";
      setClaim({
        login: c.githubLogin, commentId: BigInt(c.commentId),
        identityHash: identityHashOf(c.githubLogin, address, BigInt(c.commentId)),
        commentUrl: `https://github.com/${meta.ownerRepo}/${meta.kind === 1 ? "pull" : "issues"}/${meta.number}#issuecomment-${c.commentId}`,
      });
      setSigStatus({ ok: true, text: `Found the claim line by @${c.githubLogin} (comment ${c.commentId})${extra}.` });
      setStep("signature");
    } catch (e) {
      setScanError(e instanceof GithubRateLimitError ? e.message
        : e instanceof Error ? e.message : "GitHub lookup failed.");
    } finally { setScanning(false); }
  };

  const sign = async () => {
    if (!claim) return;
    setSigning(true); setSignError(null);
    try {
      const claimRound = bounty.claimRound + 1n;
      const message = claimMessage(id, address, claim.identityHash, claimRound);
      const signer = qorex.canSignArbitrary && qorex.native && qorex.qorAddress
        ? qorexSigner(qorex.native, qorex.qorAddress)
        : localSigner;
      if (signer.id === "local") {
        const st = await signerStatus();
        if (st.address.toLowerCase() !== me) {
          throw new SignerError(422,
            `The local signer holds ${st.address}, but the connected account is ${address}.`);
        }
        if (!st.live) throw new SignerError(422, "The signer's key is not live on diana.");
      }
      const signature = await signer.sign({
        bountyId: id, identityHash: claim.identityHash, claimRound, message });
      // verify locally before the wallet ever opens
      const key = await pqcKeyStatus(address);
      if (!key.live) throw new Error("Your ML-DSA-87 key is not live on diana.");
      const ok = mldsa87.verify(hexToBytes(key.pubkey), hexToBytes(message), hexToBytes(signature));
      if (!ok) {
        throw new Error("The returned signature failed local ML-DSA-87 verification — refusing to send it. Check the signer's key matches your account.");
      }
      setSignature(signature);
      setStep("send");
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
    } finally { setSigning(false); }
  };

  const send = () => {
    if (!claim || !signature) return;
    void tx.run({
      functionName: "claim",
      args: [id, claim.identityHash, signature],
      onConfirmed: () => toast({ kind: "info", text: "Claim stamped on chain." }),
      invalidates: [["bounty", id.toString()], ["index"], ["nextBountyId"]],
    });
  };

  const busy = ["checking", "simulating", "wallet", "submitted", "confirming"].includes(tx.state.phase);

  return (
    <div className="rounded-xl border border-vermilion/30 bg-ink-900/60 p-5">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-vermilion">claim this bounty</h2>

      {/* pairing — shown up front so the signer is ready before the signature step */}
      {!(qorex.canSignArbitrary && qorex.qorAddress) && (
        <div className="mt-3">
          <label className="block font-mono text-xs text-ink-300">
            Pairing code — the 8 characters printed by `signer serve`
            <input value={pair} onChange={(e) => { setPair(e.target.value); setPairingCode(e.target.value); }}
              className="ml-2 w-32 rounded border border-white/10 bg-ink-950 px-2 py-1 font-mono text-paper-100"
              placeholder="8-char code" />
          </label>
          <p className="mt-1 text-xs text-ink-400">
            Run <code className="text-paper-200">npm run signer -- serve --env ~/.config/postmark/&lt;profile&gt;</code> locally.{" "}
            <a href="/signer" className="text-vermilion underline underline-offset-4">help</a>
          </p>
        </div>
      )}

      {/* step 1 — identity */}
      <div className="mt-4">
        <p className="text-sm text-ink-200">
          <span className="font-mono text-xs text-ink-400">1 ·</span> Post this exact line as a comment
          on <a className="text-vermilion underline underline-offset-4" href={itemUrl} target="_blank" rel="noreferrer">
            {meta.ownerRepo}{meta.kind === 1 ? "/pull/" : "#"}{meta.number.toString()}
          </a>, from the GitHub account that will open the PR:
        </p>
        <div className="mt-2 flex items-start gap-2">
          <code className="grow break-all rounded-lg border border-white/10 bg-ink-950 p-3 font-mono text-xs text-paper-100">{line}</code>
          <button type="button"
            onClick={() => { void navigator.clipboard.writeText(line); toast({ kind: "info", text: "Claim line copied." }); }}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs text-ink-200 hover:bg-white/5">copy</button>
        </div>
        {step === "identity" && (
          <button type="button" onClick={() => void scan()} disabled={scanning}
            className="mt-3 rounded-lg border border-vermilion/50 px-4 py-2 text-sm text-vermilion hover:bg-vermilion/10 disabled:opacity-40">
            {scanning ? "Scanning comments…" : "I've posted it — find my comment"}
          </button>
        )}
        {scanError && <p role="alert" className="mt-2 text-sm text-vermilion">{scanError}</p>}
      </div>

      {/* step 2 — signature */}
      {claim && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-sm text-ink-200">
            <span className="font-mono text-xs text-ink-400">2 ·</span>{" "}
            Sign the claim with your ML-DSA-87 key
            {sigStatus && <span className="ml-2 text-emerald-300">{sigStatus.text}</span>}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-400">
            identity {claim.identityHash.slice(0, 18)}… ·{" "}
            <a className="underline decoration-dotted hover:text-vermilion" href={claim.commentUrl} target="_blank" rel="noreferrer">comment</a>
          </p>
          {myKey.data && !myKey.data.live && (
            <p role="alert" className="mt-2 text-sm text-vermilion">
              Your connected account has no live ML-DSA-87 key on diana — claims will revert with KeyIneligible.
            </p>
          )}
          {qorex.canSignArbitrary && qorex.qorAddress && (
            <p className="mt-2 text-xs text-ink-300">QoreX will sign as {qorex.qorAddress}.</p>
          )}
          {step === "signature" && (
            <button type="button" onClick={() => void sign()} disabled={signing || (myKey.data !== undefined && !myKey.data.live)}
              className="mt-3 rounded-lg border border-vermilion/50 px-4 py-2 text-sm text-vermilion hover:bg-vermilion/10 disabled:opacity-40">
              {signing ? "Signing…" : "Sign the claim"}
            </button>
          )}
          {signError && <p role="alert" className="mt-2 text-sm text-vermilion">{signError}</p>}
        </div>
      )}

      {/* step 3 — send */}
      {signature && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-sm text-ink-200">
            <span className="font-mono text-xs text-ink-400">3 ·</span>{" "}
            Signature verified locally against your live key. Send the claim transaction
            for <span className="font-mono">{shortAddr(address)}</span>.
          </p>
          <button type="button" onClick={send} disabled={busy}
            className="mt-3 rounded-lg bg-vermilion px-5 py-2 text-sm font-medium text-ink-950 hover:brightness-110 disabled:opacity-40">
            {busy ? "Working…" : "Claim bounty"}
          </button>
        </div>
      )}
      <TxStatusPanel state={tx.state} />
    </div>
  );
}

export default function ClaimPanel(props: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  return <WalletRoot><Panel {...props} /></WalletRoot>;
}

