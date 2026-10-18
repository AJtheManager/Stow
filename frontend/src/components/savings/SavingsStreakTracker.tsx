"use client";

import { useMemo, useState } from "react";
import { Award, Flame, Lock } from "lucide-react";
import {
  computeStreak,
  getStreakBadges,
  type StreakUnit,
} from "@/lib/streaks";

export interface SavingsStreakTrackerProps {
  /** Deposit timestamps (ISO strings or Dates). */
  depositDates: readonly (string | Date)[];
  isLoading?: boolean;
  /** Override "now" for deterministic rendering. */
  now?: Date;
  className?: string;
}

const UNIT_LABELS: Record<StreakUnit, { singular: string; plural: string; tab: string }> = {
  day: { singular: "day", plural: "days", tab: "Daily" },
  week: { singular: "week", plural: "weeks", tab: "Weekly" },
};

/**
 * Savings streak tracker: shows the current and longest run of consecutive
 * deposit days or weeks, and the achievement badges earned along the way.
 */
export default function SavingsStreakTracker({
  depositDates,
  isLoading = false,
  now,
  className = "",
}: SavingsStreakTrackerProps) {
  const [unit, setUnit] = useState<StreakUnit>("day");

  const dates = useMemo(
    () => depositDates.map((d) => (d instanceof Date ? d : new Date(d))),
    [depositDates],
  );
  const stats = useMemo(
    () => computeStreak(dates, unit, now),
    [dates, unit, now],
  );
  const badges = getStreakBadges(stats.longest, unit);
  const labels = UNIT_LABELS[unit];
  const periodName = unit === "day" ? "today" : "this week";

  return (
    <section
      aria-labelledby="savings-streak-title"
      className={`rounded-2xl border border-border bg-card p-6 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2
          id="savings-streak-title"
          className="text-lg font-semibold text-foreground"
        >
          Savings streak
        </h2>
        <div
          role="radiogroup"
          aria-label="Streak period"
          className="flex gap-1 rounded-xl border border-border bg-background p-1"
        >
          {(Object.keys(UNIT_LABELS) as StreakUnit[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={unit === value}
              onClick={() => setUnit(value)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                unit === value
                  ? "bg-brand/20 text-brand"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {UNIT_LABELS[value].tab}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading streak"
          className="h-24 animate-pulse rounded-xl bg-white/5"
        />
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${
                stats.current > 0 ? "bg-brand/15 text-brand" : "bg-white/5 text-muted"
              }`}
            >
              <Flame className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
              <p
                className="text-3xl font-semibold text-foreground"
                data-testid="current-streak"
              >
                {stats.current}{" "}
                <span className="text-base font-normal text-muted">
                  {stats.current === 1 ? labels.singular : labels.plural}
                </span>
              </p>
              <p className="text-sm text-muted">
                Longest: {stats.longest}{" "}
                {stats.longest === 1 ? labels.singular : labels.plural}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm text-muted">
            {stats.lastDepositAt === null
              ? "Make your first deposit to start a streak."
              : stats.depositedThisPeriod
                ? `You've saved ${periodName} — keep it going!`
                : stats.current > 0
                  ? `Deposit ${periodName} to keep your streak alive.`
                  : `Deposit ${periodName} to start a new streak.`}
          </p>

          <h3 className="mt-6 mb-3 text-sm font-medium text-foreground">
            Achievements
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {badges.map((badge) => (
              <li
                key={badge.id}
                aria-label={`${badge.label}: ${badge.threshold}-${badge.unit} streak, ${
                  badge.earned ? "earned" : "locked"
                }`}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
                  badge.earned
                    ? "border-brand/40 bg-brand/10"
                    : "border-border bg-background opacity-60"
                }`}
              >
                {badge.earned ? (
                  <Award className="h-6 w-6 text-brand" aria-hidden="true" />
                ) : (
                  <Lock className="h-6 w-6 text-muted" aria-hidden="true" />
                )}
                <span className="text-xs font-medium text-foreground">
                  {badge.label}
                </span>
                <span className="text-[11px] text-muted">
                  {badge.threshold} {UNIT_LABELS[badge.unit].plural}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
