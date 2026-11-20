// Client for the local PQ signer (scripts/signer.mjs serve) on 127.0.0.1.
// The pairing code is pasted once per tab and kept in sessionStorage.

const PAIR_KEY = "pm-signer-pair";
export const SIGNER_URL = "http://127.0.0.1:47321";

export function pairingCode(): string | null {
  return sessionStorage.getItem(PAIR_KEY);
}
export function setPairingCode(code: string | null) {
  if (code) sessionStorage.setItem(PAIR_KEY, code);
  else sessionStorage.removeItem(PAIR_KEY);
}

export interface SignerStatus {
  address: `0x${string}`; qor1: string; pubkeySha256: string;
  live: boolean; escrow: `0x${string}`; chainId: number;
}

export class SignerError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const code = pairingCode();
  let res: Response;
  try {
    res = await fetch(`${SIGNER_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "x-postmark-pair": code ?? "",
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
    });
  } catch {
    throw new SignerError(0, "Local signer not reachable — is `npm run signer -- serve` running?");
  }
  const body = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) {
    if (res.status === 401) {
      throw new SignerError(401, "Pairing code rejected — paste the code shown in the signer terminal.");
    }
    throw new SignerError(res.status, body.error ?? `signer error ${res.status}`);
  }
  return body as T;
}

export const signerStatus = () => req<SignerStatus>("/status");

export function signClaim(input: {
  bountyId: bigint; identityHash: `0x${string}`; claimRound: bigint;
}) {
  return req<{ signature: `0x${string}`; signer: `0x${string}`; pubkeySha256: string }>(
    "/sign", {
      method: "POST",
      body: JSON.stringify({
        kind: "claim",
        bountyId: input.bountyId.toString(),
        identityHash: input.identityHash,
        claimRound: input.claimRound.toString(),
      }),
    });
}
