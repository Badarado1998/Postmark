import { existsSync } from "node:fs";
import { postmarkEscrowAbi } from "../../src/chain/abi.ts";
import { e2eLog, readJsonFile } from "../util.ts";
import { E2E_ESCROW, nodePublic, nodeWallet, verifierAddr } from "./accounts.ts";

const STATE_URL = new URL("../.signer-state.json", import.meta.url);
const CLAIM_WINDOW_SEC = 3600n;
const CLAIM_BUFFER_SEC = 600n;
const MIN_FUNDER_BALANCE = 300_000_000_000_000_000n;
const FUNDED_TERMS = [200_000_000_000_000_000n, 50_000_000_000_000_000n, 50_000_000_000_000_000n] as const;
const DUST_TERMS = [1_000n, 1_000n, 1_000n] as const;

export function signerState() {
  if (!existsSync(STATE_URL.pathname)) return null;
  return readJsonFile<{
    pairingCode: string; pid: number;
    signers?: Record<string, { pairingCode: string; pid: number; profile: string }>;
  }>(STATE_URL);
}

/** pairing code for the signer on `port` (default: the claimant's). */
export function pairingCodeFor(port = 47321): string {
  const s = signerState();
  const code = s?.signers?.[String(port)]?.pairingCode ?? s?.pairingCode;
  if (!code) throw new Error("no signer pairing code — global setup did not start signers");
  return code;
}

const unixNow = () => BigInt(Math.floor(Date.now() / 1000));

async function findReusableBounty(pub: ReturnType<typeof nodePublic>, next: bigint) {
  const now = unixNow();
  for (let id = next - 1n; id >= 1n; id--) {
    const b = await pub.readContract({ address: E2E_ESCROW, abi: postmarkEscrowAbi,
      functionName: "getBounty", args: [id] });
    if (b.state === 0 && b.deadline > now + b.claimTimeout + CLAIM_BUFFER_SEC) return id;
  }
  return null;
}

/** Reuse an existing Open bounty whose deadline still fits a 1 h claim
 * window; otherwise create one — via the e2e funder when it can afford gas,
 * else a dust-value bounty from the deployer (outside the e2e QOR budget;
 * createBounty is permissionless). */
export async function openBountyOrCreate(): Promise<bigint> {
  const pub = nodePublic();
  const next = await pub.readContract({
    address: E2E_ESCROW, abi: postmarkEscrowAbi, functionName: "nextBountyId" });
  const reusable = await findReusableBounty(pub, next);
  if (reusable !== null) {
    e2eLog("e2e", "reusing open bounty", reusable.toString());
    return reusable;
  }
  const funder = nodeWallet("funder");
  const gasPrice = await pub.getGasPrice();
  const balance = await pub.getBalance({ address: funder.account.address });
  const useFunder = balance > MIN_FUNDER_BALANCE + gasPrice * 1_000_000n;
  const wallet = useFunder ? funder : nodeWallet("../deployer");
  const [amount, reward, bond] = useFunder ? FUNDED_TERMS : DUST_TERMS;
  e2eLog("e2e", `creating bounty via ${useFunder ? "funder" : "deployer (dust)"}`);
  const hash = await wallet.writeContract({
    address: E2E_ESCROW, abi: postmarkEscrowAbi, functionName: "createBounty",
    args: [amount, "postmark-e2e/sandbox", 0, 1n, unixNow() + 3n * 3600n, CLAIM_WINDOW_SEC,
      [verifierAddr(0), verifierAddr(1), verifierAddr(2)], reward, bond],
    value: amount + reward,
    gas: 900_000n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`createBounty failed: ${hash}`);
  e2eLog("e2e", "spec bounty", next.toString(), "tx", hash);
  return next;
}
