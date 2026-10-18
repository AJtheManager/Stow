'use client';

import { useState, useRef, useEffect, ReactNode, type HTMLAttributes } from 'react';

export interface TooltipProps {
  /** The element that triggers the tooltip on hover/focus */
  children: ReactNode;
  /** The tooltip content to display */
  content: ReactNode;
  /** Position of the tooltip relative to the trigger element */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay in milliseconds before showing the tooltip */
  delay?: number;
  /** Additional CSS classes for the trigger wrapper */
  className?: string;
  /** Whether to show the tooltip */
  disabled?: boolean;
  /** Optional ID for the tooltip content (for aria-describedby) */
  id?: string;
  /** Offset from the trigger element in pixels */
  offset?: number;
}

/**
 * Accessible contextual help tooltip component
 * 
 * Features:
 * - Keyboard accessible (shows on focus, hides on blur/escape)
 * - Screen reader friendly with proper ARIA attributes
 * - Mouse support (shows on hover)
 * - Automatic positioning with collision detection
 * - Configurable delay and position
 * 
 * @example
 * ```tsx
 * <Tooltip content="This is helpful information">
 *   <button>Hover me</button>
 * </Tooltip>
 * ```
 */
export function Tooltip({
  children,
  content,
  position = 'top',
  delay = 200,
  className = '',
  disabled = false,
  id,
  offset = 8,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = id || `tooltip-${useRef(Math.random().toString(36).slice(2, 11)).current}`;

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Adjust position if tooltip would overflow viewport
  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      let newPosition = position;

      // Check if tooltip overflows and adjust position
      if (position === 'top' && triggerRect.top - tooltipRect.height - offset < 0) {
        newPosition = 'bottom';
      } else if (position === 'bottom' && triggerRect.bottom + tooltipRect.height + offset > viewport.height) {
        newPosition = 'top';
      } else if (position === 'left' && triggerRect.left - tooltipRect.width - offset < 0) {
        newPosition = 'right';
      } else if (position === 'right' && triggerRect.right + tooltipRect.width + offset > viewport.width) {
        newPosition = 'left';
      }

      setActualPosition(newPosition);
    }
  }, [isVisible, position, offset]);

  const showTooltip = () => {
    if (disabled) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideTooltip();
    }
  };

  if (disabled) {
    return <>{children}</>;
  }

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <div 
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger element with ARIA attributes */}
      <div aria-describedby={isVisible ? tooltipId : undefined}>
        {children}
      </div>

      {/* Tooltip content */}
      {isVisible && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className={`
            absolute z-[9999] px-3 py-2 text-sm rounded-lg
            bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900
            shadow-lg border border-gray-700 dark:border-gray-300
            max-w-xs break-words
            animate-in fade-in-0 zoom-in-95
            ${positionClasses[actualPosition]}
          `}
          style={{ pointerEvents: 'none' }}
        >
          {content}
          {/* Arrow */}
          <div
            className={`
              absolute w-0 h-0
              border-[6px] border-gray-900 dark:border-gray-100
              ${arrowClasses[actualPosition]}
            `}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Simple info icon that can be used as a tooltip trigger
 * 
 * @example
 * ```tsx
 * <Tooltip content="Helpful information">
 *   <TooltipTrigger />
 * </Tooltip>
 * ```
 */
export function TooltipTrigger({ 
  className = '',
  ...props 
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`
        inline-flex items-center justify-center
        w-4 h-4 rounded-full
        bg-gray-200 dark:bg-gray-700
        text-gray-600 dark:text-gray-300
        text-xs font-semibold
        cursor-help
        transition-colors
        hover:bg-gray-300 dark:hover:bg-gray-600
        focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2
        ${className}
      `}
      tabIndex={0}
      {...props}
    >
      ?
    </span>
  );
}

/**
 * Hook to manage tooltip visibility programmatically
 * 
 * @example
 * ```tsx
 * const { isVisible, show, hide, toggle } = useTooltip();
 * ```
 */
export function useTooltip(initialVisible = false) {
  const [isVisible, setIsVisible] = useState(initialVisible);

  return {
    isVisible,
    show: () => setIsVisible(true),
    hide: () => setIsVisible(false),
    toggle: () => setIsVisible((prev) => !prev),
  };
}
