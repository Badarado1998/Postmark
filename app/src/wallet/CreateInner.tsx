import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { parseGithubUrl, githubItemLabel } from "../github/parse";
import { ItemPreview, VerifierInput } from "./createParts";
import { validateForm, verifierFieldError } from "../formats/createForm";
import { livePqcKey } from "../chain/pqc";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { PageBody, PageHeader } from "../components/Page";
import { Card, Qor, SectionLabel, StatusChip } from "../components/ui";
import { MS_PER_MINUTE, SECONDS_PER_DAY, SECONDS_PER_HOUR } from "../chain/time";

const CLAIM_PRESETS = [
  { label: "1 h", sec: SECONDS_PER_HOUR }, { label: "6 h", sec: 6 * SECONDS_PER_HOUR },
  { label: "24 h", sec: SECONDS_PER_DAY }, { label: "3 d", sec: 3 * SECONDS_PER_DAY },
  { label: "7 d", sec: 7 * SECONDS_PER_DAY },
];
const DEFAULT_DEADLINE_DAYS = 3;

/** Live-key lookups for the three verifier slots, plus shared-key detection. */
function useVerifierKeyCheck() {
  const [keyStates, setKeyStates] = useState<(boolean | undefined)[]>([undefined, undefined, undefined]);
  const [checkingKeys, setCheckingKeys] = useState(false);

  const clearKeyState = (i: number) =>
    setKeyStates((ks) => ks.map((k, j) => (j === i ? undefined : k)));

  const checkKeys = async (verifiers: `0x${string}`[]) => {
    setCheckingKeys(true);
    const states: boolean[] = [];
    const seen = new Set<string>();
    let shared = false;
    for (const v of verifiers) {
      const pk = await livePqcKey(v).catch(() => null);
      states.push(pk !== null);
      if (pk) {
        if (seen.has(pk.toLowerCase())) shared = true;
        seen.add(pk.toLowerCase());
      }
    }
    setKeyStates(states);
    setCheckingKeys(false);
    return { shared, missing: states.includes(false) };
  };

  return { keyStates, clearKeyState, checkingKeys, checkKeys };
}

function ClaimTimeoutPicker({ preset, onPreset, custom, onCustom }: {
  preset: number | "custom"; onPreset: (p: number | "custom") => void;
  custom: string; onCustom: (v: string) => void;
}) {
  return (
    <div className="text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">Claim timeout</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CLAIM_PRESETS.map((p) => (
          <button key={p.sec} type="button"
            onClick={() => onPreset(p.sec)}
            className={`rounded-full border px-3 py-1 text-xs ${preset === p.sec ? "border-salmon bg-salmon/15 text-deep" : "border-ink/10 text-gray"}`}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => onPreset("custom")}
          className={`rounded-full border px-3 py-1 text-xs ${preset === "custom" ? "border-salmon bg-salmon/15 text-deep" : "border-ink/10 text-gray"}`}>
          custom
        </button>
      </div>
      {preset === "custom" && (
        <label className="mt-2 flex items-center gap-2 font-mono text-xs text-gray">
          <input value={custom} onChange={(e) => onCustom(e.target.value)}
            className="w-20 rounded border border-ink/10 bg-white px-2 py-1 text-ink" /> hours (1–168)
        </label>
      )}
    </div>
  );
}

/** Amount + challenge reward, from the raw inputs, independent of the rest of the form. */
function lockedAmount(amount: string, reward: string): bigint | null {
  try { return parseUnits(amount, 18) + parseUnits(reward, 18); } catch { return null; }
}

function CreateForm() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const tx = useTxAction();
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const gref = useMemo(() => (url.trim() ? parseGithubUrl(url) : null), [url]);
  const urlTouched = url.trim().length > 0;
  const [amount, setAmount] = useState("0.5");
  const [reward, setReward] = useState("0.1");
  const [bond, setBond] = useState("0.2");
  const [preset, setPreset] = useState<number | "custom">(SECONDS_PER_DAY);
  const [customTimeout, setCustomTimeout] = useState("24");
  const claimTimeoutSec = preset === "custom" ? Math.floor(Number(customTimeout) * SECONDS_PER_HOUR) : preset;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = new Date(Date.now() + DEFAULT_DEADLINE_DAYS * SECONDS_PER_DAY * 1000);
  const [deadlineLocal, setDeadlineLocal] = useState(
    new Date(local.getTime() - local.getTimezoneOffset() * MS_PER_MINUTE).toISOString().slice(0, 16));
  const [verifiers, setVerifiers] = useState(["", "", ""]);
  const { keyStates, clearKeyState, checkingKeys, checkKeys } = useVerifierKeyCheck();

  const form = validateForm({
    amount, reward, bond, deadlineLocal, claimTimeoutSec,
    verifiers, ...(address ? { funder: address } : {}),
  });

  const submit = async () => {
    if (!form.ok || !gref) return;
    const { shared, missing } = await checkKeys(form.parsed.verifiers);
    if (shared) {
      toast({ kind: "error", text: "Two verifier slots share the same PQ key." });
      return;
    }
    if (missing) {
      toast({ kind: "error", text: "A verifier has no live ML-DSA-87 key." });
      return;
    }
    const { parsed } = form;
    const total = parsed.amount + parsed.reward;
    await tx.run({
      functionName: "createBounty",
      args: [parsed.amount, gref.ownerRepo, gref.kind, BigInt(gref.number),
        parsed.deadline, parsed.claimTimeout, parsed.verifiers,
        parsed.bond, parsed.reward],
      value: total,
      onConfirmed: () => {
        toast({ kind: "info", text: "Bounty created — redirecting…" });
        setTimeout(() => navigate("/explore"), 800);
      },
    });
  };

  const lockedWei = lockedAmount(amount, reward);
  const total = lockedWei === null ? "—" : formatUnits(lockedWei, 18);

  const input = "mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-gray focus:outline-none focus:ring-2 focus:ring-deep";
  const label = "font-mono text-[10px] uppercase tracking-[0.18em] text-gray";
  const deadlineDate = new Date(deadlineLocal);
  const deadlineValid = Number.isFinite(deadlineDate.getTime());

  return (
    <div>
      <PageHeader>
        <div>
          <h1 className="font-sans text-4xl font-semibold tracking-tight text-ink">Fund an issue</h1>
          <p className="mt-2 text-sm text-charcoal">
            Escrow test QOR against a real GitHub item on diana. No monetary value.
          </p>
        </div>
      </PageHeader>

      <PageBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6" onChangeCapture={() => setTouched(true)} onBlurCapture={() => setTouched(true)}>
          <Card>
            <SectionLabel>1 · work item</SectionLabel>
            <label className="mt-3 block text-sm">
              <span className={label}>GitHub issue or PR URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/issues/42" className={input} />
            </label>
            {urlTouched && !gref && (
              <p role="alert" className="mt-2 text-sm text-orange">
                Not a github.com issue or PR URL.
              </p>
            )}
            {gref && <ItemPreview gref={gref} />}
          </Card>

          <Card>
            <SectionLabel>2 · terms</SectionLabel>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ["Bounty amount", amount, setAmount],
                ["Challenge reward", reward, setReward],
                ["Dispute bond", bond, setBond],
              ].map(([name, val, set]) => (
                <label key={name as string} className="block text-sm">
                  <span className={label}>{name as string} (QOR)</span>
                  <input value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}
                    inputMode="decimal" className={input} />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <SectionLabel>3 · timing</SectionLabel>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className={label}>Deadline ({tz})</span>
                <input type="datetime-local" value={deadlineLocal}
                  onChange={(e) => setDeadlineLocal(e.target.value)} className={input} />
                <span className="mt-1 block font-mono text-[10px] text-gray">
                  {deadlineValid ? deadlineDate.toISOString().replace("T", " ").slice(0, 16) + " UTC" : ""}
                </span>
              </label>
              <ClaimTimeoutPicker preset={preset} onPreset={setPreset}
                custom={customTimeout} onCustom={setCustomTimeout} />
            </div>
          </Card>

          <Card>
            <fieldset>
              <legend className={label}>
                4 · Verifiers (need live ML-DSA-87 keys; any 2 settle)
              </legend>
              <div className="mt-3 space-y-2">
                {verifiers.map((v, i) => (
                  <VerifierInput key={i} i={i} value={v}
                    checking={checkingKeys}
                    live={keyStates[i]}
                    error={verifierFieldError(v, i, verifiers, address)}
                    onChange={(nv) => {
                      const next = [...verifiers]; next[i] = nv; setVerifiers(next);
                      clearKeyState(i);
                    }} />
                ))}
              </div>
            </fieldset>
          </Card>

          {!form.ok && touched && (
            <p role="alert" className="text-sm text-orange">{form.error}</p>
          )}
        </div>

        <aside aria-label="Summary" className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card tone="accent">
            <SectionLabel tone="accent">summary</SectionLabel>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-sm text-charcoal">You send now</span>
              <span className="font-mono text-2xl font-semibold text-ink">{total} QOR</span>
            </div>
            <p className="mt-1 text-xs text-gray">
              amount + challenge reward. The bond is only required to dispute a verdict.
              If no valid claim is merged, you can refund after the deadline.
            </p>
            <dl className="mt-4 space-y-2 border-t border-ink/10 pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal">Deadline</dt>
                <dd className="text-right font-mono text-xs">{deadlineValid ? deadlineDate.toLocaleString() : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal">Claim window</dt>
                <dd className="font-mono text-xs">{Number.isFinite(claimTimeoutSec) ? `${+(claimTimeoutSec / SECONDS_PER_HOUR).toFixed(2)} h` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal">Verifiers</dt>
                <dd className="font-mono text-xs">
                  {keyStates.map((k, i) => (k === undefined ? "?" : k ? "✓" : "✗") + (i < 2 ? " " : "")).join("")}
                </dd>
              </div>
            </dl>
            <TxStatusPanel state={tx.state} />
            {!isConnected ? (
              <p className="mt-4 text-sm text-charcoal">Connect an EVM wallet to continue.</p>
            ) : (
              <button onClick={() => void submit()}
                disabled={!form.ok || !gref || tx.busy}
                className="mt-4 w-full rounded-lg bg-deep px-6 py-3 font-medium text-paper hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                {tx.state.phase === "wallet" ? "Confirm in wallet…"
                  : tx.state.phase === "submitted" || tx.state.phase === "confirming" ? "Confirming…"
                  : `Create bounty (${total} QOR)`}
              </button>
            )}
          </Card>

          <div aria-label="Bounty card preview" role="group">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-gray">live preview</div>
            <div className="relative overflow-hidden rounded-xl border border-ink/10 bg-white p-4 pl-5">
              <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-leaf" />
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-semibold text-gray">#new</span>
                <StatusChip state={0} />
              </div>
              <p className="mt-3 truncate font-mono text-sm">{gref ? githubItemLabel(gref) : "owner/repo#number"}</p>
              <div className="mt-3 flex items-end justify-between text-sm">
                <Qor wei={lockedWei ?? 0n} className="font-mono text-base font-semibold" />
                <span className="font-mono text-xs text-gray">{deadlineValid ? deadlineDate.toLocaleDateString() : "no deadline"}</span>
              </div>
            </div>
          </div>
        </aside>
      </PageBody>
    </div>
  );
}

export default function CreateInner() {
  return <WalletRoot><CreateForm /></WalletRoot>;
}
