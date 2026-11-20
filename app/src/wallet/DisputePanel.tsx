// Dispute a Pending verdict: post the SPEC line on GitHub, prove it with a
// comment id, then bond the dispute. Evidence = keccak(login, commentId).
import { useState } from "react";
import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { Qor } from "../components/ui";
import { getAllComments, findDisputeComments, GithubRateLimitError } from "../github/client";
import { disputeEvidenceHashOf } from "../formats/hashes";
import { ESCROW_ADDRESS } from "../chain/config";
import type { Bounty } from "../chain/client";
import type { BountyMeta } from "../chain/indexer";

const now = () => BigInt(Math.floor(Date.now() / 1000));

export function disputeLine(bountyId: bigint, escrow: `0x${string}`) {
  return `postmark-dispute v1 chain=9800 escrow=${escrow.toLowerCase()} bounty=${bountyId}`;
}

function Panel({ id, bounty, meta }: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  useAccount();
  const tx = useTxAction();
  const toast = useToast();
  const [login, setLogin] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [found, setFound] = useState<{ commentId: bigint; hash: `0x${string}`; url: string } | null>(null);

  const closed = now() >= bounty.challengeEndsAt;
  const itemUrl = `https://github.com/${meta.ownerRepo}/${meta.kind === 1 ? "pull" : "issues"}/${meta.number}`;
  const line = disputeLine(id, ESCROW_ADDRESS);

  const scan = async () => {
    setScanning(true); setScanErr(null);
    try {
      const comments = await getAllComments(meta.ownerRepo, Number(meta.number));
      const hits = findDisputeComments(comments).filter((c) =>
        c.escrow === ESCROW_ADDRESS.toLowerCase() && c.bountyId === Number(id)
        && c.githubLogin === login.trim().toLowerCase());
      if (hits.length === 0) {
        setScanErr(`No dispute line from @${login.trim() || "?"} on this item yet — post it, then rescan.`);
        return;
      }
      const c = hits[0]!;
      setFound({ commentId: BigInt(c.commentId),
        hash: disputeEvidenceHashOf(c.githubLogin, BigInt(c.commentId)),
        url: `${itemUrl}#issuecomment-${c.commentId}` });
    } catch (e) {
      setScanErr(e instanceof GithubRateLimitError ? e.message
        : e instanceof Error ? e.message : "GitHub lookup failed.");
    } finally { setScanning(false); }
  };

  const send = () => {
    if (!found) return;
    void tx.run({
      functionName: "dispute",
      args: [id, found.hash],
      value: bounty.bondAmount,
      onConfirmed: () => toast({ kind: "info", text: "Dispute bonded — the payout is frozen." }),
      invalidates: [["bounty", id.toString()], ["index"]],
    });
  };

  if (closed) return null;

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300">dispute this verdict</h2>
      <p className="mt-2 text-sm text-ink-200">
        Anyone can bond <Qor wei={bounty.bondAmount} /> against this verdict before the window
        closes. Post this exact line as a comment on{" "}
        <a className="text-vermilion underline underline-offset-4" href={itemUrl} target="_blank" rel="noreferrer">
          {meta.ownerRepo}{meta.kind === 1 ? "/pull/" : "#"}{meta.number.toString()}</a>, with your reasons:
      </p>
      <div className="mt-2 flex items-start gap-2">
        <code className="grow break-all rounded-lg border border-white/10 bg-ink-950 p-3 font-mono text-xs text-paper-100">{line}</code>
        <button type="button"
          onClick={() => { void navigator.clipboard.writeText(line); toast({ kind: "info", text: "Dispute line copied." }); }}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs text-ink-200 hover:bg-white/5">copy</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={login} onChange={(e) => setLogin(e.target.value)}
          placeholder="your GitHub login"
          className="w-52 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 font-mono text-xs text-paper-100" />
        <button type="button" onClick={() => void scan()} disabled={scanning || !login.trim()}
          className="rounded-lg border border-amber-400/50 px-4 py-2 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40">
          {scanning ? "Scanning…" : "I've posted it — find my comment"}
        </button>
      </div>
      {scanErr && <p role="alert" className="mt-2 text-sm text-amber-300">{scanErr}</p>}
      {found && (
        <div className="mt-3">
          <p className="text-sm text-ink-200">
            Found the dispute line (comment {found.commentId.toString()}) ·{" "}
            <a className="underline decoration-dotted hover:text-vermilion" href={found.url} target="_blank" rel="noreferrer">link</a>
          </p>
          <p className="mt-1 break-all font-mono text-xs text-ink-400">evidence {found.hash}</p>
          <button type="button" onClick={send}
            className="mt-3 rounded-lg bg-amber-400 px-5 py-2 text-sm font-medium text-ink-950 hover:brightness-110">
            Bond dispute (<Qor wei={bounty.bondAmount} />)
          </button>
        </div>
      )}
      <TxStatusPanel state={tx.state} />
    </div>
  );
}

export default function DisputePanel(props: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  return <WalletRoot><Panel {...props} /></WalletRoot>;
}
