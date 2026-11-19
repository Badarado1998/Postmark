import { lazy, Suspense } from "react";
import WalletRoot from "../wallet/WalletRoot";
const MeInner = lazy(() => import("../wallet/MeInner"));
export default function Me() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-ink-300">Loading…</div>}>
      <WalletRoot><MeInner /></WalletRoot>
    </Suspense>
  );
}
