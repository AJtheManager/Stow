"use client";

import { CheckCircle2 } from "lucide-react";

export interface FormSuccessProps {
  message: string;
  className?: string;
}

/**
 * Standalone form success message component.
 * Can be used for form-level success messages or confirmations.
 */
export default function FormSuccess({ message, className = "" }: FormSuccessProps) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-400 ${className}`}
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
