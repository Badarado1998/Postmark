import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { parseUnits, formatUnits, isAddress } from "viem";
import { useAccount } from "wagmi";
import WalletRoot from "./WalletRoot";
import { parseGithubUrl, type GithubRef } from "../github/parse";
import { getIssue, getPull, GithubRateLimitError, type GhIssue, type GhPull } from "../github/client";
import { livePqcKey } from "../chain/pqc";
import { qorToEvm } from "../chain/bech32";
import { useTxAction } from "../hooks/useTxAction";
import { useToast } from "../components/Toasts";
import { TxStatusPanel } from "./TxWidgets";

const CLAIM_PRESETS = [
  { label: "1 h", sec: 3600 }, { label: "6 h", sec: 21600 },
  { label: "24 h", sec: 86400 }, { label: "3 d", sec: 259200 },
  { label: "7 d", sec: 604800 },
];

export function validateForm(f: {
  amount: string; reward: string; bond: string;
  deadlineLocal: string; claimTimeoutSec: number;
  verifiers: string[]; funder?: string;
}): { ok: true; parsed: {
  amount: bigint; reward: bigint; bond: bigint;
  deadline: bigint; claimTimeout: bigint; verifiers: `0x${string}`[];
} } | { ok: false; error: string } {
  let amount: bigint, reward: bigint, bond: bigint;
  try {
    amount = parseUnits(f.amount, 18);
    reward = parseUnits(f.reward, 18);
    bond = parseUnits(f.bond, 18);
  } catch { return { ok: false, error: "Amounts must be decimal numbers (max 18 dp)." }; }
  if (amount <= 0n) return { ok: false, error: "Amount must be above zero." };
  if (reward <= 0n) return { ok: false, error: "Challenge reward must be above zero." };
  if (bond <= 0n) return { ok: false, error: "Dispute bond must be above zero." };
  const dl = Math.floor(new Date(f.deadlineLocal).getTime() / 1000);
  if (!Number.isFinite(dl)) return { ok: false, error: "Pick a deadline." };
  if (f.claimTimeoutSec < 3600 || f.claimTimeoutSec > 604800) {
    return { ok: false, error: "Claim timeout must be between 1 hour and 7 days." };
  }
  const now = Math.floor(Date.now() / 1000);
  if (dl <= now) return { ok: false, error: "Deadline is in the past." };
  if (BigInt(dl - now) < BigInt(f.claimTimeoutSec) + 600n) {
    return { ok: false, error:
      "Deadline too close: a claim window plus a 10-minute buffer must fit before it." };
  }
  const vs: `0x${string}`[] = [];
  for (const [i, raw] of f.verifiers.entries()) {
    const err = verifierFieldError(raw, i, f.verifiers, f.funder);
    if (err) return { ok: false, error: `Verifier ${i + 1}: ${err}` };
    vs.push(normalizeVerifier(raw));
  }
  return { ok: true, parsed: {
    amount, reward, bond, deadline: BigInt(dl),
    claimTimeout: BigInt(f.claimTimeoutSec), verifiers: vs as [`0x${string}`, `0x${string}`, `0x${string}`] & `0x${string}`[] } };
}

function normalizeVerifier(raw: string): `0x${string}` {
  const v = raw.trim();
  try { return v.startsWith("0x") ? v as `0x${string}` : qorToEvm(v); }
  catch { return "0x0000000000000000000000000000000000000000"; }
}

/** Per-field verifier error (undefined when the field is empty or valid). */
export function verifierFieldError(
  raw: string, index: number, all: string[], funder?: string,
): string | undefined {
  const v = raw.trim();
  if (!v) return "Required — three verifier addresses.";
  let evm: `0x${string}`;
  try { evm = v.startsWith("0x") ? v as `0x${string}` : qorToEvm(v); }
  catch { return "Not a valid 0x or qor1 address."; }
  if (!isAddress(evm, { strict: false })) return "Invalid address.";
  if (evm === "0x0000000000000000000000000000000000000000") return "Cannot be the zero address.";
  if (funder && evm.toLowerCase() === funder.toLowerCase()) return "Equals the funder.";
  if (all.some((o, j) => j !== index && o.trim()
    && normalizeVerifier(o).toLowerCase() === evm.toLowerCase())) {
    return "Duplicated — verifier addresses must differ.";
  }
  return undefined;
}

function VerifierInput({ i, value, onChange, live, checking, error }:
  { i: number; value: string; onChange: (v: string) => void;
    live: boolean | undefined; checking: boolean; error?: string | undefined }) {
  const show = value.trim().length > 0;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={show && !!error}
          aria-label={`Verifier ${i + 1}`}
          placeholder={`Verifier ${i + 1} — 0x… or qor1…`}
          className={`w-full rounded-lg border bg-ink-900 px-3 py-2 font-mono text-sm text-paper-100 placeholder:text-ink-500 focus:outline-none focus:ring-1 focus:ring-vermilion ${
            show && error ? "border-vermilion/60" : "border-white/10"}`} />
        {checking && <span className="shrink-0 text-xs text-ink-400">checking…</span>}
        {live === true && <span className="shrink-0 rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] text-emerald-300">PQ live</span>}
        {live === false && <span className="shrink-0 rounded-full border border-vermilion/50 px-2 py-0.5 text-[10px] text-vermilion">no key</span>}
      </div>
      {show && error && <p role="alert" className="mt-1 text-xs text-vermilion">{error}</p>}
      {show && !error && live === false && (
        <p role="alert" className="mt-1 text-xs text-vermilion">No live ML-DSA-87 key registered — ineligible as a verifier.</p>
      )}
    </div>
  );
}

function ItemPreview({ gref }: { gref: GithubRef }) {
  const q = useQuery({
    queryKey: ["gh", gref.kind ? "pull" : "issue", gref.ownerRepo, gref.number],
    queryFn: (): Promise<GhIssue | GhPull> =>
      gref.kind === 1 ? getPull(gref.ownerRepo, gref.number) : getIssue(gref.ownerRepo, gref.number),
    staleTime: 60_000, retry: false,
  });
  if (q.isPending) return <div className="mt-3 animate-pulse rounded-lg bg-white/5 p-4 text-sm text-ink-400">Fetching from GitHub…</div>;
  if (q.error) {
    return <div role="alert" className="mt-3 rounded-lg border border-vermilion/40 bg-vermilion/5 p-4 text-sm text-paper-200">
      {q.error instanceof GithubRateLimitError ? q.error.message : "Couldn't fetch that item — check the URL."}
    </div>;
  }
  const d = q.data;
  const warn = gref.kind === 0 && d.state !== "open"
    ? "This issue is closed — contributors usually can't merge against it."
    : gref.kind === 1 && (d as GhPull).merged
      ? "This PR is already merged — a verdict may be signed immediately."
      : gref.kind === 1 && d.state !== "open" ? "This PR is closed without merging." : null;
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-paper-100">{d.title}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${d.state === "open" ? "border-emerald-400/40 text-emerald-300" : "border-zinc-500/40 text-zinc-400"}`}>{d.state}</span>
        {gref.kind === 1 && (d as GhPull).merged && <span className="rounded-full border border-sky-400/40 px-2 py-0.5 text-[10px] text-sky-300">merged</span>}
      </div>
      <p className="mt-1 font-mono text-xs text-ink-300">{gref.ownerRepo}{gref.kind ? "/pull/" : "#"}{gref.number} · {d.user?.login}</p>
      {warn && <p role="alert" className="mt-2 text-sm text-amber-300">{warn}</p>}
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
  const [preset, setPreset] = useState<number | "custom">(86400);
  const [customTimeout, setCustomTimeout] = useState("24");
  const claimTimeoutSec = preset === "custom" ? Math.floor(Number(customTimeout) * 3600) : preset;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = new Date(Date.now() + 3 * 86400_000);
  const [deadlineLocal, setDeadlineLocal] = useState(
    new Date(local.getTime() - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [verifiers, setVerifiers] = useState(["", "", ""]);
  const [keyStates, setKeyStates] = useState<(boolean | undefined)[]>([undefined, undefined, undefined]);
  const [checkingKeys, setCheckingKeys] = useState(false);

  const form = validateForm({
    amount, reward, bond, deadlineLocal, claimTimeoutSec,
    verifiers, ...(address ? { funder: address } : {}),
  });

  const checkKeys = async (vs: `0x${string}`[]) => {
    setCheckingKeys(true);
    const out: (boolean | undefined)[] = [];
    const seen = new Set<string>();
    let shared = false;
    for (const v of vs) {
      const pk = await livePqcKey(v).catch(() => null);
      if (!pk) { out.push(false); continue; }
      if (seen.has(pk.toLowerCase())) shared = true;
      seen.add(pk.toLowerCase());
      out.push(true);
    }
    setKeyStates(out);
    setCheckingKeys(false);
    return shared;
  };

  const submit = async () => {
    if (!form.ok || !gref) return;
    const shared = await checkKeys(form.parsed.verifiers);
    if (shared) {
      toast({ kind: "error", text: "Two verifier slots share the same PQ key." });
      return;
    }
    if (keyStates.includes(false)) {
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
      <h1 className="font-serif text-4xl font-semibold text-paper-100">Fund an issue</h1>
      <p className="mt-2 text-sm text-ink-300">
        Escrow test QOR against a real GitHub item on diana. No monetary value.
      </p>

      <label className="mt-8 block text-sm">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">GitHub issue or PR URL</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo/issues/42"
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 font-mono text-sm text-paper-100 placeholder:text-ink-500 focus:outline-none focus:ring-1 focus:ring-vermilion" />
      </label>
      {urlTouched && !gref && (
        <p role="alert" className="mt-2 text-sm text-vermilion">
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
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">{label as string} (QOR)</span>
            <input value={val as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 font-mono text-sm text-paper-100 focus:outline-none focus:ring-1 focus:ring-vermilion" />
          </label>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Deadline ({tz})</span>
          <input type="datetime-local" value={deadlineLocal}
            onChange={(e) => setDeadlineLocal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2 font-mono text-sm text-paper-100 focus:outline-none focus:ring-1 focus:ring-vermilion" />
          <span className="mt-1 block font-mono text-[10px] text-ink-400">
            {Number.isFinite(new Date(deadlineLocal).getTime())
              ? new Date(deadlineLocal).toISOString().replace("T", " ").slice(0, 16) + " UTC" : ""}
          </span>
        </label>
        <div className="text-sm">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">Claim timeout</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CLAIM_PRESETS.map((p) => (
              <button key={p.sec} type="button"
                onClick={() => setPreset(p.sec)}
                className={`rounded-full border px-3 py-1 text-xs ${preset === p.sec ? "border-vermilion bg-vermilion/15 text-vermilion" : "border-white/10 text-ink-300"}`}>
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => setPreset("custom")}
              className={`rounded-full border px-3 py-1 text-xs ${preset === "custom" ? "border-vermilion bg-vermilion/15 text-vermilion" : "border-white/10 text-ink-300"}`}>
              custom
            </button>
          </div>
          {preset === "custom" && (
            <label className="mt-2 flex items-center gap-2 font-mono text-xs text-ink-300">
              <input value={customTimeout} onChange={(e) => setCustomTimeout(e.target.value)}
                className="w-20 rounded border border-white/10 bg-ink-900 px-2 py-1 text-paper-100" /> hours (1–168)
            </label>
          )}
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
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
                const ks = [...keyStates]; ks[i] = undefined; setKeyStates(ks);
              }} />
          ))}
        </div>
      </fieldset>

      {!form.ok && (
        <p role="alert" className="mt-4 text-sm text-vermilion">{form.error}</p>
      )}

      <div className="mt-6 rounded-xl border border-white/10 bg-ink-900/60 p-5">
        <div className="flex justify-between text-sm">
          <span className="text-ink-300">You send now</span>
          <span className="font-mono text-paper-100">{total} QOR <span className="text-[10px] uppercase text-vermilion">testnet</span></span>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          amount + challenge reward. The bond is only required to dispute a verdict.
          If no valid claim is merged, you can refund after the deadline.
        </p>
      </div>

      <TxStatusPanel state={tx.state} />

      {!isConnected ? (
        <p className="mt-6 text-sm text-ink-300">Connect an EVM wallet to continue.</p>
      ) : (
        <button onClick={() => void submit()}
          disabled={!form.ok || !gref || tx.state.phase === "checking" || tx.state.phase === "simulating"
            || tx.state.phase === "wallet" || tx.state.phase === "submitted" || tx.state.phase === "confirming"}
          className="mt-6 w-full rounded-lg bg-vermilion px-6 py-3 font-medium text-ink-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
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
