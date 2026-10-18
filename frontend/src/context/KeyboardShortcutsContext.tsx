'use client';

import { createContext, useContext, ReactNode } from 'react';
import KeyboardShortcutsPanel from '@/components/KeyboardShortcutsPanel';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

interface KeyboardShortcutsContextType {
  showShortcutsPanel: () => void;
  hideShortcutsPanel: () => void;
  isShortcutsPanelOpen: boolean;
}

const KeyboardShortcutsContext = createContext<
  KeyboardShortcutsContextType | undefined
>(undefined);

export function useKeyboardShortcutsContext() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error(
      'useKeyboardShortcutsContext must be used within KeyboardShortcutsProvider'
    );
  }
  return context;
}

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
  enableShortcuts?: boolean;
}

export function KeyboardShortcutsProvider({
  children,
  enableShortcuts = true,
}: KeyboardShortcutsProviderProps) {
  const { isShortcutsPanelOpen, showShortcutsPanel, hideShortcutsPanel } =
    useKeyboardShortcuts({ enableShortcuts });

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        showShortcutsPanel,
        hideShortcutsPanel,
        isShortcutsPanelOpen,
      }}
    >
      {children}
      <KeyboardShortcutsPanel
        isOpen={isShortcutsPanelOpen}
        onClose={hideShortcutsPanel}
      />
    </KeyboardShortcutsContext.Provider>
  );
}
