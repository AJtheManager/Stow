/**
 * Savings goal projections for the calculator widget.
 *
 * Models a balance that starts at `initialDeposit`, earns `apr` percent a
 * year compounded monthly, and receives `monthlyContribution` at the end
 * of each month. These are estimates for planning only: real yield varies
 * with the underlying strategy and is not guaranteed.
 */

/** Projections stop after this many months (50 years) to bound the loop. */
export const MAX_PROJECTION_MONTHS = 600;

export interface ProjectionInput {
  /** Target balance the user is saving towards. */
  goalAmount: number;
  /** Amount already saved / deposited up front. */
  initialDeposit: number;
  /** Amount added at the end of every month. */
  monthlyContribution: number;
  /** Annual percentage rate, e.g. `5` for 5%. `0` disables yield. */
  apr: number;
}

export interface ProjectionPoint {
  /** Months elapsed since the start (0 = today). */
  month: number;
  balance: number;
  /** Cumulative principal deposited (initial deposit + contributions). */
  contributed: number;
  /** Cumulative yield earned: `balance - contributed`. */
  yieldEarned: number;
}

export interface ProjectionResult {
  /**
   * Months until the balance first reaches the goal, `0` if it already
   * has, or `null` if it won't within `MAX_PROJECTION_MONTHS`.
   */
  monthsToGoal: number | null;
  /** The month-by-month balance, from today up to the goal (or the cap). */
  points: ProjectionPoint[];
  /** The point at which the goal is reached (or the last projected one). */
  final: ProjectionPoint;
}

function sanitize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Projects a savings balance month by month until it reaches the goal.
 * Non-finite or negative inputs are treated as zero.
 */
export function projectSavings(input: ProjectionInput): ProjectionResult {
  const goal = sanitize(input.goalAmount);
  const monthly = sanitize(input.monthlyContribution);
  const monthlyRate = sanitize(input.apr) / 100 / 12;

  let balance = sanitize(input.initialDeposit);
  let contributed = balance;
  const points: ProjectionPoint[] = [
    { month: 0, balance, contributed, yieldEarned: 0 },
  ];

  if (balance >= goal) {
    return { monthsToGoal: 0, points, final: points[0] };
  }

  for (let month = 1; month <= MAX_PROJECTION_MONTHS; month++) {
    balance = balance * (1 + monthlyRate) + monthly;
    contributed += monthly;
    const point = {
      month,
      balance,
      contributed,
      yieldEarned: balance - contributed,
    };
    points.push(point);
    if (balance >= goal) {
      return { monthsToGoal: month, points, final: point };
    }
    // Nothing is being added and nothing is growing: it'll never get there.
    if (monthly === 0 && monthlyRate === 0) break;
  }

  return { monthsToGoal: null, points, final: points[points.length - 1] };
}

/**
 * The balance after `months` months under the same model, regardless of
 * any goal — used for "in 1 / 3 / 5 years" yield projections.
 */
export function balanceAfter(
  input: Omit<ProjectionInput, "goalAmount">,
  months: number,
): ProjectionPoint {
  const monthly = sanitize(input.monthlyContribution);
  const monthlyRate = sanitize(input.apr) / 100 / 12;
  let balance = sanitize(input.initialDeposit);
  let contributed = balance;

  for (let month = 1; month <= months; month++) {
    balance = balance * (1 + monthlyRate) + monthly;
    contributed += monthly;
  }

  return { month: months, balance, contributed, yieldEarned: balance - contributed };
}

/** Adds `months` calendar months to `from` (defaults to now). */
export function addMonths(months: number, from: Date = new Date()): Date {
  const date = new Date(from);
  date.setMonth(date.getMonth() + months);
  return date;
}
