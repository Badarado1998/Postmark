import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type ToastKind = "success" | "error" | "warning" | "info";
export interface ToastInput { kind: ToastKind; title?: string; text: string }
interface ToastItem extends ToastInput { id: number; title: string }

export const TOAST_DURATION_MS = 4000;
export const MAX_TOASTS = 3;

const DEFAULT_TITLE: Record<ToastKind, string> = {
  success: "Done", error: "Something went wrong", warning: "Heads up", info: "Note",
};

const STYLE: Record<ToastKind, { bar: string; icon: string }> = {
  success: { bar: "bg-deep", icon: "text-deep" },
  error: { bar: "bg-salmon", icon: "text-orange" },
  warning: { bar: "bg-mustard", icon: "text-orange" },
  info: { bar: "bg-ink", icon: "text-charcoal" },
};

const Ctx = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(Ctx);

function Icon({ kind }: { kind: ToastKind }) {
  const common = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
    strokeLinecap: "round", strokeLinejoin: "round", className: "size-5", "aria-hidden": true } as const;
  if (kind === "success") return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M6.5 10.5l2.5 2.5 4.5-5" /></svg>;
  if (kind === "error") return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M10 6v5M10 13.8v.2" /></svg>;
  if (kind === "warning") return <svg {...common}><path d="M10 3l8 14H2z" /><path d="M10 8v4M10 14.6v.2" /></svg>;
  return <svg {...common}><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6.2v.2" /></svg>;
}

function ToastCard({ toast, onClose, reduce }: { toast: ToastItem; onClose: () => void; reduce: boolean }) {
  const s = STYLE[toast.kind];
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { x: 48, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { x: 48, opacity: 0, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      role={toast.kind === "error" ? "alert" : "status"}
      className="pointer-events-auto relative overflow-hidden rounded-xl border border-ink/10 bg-white text-ink shadow-lg shadow-ink/10">
      <div className="flex items-start gap-3 p-3.5 pr-10">
        <span className={`mt-0.5 shrink-0 ${s.icon}`}><Icon kind={toast.kind} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{toast.title}</p>
          <p className="mt-0.5 break-words text-sm leading-snug text-charcoal">{toast.text}</p>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss notification"
        className="absolute right-2 top-2 grid size-6 place-items-center rounded-md text-gray hover:bg-ink/5 hover:text-ink">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <div aria-hidden className="h-1 w-full bg-ink/5 motion-reduce:hidden">
        <div className={`toast-progress h-full ${s.bar}`} style={{ animationDuration: `${TOAST_DURATION_MS}ms` }} />
      </div>
    </motion.li>
  );
}

let nextId = 1;
export function ToastProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [top, setTop] = useState(72);
  const toastsRef = useRef<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t !== undefined) { clearTimeout(t); timers.current.delete(id); }
    toastsRef.current = toastsRef.current.filter((x) => x.id !== id);
    setToasts(toastsRef.current);
  }, []);

  const push = useCallback((input: ToastInput) => {
    const title = input.title ?? DEFAULT_TITLE[input.kind];
    const current = toastsRef.current;
    if (current.some((x) => x.kind === input.kind && x.title === title && x.text === input.text)) return;
    const id = nextId++;
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    const next = [{ ...input, title, id }, ...current];
    for (const dropped of next.slice(MAX_TOASTS)) {
      const t = timers.current.get(dropped.id);
      if (t !== undefined) { clearTimeout(t); timers.current.delete(dropped.id); }
    }
    toastsRef.current = next.slice(0, MAX_TOASTS);
    setToasts(toastsRef.current);
  }, [dismiss]);

  useEffect(() => {
    const place = () => {
      const bottom = document.querySelector("header")?.getBoundingClientRect().bottom;
      setTop(Math.max(8, Math.round(bottom ?? 64)) + 8);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place); };
  }, []);

  useEffect(() => {
    const live = timers.current;
    return () => { for (const t of live.values()) clearTimeout(t); live.clear(); };
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" style={{ top }}
        className="pointer-events-none fixed left-3 right-3 z-50 sm:left-auto sm:right-4 sm:w-96">
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <ToastCard key={t.id} toast={t} reduce={reduce} onClose={() => dismiss(t.id)} />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </Ctx.Provider>
  );
}
