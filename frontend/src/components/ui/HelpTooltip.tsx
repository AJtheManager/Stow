'use client';

import { Tooltip, TooltipTrigger, type TooltipProps } from './Tooltip';
import { HelpCircle } from 'lucide-react';

export interface HelpTooltipProps extends Omit<TooltipProps, 'children'> {
  /** The help text to display in the tooltip */
  helpText: string;
  /** Icon variant to use */
  variant?: 'icon' | 'question-mark';
  /** Size of the icon */
  size?: 'sm' | 'md' | 'lg';
  /** Accessible label for the help icon */
  ariaLabel?: string;
}

/**
 * Pre-styled contextual help tooltip with an info icon
 * 
 * This component provides a consistent way to add contextual help
 * throughout the application with proper accessibility support.
 * 
 * @example
 * ```tsx
 * <label>
 *   Savings Amount
 *   <HelpTooltip helpText="The amount you want to save in USDC" />
 * </label>
 * ```
 */
export function HelpTooltip({
  helpText,
  variant = 'icon',
  size = 'md',
  ariaLabel = 'Help information',
  className = '',
  ...tooltipProps
}: HelpTooltipProps) {
  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <Tooltip content={helpText} {...tooltipProps}>
      {variant === 'icon' ? (
        <button
          type="button"
          className={`
            inline-flex items-center justify-center
            text-gray-500 dark:text-gray-400
            hover:text-gray-700 dark:hover:text-gray-200
            focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1
            rounded-full transition-colors
            ${className}
          `}
          aria-label={ariaLabel}
          tabIndex={0}
        >
          <HelpCircle className={sizeClasses[size]} />
        </button>
      ) : (
        <TooltipTrigger className={className} aria-label={ariaLabel} />
      )}
    </Tooltip>
  );
}

/**
 * Inline help tooltip that appears next to labels or text
 * 
 * @example
 * ```tsx
 * <h2>
 *   Locked Savings
 *   <InlineHelp content="Savings locked for a specific duration with higher yields" />
 * </h2>
 * ```
 */
export function InlineHelp({
  content,
  className = '',
  ...props
}: Omit<TooltipProps, 'children'> & { content: string }) {
  return (
    <Tooltip content={content} className={`ml-1 ${className}`} {...props}>
      <span
        className="
          inline-flex items-center justify-center
          w-4 h-4 rounded-full
          bg-brand/10 text-brand
          text-xs font-semibold
          cursor-help
          transition-all
          hover:bg-brand/20
          focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-1
        "
        tabIndex={0}
        aria-label="Additional information"
      >
        i
      </span>
    </Tooltip>
  );
}

/**
 * Help text with tooltip for form fields
 * 
 * @example
 * ```tsx
 * <FormFieldHelp
 *   label="Lock Duration"
 *   tooltip="The period during which your funds will be locked"
 * />
 * ```
 */
export function FormFieldHelp({
  label,
  tooltip,
  required = false,
  className = '',
}: {
  label: string;
  tooltip: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-sm font-medium text-text">
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-label="required">*</span>}
      </span>
      <HelpTooltip helpText={tooltip} size="sm" />
    </div>
  );
}
