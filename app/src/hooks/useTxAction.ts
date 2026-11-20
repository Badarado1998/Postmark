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
  gasLimit?: bigint | undefined;
  maxFeeWei?: bigint | undefined;
}

// diana feemarket: min_gas_multiplier 0.5 — a tx pays at least half its limit,
// so the limit must be a real estimate, not a generous constant.
const FEE_CAP_WEI = 112_500_000_000n; // 112.5 gwei

// used only if eth_estimateGas fails but the call itself simulates fine
const FALLBACK_GAS: Record<string, bigint> = {
  createBounty: 900_000n, claim: 400_000n, dispute: 500_000n,
  refundExpired: 300_000n, finalize: 300_000n, reopen: 300_000n,
  withdraw: 250_000n, submitVerdict: 2_500_000n, resolveDispute: 2_500_000n,
};

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
      // gas first: estimate from the sender with value. An estimate failure is
      // usually a revert — but the window preflight comes before simulation so a
      // window-less wallet still gets the QoreX guide instead of an RPC error.
      setState({ phase: "simulating" });
      let gasLimit: bigint;
      let estimateFailed = false;
      try {
        const est = await httpClient.estimateContractGas({
          address: ESCROW_ADDRESS, abi: escrow.abi as Abi,
          functionName: req.functionName,
          args: req.args as ContractFunctionArgs,
          account: address, value: req.value,
        });
        gasLimit = req.gas ?? (est * 125n) / 100n + 1n;
      } catch {
        estimateFailed = true;
        gasLimit = req.gas ?? FALLBACK_GAS[req.functionName] ?? 800_000n;
      }
      const maxFeeWei = gasLimit * FEE_CAP_WEI;
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
        maxFeeWei,
        escrow: ESCROW_ADDRESS,
      });
      if (!pre.ok) {
        setState({ phase: "blocked", blockReason: pre.reason, guide: pre.guide,
          gasLimit, maxFeeWei });
        return;
      }
      if (estimateFailed) {
        // decode the real revert now that the window is known-good
        try {
          await httpClient.simulateContract({
            address: ESCROW_ADDRESS, abi: escrow.abi as Abi,
            functionName: req.functionName,
            args: req.args as ContractFunctionArgs,
            account: address, value: req.value,
          });
        } catch (e2) {
          setState({ phase: "failed", error: explainError(e2) });
          return;
        }
      }
      setState({ phase: "wallet", gasLimit, maxFeeWei });
      let hash: `0x${string}`;
      try {
        hash = await writeContractAsync({
          address: ESCROW_ADDRESS, abi: escrow.abi as Abi,
          functionName: req.functionName,
          args: req.args as ContractFunctionArgs,
          value: req.value,
          gas: gasLimit,
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
      setState({ phase: "submitted", hash, gasLimit, maxFeeWei });
      setState({ phase: "confirming", hash, gasLimit, maxFeeWei });
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
      setState({ phase: "confirmed", hash, gasLimit, maxFeeWei });
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
