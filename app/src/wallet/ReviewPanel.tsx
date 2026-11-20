// The verifier tool: check the claim, check the PR, build a verdict, sign it
// through a PqSigner, merge bundles and relay the quorum — all against chain
// truth (nonce, claimRound, dispute hashes are never user input).
import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { PHASE } from "../chain/verdict";
import { sameAddress } from "../chain/address";
import { useQorex } from "./qorex";
import { useIdentityCheck } from "./review/useIdentityCheck";
import { usePrCheck } from "./review/usePrCheck";
import { useVerdictBuilder } from "./review/useVerdictBuilder";
import { useVerdictBundle } from "./review/useVerdictBundle";
import { useVerdictSigning } from "./review/useVerdictSigning";
import {
  BundleCard, ClaimUnderReview, DecisionCard, IdentityCard, PrCheckCard, SignCard,
} from "./review/ReviewSections";
import type { Bounty } from "../chain/client";
import type { BountyMeta } from "../chain/indexer";

function ReviewPanelBody({ id, bounty, meta }: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  const { address } = useAccount();
  const qorex = useQorex();
  const tx = useTxAction();
  const toast = useToast();

  const disputed = bounty.state === 3;
  const phase = disputed ? PHASE.DISPUTE : PHASE.INITIAL;

  const identity = useIdentityCheck(id, bounty, meta, disputed);
  const pr = usePrCheck(meta, bounty, identity.identity?.login ?? null);
  const builder = useVerdictBuilder({
    id, bounty, phase, disputed, prCheck: pr.prCheck, disputeComment: identity.disputeComment,
  });
  const bundle = useVerdictBundle(id, bounty, phase, builder.built);
  const signing = useVerdictSigning(bounty, builder.built, bundle.recordSignature);

  const myVerifierIndex = bounty.verifiers.findIndex((v) => sameAddress(v, address));
  const canResolve = !disputed || identity.disputeComment !== null;

  const submit = () => {
    const v = builder.built?.verdict;
    if (!bundle.bundle || !v) return;
    tx.run({
      functionName: disputed ? "resolveDispute" : "submitVerdict",
      args: [{
        bountyId: v.bountyId, phase: v.phase, outcome: v.outcome, payee: v.payee,
        mergedAt: v.mergedAt, evidenceHash: v.evidenceHash, nonce: v.nonce, claimRound: v.claimRound,
      }, bundle.validIndices, bundle.validIndices.map((i) => bundle.bundle!.signatures[i]!)],
      onConfirmed: () => {
        toast({ kind: "info", text: disputed ? "Dispute resolved on chain." : "Verdict stamped on chain." });
        bundle.persist(null);
      },
      invalidates: [["bounty", id.toString()], ["index"], ["bounties"], ["nextBountyId"]],
    });
  };

  return (
    <div className="space-y-6">
      <ClaimUnderReview bounty={bounty} disputed={disputed} />
      <IdentityCard meta={meta} disputed={disputed} status={identity.status} error={identity.error}
        identity={identity.identity} disputeComment={identity.disputeComment} onScan={() => void identity.scan()} />
      <PrCheckCard meta={meta} pr={pr} />
      <DecisionCard disputed={disputed} canPay={!!pr.prCheck && canResolve} canResolve={canResolve}
        scanDone={identity.status === "done"} builder={builder} built={builder.built} />
      {builder.built && (
        <SignCard myVerifierIndex={myVerifierIndex}
          usesQorex={!!(qorex.canSignArbitrary && qorex.qorAddress)}
          signing={signing.signing} error={signing.error} signedIndex={signing.signedIndex}
          onSign={() => void signing.sign()} />
      )}
      {builder.built && (
        <BundleCard bounty={bounty} disputed={disputed} bundleView={bundle} onSubmit={submit}
          onCopy={() => { void navigator.clipboard.writeText(bundle.bundleJson); toast({ kind: "info", text: "Bundle copied." }); }}>
          <TxStatusPanel state={tx.state} />
        </BundleCard>
      )}
    </div>
  );
}

export default function ReviewPanel(props: { id: bigint; bounty: Bounty; meta: BountyMeta }) {
  return <WalletRoot><ReviewPanelBody {...props} /></WalletRoot>;
}
