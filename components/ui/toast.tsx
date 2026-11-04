"use client";

import * as React from "react";
import { Dismiss20Regular, CheckmarkCircle16Filled, Warning16Regular, Info20Regular } from "@fluentui/react-icons";
import { cn } from "@/lib/utils";

export type ToastInput = { title: string; description?: string; kind?: "info" | "success" | "warning" | "danger"; action?: { label: string; onClick: () => void }; durationMs?: number };
type ToastItem = ToastInput & { id: number };

type Ctx = { toast: (t: ToastInput) => void };
const ToastContext = React.createContext<Ctx>({ toast: () => undefined });

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);
  const toast = React.useCallback((t: ToastInput) => {
    const id = ++counter.current;
    setItems((prev) => [...prev, { ...t, id }]);
    const timeout = t.durationMs ?? (t.action ? 8000 : 4000);
    window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), timeout);
  }, []);
  const dismiss = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} role="status" className={cn("pointer-events-auto flex items-start gap-2 rounded-md border border-border bg-surface-raised p-3 shadow-menu")}>
            <span className={cn("mt-0.5", t.kind === "success" && "text-success", t.kind === "warning" && "text-warning", t.kind === "danger" && "text-danger", (!t.kind || t.kind === "info") && "text-brand")}>
              {t.kind === "success" ? <CheckmarkCircle16Filled /> : t.kind === "warning" || t.kind === "danger" ? <Warning16Regular /> : <Info20Regular className="h-4 w-4" />}
            </span>
            <div className="flex-1">
              <p className="type-body-1-strong text-fg">{t.title}</p>
              {t.description ? <p className="type-caption-1 text-fg-secondary">{t.description}</p> : null}
              {t.action ? (
                <button type="button" className="mt-1 type-caption-1-strong text-brand hover:underline" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
                  {t.action.label}
                </button>
              ) : null}
            </div>
            <button type="button" className="text-fg-tertiary hover:text-fg" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Dismiss20Regular className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
