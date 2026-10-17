"use client";

import React, { useId } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  success?: string;
  required?: boolean;
  children: React.ReactElement;
  className?: string;
}

/**
 * FormField component that wraps form inputs with label, error, hint, and success states.
 * Provides accessible labeling and ARIA attributes for form validation feedback.
 */
export default function FormField({
  label,
  error,
  hint,
  success,
  required = false,
  children,
  className = "",
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const successId = `${id}-success`;

  // Clone the child input element and add necessary props
  const childWithProps = React.cloneElement(children, {
    id: children.props.id || id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [
      error ? errorId : null,
      success ? successId : null,
      hint ? hintId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined,
    required,
  });

  return (
    <div className={className}>
      <label
        htmlFor={children.props.id || id}
        className="block text-sm font-medium text-foreground mb-2"
      >
        {label}
        {required && (
          <span className="text-red-400 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>

      {childWithProps}

      {hint && !error && !success && (
        <p id={hintId} className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {hint}
        </p>
      )}

      {success && !error && (
        <p
          id={successId}
          className="mt-1.5 flex items-start gap-1.5 text-xs text-emerald-400"
          role="status"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {success}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-xs text-red-400"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
