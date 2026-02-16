"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

const listeners = new Set<(toasts: ToastMessage[]) => void>();
let toasts: ToastMessage[] = [];

function emit() {
  for (const listener of listeners) {
    listener(toasts);
  }
}

function removeToast(id: string) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function toast(input: Omit<ToastMessage, "id">) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { ...input, id }];
  emit();

  setTimeout(() => {
    removeToast(id);
  }, 3500);
}

export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<ToastMessage[]>(toasts);

  useEffect(() => {
    listeners.add(setCurrentToasts);
    return () => {
      listeners.delete(setCurrentToasts);
    };
  }, []);

  const dismiss = useCallback((id: string) => removeToast(id), []);

  return {
    toasts: currentToasts,
    toast,
    dismiss,
  };
}
