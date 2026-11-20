import { useParams } from "react-router";
import { useBounty, useIndex, useNextBountyId } from "./queries";

function parseBountyId(raw: string | undefined): bigint | undefined {
  try { return BigInt(raw ?? ""); } catch { return undefined; }
}

/** Everything a /bounty/:id page needs: id, chain state, indexed metadata. */
export function useBountyRoute() {
  const id = parseBountyId(useParams().id);
  const next = useNextBountyId();
  const bounty = useBounty(id);
  const index = useIndex();
  return {
    id, bounty, index,
    meta: id === undefined ? undefined : index.data?.metaById.get(id),
    notFound: id !== undefined && next.data !== undefined && id >= next.data,
    loading: bounty.isPending || index.isPending || next.isPending,
  };
}
