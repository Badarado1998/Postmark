import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { useQorex } from "../wallet/qorex";
import { useEvmWindow, usePqcStatus, useQorEvm } from "../hooks/queries";
import { diana } from "../chain/config";
import { shortAddr } from "./ui";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const qorex = useQorex();
  const qorEvm = useQorEvm(qorex.qorAddress);
  const evmAddr = isConnected ? address : qorEvm;
  const pqc = usePqcStatus(evmAddr);
  const win = useEvmWindow(qorex.qorAddress);

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2">
        {qorex.installed && (
          <span className="hidden rounded-full border border-sky-400/30 px-2.5 py-1 text-xs text-sky-300 md:inline"
            title={qorex.qorAddress
              ? `QoreX connected for identity: ${qorex.qorAddress}. It cannot send EVM transactions yet.`
              : "QoreX detected — connect it in the extension to use it for identity"}>
            QoreX{qorex.qorAddress ? ` · ${qorex.qorAddress.slice(0, 10)}…` : ""}
          </span>
        )}
        {connectors.map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c, chainId: diana.id })}
            disabled={isPending}
            className="rounded-lg bg-vermilion px-4 py-1.5 text-sm font-medium text-ink-950 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion disabled:opacity-50">
            {isPending ? "Connecting…" : "Connect wallet"}
          </button>
        ))}
      </div>
    );
  }

  const wrongChain = chainId !== diana.id;
  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <button onClick={() => switchChain({ chainId: diana.id })}
          className="rounded-lg border border-vermilion px-3 py-1 text-xs font-medium text-vermilion hover:bg-vermilion/10">
          Switch to diana (9800)
        </button>
      )}
      {!wrongChain && win.data && !win.data.live && (
        <span className="hidden rounded-full border border-amber-400/30 px-2.5 py-1 text-xs text-amber-300 md:inline"
          title="No open EVM authorisation window. To send transactions, open one in QoreX scoped to the escrow address.">
          No EVM window
        </span>
      )}
      {pqc.data && (
        <span className={`hidden rounded-full border px-2.5 py-1 text-xs md:inline ${
          pqc.data.live ? "border-emerald-400/30 text-emerald-300" : "border-zinc-500/40 text-zinc-400"}`}
          title={pqc.data.live ? "Live ML-DSA-87 key registered" : "No live ML-DSA-87 key"}>
          {pqc.data.live ? "PQ key" : "no PQ key"}
        </span>
      )}
      <button onClick={() => disconnect()}
        className="rounded-lg border border-paper-300/25 px-3 py-1.5 font-mono text-xs text-paper-200 hover:bg-white/5"
        title={address}>
        {shortAddr(address)}
      </button>
    </div>
  );
}
