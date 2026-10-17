"use client";

import React from "react";
import { ToastData } from "./Toast";
import Toast from "./Toast";

export interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
  maxToasts?: number;
}

const POSITION_STYLES = {
  "top-right": "top-4 right-4 items-end",
  "top-left": "top-4 left-4 items-start",
  "bottom-right": "bottom-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
};

/**
 * Container component for rendering multiple toast notifications.
 * Handles positioning, stacking, and rendering of toast messages.
 */
export default function ToastContainer({
  toasts,
  onDismiss,
  position = "bottom-right",
  maxToasts = 5,
}: ToastContainerProps) {
  // Limit the number of visible toasts
  const visibleToasts = toasts.slice(-maxToasts);

  if (visibleToasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Notifications"
      aria-live="polite"
      className={`pointer-events-none fixed z-50 flex flex-col gap-3 px-4 ${POSITION_STYLES[position]}`}
    >
      {visibleToasts.map((toast, index) => (
        <div
          key={toast.id}
          className="pointer-events-auto w-full sm:w-auto animate-slide-in"
          style={{
            animationDelay: `${index * 100}ms`,
          }}
        >
          <Toast toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
