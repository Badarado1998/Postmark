import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface Toast { id: number; kind: "error" | "info"; text: string }
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

let nextId = 1;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = nextId++;
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 8000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id}
            className={`rounded-lg border p-3 text-sm shadow-lg backdrop-blur ${
              t.kind === "error"
                ? "border-vermilion/50 bg-ink-900/95 text-paper-100"
                : "border-paper-300/20 bg-ink-900/95 text-paper-200"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
