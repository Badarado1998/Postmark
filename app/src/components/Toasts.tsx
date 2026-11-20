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
                ? "border-salmon/50 bg-white/95 text-ink"
                : "border-ink/15 bg-white/95 text-ink"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
