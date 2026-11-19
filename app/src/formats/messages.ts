import {
  concatHex, encodeAbiParameters, keccak256, stringToBytes, stringToHex, type Hex,
} from "viem";
import { MESSAGE_PREFIX, ESCROW_ADDRESS } from "../chain/config";

export const CLAIM_TYPEHASH = keccak256(stringToBytes(
  "ClaimV1(uint256 chainId,address escrow,uint256 bountyId,address claimant,bytes32 identityHash,uint256 claimRound)"));
export const VERDICT_TYPEHASH = keccak256(stringToBytes(
  "PostmarkEscrowVerdictV1(uint256 chainId,address escrow,uint256 bountyId,uint8 phase,uint8 outcome,address payee,uint64 mergedAt,bytes32 evidenceHash,uint256 nonce,uint256 claimRound,bytes32 disputedVerdictHash,bytes32 disputeEvidenceHash)"));

const PREFIX = stringToHex(MESSAGE_PREFIX);

export interface VerdictFields {
  bountyId: bigint;
  phase: number;          // 0 INITIAL, 1 DISPUTE
  outcome: number;        // 0 PAY, 1 REFUND
  payee: `0x${string}`;
  mergedAt: bigint;
  evidenceHash: Hex;
  nonce: bigint;
  claimRound: bigint;
  disputedVerdictHash: Hex;
  disputeEvidenceHash: Hex;
}

/** "qorechain-msg-v1|<chain>|" || abi.encode(CLAIM_TYPEHASH, chainId, escrow, ...) */
export function claimMessage(
  bountyId: bigint, claimant: `0x${string}`, identityHash: Hex, claimRound: bigint,
  chainId: bigint | number = 9800, escrow: `0x${string}` = ESCROW_ADDRESS,
): `0x${string}` {
  return concatHex([PREFIX, encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "uint256" }, { type: "address" },
      { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint256" },
    ],
    [CLAIM_TYPEHASH, BigInt(chainId), escrow, bountyId, claimant, identityHash, claimRound])]);
}

/** "qorechain-msg-v1|<chain>|" || abi.encode(VERDICT_TYPEHASH, chainId, escrow, ...) — the same
 * 13-word encoding as the contract (split in the contract only to dodge a stack limit).
 * Like the contract: the dispute hashes are encoded only for DISPUTE verdicts — and the
 * caller must pass the bounty's *stored* pendingVerdictHash / disputeEvidenceHash there;
 * for INITIAL they are always zero. */
export function verdictMessage(
  v: VerdictFields,
  chainId: bigint | number = 9800, escrow: `0x${string}` = ESCROW_ADDRESS,
): `0x${string}` {
  const zero = `0x${"0".repeat(64)}` as `0x${string}`;
  const disputed = v.phase === 1 ? v.disputedVerdictHash : zero;
  const disputeEv = v.phase === 1 ? v.disputeEvidenceHash : zero;
  return concatHex([PREFIX, encodeAbiParameters(
    [
      { type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" },
      { type: "uint8" }, { type: "uint8" }, { type: "address" }, { type: "uint64" },
      { type: "bytes32" }, { type: "uint256" }, { type: "uint256" },
      { type: "bytes32" }, { type: "bytes32" },
    ],
    [VERDICT_TYPEHASH, BigInt(chainId), escrow, v.bountyId, v.phase, v.outcome,
      v.payee, v.mergedAt, v.evidenceHash, v.nonce, v.claimRound,
      disputed, disputeEv])]);
}
