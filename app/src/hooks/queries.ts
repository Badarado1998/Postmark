import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBounty, nextBountyId, totalLiabilities } from "../chain/client";
import { fetchIndex, type IndexerState } from "../chain/indexer";
import { pqcKeyStatus, type PqcStatus } from "../chain/pqc";
import { fetchEvmWindow } from "../chain/window";
import { qorToEvm } from "../chain/bech32";

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
export const useQorEvm = (qor: string | null | undefined) => {
  try { return qor ? qorToEvm(qor) : undefined; } catch { return undefined; }
};
export const useInvalidateBounty = () => {
  const qc = useQueryClient();
  return (id: bigint) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["bounty", id.toString()] }),
      qc.invalidateQueries({ queryKey: ["totalLiabilities"] }),
    ]);
};

import { httpClient, escrow } from "../chain/client";

/** One multicall getBounty over every indexed id. */
export const useBounties = (ids: bigint[] | undefined) => useQuery({
  queryKey: ["bounties", ids?.map(String).join(",")],
  enabled: !!ids,
  queryFn: async () => {
    const res = await httpClient.multicall({
      contracts: ids!.map((id) => ({
        ...escrow, functionName: "getBounty" as const, args: [id] as const,
      })),
    });
    return res.map((r, i) => ({
      id: ids![i]!,
      bounty: r.status === "success" ? r.result : null,
    }));
  },
  staleTime: 10_000,
});
