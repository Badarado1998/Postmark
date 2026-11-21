import { Card, SectionLabel } from "../../components/ui";
import { CLAIM_STEPS } from "../../data/claimSteps";
import { requestWallet } from "../../components/walletIntent";

/** Not-connected stand-in for the claim card: same spot, same three steps, one button that loads the wallet. */
export function ClaimIntro() {
  return (
    <div data-testid="claim-card">
    <Card tone="accent">
      <SectionLabel tone="accent">claim this bounty</SectionLabel>
      <ol className="mt-3 space-y-2">
        {CLAIM_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 text-sm text-charcoal">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/10 font-mono text-xs">{i + 1}</span>
            <span><span className="font-medium text-ink">{s.title}</span> — {s.hint}</span>
          </li>
        ))}
      </ol>
      <button type="button"
        onClick={() => { requestWallet(); document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.click(); }}
        className="mt-4 rounded-lg bg-deep px-5 py-2.5 text-sm font-medium text-paper hover:brightness-110">
        Connect wallet to claim
      </button>
    </Card>
    </div>
  );
}
