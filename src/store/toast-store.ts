"use client";

import { create } from "zustand";

export type ToastVariant = "default" | "success" | "error" | "warning";

export type ToastItem = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  createdAt: number;
  durationMs: number;
};

type ToastState = {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id" | "createdAt"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = toast.id ?? makeId();
    const item: ToastItem = {
      id,
      title: toast.title,
      message: toast.message,
      variant: toast.variant ?? "default",
      durationMs: toast.durationMs ?? 4500,
      createdAt: Date.now(),
    };

    set((state) => ({ toasts: [...state.toasts, item].slice(-6) }));

    if (item.durationMs > 0) {
      window.setTimeout(() => {
        const exists = get().toasts.some((t) => t.id === id);
        if (exists) get().dismiss(id);
      }, item.durationMs);
    }

    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export function toast(input: { title?: string; message: string; variant?: ToastVariant; durationMs?: number }) {
  useToastStore.getState().push({
    title: input.title,
    message: input.message,
    variant: input.variant ?? "default",
    durationMs: input.durationMs ?? 4500,
  });
}

