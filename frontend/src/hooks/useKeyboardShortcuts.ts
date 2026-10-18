'use client';

import { useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

interface KeyboardShortcutsConfig {
  enableShortcuts?: boolean;
  onShowShortcuts?: () => void;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig = {}) {
  const { enableShortcuts = true, onShowShortcuts } = config;
  const router = useRouter();
  const [isShortcutsPanelOpen, setIsShortcutsPanelOpen] = useState(false);

  const handleShowShortcuts = useCallback(() => {
    setIsShortcutsPanelOpen(true);
    if (onShowShortcuts) {
      onShowShortcuts();
    }
  }, [onShowShortcuts]);

  const handleHideShortcuts = useCallback(() => {
    setIsShortcutsPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!enableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Show keyboard shortcuts panel
      if (
        (e.altKey && e.key.toLowerCase() === 'k') ||
        (e.key === '?' && !isInput)
      ) {
        e.preventDefault();
        handleShowShortcuts();
        return;
      }

      // Alt key shortcuts (only when not in input)
      if (e.altKey && !isInput) {
        switch (e.key.toLowerCase()) {
          case 'h':
            e.preventDefault();
            router.push('/');
            break;
          case 'd':
            e.preventDefault();
            router.push('/dashboard');
            break;
          case 's':
            e.preventDefault();
            router.push('/dashboard/savings');
            break;
          case 'p':
            e.preventDefault();
            router.push('/dashboard/profile');
            break;
          case 'm':
            e.preventDefault();
            // Skip to main content
            const mainContent = document.querySelector('main');
            if (mainContent) {
              (mainContent as HTMLElement).focus();
              mainContent.scrollIntoView({ behavior: 'smooth' });
            }
            break;
          case 't':
            e.preventDefault();
            // Toggle theme
            const themeToggle = document.querySelector(
              '[aria-label*="theme" i], [aria-label*="dark mode" i]'
            ) as HTMLButtonElement;
            if (themeToggle) {
              themeToggle.click();
            }
            break;
          case 'w':
            e.preventDefault();
            // Connect wallet
            const walletButton = document.querySelector(
              '[aria-label*="wallet" i], [aria-label*="connect" i]'
            ) as HTMLButtonElement;
            if (walletButton) {
              walletButton.click();
            }
            break;
          case 'n':
            e.preventDefault();
            // Open notifications
            const notificationsButton = document.querySelector(
              '[aria-label*="notification" i]'
            ) as HTMLButtonElement;
            if (notificationsButton) {
              notificationsButton.click();
            }
            break;
          case 'c':
            e.preventDefault();
            // Create new savings goal
            const createButton = document.querySelector(
              '[aria-label*="create" i], [aria-label*="new" i]'
            ) as HTMLButtonElement;
            if (createButton) {
              createButton.click();
            }
            break;
        }
      }

      // Ctrl/Cmd key shortcuts
      if ((e.ctrlKey || e.metaKey) && !isInput) {
        switch (e.key.toLowerCase()) {
          case 'k':
            e.preventDefault();
            // Open command palette (if implemented)
            const commandPalette = document.querySelector(
              '[aria-label*="command" i], [aria-label*="search" i]'
            ) as HTMLButtonElement;
            if (commandPalette) {
              commandPalette.click();
            }
            break;
          case '/':
            e.preventDefault();
            // Show help
            handleShowShortcuts();
            break;
        }
      }

      // Form shortcuts
      if ((e.ctrlKey || e.metaKey) && isInput) {
        switch (e.key.toLowerCase()) {
          case 'enter':
            e.preventDefault();
            // Submit form
            const form = target.closest('form');
            if (form) {
              const submitButton = form.querySelector(
                'button[type="submit"]'
              ) as HTMLButtonElement;
              if (submitButton) {
                submitButton.click();
              }
            }
            break;
          case 's':
            e.preventDefault();
            // Save draft (trigger save action)
            const saveButton = document.querySelector(
              '[aria-label*="save" i], [aria-label*="draft" i]'
            ) as HTMLButtonElement;
            if (saveButton) {
              saveButton.click();
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enableShortcuts, router, handleShowShortcuts]);

  return {
    isShortcutsPanelOpen,
    showShortcutsPanel: handleShowShortcuts,
    hideShortcutsPanel: handleHideShortcuts,
  };
}

// Hook for individual component shortcuts
export function useComponentShortcuts(
  shortcuts: Record<string, () => void>,
  options: { enabled?: boolean; preventDefault?: boolean } = {}
) {
  const { enabled = true, preventDefault = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInput) return;

      const key = e.key.toLowerCase();
      const withAlt = e.altKey;
      const withCtrl = e.ctrlKey || e.metaKey;
      const withShift = e.shiftKey;

      // Build shortcut key string
      let shortcutKey = '';
      if (withCtrl) shortcutKey += 'ctrl+';
      if (withAlt) shortcutKey += 'alt+';
      if (withShift) shortcutKey += 'shift+';
      shortcutKey += key;

      if (shortcuts[shortcutKey]) {
        if (preventDefault) {
          e.preventDefault();
        }
        shortcuts[shortcutKey]();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts, enabled, preventDefault]);
}
