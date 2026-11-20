// The exact comment lines a claimant and a disputer post on the GitHub item.

export function claimLine(bountyId: bigint, claimant: `0x${string}`, escrow: `0x${string}`) {
  return `postmark-claim v1 chain=9800 escrow=${escrow.toLowerCase()} bounty=${bountyId} claimant=${claimant.toLowerCase()}`;
}

export function disputeLine(bountyId: bigint, escrow: `0x${string}`) {
  return `postmark-dispute v1 chain=9800 escrow=${escrow.toLowerCase()} bounty=${bountyId}`;
}
