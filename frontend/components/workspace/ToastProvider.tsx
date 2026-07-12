"use client";

// Lightweight toast system: screen-reader announced (polite live region),
// auto-dismissing, motion-restrained. Used for workspace events that finish
// away from where they were triggered (saves, copies, imports).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastValue {
  pushToast: (text: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function useToast(): ToastValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

const TONE_CLASS: Record<ToastTone, string> = {
  info: "border-accent-cyan/40 text-cyan-100",
  success: "border-accent-green/40 text-emerald-100",
  error: "border-accent-red/45 text-red-100",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-3), { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-[95] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-enter pointer-events-auto rounded-lg border bg-lab-panel/95 px-3.5 py-2.5 text-xs leading-5 shadow-[0_16px_40px_rgba(0,0,0,.45)] backdrop-blur ${TONE_CLASS[toast.tone]}`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
