import type { ReactNode } from "react";

/** The one width/padding every app page, the nav and the footer share, so left edges line up. */
export function Container({ name, className = "", children }:
  { name?: string; className?: string; children: ReactNode }) {
  return (
    <div data-container={name} className={`mx-auto w-full max-w-6xl px-4 ${className}`}>{children}</div>
  );
}

/** Full-bleed tinted band holding a page title; its content sits in the shared Container. */
export function PageHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <header className={`w-full border-b border-ink/10 bg-leaf/25 py-8 md:py-10 ${className}`}>
      <Container name="header">{children}</Container>
    </header>
  );
}

/** Page body below the header band. */
export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Container name="body" className={`pb-8 pt-6 ${className}`}>{children}</Container>;
}
