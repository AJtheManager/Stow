import { describe, expect, it } from "vitest";
import {
  CALCULATOR_LIMITS,
  COMPOUNDING_FREQUENCIES,
  COMPOUNDING_PERIODS_PER_YEAR,
  calculateSavings,
  validateCalculatorInput,
  type CalculatorInput,
} from "./savingsCalculator";

const base: CalculatorInput = {
  initialAmount: 1000,
  monthlyDeposit: 100,
  durationMonths: 12,
  annualRatePercent: 6,
  compounding: "monthly",
};

/** Independent closed form: FV of a lump sum plus an end-of-month annuity. */
function closedForm(input: CalculatorInput): number {
  const n = COMPOUNDING_PERIODS_PER_YEAR[input.compounding];
  const yearFactor = Math.pow(1 + input.annualRatePercent / 100 / n, n);
  const g = Math.pow(yearFactor, 1 / 12);
  const m = input.durationMonths;
  if (g === 1) return input.initialAmount + input.monthlyDeposit * m;
  return (
    input.initialAmount * Math.pow(g, m) +
    (input.monthlyDeposit * (Math.pow(g, m) - 1)) / (g - 1)
  );
}

describe("calculateSavings", () => {
  describe("correctness", () => {
    it("matches a hand-computed single month at monthly compounding", () => {
      // 1000 * (1 + 0.06/12) + 100 = 1005 + 100
      const result = calculateSavings({ ...base, durationMonths: 1 });
      expect(result.finalBalance).toBe(1105);
      expect(result.totalPrincipal).toBe(1100);
      expect(result.totalInterest).toBe(5);
    });

    it("matches the closed-form future value for every compounding frequency", () => {
      for (const compounding of COMPOUNDING_FREQUENCIES) {
        const input = { ...base, durationMonths: 60, compounding };
        const result = calculateSavings(input);
        expect(result.points[result.points.length - 1].balance).toBeCloseTo(
          closedForm(input),
          6,
        );
        expect(result.finalBalance).toBeCloseTo(closedForm(input), 2);
      }
    });

    it("grows a lump sum to P(1 + r)^t with annual compounding and no deposits", () => {
      const result = calculateSavings({
        initialAmount: 1000,
        monthlyDeposit: 0,
        durationMonths: 24,
        annualRatePercent: 10,
        compounding: "annually",
      });
      expect(result.finalBalance).toBeCloseTo(1210, 2);
      expect(result.totalInterest).toBeCloseTo(210, 2);
    });

    it("earns more with more frequent compounding at the same nominal rate", () => {
      const balances = (
        ["annually", "quarterly", "monthly", "weekly", "daily"] as const
      ).map(
        (compounding) =>
          calculateSavings({ ...base, durationMonths: 120, compounding })
            .finalBalance,
      );
      for (let i = 1; i < balances.length; i++) {
        expect(balances[i]).toBeGreaterThan(balances[i - 1]);
      }
    });

    it("reports the effective annual yield for the chosen compounding", () => {
      expect(
        calculateSavings({ ...base, compounding: "annually" })
          .effectiveAnnualYieldPercent,
      ).toBeCloseTo(6, 10);
      expect(
        calculateSavings({ ...base, compounding: "monthly" })
          .effectiveAnnualYieldPercent,
      ).toBeCloseTo(6.1678, 3);
    });
  });

  describe("principal and interest breakdown", () => {
    it("splits the balance exactly into principal plus interest", () => {
      const result = calculateSavings({ ...base, durationMonths: 90 });
      expect(result.totalPrincipal + result.totalInterest).toBeCloseTo(
        result.finalBalance,
        2,
      );
      expect(result.totalPrincipal).toBe(1000 + 100 * 90);
    });

    it("tracks cumulative principal and interest at every month", () => {
      const { points } = calculateSavings({ ...base, durationMonths: 36 });
      expect(points).toHaveLength(37);
      points.forEach((point, month) => {
        expect(point.month).toBe(month);
        expect(point.principal).toBe(1000 + 100 * month);
        expect(point.interest).toBeCloseTo(point.balance - point.principal, 8);
      });
      expect(points[0]).toEqual({
        month: 0,
        balance: 1000,
        principal: 1000,
        interest: 0,
      });
    });

    it("never lets interest go negative", () => {
      const { points } = calculateSavings({ ...base, durationMonths: 120 });
      for (const point of points) {
        expect(point.interest).toBeGreaterThanOrEqual(-1e-9);
      }
    });
  });

  describe("yearly breakdown", () => {
    it("has one row per year ending on a year boundary", () => {
      const { yearly, points } = calculateSavings({
        ...base,
        durationMonths: 36,
      });
      expect(yearly.map(row => row.year)).toEqual([1, 2, 3]);
      expect(yearly.map(row => row.month)).toEqual([12, 24, 36]);
      expect(yearly[1].balance).toBeCloseTo(points[24].balance, 2);
    });

    it("adds a final partial-year row when the duration is not a whole year", () => {
      const { yearly, finalBalance } = calculateSavings({
        ...base,
        durationMonths: 18,
      });
      expect(yearly.map(row => row.month)).toEqual([12, 18]);
      expect(yearly[1].balance).toBe(finalBalance);
    });

    it("keeps every row's principal and interest summing to its balance", () => {
      const { yearly } = calculateSavings({ ...base, durationMonths: 120 });
      for (const row of yearly) {
        expect(row.principal + row.interest).toBeCloseTo(row.balance, 2);
      }
    });

    it("ends on the headline totals", () => {
      const result = calculateSavings({ ...base, durationMonths: 60 });
      const last = result.yearly[result.yearly.length - 1];
      expect(last.balance).toBe(result.finalBalance);
      expect(last.principal).toBe(result.totalPrincipal);
      expect(last.interest).toBe(result.totalInterest);
    });
  });

  describe("edge cases", () => {
    it("returns the deposits unchanged at a 0% rate", () => {
      const result = calculateSavings({ ...base, annualRatePercent: 0 });
      expect(result.finalBalance).toBe(1000 + 100 * 12);
      expect(result.totalInterest).toBe(0);
      expect(result.effectiveAnnualYieldPercent).toBe(0);
    });

    it("handles a zero initial amount", () => {
      const result = calculateSavings({ ...base, initialAmount: 0 });
      expect(result.points[0].balance).toBe(0);
      expect(result.totalPrincipal).toBe(1200);
      expect(result.finalBalance).toBeGreaterThan(1200);
    });

    it("handles a zero monthly deposit", () => {
      const result = calculateSavings({ ...base, monthlyDeposit: 0 });
      expect(result.totalPrincipal).toBe(1000);
      expect(result.totalInterest).toBeGreaterThan(0);
    });

    it("handles zero amounts and zero rate together", () => {
      const result = calculateSavings({
        initialAmount: 0,
        monthlyDeposit: 0,
        durationMonths: 12,
        annualRatePercent: 0,
        compounding: "daily",
      });
      expect(result.finalBalance).toBe(0);
      expect(result.totalPrincipal).toBe(0);
      expect(result.totalInterest).toBe(0);
    });

    it("handles the longest supported duration", () => {
      const result = calculateSavings({
        ...base,
        durationMonths: CALCULATOR_LIMITS.maxMonths,
      });
      expect(result.points).toHaveLength(CALCULATOR_LIMITS.maxMonths + 1);
      expect(result.yearly).toHaveLength(50);
      expect(Number.isFinite(result.finalBalance)).toBe(true);
    });

    it("stays finite at the largest supported inputs", () => {
      const result = calculateSavings({
        initialAmount: CALCULATOR_LIMITS.maxAmount,
        monthlyDeposit: CALCULATOR_LIMITS.maxAmount,
        durationMonths: CALCULATOR_LIMITS.maxMonths,
        annualRatePercent: CALCULATOR_LIMITS.maxRatePercent,
        compounding: "daily",
      });
      expect(Number.isFinite(result.finalBalance)).toBe(true);
      expect(Number.isFinite(result.totalInterest)).toBe(true);
      expect(result.finalBalance).toBeGreaterThan(result.totalPrincipal);
    });

    it("rounds headline values to whole cents", () => {
      const result = calculateSavings({
        ...base,
        initialAmount: 333.33,
        annualRatePercent: 3.37,
        durationMonths: 17,
      });
      for (const value of [
        result.finalBalance,
        result.totalPrincipal,
        result.totalInterest,
      ]) {
        expect(Math.round(value * 100)).toBeCloseTo(value * 100, 6);
      }
    });

    it("does not mutate its input", () => {
      const input = { ...base };
      calculateSavings(input);
      expect(input).toEqual(base);
    });
  });

  describe("invalid input", () => {
    it.each([
      ["a negative initial amount", { initialAmount: -1 }],
      ["a negative monthly deposit", { monthlyDeposit: -5 }],
      ["a NaN amount", { initialAmount: Number.NaN }],
      ["an infinite amount", { monthlyDeposit: Number.POSITIVE_INFINITY }],
      ["zero months", { durationMonths: 0 }],
      ["a fractional duration", { durationMonths: 12.5 }],
      ["a duration beyond 50 years", { durationMonths: 601 }],
      ["a negative rate", { annualRatePercent: -0.1 }],
      ["a rate above 100%", { annualRatePercent: 100.01 }],
    ])("throws a RangeError for %s", (_label, override) => {
      expect(() => calculateSavings({ ...base, ...override })).toThrow(
        RangeError,
      );
    });

    it("throws for an unknown compounding frequency", () => {
      expect(() =>
        calculateSavings({
          ...base,
          compounding: "hourly" as unknown as CalculatorInput["compounding"],
        }),
      ).toThrow(RangeError);
    });
  });
});

describe("validateCalculatorInput", () => {
  it("returns no errors for valid input", () => {
    expect(validateCalculatorInput(base)).toEqual({});
  });

  it("accepts the boundary values", () => {
    expect(
      validateCalculatorInput({
        initialAmount: 0,
        monthlyDeposit: CALCULATOR_LIMITS.maxAmount,
        durationMonths: 1,
        annualRatePercent: CALCULATOR_LIMITS.maxRatePercent,
        compounding: "annually",
      }),
    ).toEqual({});
  });

  it("reports one message per invalid field and leaves valid fields alone", () => {
    const errors = validateCalculatorInput({
      ...base,
      initialAmount: -10,
      durationMonths: 0,
      annualRatePercent: 150,
    });
    expect(Object.keys(errors).sort()).toEqual([
      "annualRatePercent",
      "durationMonths",
      "initialAmount",
    ]);
    expect(errors.monthlyDeposit).toBeUndefined();
    expect(errors.compounding).toBeUndefined();
  });

  it("explains each failure in plain language", () => {
    expect(
      validateCalculatorInput({ ...base, initialAmount: -1 }).initialAmount,
    ).toBe("Initial amount cannot be negative");
    expect(
      validateCalculatorInput({ ...base, durationMonths: 12.5 }).durationMonths,
    ).toBe("Duration must be a whole number of months");
    expect(
      validateCalculatorInput({ ...base, annualRatePercent: 101 })
        .annualRatePercent,
    ).toBe("Interest rate cannot exceed 100%");
    expect(
      validateCalculatorInput({ ...base, durationMonths: 601 }).durationMonths,
    ).toBe("Duration cannot exceed 50 years");
  });

  it("flags non-numeric values", () => {
    const errors = validateCalculatorInput({
      ...base,
      monthlyDeposit: Number.NaN,
      annualRatePercent: Number.NaN,
      durationMonths: Number.NaN,
    });
    expect(errors.monthlyDeposit).toBe("Monthly deposit must be a number");
    expect(errors.annualRatePercent).toBe("Interest rate must be a number");
    expect(errors.durationMonths).toBe("Duration must be a number");
  });
});
