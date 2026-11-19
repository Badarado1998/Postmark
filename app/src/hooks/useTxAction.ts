import { useCallback, useRef, useState } from "react";
import {
  useAccount, useChainId, useWriteContract, usePublicClient, useSwitchChain,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Abi, type ContractFunctionArgs } from "viem";
import { escrow, httpClient } from "../chain/client";
import { ESCROW_ADDRESS } from "../chain/config";
import { preflightTx } from "../chain/preflight";
import { explainError } from "../chain/errors";
import { evmToQor } from "../chain/bech32";
import { fetchEvmWindow } from "../chain/window";
import { pqcKeyStatus } from "../chain/pqc";
import { useToast } from "../components/Toasts";

export type TxPhase =
  | "idle" | "checking" | "blocked" | "simulating" | "ready"
  | "wallet" | "submitted" | "confirming" | "confirmed" | "failed";

export interface TxState {
  phase: TxPhase;
  blockReason?: string | undefined;
  guide?: { target: string; suggestedTxs: number; suggestedValueUqor: string } | undefined;
  hash?: `0x${string}` | undefined;
  error?: string | undefined;
}

const MAX_FEE_WEI = 800_000n * 112_500_000_000n; // 800k gas * 112.5 gwei upper bound for calls

export function useTxAction() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const walletClient = usePublicClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const running = useRef(false);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  const run = useCallback(async (req: {
    functionName: string;
    args: readonly unknown[];
    value?: bigint;
    gas?: bigint;
    onConfirmed?: (hash: `0x${string}`) => void;
    invalidates?: readonly (readonly unknown[])[];
  }) => {
    if (running.current) return;
    running.current = true;
    try {
      setState({ phase: "checking" });
      if (!isConnected || !address) {
        setState({ phase: "blocked", blockReason: "Connect an EVM wallet first." });
        return;
      }
      if (chainId !== 9800) {
        try { await switchChainAsync({ chainId: 9800 }); }
        catch { setState({ phase: "blocked", blockReason: "Switch the wallet to QoreChain diana (9800)." }); return; }
      }
      // fresh reads at submit time — never trust possibly-stale query state
      const [pqcData, winData] = await Promise.all([
        pqcKeyStatus(address).catch(() => undefined),
        fetchEvmWindow(evmToQor(address)).catch(() => undefined),
      ]);
      const pre = preflightTx({
        connected: true, chainId: 9800,
        pqcLive: pqcData?.live,
        window: winData,
        valueWei: req.value ?? 0n,
        maxFeeWei: MAX_FEE_WEI,
        escrow: ESCROW_ADDRESS,
      });
      if (!pre.ok) {
        setState({ phase: "blocked", blockReason: pre.reason, guide: pre.guide });
        return;
      }
      setState({ phase: "simulating" });
      try {
        await httpClient.simulateContract({
          address: ESCROW_ADDRESS, abi: escrow.abi as Abi,
          functionName: req.functionName,
          args: req.args as ContractFunctionArgs,
          account: address, value: req.value,
          gas: req.gas ?? 1_500_000n,
        });
      } catch (e) {
        setState({ phase: "failed", error: explainError(e) });
        return;
      }
      setState({ phase: "wallet" });
      let hash: `0x${string}`;
      try {
        hash = await writeContractAsync({
          address: ESCROW_ADDRESS, abi: escrow.abi as Abi,
          functionName: req.functionName,
          args: req.args as ContractFunctionArgs,
          value: req.value,
          gas: req.gas ?? 1_500_000n, // public RPC caps estimation; fixed limit
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/user rejected|denied|rejected the request/i.test(msg)) {
          setState({ phase: "ready", error: "Rejected in the wallet — nothing was sent." });
          return;
        }
        setState({ phase: "failed", error: explainError(e) });
        return;
      }
      setState({ phase: "submitted", hash });
      setState({ phase: "confirming", hash });
      try {
        const receipt = await (walletClient ?? httpClient).waitForTransactionReceipt({
          hash, timeout: 120_000,
        });
        if (receipt.status !== "success") {
          setState({ phase: "failed", hash, error: "The transaction reverted on chain." });
          return;
        }
      } catch (e) {
        setState({ phase: "failed", hash,
          error: `Still unconfirmed — check the explorer. ${explainError(e)}` });
        return;
      }
      setState({ phase: "confirmed", hash });
      for (const key of req.invalidates ?? []) {
        void qc.invalidateQueries({ queryKey: [...key] });
      }
      void qc.invalidateQueries({ queryKey: ["index"] });
      req.onConfirmed?.(hash);
    } finally {
      running.current = false;
    }
  }, [address, isConnected, chainId, switchChainAsync, writeContractAsync,
      walletClient, qc]);

  return { state, run, reset, toast };
}
