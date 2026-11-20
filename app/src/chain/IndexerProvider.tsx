import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Log, type WatchContractEventReturnType } from "viem";
import { httpClient, wsPublicClient } from "./client";
import { ESCROW_ADDRESS, DEPLOY_BLOCK } from "./config";
import { postmarkEscrowAbi } from "./abi";
import { decodeLogs } from "./indexer";

type Feed = "connecting" | "live" | "polling";
const FeedContext = createContext<Feed>("connecting");
export const useFeedStatus = () => useContext(FeedContext);

/** Subscribes to new escrow events (WS, HTTP poll fallback) and pokes
 * react-query so views refetch just what changed. */
export function IndexerProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [feed, setFeed] = useState<Feed>("connecting");
  const lastBlock = useRef<bigint>(DEPLOY_BLOCK - 1n);

  useEffect(() => {
    let unwatch: WatchContractEventReturnType | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let dead = false;

    const ingest = async (logs: Log[]) => {
      const evs = decodeLogs(logs);
      if (evs.length === 0) return;
      const touched = new Set<string>();
      for (const e of evs) {
        const args = e.args as Record<string, unknown>;
        if (typeof args.bountyId === "bigint") touched.add(args.bountyId.toString());
        if (e.blockNumber! > lastBlock.current) lastBlock.current = e.blockNumber!;
      }
      for (const id of touched) {
        void qc.invalidateQueries({ queryKey: ["bounty", id] });
      }
      void qc.invalidateQueries({ queryKey: ["index"] });
      void qc.invalidateQueries({ queryKey: ["totalLiabilities"] });
      void qc.invalidateQueries({ queryKey: ["nextBountyId"] });
    };

    const startPolling = () => {
      if (poll || dead) return;
      setFeed("polling");
      poll = setInterval(async () => {
        try {
          const head = await httpClient.getBlockNumber();
          if (head <= lastBlock.current) return;
          const logs = await httpClient.getLogs({
            address: ESCROW_ADDRESS,
            fromBlock: lastBlock.current + 1n, toBlock: head,
          });
          await ingest(logs);
        } catch { /* transient; try again next tick */ }
      }, 6000);
    };

    let wsRetry: ReturnType<typeof setTimeout> | undefined;
    let healthy: ReturnType<typeof setTimeout> | undefined;

    const startWs = () => {
      if (dead) return;
      setFeed((f) => (f === "live" ? f : "connecting"));
      try {
        unwatch = wsPublicClient().watchContractEvent({
          address: ESCROW_ADDRESS,
          abi: postmarkEscrowAbi,
          onLogs: (logs) => { void ingest(logs as Log[]); },
          onError: () => {
            unwatch?.(); unwatch = undefined;
            if (healthy) clearTimeout(healthy);
            startPolling();
            // the node can be stable (eth_subscribe works) but drops idle
            // sockets — back off and try again instead of staying on polling
            wsRetry = setTimeout(startWs, 25_000);
          },
          pollingInterval: 6000,
        });
        // only declare "live" once the watch survived a grace period without
        // an error — avoids flickering live→polling on a dead socket
        healthy = setTimeout(() => {
          if (!dead && unwatch) { setFeed("live"); poll && clearInterval(poll); poll = undefined; }
        }, 4_000);
      } catch {
        startPolling();
        wsRetry = setTimeout(startWs, 25_000);
      }
    };

    (async () => {
      try {
        const head = await httpClient.getBlockNumber();
        lastBlock.current = head;
      } catch { /* polling will recover */ }
      startPolling(); // never blind while the WS comes up
      startWs();
    })();

    return () => {
      dead = true;
      unwatch?.();
      if (poll) clearInterval(poll);
      if (wsRetry) clearTimeout(wsRetry);
      if (healthy) clearTimeout(healthy);
    };
  }, [qc]);

  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}
