'use client';

import { useEffect, useState } from 'react';

export default function SkipToContent() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const handleSkip = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const main = document.querySelector('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus();
      main.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Remove tabindex after focus to restore normal tab order
      setTimeout(() => {
        main.removeAttribute('tabindex');
      }, 100);
    }
  };

  return (
    <a
      href="#main-content"
      onClick={handleSkip}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-6 focus:py-3 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 font-medium transition-all"
    >
      Skip to main content
    </a>
  );
}
