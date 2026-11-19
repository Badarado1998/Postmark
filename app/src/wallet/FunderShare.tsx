import { useAccount } from "wagmi";
import { useToast } from "../components/Toasts";
import type { Bounty } from "../chain/client";

export default function FunderShare({ bounty }: { bounty: Bounty }) {
  const { address } = useAccount();
  const toast = useToast();
  if (!address || address.toLowerCase() !== bounty.funder.toLowerCase()) return null;
  const url = typeof location !== "undefined" ? location.href : "";
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4 text-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">funder view</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          onClick={() => { void navigator.clipboard?.writeText(url)
            .then(() => toast({ kind: "info", text: "Link copied — share it with contributors and verifiers." })); }}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-paper-200 hover:bg-white/5">
          Copy share link
        </button>
        <span className="font-mono text-xs text-ink-400">
          deadline <span className="text-paper-200">{new Date(Number(bounty.deadline) * 1000).toLocaleString()}</span>
          {bounty.challengeEndsAt > 0n && <> · challenge ends <span className="text-paper-200">{new Date(Number(bounty.challengeEndsAt) * 1000).toLocaleString()}</span></>}
        </span>
      </div>
    </div>
  );
}
