import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { hexToBytes } from "viem";
import { mldsa87 } from "@qorechain/pqc";
import WalletRoot from "./WalletRoot";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { claimMessage } from "../formats/messages";
import { claimLine } from "../formats/lines";
import { identityHashOf } from "../formats/hashes";
import { getAllComments, findClaimComments } from "../github/client";
import { githubItemUrl, githubItemLabel } from "../github/parse";
import { pqcKeyStatus } from "../chain/pqc";
import { signerStatus, SignerError } from "../chain/localSigner";
import { pickSigner } from "./pqSigner";
import { accountMismatchMessage, usePrefersLocalSigner } from "./signerPreference";
import { AdvancedSigner } from "./AdvancedSigner";
import { ReadinessChecklist } from "./Readiness";
import { useEnableTransactions } from "./useEnableTransactions";
import { useQorex } from "./qorex";
import { usePqcStatus } from "../hooks/queries";
import { Card, SectionLabel, shortAddr } from "../components/ui";
import { ESCROW_ADDRESS } from "../chain/config";
import { sameAddress } from "../chain/address";
import { errorMessage } from "../chain/errors";
import { nowSec } from "../chain/time";
import type { Bounty } from "../chain/client";
import type { BountyMeta } from "../chain/indexer";

type Step = "identity" | "scan" | "signature" | "send";

function ClaimPanelBody({ id, bounty, meta }: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  const { address } = useAccount();
  const qorex = useQorex();
  const enable = useEnableTransactions();
  const preferLocal = usePrefersLocalSigner();
  const qoreXSigns = !preferLocal && qorex.canSignArbitrary && !!qorex.qorAddress;
  const mismatch = qoreXSigns ? accountMismatchMessage(qorex.qorAddress, address) : null;
  const myKey = usePqcStatus(address);
  const tx = useTxAction();
  const toast = useToast();

  const [step, setStep] = useState<Step>("identity");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [claim, setClaim] = useState<{
    login: string; commentId: bigint; identityHash: `0x${string}`; commentUrl: string;
  } | null>(null);
  const [sigStatus, setSigStatus] = useState<{
    ok: boolean; text: string } | null>(null);
  const [signature, setSignature] = useState<`0x${string}` | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const line = useMemo(
    () => (address ? claimLine(id, address, ESCROW_ADDRESS) : ""), [id, address]);

  if (!address) return null;
  const me = address.toLowerCase();
  if (sameAddress(address, bounty.funder)
      || bounty.verifiers.some((v) => sameAddress(v, address))) {
    return <Card className="text-sm text-gray">Funders and verifiers cannot claim their own bounty.</Card>;
  }
  const t = nowSec();
  if (t >= bounty.deadline) {
    return <Card className="text-sm text-gray">Claiming is closed — the deadline has passed.</Card>;
  }
  if (bounty.claimTimeout > bounty.deadline - t) {
    return <Card className="text-sm text-gray">The claim window no longer fits before the deadline.</Card>;
  }

  const itemUrl = githubItemUrl(meta);

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
        commentUrl: `${itemUrl}#issuecomment-${c.commentId}`,
      });
      setSigStatus({ ok: true, text: `Found the claim line by @${c.githubLogin} (comment ${c.commentId})${extra}.` });
      setStep("signature");
    } catch (e) {
      setScanError(errorMessage(e, "GitHub lookup failed."));
    } finally { setScanning(false); }
  };

  const sign = async () => {
    if (!claim) return;
    setSigning(true); setSignError(null);
    try {
      const claimRound = bounty.claimRound + 1n;
      const message = claimMessage(id, address, claim.identityHash, claimRound);
      const signer = pickSigner(qorex);
      if (signer.id === "qorex" && mismatch) throw new Error(mismatch);
      if (signer.id === "local") {
        const st = await signerStatus();
        if (!sameAddress(st.address, address)) {
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
      setSignError(errorMessage(e));
      toast({ kind: "error", title: "Signing didn't work", text: errorMessage(e) });
    } finally { setSigning(false); }
  };

  const send = () => {
    if (!claim || !signature) return;
    void tx.run({
      functionName: "claim",
      args: [id, claim.identityHash, signature],
      onConfirmed: () => toast({ kind: "success", title: "Claim stamped on chain", text: "Your claim is recorded; verifiers can review it now." }),
      invalidates: [["bounty", id.toString()], ["index"], ["nextBountyId"]],
    });
  };

  return (
    <Card tone="accent">
      <SectionLabel tone="accent">claim this bounty</SectionLabel>

      {!qoreXSigns && (
        <p className="mt-3 text-sm text-charcoal">
          To sign your claim you need QoreX with a registered post-quantum key.{" "}
          <a href="/start" className="text-deep underline underline-offset-4">Get started</a>
        </p>
      )}
      <AdvancedSigner />

      <div className="mt-4">
        <ReadinessChecklist neededWei={0n} title="Before you claim" onEnable={(n) => void enable.run(n)} />
      </div>

      {/* step 1 — identity */}
      <div className="mt-4">
        <p className="text-sm text-gray">
          <span className="font-mono text-xs text-gray">1 ·</span> Post this exact line as a comment
          on <a className="text-deep underline underline-offset-4" href={itemUrl} target="_blank" rel="noreferrer">
            {githubItemLabel(meta)}
          </a>, from the GitHub account that will open the PR:
        </p>
        <div className="mt-2 flex items-start gap-2">
          <code className="grow break-all rounded-lg border border-ink/10 bg-paper p-3 font-mono text-xs text-ink">{line}</code>
          <button type="button"
            onClick={() => { void navigator.clipboard.writeText(line); toast({ kind: "success", title: "Copied", text: "Claim line copied — post it as a GitHub comment." }); }}
            className="shrink-0 rounded-lg border border-ink/15 px-3 py-2 text-xs text-gray hover:bg-ink/5">copy</button>
        </div>
        {step === "identity" && (
          <button type="button" onClick={() => void scan()} disabled={scanning}
            className="mt-3 rounded-lg border border-salmon/50 px-4 py-2 text-sm text-deep hover:bg-salmon/10 disabled:opacity-40">
            {scanning ? "Scanning comments…" : "I've posted it — find my comment"}
          </button>
        )}
        {scanError && <p role="alert" className="mt-2 text-sm text-orange">{scanError}</p>}
      </div>

      {/* step 2 — signature */}
      {claim && (
        <div className="mt-5 border-t border-ink/10 pt-4">
          <p className="text-sm text-gray">
            <span className="font-mono text-xs text-gray">2 ·</span>{" "}
            Sign the claim with your ML-DSA-87 key
            {sigStatus && <span className="ml-2 text-deep">{sigStatus.text}</span>}
          </p>
          <p className="mt-1 font-mono text-xs text-gray">
            identity {claim.identityHash.slice(0, 18)}… ·{" "}
            <a className="underline decoration-dotted hover:text-deep" href={claim.commentUrl} target="_blank" rel="noreferrer">comment</a>
          </p>
          {myKey.data && !myKey.data.live && (
            <p role="alert" className="mt-2 text-sm text-orange">
              Your connected account has no live ML-DSA-87 key on diana — claims will revert with KeyIneligible.
            </p>
          )}
          {qoreXSigns && (
            <p className="mt-2 text-xs text-gray">QoreX will sign as {qorex.qorAddress}.</p>
          )}
          {mismatch && <p role="alert" className="mt-2 text-sm text-orange">{mismatch}</p>}
          {step === "signature" && (
            <button type="button" onClick={() => void sign()} disabled={signing || !!mismatch || (myKey.data !== undefined && !myKey.data.live)}
              className="mt-3 rounded-lg border border-salmon/50 px-4 py-2 text-sm text-deep hover:bg-salmon/10 disabled:opacity-40">
              {signing ? "Signing…" : qoreXSigns ? "Sign with QoreX" : "Sign the claim"}
            </button>
          )}
          {signError && <p role="alert" className="mt-2 text-sm text-orange">{signError}</p>}
        </div>
      )}

      {/* step 3 — send */}
      {signature && (
        <div className="mt-5 border-t border-ink/10 pt-4">
          <p className="text-sm text-gray">
            <span className="font-mono text-xs text-gray">3 ·</span>{" "}
            Signature verified locally against your live key. Send the claim transaction
            for <span className="font-mono">{shortAddr(address)}</span>.
          </p>
          <button type="button" onClick={send} disabled={tx.busy}
            className="mt-3 rounded-lg bg-deep px-5 py-2 text-sm font-medium text-paper hover:brightness-110 disabled:opacity-40">
            {tx.busy ? "Working…" : "Claim bounty"}
          </button>
        </div>
      )}
      <TxStatusPanel state={tx.state} />
    </Card>
  );
}

export default function ClaimPanel(props: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  return <WalletRoot><ClaimPanelBody {...props} /></WalletRoot>;
}

