import type { CalculatorPoint } from "@/lib/savingsCalculator";

const compactAmount = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export interface PortfolioAllocationDescription {
  label: string;
  amount: string;
  percent: number;
}

export function describePortfolioAllocation(
  total: string,
  allocations: readonly PortfolioAllocationDescription[],
): string {
  if (allocations.length === 0) {
    return "No savings allocation data is available.";
  }

  const categories = allocations
    .map(
      ({ label, amount, percent }) =>
        `${label}: ${amount}, ${percent.toLocaleString(undefined, { maximumFractionDigits: 1 })} percent`,
    )
    .join(". ");

  return `Savings allocation. Total savings: ${total}. ${categories}.`;
}

function formatMonth(month: number): string {
  if (month % 12 === 0) return `${month / 12} years`;
  return `${month} months`;
}

export function describeSavingsGrowth(
  points: readonly CalculatorPoint[],
): string {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return "No projection to show.";
  }

  return `Projected balance grows from ${compactAmount.format(first.balance)} to ${compactAmount.format(last.balance)} over ${formatMonth(last.month)}, of which ${compactAmount.format(last.principal)} is principal and ${compactAmount.format(last.interest)} is interest.`;
}
