'use client';

import { useEffect, useRef, useState } from 'react';

interface LiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive' | 'off';
  clearAfter?: number;
}

/**
 * LiveRegion component for announcing dynamic content to screen readers
 * 
 * @example
 * ```tsx
 * <LiveRegion message="Form submitted successfully" politeness="polite" />
 * ```
 */
export default function LiveRegion({
  message,
  politeness = 'polite',
  clearAfter = 3000,
}: LiveRegionProps) {
  const [currentMessage, setCurrentMessage] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (message) {
      setCurrentMessage(message);

      if (clearAfter > 0) {
        timeoutRef.current = setTimeout(() => {
          setCurrentMessage('');
        }, clearAfter);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearAfter]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {currentMessage}
    </div>
  );
}

/**
 * Hook for programmatically announcing messages to screen readers
 */
export function useAnnounce() {
  const [announcement, setAnnouncement] = useState<{
    message: string;
    politeness: 'polite' | 'assertive';
  }>({ message: '', politeness: 'polite' });

  const announce = (
    message: string,
    politeness: 'polite' | 'assertive' = 'polite'
  ) => {
    setAnnouncement({ message, politeness });
    // Clear after announcement to allow re-announcing the same message
    setTimeout(() => {
      setAnnouncement({ message: '', politeness: 'polite' });
    }, 100);
  };

  return { announcement, announce };
}
