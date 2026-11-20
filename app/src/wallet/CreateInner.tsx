import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { parseGithubUrl } from "../github/parse";
import { ItemPreview, VerifierInput } from "./createParts";
import { validateForm, verifierFieldError } from "../formats/createForm";
import { livePqcKey } from "../chain/pqc";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";
import { Card } from "../components/ui";
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

function CreateForm() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const tx = useTxAction();
  const [url, setUrl] = useState("");
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

  const total = form.ok ? formatUnits(form.parsed.amount + form.parsed.reward, 18) : "—";

  return (
    <div className="mx-auto max-w-2xl py-10">
      <h1 className="font-sans text-4xl font-semibold text-ink">Fund an issue</h1>
      <p className="mt-2 text-sm text-gray">
        Escrow test QOR against a real GitHub item on diana. No monetary value.
      </p>

      <label className="mt-8 block text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">GitHub issue or PR URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/issues/42"
          className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-sm text-ink placeholder:text-gray focus:outline-none focus:ring-1 focus:ring-deep" />
      </label>
      {urlTouched && !gref && (
        <p role="alert" className="mt-2 text-sm text-orange">
          Not a github.com issue or PR URL.
        </p>
      )}
      {gref && <ItemPreview gref={gref} />}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          ["Bounty amount", amount, setAmount],
          ["Challenge reward", reward, setReward],
          ["Dispute bond", bond, setBond],
        ].map(([label, val, set]) => (
          <label key={label as string} className="block text-sm">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">{label as string} (QOR)</span>
            <input value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:ring-1 focus:ring-deep" />
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">Deadline ({tz})</span>
          <input type="datetime-local" value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:ring-1 focus:ring-deep" />
          <span className="mt-1 block font-mono text-[10px] text-gray">
            {Number.isFinite(new Date(deadlineLocal).getTime())
              ? new Date(deadlineLocal).toISOString().replace("T", " ").slice(0, 16) + " UTC" : ""}
          </span>
        </label>
        <ClaimTimeoutPicker preset={preset} onPreset={setPreset}
          custom={customTimeout} onCustom={setCustomTimeout} />
      </div>

      <fieldset className="mt-6">
        <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray">
          Verifiers (need live ML-DSA-87 keys; any 2 settle)
        </legend>
        <div className="mt-2 space-y-2">
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

      {!form.ok && (
        <p role="alert" className="mt-4 text-sm text-orange">{form.error}</p>
      )}

      <Card className="mt-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray">You send now</span>
          <span className="font-mono text-ink">{total} QOR <span className="text-[10px] uppercase text-deep">testnet</span></span>
        </div>
        <p className="mt-2 text-xs text-gray">
          amount + challenge reward. The bond is only required to dispute a verdict.
          If no valid claim is merged, you can refund after the deadline.
        </p>
      </Card>

      <TxStatusPanel state={tx.state} />

      {!isConnected ? (
        <p className="mt-6 text-sm text-gray">Connect an EVM wallet to continue.</p>
      ) : (
        <button onClick={() => void submit()}
          disabled={!form.ok || !gref || tx.busy}
          className="mt-6 w-full rounded-lg bg-deep px-6 py-3 font-medium text-paper hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
          {tx.state.phase === "wallet" ? "Confirm in wallet…"
            : tx.state.phase === "submitted" || tx.state.phase === "confirming" ? "Confirming…"
            : `Create bounty (${total} QOR)`}
        </button>
      )}
    </div>
  );
}

export default function CreateInner() {
  return <WalletRoot><CreateForm /></WalletRoot>;
}
