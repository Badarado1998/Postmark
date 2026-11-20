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
          <p className="font-sans text-2xl text-ink">This page hit an error.</p>
          <p className="mt-3 font-mono text-xs text-gray">{this.state.error.message}</p>
          <Link to="/" className="mt-6 inline-block text-deep underline underline-offset-4">
            Back home
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
