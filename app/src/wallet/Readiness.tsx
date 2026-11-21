import type { ReactNode } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { QOREX_DOWNLOAD_URLS } from "@qorechain/qorex-types";
import { httpClient } from "../chain/client";
import { ESCROW_ADDRESS } from "../chain/config";
import { evmToQor } from "../chain/bech32";
import { preflightTx } from "../chain/preflight";
import type { EvmWindow } from "../chain/window";
import { useEvmWindow, usePqcStatus } from "../hooks/queries";
import { Card, SectionLabel } from "../components/ui";
import { useQorex } from "./qorex";
import { accountMismatchMessage } from "./signerPreference";

export const FAUCET_URL = "https://dashboard.qorechain.io";

export type RowStatus = "ok" | "todo" | "wait";
export type RowAction =
  | { kind: "connect" } | { kind: "switch" } | { kind: "enable" }
  | { kind: "link"; href: string; label: string };
export interface ReadinessRow { id: string; label: string; status: RowStatus; hint?: string | undefined; action?: RowAction }

export interface ReadinessInput {
  connected: boolean;
  chainId: number | undefined;
  qorexInstalled: boolean;
  qorAddress: string | null;
  account: string | undefined;
  pqcLive: boolean | undefined;
  window: EvmWindow | undefined;
  neededWei: bigint;
  balanceWei: bigint | undefined;
}

const FEE_MARGIN_WEI = 10n ** 16n; // 0.01 QOR for gas

/** The "Before you fund" rows: each with a status and one fix. Pure, so every state is unit-tested. */
export function readinessRows(i: ReadinessInput): ReadinessRow[] {
  const mismatch = i.connected ? accountMismatchMessage(i.qorAddress, i.account) : null;
  const rows: ReadinessRow[] = [];
  rows.push(i.connected
    ? { id: "wallet", label: "Wallet connected", status: "ok" }
    : { id: "wallet", label: "Connect your wallet", status: "todo", action: { kind: "connect" } });
  rows.push(!i.connected ? { id: "chain", label: "On QoreChain diana", status: "wait" }
    : i.chainId === 9800 ? { id: "chain", label: "On QoreChain diana", status: "ok" }
    : { id: "chain", label: "On QoreChain diana", status: "todo", hint: "Your wallet is on another network.", action: { kind: "switch" } });
  rows.push(!i.qorexInstalled
    ? { id: "qorex", label: "Same account as QoreX", status: "todo", hint: "Install QoreX to sign with your post-quantum key.",
        action: { kind: "link", href: QOREX_DOWNLOAD_URLS.chrome, label: "Get QoreX" } }
    : mismatch ? { id: "qorex", label: "Same account as QoreX", status: "todo", hint: mismatch }
    : !i.qorAddress ? { id: "qorex", label: "Same account as QoreX", status: "todo", hint: "Open QoreX and connect this site." }
    : { id: "qorex", label: "Same account as QoreX", status: "ok" });
  rows.push(i.pqcLive === true ? { id: "pqc", label: "Post-quantum key registered", status: "ok" }
    : i.pqcLive === false ? { id: "pqc", label: "Post-quantum key registered", status: "todo",
        hint: "Make one send in QoreX to register it.", action: { kind: "link", href: "/start", label: "How" } }
    : { id: "pqc", label: "Post-quantum key registered", status: "wait" });
  const pre = i.connected ? preflightTx({
    connected: true, chainId: 9800, pqcLive: undefined, window: i.window,
    valueWei: i.neededWei, maxFeeWei: FEE_MARGIN_WEI, escrow: ESCROW_ADDRESS }) : null;
  rows.push(!i.connected ? { id: "window", label: "Transactions enabled", status: "wait" }
    : pre?.ok ? { id: "window", label: "Transactions enabled", status: "ok" }
    : { id: "window", label: "Transactions enabled", status: "todo", hint: pre?.ok === false ? pre.reason : undefined,
        action: { kind: "enable" } });
  rows.push(i.balanceWei === undefined ? { id: "balance", label: "Enough test QOR", status: "wait" }
    : i.balanceWei >= i.neededWei + FEE_MARGIN_WEI ? { id: "balance", label: "Enough test QOR", status: "ok" }
    : { id: "balance", label: "Enough test QOR", status: "todo", hint: "Get free test QOR from the faucet.",
        action: { kind: "link", href: FAUCET_URL, label: "Open faucet" } });
  return rows;
}

const ICON: Record<RowStatus, ReactNode> = {
  ok: <span className="grid size-5 place-items-center rounded-full bg-deep text-[11px] text-paper" aria-hidden>✓</span>,
  todo: <span className="grid size-5 place-items-center rounded-full bg-salmon text-[11px] font-bold text-ink" aria-hidden>!</span>,
  wait: <span className="grid size-5 place-items-center rounded-full bg-ink/10 text-[11px] text-gray" aria-hidden>…</span>,
};
const STATUS_TEXT: Record<RowStatus, string> = { ok: "ready", todo: "needs attention", wait: "waiting" };

export function ReadinessChecklist({ neededWei, onEnable, title = "Before you fund" }: {
  neededWei: bigint; onEnable?: (neededWei: bigint) => void; title?: string;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const qorex = useQorex();
  const pqc = usePqcStatus(address);
  const win = useEvmWindow(address ? evmToQor(address) : undefined);
  const balance = useQuery({
    queryKey: ["balance", address], enabled: !!address, staleTime: 15_000,
    queryFn: () => httpClient.getBalance({ address: address! }),
  });
  const rows = readinessRows({
    connected: isConnected, chainId: isConnected ? chainId : undefined,
    qorexInstalled: qorex.installed, qorAddress: qorex.qorAddress, account: address,
    pqcLive: isConnected ? pqc.data?.live : undefined, window: win.data, neededWei, balanceWei: balance.data,
  });
  const run = (a: RowAction) => {
    if (a.kind === "connect") document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')?.click();
    else if (a.kind === "switch") switchChain({ chainId: 9800 });
    else if (a.kind === "enable") onEnable?.(neededWei);
  };
  const btn = "shrink-0 rounded-md border border-ink/20 bg-white px-2.5 py-1 text-xs font-medium hover:bg-ink/5";
  return (
    <Card>
      <SectionLabel>{title}</SectionLabel>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start gap-2.5">
            <span className="mt-0.5">{ICON[r.status]}</span>
            <div className="min-w-0 grow">
              <p className="text-sm font-medium leading-tight">{r.label} <span className="sr-only">— {STATUS_TEXT[r.status]}</span></p>
              {r.status === "todo" && r.hint && <p className="mt-0.5 text-xs text-charcoal">{r.hint}</p>}
            </div>
            {r.status === "todo" && r.action && (
              r.action.kind === "link"
                ? <a className={btn} href={r.action.href} target={r.action.href.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{r.action.label}</a>
                : r.action.kind === "enable" && !onEnable ? null
                : <button type="button" className={btn} onClick={() => run(r.action!)}>
                    {r.action.kind === "connect" ? "Connect" : r.action.kind === "switch" ? "Switch" : "Enable"}
                  </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
