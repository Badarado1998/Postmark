export const STATE_NAMES = ["Open", "Claimed", "Pending", "Disputed", "Paid", "Refunded"] as const;
export type BountyStateName = (typeof STATE_NAMES)[number];

interface StatusStyle { pill: string; dot: string; bar: string; hex: string }

/** One colour per bounty state, used by pills, timeline dots, the stepper and table accents.
 * Text on the light fills (leaf, mustard, orange, salmon, olive) is ink; Paid uses paper on deep green. */
export const STATUS_STYLES: Record<BountyStateName, StatusStyle> = {
  Open: { pill: "bg-leaf text-ink", dot: "bg-leaf", bar: "bg-leaf", hex: "#7DB069" },
  Claimed: { pill: "bg-mustard text-ink", dot: "bg-mustard", bar: "bg-mustard", hex: "#DDC362" },
  Pending: { pill: "bg-orange text-ink", dot: "bg-orange", bar: "bg-orange", hex: "#CE8E3D" },
  Disputed: { pill: "bg-salmon text-ink", dot: "bg-salmon", bar: "bg-salmon", hex: "#F1A783" },
  Paid: { pill: "bg-deep text-paper", dot: "bg-deep", bar: "bg-deep", hex: "#23663F" },
  Refunded: { pill: "bg-olive text-ink", dot: "bg-olive", bar: "bg-olive", hex: "#7A825B" },
};

export const stateName = (state: number): BountyStateName | undefined => STATE_NAMES[state];
export const statusStyle = (state: number): StatusStyle | undefined => {
  const n = stateName(state);
  return n ? STATUS_STYLES[n] : undefined;
};
