"use client";

import { useId, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import SavingsGrowthChart from "@/components/savings/SavingsGrowthChart";
import {
  CALCULATOR_LIMITS,
  COMPOUNDING_FREQUENCIES,
  calculateSavings,
  validateCalculatorInput,
  type CalculatorField,
  type CalculatorInput,
  type CompoundingFrequency,
} from "@/lib/savingsCalculator";

const COMPOUNDING_LABELS: Record<CompoundingFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

interface FormState {
  initialAmount: string;
  monthlyDeposit: string;
  durationYears: string;
  annualRatePercent: string;
  compounding: CompoundingFrequency;
}

const DEFAULTS: FormState = {
  initialAmount: "1000",
  monthlyDeposit: "100",
  durationYears: "10",
  annualRatePercent: "5",
  compounding: "monthly",
};

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number): string {
  return `${money.format(value)} USDC`;
}

/** Rounds away floating point noise, e.g. 0.1 years * 12 = 1.2000000000000002. */
function snapToInteger(value: number): number {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-9 ? rounded : value;
}

/** An empty field counts as 0 so clearing an input does not flash an error. */
function toNumber(raw: string): number {
  const trimmed = raw.trim();
  return trimmed === "" ? 0 : Number(trimmed);
}

function toInput(form: FormState): CalculatorInput {
  return {
    initialAmount: toNumber(form.initialAmount),
    monthlyDeposit: toNumber(form.monthlyDeposit),
    // Whole months only; an empty duration is invalid (see below).
    durationMonths:
      form.durationYears.trim() === ""
        ? Number.NaN
        : snapToInteger(Number(form.durationYears) * 12),
    annualRatePercent: toNumber(form.annualRatePercent),
    compounding: form.compounding,
  };
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  suffix?: string;
  step?: string;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  suffix,
  step = "any",
}: NumberFieldProps) {
  const messageId = `${id}-message`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={event => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          className={`min-h-11 w-full rounded-lg border bg-card px-3 pr-16 text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 ${
            error ? "border-red-500" : "border-border"
          }`}
        />
        {suffix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted"
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {error || hint ? (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={`mt-1.5 text-xs ${error ? "text-red-500" : "text-muted"}`}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}

const ERROR_FIELD_FOR: Record<CalculatorField, keyof FormState> = {
  initialAmount: "initialAmount",
  monthlyDeposit: "monthlyDeposit",
  durationMonths: "durationYears",
  annualRatePercent: "annualRatePercent",
  compounding: "compounding",
};

export default function CalculatorPage() {
  const baseId = useId();
  const [form, setForm] = useState<FormState>(DEFAULTS);

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) =>
    setForm(current => ({ ...current, [key]: value }));

  // Recalculates on every change; inputs are validated before any maths runs.
  const { errors, result } = useMemo(() => {
    const input = toInput(form);
    const fieldErrors = validateCalculatorInput(input);
    const byFormField: Partial<Record<keyof FormState, string>> = {};
    for (const [field, message] of Object.entries(fieldErrors)) {
      byFormField[ERROR_FIELD_FOR[field as CalculatorField]] = message;
    }
    return {
      errors: byFormField,
      result:
        Object.keys(fieldErrors).length === 0 ? calculateSavings(input) : null,
    };
  }, [form]);

  const interestShare =
    result && result.finalBalance > 0
      ? (result.totalInterest / result.finalBalance) * 100
      : 0;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 max-w-3xl">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/10">
              <Calculator className="h-5 w-5 text-brand" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-brand">Savings tools</p>
          </div>
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
            Savings calculator
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Estimate what your savings could be worth before you commit any
            funds. Change a value and the projection updates straight away.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <form
            aria-label="Calculator inputs"
            onSubmit={event => event.preventDefault()}
            className="space-y-5 self-start rounded-xl border border-border bg-card p-5"
            noValidate
          >
            <NumberField
              id={`${baseId}-initial`}
              label="Initial amount"
              value={form.initialAmount}
              onChange={set("initialAmount")}
              error={errors.initialAmount}
              suffix="USDC"
            />
            <NumberField
              id={`${baseId}-monthly`}
              label="Monthly deposit"
              value={form.monthlyDeposit}
              onChange={set("monthlyDeposit")}
              error={errors.monthlyDeposit}
              hint="Added at the end of each month."
              suffix="USDC"
            />
            <NumberField
              id={`${baseId}-years`}
              label="Duration"
              value={form.durationYears}
              onChange={set("durationYears")}
              error={errors.durationYears}
              hint={`Up to ${CALCULATOR_LIMITS.maxMonths / 12} years.`}
              suffix="years"
              step="0.0833333333"
            />
            <NumberField
              id={`${baseId}-rate`}
              label="Interest rate"
              value={form.annualRatePercent}
              onChange={set("annualRatePercent")}
              error={errors.annualRatePercent}
              hint="Nominal annual rate. Real yield varies and is not guaranteed."
              suffix="% / year"
            />

            <div>
              <label
                htmlFor={`${baseId}-compounding`}
                className="block text-sm font-medium text-foreground"
              >
                Compounding
              </label>
              <select
                id={`${baseId}-compounding`}
                value={form.compounding}
                onChange={event =>
                  set("compounding")(event.target.value as CompoundingFrequency)
                }
                className="mt-2 min-h-11 w-full rounded-lg border border-border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                {COMPOUNDING_FREQUENCIES.map(frequency => (
                  <option key={frequency} value={frequency}>
                    {COMPOUNDING_LABELS[frequency]}
                  </option>
                ))}
              </select>
            </div>
          </form>

          <div className="min-w-0 space-y-8" aria-live="polite">
            {result ? (
              <>
                <section aria-labelledby={`${baseId}-summary`}>
                  <h2 id={`${baseId}-summary`} className="sr-only">
                    Projected result
                  </h2>
                  <p className="text-sm text-muted">Projected final balance</p>
                  <p className="mt-1 text-4xl font-semibold text-foreground">
                    {formatMoney(result.finalBalance)}
                  </p>
                  <dl className="mt-5 grid gap-4 sm:grid-cols-3">
                    <div className="border-t-2 border-brand-2/60 bg-card px-4 py-3">
                      <dt className="text-xs font-medium text-muted">
                        Total principal
                      </dt>
                      <dd className="mt-1 text-lg font-semibold text-foreground">
                        {formatMoney(result.totalPrincipal)}
                      </dd>
                    </div>
                    <div className="border-t-2 border-brand/60 bg-card px-4 py-3">
                      <dt className="text-xs font-medium text-muted">
                        Interest earned
                      </dt>
                      <dd className="mt-1 text-lg font-semibold text-foreground">
                        {formatMoney(result.totalInterest)}
                      </dd>
                    </div>
                    <div className="border-t-2 border-border bg-card px-4 py-3">
                      <dt className="text-xs font-medium text-muted">
                        Effective annual yield
                      </dt>
                      <dd className="mt-1 text-lg font-semibold text-foreground">
                        {result.effectiveAnnualYieldPercent.toFixed(2)}%
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-sm text-muted">
                    Interest makes up {interestShare.toFixed(1)}% of the final
                    balance.
                  </p>
                </section>

                <section aria-labelledby={`${baseId}-chart`}>
                  <h2
                    id={`${baseId}-chart`}
                    className="mb-3 text-xl font-semibold text-foreground"
                  >
                    Growth over time
                  </h2>
                  <SavingsGrowthChart points={result.points} />
                </section>

                <section aria-labelledby={`${baseId}-table`}>
                  <h2
                    id={`${baseId}-table`}
                    className="mb-3 text-xl font-semibold text-foreground"
                  >
                    Year by year
                  </h2>
                  <div
                    className="overflow-x-auto rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/50"
                    tabIndex={0}
                    aria-label="Year by year breakdown"
                  >
                    <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="bg-card">
                          <th scope="col" className="border-b border-border px-4 py-3 font-medium text-muted">
                            Year
                          </th>
                          <th scope="col" className="border-b border-border px-4 py-3 text-right font-medium text-muted">
                            Principal
                          </th>
                          <th scope="col" className="border-b border-border px-4 py-3 text-right font-medium text-muted">
                            Interest
                          </th>
                          <th scope="col" className="border-b border-border px-4 py-3 text-right font-medium text-muted">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.yearly.map(row => (
                          <tr key={row.year} className="odd:bg-card/40">
                            <th scope="row" className="border-b border-border px-4 py-3 font-medium text-foreground">
                              {row.month % 12 === 0
                                ? row.year
                                : `${row.year} (${row.month % 12} mo)`}
                            </th>
                            <td className="border-b border-border px-4 py-3 text-right tabular-nums text-muted">
                              {money.format(row.principal)}
                            </td>
                            <td className="border-b border-border px-4 py-3 text-right tabular-nums text-muted">
                              {money.format(row.interest)}
                            </td>
                            <td className="border-b border-border px-4 py-3 text-right tabular-nums font-medium text-foreground">
                              {money.format(row.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <p
                role="status"
                className="rounded-xl border border-border bg-card p-5 text-sm text-muted"
              >
                Fix the highlighted fields to see your projection.
              </p>
            )}

            <p className="text-xs text-muted">
              Estimates for planning only. They assume a constant rate and
              on-time deposits, and are not a promise of future returns.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
