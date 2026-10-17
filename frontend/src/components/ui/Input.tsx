"use client";

import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  success?: boolean;
}

/**
 * Enhanced Input component with validation state styling.
 * Supports error and success states for visual feedback.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, success, className = "", ...props }, ref) => {
    const baseStyles =
      "w-full rounded-xl border bg-background px-4 py-3 text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

    const stateStyles = error
      ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/30"
      : success
        ? "border-emerald-400/50 focus:border-emerald-400 focus:ring-emerald-400/30"
        : "border-border focus:border-brand/50 focus:ring-brand/30";

    return (
      <input
        ref={ref}
        className={`${baseStyles} ${stateStyles} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export default Input;
