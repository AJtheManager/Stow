"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  matchLocale,
  type Locale,
} from "@/i18n/config";
import { MESSAGES, interpolate, lookup } from "@/i18n/messages";

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

interface I18nContextValue {
  /** The active locale code, e.g. "en". */
  locale: Locale;
  /** Switches language and remembers the choice for future visits. */
  setLocale: (locale: Locale) => void;
  /**
   * Translates a dot-separated key, interpolating `{name}` placeholders.
   * Pass a numeric `count` to select a plural form.
   */
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_CHANGE_EVENT = "stow-locale-change";

/**
 * Finds the message for `key` in one locale. When `vars.count` is a number
 * and `key` holds plural forms (`{ "one": …, "other": … }`), picks the form
 * for that count using the locale's plural rules.
 */
function resolve(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string | undefined {
  const messages = MESSAGES[locale];
  const direct = lookup(messages, key);
  if (direct !== undefined || typeof vars?.count !== "number") return direct;
  const form = new Intl.PluralRules(locale).select(vars.count);
  return lookup(messages, `${key}.${form}`) ?? lookup(messages, `${key}.other`);
}

function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const message =
    resolve(locale, key, vars) ?? resolve(DEFAULT_LOCALE, key, vars) ?? key;
  return interpolate(message, vars);
}

/**
 * Used when a component renders outside an I18nProvider (e.g. isolated
 * component tests): English strings, and switching is a no-op.
 */
const FALLBACK_CONTEXT: I18nContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
};

function readLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage unavailable (private mode, blocked cookies) — use the browser.
  }
  return matchLocale(window.navigator.languages ?? [window.navigator.language]);
}

function subscribe(onChange: () => void) {
  window.addEventListener(LOCALE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Provides the active locale and a `t()` translator to the tree.
 *
 * The server always renders the default locale; the client switches to the
 * stored (or browser-preferred) locale after hydration, so markup never
 * mismatches. Messages missing from a translation fall back to English,
 * then to the key itself.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    readLocale,
    () => DEFAULT_LOCALE,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // Ignore — the choice just won't persist across visits.
    }
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext) ?? FALLBACK_CONTEXT;
}
