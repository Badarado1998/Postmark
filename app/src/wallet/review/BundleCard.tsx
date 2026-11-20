import type { ReactNode } from "react";
import { Card, SectionLabel, shortAddr } from "../../components/ui";
import { explorerAddress } from "../../chain/config";
import type { Bounty } from "../../chain/client";
import type { SigStatus } from "./bundleVerify";
import { Alert, GHOST_BTN, SOLID_BTN } from "./reviewUi";

const SIG_STATUS_TONE: Record<SigStatus, string> = {
  valid: "text-deep", invalid: "text-orange", "key not live": "text-orange", pending: "text-gray",
};

export function BundleCard({ bounty, disputed, bundleView, onSubmit, onCopy, children }: {
  bounty: Bounty; disputed: boolean;
  bundleView: {
    bundle: { signatures: Record<number, string> } | null; bundleJson: string;
    sigStatus: Record<number, SigStatus>; validIndices: number[];
    importText: string; setImportText: (v: string) => void; importErr: string | null;
    importBundle: () => Promise<void>; download: () => void;
  };
  onSubmit: () => void; onCopy: () => void; children: ReactNode;
}) {
  const v = bundleView;
  const validCount = v.validIndices.length;
  return (
    <Card>
      <SectionLabel>verdict bundle</SectionLabel>
      <div className="mt-2 space-y-1 font-mono text-xs">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <a className="text-ink hover:text-deep" href={explorerAddress(bounty.verifiers[i]!)} target="_blank" rel="noreferrer">
              verifier {i} · {shortAddr(bounty.verifiers[i])}</a>
            <span className={v.sigStatus[i] ? SIG_STATUS_TONE[v.sigStatus[i]!] : "text-gray"}>
              {v.bundle?.signatures[i] ? (v.sigStatus[i] ?? "pending") : "—"}
            </span>
          </div>
        ))}
      </div>
      {v.bundle && (
        <>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-ink/10 bg-paper p-3 font-mono text-[10px] text-gray">{v.bundleJson}</pre>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onCopy} className={`${GHOST_BTN} px-3 py-1.5 text-xs`}>Copy JSON</button>
            <button type="button" onClick={v.download} className={`${GHOST_BTN} px-3 py-1.5 text-xs`}>Download .json</button>
          </div>
        </>
      )}
      <div className="mt-4">
        <textarea value={v.importText} onChange={(e) => v.setImportText(e.target.value)}
          placeholder="paste another verifier's bundle JSON to merge"
          className="h-24 w-full rounded-lg border border-ink/10 bg-paper p-3 font-mono text-xs text-ink" />
        <button type="button" onClick={() => void v.importBundle()}
          className={`mt-2 ${GHOST_BTN} px-3 py-1.5 text-xs`}>Import & merge</button>
        {v.importErr && <Alert>{v.importErr}</Alert>}
      </div>
      <button type="button" onClick={onSubmit} disabled={validCount < 2}
        className={`mt-4 ${SOLID_BTN} px-5 py-2 text-sm`}>
        {disputed ? `Submit resolution (${validCount}/3 valid)` : `Submit verdict (${validCount}/3 valid)`}
      </button>
      {validCount >= 2 && (
        <p className="mt-1 text-xs text-gray">Anyone can relay this — signatures prove themselves.</p>
      )}
      {children}
    </Card>
  );
}
