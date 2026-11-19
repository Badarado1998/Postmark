import { Link } from "react-router";
export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-vermilion">404</p>
      <h1 className="mt-4 font-serif text-4xl font-semibold text-paper-100">This letter never arrived.</h1>
      <Link to="/" className="mt-6 inline-block text-vermilion underline underline-offset-4">Back home</Link>
    </div>
  );
}
