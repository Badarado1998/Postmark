import { Link } from "react-router";
import { PixelBand } from "../components/PixelBand";

export default function NotFound() {
  return (
    <div className="pt-16 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-deep">404</p>
      <h1 className="mt-4 font-sans text-4xl font-semibold tracking-tight text-ink">This letter never arrived.</h1>
      <p className="mx-auto mt-3 max-w-md text-charcoal">That address isn't stamped on diana — check the link or head back.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/" className="rounded-lg bg-deep px-5 py-2.5 text-sm font-medium text-paper hover:brightness-110">Back home</Link>
        <Link to="/explore" className="rounded-lg border border-ink/30 bg-white px-5 py-2.5 text-sm font-medium hover:bg-ink/5">Browse bounties</Link>
      </div>
      <PixelBand className="mt-16 h-24 md:h-32" stripeHeight={18} />
    </div>
  );
}
