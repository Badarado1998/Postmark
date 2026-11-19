import { lazy, Suspense, useEffect, useState } from "react";
const ConnectWallet = lazy(() => import("../wallet/ConnectWallet"));

/** Wallet UI mounts only after first paint, so the landing's initial chunk
 * never contains wagmi/connectors. */
export function DeferredConnect() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return <div className="h-8 w-32 rounded-lg bg-white/5" aria-hidden />;
  }
  return (
    <Suspense fallback={<div className="h-8 w-32 rounded-lg bg-white/5" aria-hidden />}>
      <ConnectWallet />
    </Suspense>
  );
}
