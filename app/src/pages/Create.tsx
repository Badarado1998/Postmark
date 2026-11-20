import { lazy, Suspense } from "react";
const CreateInner = lazy(() => import("../wallet/CreateInner"));
export default function Create() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-gray">Loading…</div>}>
      <CreateInner />
    </Suspense>
  );
}
