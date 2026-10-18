"use client";

import { useId } from "react";
import { Languages } from "lucide-react";
import { LOCALES, isLocale } from "@/i18n/config";
import { useTranslation } from "@/context/I18nProvider";

export interface LanguageSwitcherProps {
  className?: string;
}

/** Dropdown for switching the interface language. */
export default function LanguageSwitcher({ className = "" }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();
  const id = useId();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Languages className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {t("language.label")}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
