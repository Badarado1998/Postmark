import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { useToast } from "../components/Toasts";
import { sameAddress } from "../chain/address";
import type { Bounty } from "../chain/client";

export default function FunderShare(props: { bounty: Bounty }) {
  return <WalletRoot><Share {...props} /></WalletRoot>;
}

function Share({ bounty }: { bounty: Bounty }) {
  const { address } = useAccount();
  const toast = useToast();
  if (!sameAddress(address, bounty.funder)) return null;
  const url = typeof location !== "undefined" ? location.href : "";
  return (
    <div className="rounded-xl border border-ink/10 bg-white/70 p-4 text-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">funder view</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={() => { void navigator.clipboard?.writeText(url)
            .then(() => toast({ kind: "info", text: "Link copied — share it with contributors and verifiers." })); }}
          className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs text-ink hover:bg-ink/5">
          Copy share link
        </button>
        <span className="font-mono text-xs text-gray">
          deadline <span className="text-ink">{new Date(Number(bounty.deadline) * 1000).toLocaleString()}</span>
          {bounty.challengeEndsAt > 0n && <> · challenge ends <span className="text-ink">{new Date(Number(bounty.challengeEndsAt) * 1000).toLocaleString()}</span></>}
        </span>
      </div>
    </div>
  );
}
