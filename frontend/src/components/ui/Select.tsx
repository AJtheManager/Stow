"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  success?: boolean;
}

/**
 * Enhanced Select component with validation state styling.
 * Supports error and success states for visual feedback.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, success, className = "", children, ...props }, ref) => {
    const baseStyles =
      "w-full rounded-xl border bg-background pl-4 pr-10 py-3 text-foreground transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none";

    const stateStyles = error
      ? "border-red-400/50 focus:border-red-400 focus:ring-red-400/30"
      : success
        ? "border-emerald-400/50 focus:border-emerald-400 focus:ring-emerald-400/30"
        : "border-border focus:border-brand/50 focus:ring-brand/30";

    return (
      <div className="relative">
        <select
          ref={ref}
          className={`${baseStyles} ${stateStyles} ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted pointer-events-none"
          aria-hidden="true"
        />
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
