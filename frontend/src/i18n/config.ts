/**
 * i18n configuration: the locales Stow ships translations for, and the one
 * used when nothing else matches.
 *
 * Adding a language:
 *  1. Copy `locales/en.json` to `locales/<code>.json` and translate values.
 *  2. Import it in `messages.ts` and add it to `MESSAGES`.
 *  3. Add the code and its native-language name to `LOCALES` below.
 *
 * Keys missing from a translation fall back to the English string, so a
 * partially translated locale never renders raw keys.
 */

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";

/** localStorage key for the user's chosen language. */
export const LOCALE_STORAGE_KEY = "stow-locale";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((l) => l.code === value);
}

/**
 * Picks the best supported locale from a list of BCP 47 tags (e.g.
 * `navigator.languages`), matching on the primary language subtag so
 * "fr-CA" resolves to "fr".
 */
export function matchLocale(candidates: readonly string[]): Locale {
  for (const tag of candidates) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
