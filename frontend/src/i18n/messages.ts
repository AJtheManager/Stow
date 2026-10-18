import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import type { Locale } from "./config";

/** Nested translation dictionary, as stored in `locales/*.json`. */
export interface Messages {
  [key: string]: string | Messages;
}

export const MESSAGES: Record<Locale, Messages> = { en, es, fr };

/** Looks up a dot-separated key (e.g. "nav.dashboard") in a dictionary. */
export function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Replaces `{name}` placeholders with values from `vars`. */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
