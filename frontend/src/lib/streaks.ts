/**
 * Savings streak calculations: how many consecutive days (or weeks) a user
 * has made at least one deposit, plus achievement badges for streak
 * milestones.
 *
 * Periods are bucketed by the viewer's local calendar (a deposit at 23:59
 * and one at 00:01 the next day are two different days), and weeks start
 * on Monday.
 */

export type StreakUnit = "day" | "week";

export interface StreakStats {
  /** Consecutive periods with a deposit, ending this period or the previous one. */
  current: number;
  /** Longest run of consecutive periods with a deposit, ever. */
  longest: number;
  /** Whether a deposit has already been made in the current period. */
  depositedThisPeriod: boolean;
  /** Most recent deposit time, or `null` if there are none. */
  lastDepositAt: Date | null;
}

export interface StreakBadge {
  id: string;
  label: string;
  /** Streak length (in `unit`s) needed to earn the badge. */
  threshold: number;
  unit: StreakUnit;
}

export const STREAK_BADGES: readonly StreakBadge[] = [
  { id: "day-3", label: "Getting started", threshold: 3, unit: "day" },
  { id: "day-7", label: "One-week wonder", threshold: 7, unit: "day" },
  { id: "day-30", label: "Monthly master", threshold: 30, unit: "day" },
  { id: "day-100", label: "Century saver", threshold: 100, unit: "day" },
  { id: "week-4", label: "Steady saver", threshold: 4, unit: "week" },
  { id: "week-12", label: "Quarter streak", threshold: 12, unit: "week" },
  { id: "week-26", label: "Half-year habit", threshold: 26, unit: "week" },
  { id: "week-52", label: "Year-round saver", threshold: 52, unit: "week" },
];

const MS_PER_DAY = 86_400_000;

/** Local calendar date as a whole day number (DST-safe). */
function localDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  );
}

/** Index of the Monday-based week containing `date`. Day 0 (1970-01-01) was a Thursday. */
function periodIndex(date: Date, unit: StreakUnit): number {
  const day = localDayNumber(date);
  return unit === "day" ? day : Math.floor((day + 3) / 7);
}

export function computeStreak(
  depositDates: readonly Date[],
  unit: StreakUnit,
  now: Date = new Date(),
): StreakStats {
  const valid = depositDates.filter((d) => !Number.isNaN(d.getTime()));
  if (valid.length === 0) {
    return {
      current: 0,
      longest: 0,
      depositedThisPeriod: false,
      lastDepositAt: null,
    };
  }

  const lastDepositAt = new Date(
    valid.reduce((max, d) => Math.max(max, d.getTime()), -Infinity),
  );
  const periods = Array.from(new Set(valid.map((d) => periodIndex(d, unit)))).sort(
    (a, b) => a - b,
  );

  let longest = 1;
  let run = 1;
  for (let i = 1; i < periods.length; i++) {
    run = periods[i] === periods[i - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const nowPeriod = periodIndex(now, unit);
  const latest = periods[periods.length - 1];
  const depositedThisPeriod = latest === nowPeriod;

  // A streak is still alive if the last deposit was this period or the one
  // before — the user hasn't missed a period yet, they just haven't
  // deposited in the current one.
  let current = 0;
  if (latest === nowPeriod || latest === nowPeriod - 1) {
    current = 1;
    for (let i = periods.length - 2; i >= 0; i--) {
      if (periods[i] !== periods[i + 1] - 1) break;
      current++;
    }
  }

  return { current, longest, depositedThisPeriod, lastDepositAt };
}

/** Badges for `unit`, flagged with whether `longest` streak has earned them. */
export function getStreakBadges(
  longest: number,
  unit: StreakUnit,
): (StreakBadge & { earned: boolean })[] {
  return STREAK_BADGES.filter((badge) => badge.unit === unit).map((badge) => ({
    ...badge,
    earned: longest >= badge.threshold,
  }));
}
