"use client";

import { X } from "lucide-react";

import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border p-4 shadow-lg ${
            toast.variant === "destructive"
              ? "border-rose-500/50 bg-rose-950/90 text-rose-100"
              : "border-zinc-700 bg-zinc-900/95 text-zinc-100"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-xs text-zinc-300">{toast.description}</p>
              ) : null}
            </div>
            <button
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
