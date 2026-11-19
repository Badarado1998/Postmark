import { decodeAbiParameters, keccak256 } from "viem";
import { httpClient } from "./client";
import { REST, PQC_KEY_STATUS_PRECOMPILE } from "./config";

export interface PqcStatus {
  registered: boolean;
  algorithmId: number;
  pubkey: `0x${string}`;
  possessionProven: boolean;
  live: boolean;
  pubkeySha256?: string;
}

/** pqcKeyStatus via eth_call on the diana precompile; fails closed. */
export async function pqcKeyStatus(account: `0x${string}`): Promise<PqcStatus> {
  const data = "0x850dfe51" + account.slice(2).padStart(64, "0"); // pqcKeyStatus(address)
  const res = await httpClient.request({
    method: "eth_call",
    params: [{ to: PQC_KEY_STATUS_PRECOMPILE, data: data as `0x${string}` }, "latest"],
  });
  if (!res || res === "0x") throw new Error("pqcKeyStatus precompile returned empty");
  const [registered, algorithmId, pubkey, possessionProven] = decodeAbiParameters(
    [
      { name: "registered", type: "bool" },
      { name: "algorithmId", type: "uint8" },
      { name: "pubkey", type: "bytes" },
      { name: "possessionProven", type: "bool" },
    ], res);
  return {
    registered, algorithmId: Number(algorithmId), pubkey: pubkey as `0x${string}`,
    possessionProven,
    live: registered && Number(algorithmId) === 1 && (pubkey as string).length === 2 + 2592 * 2
      && possessionProven,
  };
}

/** REST mirror of the key for cross-checking (returns sha256 of the pubkey). */
export async function pqcRestStatus(qorAddr: string) {
  const res = await fetch(`${REST}/qorechain/pqc/v1/account/${qorAddr}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pqc REST ${res.status}`);
  return res.json() as Promise<{ algorithm_id?: number; public_key?: string;
    possession_proven?: boolean; created_at_height?: string }>;
}

/** Registered ML-DSA-87 key for an account, or null. */
export async function livePqcKey(account: `0x${string}`): Promise<`0x${string}` | null> {
  try {
    const s = await pqcKeyStatus(account);
    return s.live ? s.pubkey : null;
  } catch {
    return null;
  }
}

export const pubkeyKeccak = (pk: `0x${string}`) => keccak256(pk);
