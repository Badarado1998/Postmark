import {
  parseEventLogs, type Log, type ParseEventLogsReturnType,
} from "viem";
import { httpClient } from "./client";
import { ESCROW_ADDRESS, DEPLOY_BLOCK } from "./config";
import { postmarkEscrowAbi } from "./abi";
import { workHashOf } from "../formats/hashes";

export type EscrowLog = ParseEventLogsReturnType<typeof postmarkEscrowAbi>[number] & {
  blockNumber: bigint; transactionHash: `0x${string}`; logIndex: number;
};

export interface BountyMeta {
  ownerRepo: string;
  kind: number;
  number: bigint;
  workHash: `0x${string}`;
  /** true when the emitted metadata does not hash back to the stored hash */
  workHashMismatch: boolean;
}

export interface IndexerState {
  events: EscrowLog[];
  metaById: Map<bigint, BountyMeta>;
  bountyIds: bigint[];
  lastBlock: bigint;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** getLogs over [from,to], halving the range on RPC limits and backing off. */
export async function getLogsChunked(
  fromBlock: bigint, toBlock: bigint,
): Promise<Log[]> {
  const out: Log[] = [];
  let chunk = 50_000n;
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    try {
      const logs = await httpClient.getLogs({
        address: ESCROW_ADDRESS, fromBlock: start, toBlock: end,
      });
      out.push(...logs);
      start = end + 1n;
      await sleep(60);
    } catch (e) {
      if (chunk > 500n) { chunk /= 5n; continue; }
      await sleep(1500); // one retry at min chunk before giving up
      const logs = await httpClient.getLogs({
        address: ESCROW_ADDRESS, fromBlock: start, toBlock: end,
      });
      out.push(...logs);
      start = end + 1n;
    }
  }
  return out;
}

/** Decode raw logs into typed escrow events, sorted canonically. */
export function decodeLogs(logs: Log[]): EscrowLog[] {
  return parseEventLogs({ abi: postmarkEscrowAbi, logs })
    .filter((l) => l.blockNumber != null && l.transactionHash != null) as EscrowLog[];
}

/** Fold a set of decoded events into the index state. */
export function indexEvents(events: EscrowLog[], toBlock: bigint): IndexerState {
  const metaById = new Map<bigint, BountyMeta>();
  const bountyIds: bigint[] = [];
  for (const e of events) {
    if (e.eventName === "BountyCreated") {
      const id = (e.args as { bountyId: bigint }).bountyId;
      if (!bountyIds.includes(id)) bountyIds.push(id);
    }
    if (e.eventName === "BountyWork") {
      const a = e.args as {
        bountyId: bigint; workHash: `0x${string}`;
        ownerRepo: string; kind: number; number: bigint;
      };
      const recomputed = workHashOf(a.ownerRepo, a.kind, a.number);
      metaById.set(a.bountyId, {
        ownerRepo: a.ownerRepo, kind: Number(a.kind), number: a.number,
        workHash: a.workHash, workHashMismatch: recomputed !== a.workHash,
      });
    }
  }
  return { events, metaById, bountyIds, lastBlock: toBlock };
}

/** Fetch the full event history from the deploy block. */
export async function fetchIndex(): Promise<IndexerState> {
  const head = await httpClient.getBlockNumber();
  const logs = await getLogsChunked(DEPLOY_BLOCK, head);
  return indexEvents(decodeLogs(logs), head);
}
