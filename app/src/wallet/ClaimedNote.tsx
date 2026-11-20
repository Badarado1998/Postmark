import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { Countdown, SectionLabel } from "../components/ui";
import { sameAddress } from "../chain/address";
import type { Bounty } from "../chain/client";

function Note({ bounty }: { bounty: Bounty }) {
  const { address } = useAccount();
  const mine = sameAddress(address, bounty.payee);
  return (
    <div className="rounded-xl border border-leaf/50 bg-leaf/10 p-5">
      <SectionLabel tone="accent">{mine ? "your claim is live" : "claimed"}</SectionLabel>
      <p className="mt-2 text-sm text-gray">
        {mine
          ? "Your ML-DSA-87 claim is stamped on chain. Now open the pull request and let the three verifiers review it — two seals settle the verdict."
          : "This bounty is claimed and waiting on verifier verdicts."}
      </p>
      <p className="mt-2 font-mono text-xs text-gray">
        claim expires in <Countdown to={bounty.claimExpiresAt} /> · round {bounty.claimRound.toString()}
      </p>
      <p className="mt-2 text-xs text-gray">
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
