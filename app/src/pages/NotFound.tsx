import { Link } from "react-router";
export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-deep">404</p>
      <h1 className="mt-4 font-sans text-4xl font-semibold text-ink">This letter never arrived.</h1>
      <Link to="/" className="mt-6 inline-block text-deep underline underline-offset-4">Back home</Link>
    </div>
  );
}
