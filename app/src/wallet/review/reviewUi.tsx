import type { ReactNode } from "react";

export const GHOST_BTN = "rounded-lg border border-ink/15 text-gray hover:bg-ink/5 disabled:opacity-40";
export const SOLID_BTN = "rounded-lg bg-deep font-medium text-paper hover:brightness-110 disabled:opacity-40";
export const ACCENT_BTN = "rounded-lg border border-salmon/50 px-4 py-2 text-sm text-deep hover:bg-salmon/10 disabled:opacity-40";
export const TEXT_INPUT = "rounded-lg border border-ink/10 bg-paper px-3 py-2 font-mono text-xs text-ink";
export const COMMENT_LINK = "underline decoration-dotted hover:text-deep";

export const Alert = ({ children }: { children: ReactNode }) =>
  <p role="alert" className="mt-2 text-sm text-orange">{children}</p>;
