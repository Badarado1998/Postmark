import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { Countdown } from "../components/ui";
import type { Bounty } from "../chain/client";

function Note({ bounty }: { bounty: Bounty }) {
  const { address } = useAccount();
  const mine = !!address && address.toLowerCase() === bounty.payee.toLowerCase();
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-5">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
        {mine ? "your claim is live" : "claimed"}
      </h2>
      <p className="mt-2 text-sm text-ink-200">
        {mine
          ? "Your ML-DSA-87 claim is stamped on chain. Now open the pull request and let the three verifiers review it — two seals settle the verdict."
          : "This bounty is claimed and waiting on verifier verdicts."}
      </p>
      <p className="mt-2 font-mono text-xs text-ink-300">
        claim expires in <Countdown to={bounty.claimExpiresAt} /> · round {bounty.claimRound.toString()}
      </p>
      <p className="mt-2 text-xs text-ink-400">
        {mine
          ? "If the claim lapses before a verdict, anyone can reopen the bounty and someone else may claim."
          : "Claim expired? Anyone can call Reopen to free the bounty for a new claim."}
      </p>
    </div>
  );
}

export default function ClaimedNote(props: { bounty: Bounty }) {
  return <WalletRoot><Note {...props} /></WalletRoot>;
}
