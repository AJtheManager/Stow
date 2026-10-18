'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['Alt', 'H'], description: 'Go to Home', category: 'Navigation' },
  { keys: ['Alt', 'D'], description: 'Go to Dashboard', category: 'Navigation' },
  { keys: ['Alt', 'S'], description: 'Go to Savings', category: 'Navigation' },
  { keys: ['Alt', 'N'], description: 'Open Notifications', category: 'Navigation' },
  { keys: ['Alt', 'P'], description: 'Open Profile', category: 'Navigation' },
  
  // Actions
  { keys: ['Alt', 'C'], description: 'Create New Savings Goal', category: 'Actions' },
  { keys: ['Alt', 'W'], description: 'Connect Wallet', category: 'Actions' },
  { keys: ['Alt', 'T'], description: 'Toggle Theme', category: 'Actions' },
  { keys: ['Ctrl', 'K'], description: 'Open Command Palette', category: 'Actions' },
  
  // Accessibility
  { keys: ['Alt', 'K'], description: 'Show Keyboard Shortcuts', category: 'Accessibility' },
  { keys: ['Alt', 'M'], description: 'Skip to Main Content', category: 'Accessibility' },
  { keys: ['Tab'], description: 'Navigate Forward', category: 'Accessibility' },
  { keys: ['Shift', 'Tab'], description: 'Navigate Backward', category: 'Accessibility' },
  { keys: ['Enter'], description: 'Activate Element', category: 'Accessibility' },
  { keys: ['Escape'], description: 'Close Dialog/Menu', category: 'Accessibility' },
  { keys: ['Space'], description: 'Toggle Checkbox/Button', category: 'Accessibility' },
  { keys: ['Arrow Keys'], description: 'Navigate Lists/Menus', category: 'Accessibility' },
  
  // Forms
  { keys: ['Ctrl', 'Enter'], description: 'Submit Form', category: 'Forms' },
  { keys: ['Ctrl', 'S'], description: 'Save Draft', category: 'Forms' },
  
  // General
  { keys: ['Ctrl', '/'], description: 'Show Help', category: 'General' },
  { keys: ['?'], description: 'Show Keyboard Shortcuts', category: 'General' },
];

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsPanel({
  isOpen,
  onClose,
}: KeyboardShortcutsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen) {
      const focusableElements = document.querySelectorAll(
        '#keyboard-shortcuts-panel button, #keyboard-shortcuts-panel [href], #keyboard-shortcuts-panel [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement?.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement?.focus();
            }
          }
        }
      };

      document.addEventListener('keydown', handleTab);
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleTab);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const categories = ['All', ...new Set(shortcuts.map((s) => s.category))];
  const filteredShortcuts =
    activeCategory === 'All'
      ? shortcuts
      : shortcuts.filter((s) => s.category === activeCategory);

  // Group by category
  const groupedShortcuts = filteredShortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, Shortcut[]>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        id="keyboard-shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2
              id="shortcuts-title"
              className="text-2xl font-bold text-gray-900 dark:text-white"
            >
              Keyboard Shortcuts
            </h2>
            <button
              onClick={onClose}
              aria-label="Close keyboard shortcuts panel"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Category Filter */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <div
              role="tablist"
              aria-label="Shortcut categories"
              className="flex gap-2"
            >
              {categories.map((category) => (
                <button
                  key={category}
                  role="tab"
                  aria-selected={activeCategory === category}
                  aria-controls="shortcuts-content"
                  onClick={() => setActiveCategory(category)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    activeCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Shortcuts List */}
          <div
            id="shortcuts-content"
            role="tabpanel"
            className="flex-1 overflow-y-auto p-6"
          >
            <div className="space-y-6">
              {Object.entries(groupedShortcuts).map(
                ([category, categoryShortcuts]) => (
                  <section key={category} aria-labelledby={`${category}-heading`}>
                    {activeCategory === 'All' && (
                      <h3
                        id={`${category}-heading`}
                        className="text-lg font-semibold text-gray-900 dark:text-white mb-3"
                      >
                        {category}
                      </h3>
                    )}
                    <div className="space-y-2">
                      {categoryShortcuts.map((shortcut, index) => (
                        <div
                          key={`${category}-${index}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-gray-700 dark:text-gray-300">
                            {shortcut.description}
                          </span>
                          <div
                            className="flex gap-1"
                            role="group"
                            aria-label={`Shortcut: ${shortcut.keys.join(' + ')}`}
                          >
                            {shortcut.keys.map((key, keyIndex) => (
                              <kbd
                                key={keyIndex}
                                className="px-3 py-1.5 text-sm font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded shadow-sm min-w-[3rem] text-center"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <p>
                Press{' '}
                <kbd className="px-2 py-1 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded">
                  Esc
                </kbd>{' '}
                or{' '}
                <kbd className="px-2 py-1 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded">
                  Alt
                </kbd>{' '}
                +{' '}
                <kbd className="px-2 py-1 text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded">
                  K
                </kbd>{' '}
                to close
              </p>
              <p className="text-xs">
                {filteredShortcuts.length} shortcut
                {filteredShortcuts.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
