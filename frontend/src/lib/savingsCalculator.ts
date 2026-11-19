/**
 * Savings growth calculator (#569).
 *
 * Projects a balance that starts at `initialAmount`, receives `monthlyDeposit`
 * at the end of every month, and earns `annualRatePercent` a year compounded
 * at a chosen frequency. Everything is an estimate for planning only: real
 * yield varies with the underlying strategy and is not guaranteed.
 *
 * Model
 * -----
 * The nominal annual rate `r` compounds `n` times a year, so one year grows by
 * `(1 + r / n) ^ n`. Deposits land monthly, so the balance is advanced one
 * month at a time with the equivalent monthly growth factor
 * `g = (1 + r / n) ^ (n / 12)`:
 *
 *   balance(m) = balance(m - 1) * g + monthlyDeposit
 *
 * A deposit made at the end of a month earns nothing until the next month,
 * matching `savingsProjection.ts`. With monthly compounding `g = 1 + r / 12`,
 * which is the same convention the goal calculator already uses.
 */

export type CompoundingFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "annually";

/** Compounding periods per year for each supported frequency. */
export const COMPOUNDING_PERIODS_PER_YEAR: Record<CompoundingFrequency, number> =
  {
    daily: 365,
    weekly: 52,
    monthly: 12,
    quarterly: 4,
    annually: 1,
  };

export const COMPOUNDING_FREQUENCIES = Object.keys(
  COMPOUNDING_PERIODS_PER_YEAR,
) as CompoundingFrequency[];

/** Bounds enforced by `validateCalculatorInput`. */
export const CALCULATOR_LIMITS = {
  /** Largest accepted initial amount or monthly deposit. */
  maxAmount: 1_000_000_000,
  /** Longest projection, in months (50 years). */
  maxMonths: 600,
  /** Highest accepted annual rate, in percent. */
  maxRatePercent: 100,
} as const;

export interface CalculatorInput {
  /** Amount deposited up front. */
  initialAmount: number;
  /** Amount added at the end of every month. */
  monthlyDeposit: number;
  /** Projection length in whole months. */
  durationMonths: number;
  /** Nominal annual rate in percent, e.g. `5` for 5%. `0` disables interest. */
  annualRatePercent: number;
  compounding: CompoundingFrequency;
}

export type CalculatorField = keyof CalculatorInput;
export type CalculatorErrors = Partial<Record<CalculatorField, string>>;

export interface CalculatorPoint {
  /** Months elapsed since the start (0 = today). */
  month: number;
  balance: number;
  /** Cumulative principal: initial amount plus all deposits so far. */
  principal: number;
  /** Cumulative interest earned: `balance - principal`. */
  interest: number;
}

export interface YearlyBreakdownRow {
  /** 1-based year. The last row may cover a partial year. */
  year: number;
  /** Months elapsed at the end of this row. */
  month: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface CalculatorResult {
  /** Balance at the end of the projection, rounded to cents. */
  finalBalance: number;
  /** Initial amount plus every deposit, rounded to cents. */
  totalPrincipal: number;
  /** `finalBalance - totalPrincipal`, so the two parts always sum exactly. */
  totalInterest: number;
  /** Effective annual yield in percent for the chosen rate and compounding. */
  effectiveAnnualYieldPercent: number;
  /** The unrounded balance after every month, from month 0 to the end. */
  points: CalculatorPoint[];
  /** One row per year-end (plus the final month), rounded to cents. */
  yearly: YearlyBreakdownRow[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validateAmount(value: unknown, label: string): string | undefined {
  if (!isFiniteNumber(value)) return `${label} must be a number`;
  if (value < 0) return `${label} cannot be negative`;
  if (value > CALCULATOR_LIMITS.maxAmount) {
    return `${label} cannot exceed ${CALCULATOR_LIMITS.maxAmount.toLocaleString("en-US")}`;
  }
  return undefined;
}

/**
 * Checks every field and returns a message per invalid one. An empty object
 * means the input is safe to pass to `calculateSavings`.
 */
export function validateCalculatorInput(
  input: CalculatorInput,
): CalculatorErrors {
  const errors: CalculatorErrors = {};

  const initialError = validateAmount(input.initialAmount, "Initial amount");
  if (initialError) errors.initialAmount = initialError;

  const monthlyError = validateAmount(input.monthlyDeposit, "Monthly deposit");
  if (monthlyError) errors.monthlyDeposit = monthlyError;

  if (!isFiniteNumber(input.durationMonths)) {
    errors.durationMonths = "Duration must be a number";
  } else if (!Number.isInteger(input.durationMonths)) {
    errors.durationMonths = "Duration must be a whole number of months";
  } else if (input.durationMonths < 1) {
    errors.durationMonths = "Duration must be at least 1 month";
  } else if (input.durationMonths > CALCULATOR_LIMITS.maxMonths) {
    errors.durationMonths = `Duration cannot exceed ${CALCULATOR_LIMITS.maxMonths / 12} years`;
  }

  if (!isFiniteNumber(input.annualRatePercent)) {
    errors.annualRatePercent = "Interest rate must be a number";
  } else if (input.annualRatePercent < 0) {
    errors.annualRatePercent = "Interest rate cannot be negative";
  } else if (input.annualRatePercent > CALCULATOR_LIMITS.maxRatePercent) {
    errors.annualRatePercent = `Interest rate cannot exceed ${CALCULATOR_LIMITS.maxRatePercent}%`;
  }

  if (!(input.compounding in COMPOUNDING_PERIODS_PER_YEAR)) {
    errors.compounding = "Choose a compounding frequency";
  }

  return errors;
}

/** Growth factor for one year at a nominal rate and compounding frequency. */
function yearlyGrowthFactor(
  annualRatePercent: number,
  periodsPerYear: number,
): number {
  return Math.pow(1 + annualRatePercent / 100 / periodsPerYear, periodsPerYear);
}

/**
 * Projects the balance month by month.
 *
 * @throws {RangeError} if the input fails `validateCalculatorInput`. Callers
 * that take user input should validate first and show the field messages.
 */
export function calculateSavings(input: CalculatorInput): CalculatorResult {
  const errors = validateCalculatorInput(input);
  const firstError = Object.values(errors)[0];
  if (firstError) {
    throw new RangeError(firstError);
  }

  const periodsPerYear = COMPOUNDING_PERIODS_PER_YEAR[input.compounding];
  const yearFactor = yearlyGrowthFactor(input.annualRatePercent, periodsPerYear);
  const monthlyFactor = Math.pow(yearFactor, 1 / 12);

  let balance = input.initialAmount;
  const points: CalculatorPoint[] = [
    { month: 0, balance, principal: input.initialAmount, interest: 0 },
  ];

  for (let month = 1; month <= input.durationMonths; month++) {
    balance = balance * monthlyFactor + input.monthlyDeposit;
    const principal = input.initialAmount + input.monthlyDeposit * month;
    points.push({ month, balance, principal, interest: balance - principal });
  }

  const last = points[points.length - 1];
  const finalBalance = roundCents(last.balance);
  const totalPrincipal = roundCents(last.principal);
  const totalInterest = roundCents(finalBalance - totalPrincipal);

  const yearly: YearlyBreakdownRow[] = [];
  const years = Math.ceil(input.durationMonths / 12);
  for (let year = 1; year <= years; year++) {
    const point = points[Math.min(year * 12, input.durationMonths)];
    const balanceRounded = roundCents(point.balance);
    const principalRounded = roundCents(point.principal);
    yearly.push({
      year,
      month: point.month,
      principal: principalRounded,
      interest: roundCents(balanceRounded - principalRounded),
      balance: balanceRounded,
    });
  }

  return {
    finalBalance,
    totalPrincipal,
    totalInterest,
    effectiveAnnualYieldPercent: (yearFactor - 1) * 100,
    points,
    yearly,
  };
}
