import { useQuery } from "@tanstack/react-query";
import { getBounty, httpClient, escrow, nextBountyId, totalLiabilities } from "../chain/client";
import { fetchIndex, type IndexerState } from "../chain/indexer";
import { pqcKeyStatus, type PqcStatus } from "../chain/pqc";
import { fetchEvmWindow } from "../chain/window";
import { getIssue, getPull, type GhIssue, type GhPull } from "../github/client";
import type { WorkItem } from "../github/parse";

export const useIndex = () => useQuery<IndexerState>({
  queryKey: ["index"], queryFn: fetchIndex,
  staleTime: 30_000, refetchOnWindowFocus: false,
});

export const useBounty = (id: bigint | undefined) => useQuery({
  queryKey: ["bounty", id?.toString()],
  queryFn: () => getBounty(id!),
  enabled: id !== undefined,
  staleTime: 10_000,
});

export const useNextBountyId = () => useQuery({
  queryKey: ["nextBountyId"], queryFn: nextBountyId, staleTime: 15_000,
});

export const useTotalLiabilities = () => useQuery({
  queryKey: ["totalLiabilities"], queryFn: totalLiabilities, staleTime: 15_000,
});

export const usePqcStatus = (account: `0x${string}` | undefined) => useQuery<PqcStatus>({
  queryKey: ["pqc", account],
  queryFn: () => pqcKeyStatus(account!),
  enabled: !!account,
  staleTime: 60_000, retry: 1,
});

export const useEvmWindow = (addr: string | undefined | null) => useQuery({
  queryKey: ["evmWindow", addr],
  queryFn: () => fetchEvmWindow(addr!),
  enabled: !!addr,
  staleTime: 15_000, retry: 1,
});
/** One multicall getBounty over every indexed id. */
export const useBounties = (ids: bigint[] | undefined) => useQuery({
  queryKey: ["bounties", ids?.map(String).join(",")],
  enabled: !!ids,
  queryFn: async () => {
    // diana has no multicall3 contract — plain parallel reads
    const res = await Promise.allSettled(ids!.map((id) =>
      httpClient.readContract({
        ...escrow, functionName: "getBounty", args: [id],
      })));
    return res.map((r, i) => ({
      id: ids![i]!,
      bounty: r.status === "fulfilled" ? r.value : null,
    }));
  },
  staleTime: 10_000,
});

/** The GitHub issue or pull request a bounty (or a form field) points at. */
export const useGithubItem = (w: WorkItem, opts: {
  staleTime?: number; enabled?: boolean; retry?: boolean | ((count: number, err: unknown) => boolean);
} = {}) => useQuery<GhIssue | GhPull>({
  queryKey: ["gh", w.kind === 1 ? "pull" : "issue", w.ownerRepo, Number(w.number)],
  queryFn: () => (w.kind === 1
    ? getPull(w.ownerRepo, Number(w.number)) : getIssue(w.ownerRepo, Number(w.number))),
  staleTime: opts.staleTime ?? 5 * 60_000,
  enabled: opts.enabled ?? true,
  retry: opts.retry ?? false,
});

/** Latest block number, polled lightly; an error marks the network degraded. */
export const useBlockNumber = () => useQuery({
  queryKey: ["blockNumber"], queryFn: () => httpClient.getBlockNumber(),
  refetchInterval: 15_000, staleTime: 10_000, retry: false,
});
