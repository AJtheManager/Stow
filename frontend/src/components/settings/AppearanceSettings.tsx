"use client";

import { Monitor, Moon, Palette, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemePreference } from "@/context/ThemeProvider";

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { value: "light", label: "Light", description: "Always use the light theme", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use the dark theme", icon: Moon },
  {
    value: "system",
    label: "System",
    description: "Match your device setting",
    icon: Monitor,
  },
];

/**
 * Theme picker for the settings page. The choice is persisted to local
 * storage by `ThemeProvider` ("system" clears the stored value so the
 * device's color scheme is followed again).
 */
export default function AppearanceSettings() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2
        id="appearance-heading"
        className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2"
      >
        <Palette className="h-5 w-5" />
        Appearance
      </h2>
      <div
        role="radiogroup"
        aria-labelledby="appearance-heading"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreference(value)}
              className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                selected
                  ? "border-brand bg-brand/10"
                  : "border-border hover:border-brand/40"
              }`}
            >
              <span
                className={`flex items-center gap-2 text-sm font-medium ${
                  selected ? "text-brand" : "text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </span>
              <span className="text-xs text-muted">{description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
