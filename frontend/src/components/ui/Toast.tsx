"use client";

import React from "react";
import {
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";

export type ToastVariant = "pending" | "success" | "error" | "info" | "warning";

export interface ToastData {
  id: string;
  variant: ToastVariant;
  message: string;
  /** Optional link to view the transaction (e.g. a Stellar explorer URL). */
  txUrl?: string;
  txLabel?: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string }> = {
  pending: { border: "border-brand-2/30", icon: "text-brand-2" },
  success: { border: "border-emerald-400/30", icon: "text-emerald-400" },
  error: { border: "border-red-400/30", icon: "text-red-400" },
  info: { border: "border-blue-400/30", icon: "text-blue-400" },
  warning: { border: "border-amber-400/30", icon: "text-amber-400" },
};

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const className = `h-5 w-5 ${VARIANT_STYLES[variant].icon}`;
  if (variant === "pending") {
    return (
      <Loader2
        className={`${className} animate-spin`}
        aria-hidden="true"
        data-testid="toast-icon-pending"
      />
    );
  }
  if (variant === "success") {
    return (
      <CheckCircle2
        className={className}
        aria-hidden="true"
        data-testid="toast-icon-success"
      />
    );
  }
  if (variant === "info") {
    return (
      <Info
        className={className}
        aria-hidden="true"
        data-testid="toast-icon-info"
      />
    );
  }
  if (variant === "warning") {
    return (
      <TriangleAlert
        className={className}
        aria-hidden="true"
        data-testid="toast-icon-warning"
      />
    );
  }
  return (
    <XCircle
      className={className}
      aria-hidden="true"
      data-testid="toast-icon-error"
    />
  );
}

export default function Toast({ toast, onDismiss }: ToastProps) {
  const { id, variant, message, txUrl, txLabel, action } = toast;
  const isAssertive = variant === "error";

  return (
    <div
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      aria-atomic="true"
      data-testid={`toast-${variant}`}
      className={`flex items-start gap-3 rounded-xl border ${VARIANT_STYLES[variant].border} bg-background-elevated/95 backdrop-blur px-4 py-3 shadow-lg shadow-black/20 min-w-[280px] max-w-sm transition-all duration-300`}
    >
      <ToastIcon variant={variant} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-foreground">{message}</p>
        {txUrl && (
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand/50 rounded"
          >
            {txLabel ?? "View transaction"}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center text-xs font-medium text-brand hover:underline focus:outline-none focus:ring-2 focus:ring-brand/50 rounded"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="text-muted hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 rounded"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
