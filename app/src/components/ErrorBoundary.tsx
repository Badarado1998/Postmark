import { Component, type ReactNode } from "react";
import { Link } from "react-router";

export class ErrorBoundary extends Component<
  { children: ReactNode; name?: string }, { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg py-24 text-center">
          <p className="font-serif text-2xl text-paper-100">This page hit an error.</p>
          <p className="mt-3 font-mono text-xs text-ink-300">{this.state.error.message}</p>
          <Link to="/" className="mt-6 inline-block text-vermilion underline underline-offset-4">
            Back home
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
