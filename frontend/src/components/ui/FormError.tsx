"use client";

import { AlertCircle } from "lucide-react";

export interface FormErrorProps {
  message: string;
  className?: string;
}

/**
 * Standalone form error message component.
 * Can be used for form-level errors or field-level errors outside of FormField.
 */
export default function FormError({ message, className = "" }: FormErrorProps) {
  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400 ${className}`}
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
