"use client";

import { useId, useMemo, useState } from "react";
import { Calculator, CalendarCheck, TrendingUp } from "lucide-react";
import { formatAPR, formatAssetAmount } from "@/lib/currency";
import {
  MAX_PROJECTION_MONTHS,
  addMonths,
  balanceAfter,
  projectSavings,
} from "@/lib/savingsProjection";
import { useTranslation, type TranslateFn } from "@/context/I18nProvider";

export interface SavingsCalculatorProps {
  /** Starting goal amount in USDC. */
  defaultGoal?: number;
  /** Starting up-front deposit in USDC. */
  defaultInitialDeposit?: number;
  /** Starting monthly contribution in USDC. */
  defaultMonthlyContribution?: number;
  /** Starting APR in percent, e.g. the current strategy's APR. */
  defaultApr?: number;
  /** Upper bound of the APR slider, in percent. */
  maxApr?: number;
  className?: string;
}

/** Yield projection horizons shown under the timeline, in years. */
const HORIZON_YEARS = [1, 3, 5] as const;

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatDuration(months: number, t: TranslateFn): string {
  if (months === 0) return t("calculator.alreadyReached");
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return t("calculator.months", { count: rest });
  if (rest === 0) return t("calculator.years", { count: years });
  return t("calculator.yearsAndMonths", {
    years: t("calculator.years", { count: years }),
    months: t("calculator.months", { count: rest }),
  });
}

/**
 * Interactive goal calculator: given a target, an up-front deposit, a
 * monthly contribution and an APR, estimates how long the goal takes to
 * reach and how much of the final balance comes from yield.
 */
export default function SavingsCalculator({
  defaultGoal = 1000,
  defaultInitialDeposit = 100,
  defaultMonthlyContribution = 50,
  defaultApr = 5,
  maxApr = 20,
  className = "",
}: SavingsCalculatorProps) {
  const { t, locale } = useTranslation();
  const baseId = useId();
  const [goal, setGoal] = useState(String(defaultGoal));
  const [initialDeposit, setInitialDeposit] = useState(String(defaultInitialDeposit));
  const [monthly, setMonthly] = useState(String(defaultMonthlyContribution));
  const [apr, setApr] = useState(defaultApr);

  const input = useMemo(
    () => ({
      goalAmount: toNumber(goal),
      initialDeposit: toNumber(initialDeposit),
      monthlyContribution: toNumber(monthly),
      apr,
    }),
    [goal, initialDeposit, monthly, apr],
  );

  const projection = useMemo(() => projectSavings(input), [input]);
  const horizons = useMemo(
    () => HORIZON_YEARS.map((years) => balanceAfter(input, years * 12)),
    [input],
  );

  const usdc = (value: number) =>
    formatAssetAmount(value, "USDC", { locale, maximumFractionDigits: 2 });

  const { monthsToGoal, final } = projection;
  const reachable = monthsToGoal !== null;
  const yieldShare =
    final.balance > 0 ? Math.max(0, final.yieldEarned) / final.balance : 0;

  const fields = [
    { key: "goal", label: t("calculator.goalAmount"), value: goal, set: setGoal },
    {
      key: "initial",
      label: t("calculator.initialDeposit"),
      value: initialDeposit,
      set: setInitialDeposit,
    },
    {
      key: "monthly",
      label: t("calculator.monthlyContribution"),
      value: monthly,
      set: setMonthly,
    },
  ];

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className={`rounded-2xl border border-border bg-card p-6 ${className}`}
    >
      <h2
        id={`${baseId}-title`}
        className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground"
      >
        <Calculator className="h-5 w-5 text-brand" aria-hidden="true" />
        {t("calculator.title")}
      </h2>
      <p className="mb-5 text-sm text-muted">{t("calculator.description")}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`${baseId}-${field.key}`}
              className="mb-2 block text-sm font-medium text-foreground"
            >
              {field.label}
            </label>
            <div className="relative">
              <input
                id={`${baseId}-${field.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                className="w-full rounded-xl border border-border bg-background py-2 pl-4 pr-16 text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-muted">
                USDC
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <label
            htmlFor={`${baseId}-apr`}
            className="text-sm font-medium text-foreground"
          >
            {t("calculator.apr")}
          </label>
          <span className="text-sm font-semibold text-brand">
            {formatAPR(apr, { locale })}
          </span>
        </div>
        <input
          id={`${baseId}-apr`}
          type="range"
          min={0}
          max={maxApr}
          step={0.25}
          value={apr}
          onChange={(e) => setApr(Number(e.target.value))}
          aria-valuetext={formatAPR(apr, { locale })}
          className="w-full accent-brand"
        />
      </div>

      <div aria-live="polite" className="mt-6 space-y-4">
        <div className="rounded-xl border border-brand/40 bg-brand/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-brand">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {t("calculator.timeToGoal")}
          </div>
          {reachable ? (
            <>
              <p
                data-testid="calculator-timeline"
                className="mt-2 text-2xl font-semibold text-foreground"
              >
                {formatDuration(monthsToGoal, t)}
              </p>
              {monthsToGoal > 0 && (
                <p className="mt-1 text-sm text-muted">
                  {t("calculator.targetDate", {
                    date: addMonths(monthsToGoal).toLocaleDateString(locale, {
                      month: "long",
                      year: "numeric",
                    }),
                  })}
                </p>
              )}
            </>
          ) : (
            <p
              data-testid="calculator-timeline"
              className="mt-2 text-sm text-foreground"
            >
              {t("calculator.unreachable", {
                years: MAX_PROJECTION_MONTHS / 12,
              })}
            </p>
          )}
        </div>

        {reachable && (
          <div>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">{t("calculator.totalContributed")}</dt>
                <dd className="font-semibold text-foreground">
                  {usdc(final.contributed)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("calculator.yieldEarned")}</dt>
                <dd className="font-semibold text-brand">
                  {usdc(final.yieldEarned)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("calculator.finalBalance")}</dt>
                <dd className="font-semibold text-foreground">
                  {usdc(final.balance)}
                </dd>
              </div>
            </dl>
            <div
              className="mt-3 flex h-2 overflow-hidden rounded-full bg-border"
              role="img"
              aria-label={t("calculator.yieldShare", {
                percent: Math.round(yieldShare * 100),
              })}
            >
              <div
                className="h-full bg-brand-2"
                style={{ width: `${(1 - yieldShare) * 100}%` }}
              />
              <div
                className="h-full bg-brand"
                style={{ width: `${yieldShare * 100}%` }}
              />
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <TrendingUp className="h-4 w-4 text-brand" aria-hidden="true" />
            {t("calculator.yieldProjections")}
          </h3>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 font-medium">
                  {t("calculator.horizon")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("calculator.balance")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("calculator.yieldEarned")}
                </th>
              </tr>
            </thead>
            <tbody>
              {horizons.map((point) => (
                <tr key={point.month} className="border-t border-border">
                  <th scope="row" className="py-2 font-normal text-muted">
                    {formatDuration(point.month, t)}
                  </th>
                  <td className="py-2 text-right text-foreground">
                    {usdc(point.balance)}
                  </td>
                  <td className="py-2 text-right text-brand">
                    {usdc(point.yieldEarned)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">{t("calculator.disclaimer")}</p>
      </div>
    </section>
  );
}
