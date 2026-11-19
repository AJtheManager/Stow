/**
 * Account activity, as returned by `GET /api/savings/activity` and exported
 * as CSV by `GET /api/savings/activity/export` (see `lib/exportTransactions`).
 */
export const ACTIVITY_TYPES = [
  "deposit",
  "withdrawal",
  "goal_created",
  "goal_contribution",
  "goal_reached",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  goal_created: "Goal created",
  goal_contribution: "Goal contribution",
  goal_reached: "Goal reached",
};

export interface ActivityItem {
  id: string;
  type: ActivityType;
  /** Amount in stroops, or null for events without one (e.g. goal_reached). */
  amount: string | null;
  goal_id: string | null;
  goal_name: string | null;
  tx_hash: string | null;
  ledger: number;
  occurred_at: string;
  /** Flexible balance in stroops after a deposit/withdrawal, else null. */
  balance: string | null;
}

export interface ActivityFilters {
  /** Inclusive start date, `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive end date, `YYYY-MM-DD`. */
  to?: string;
  /** Only these activity types; empty/omitted means all. */
  types?: ActivityType[];
  limit?: number;
}

/**
 * Builds the shared query string for the activity list and CSV export.
 * Date-only inputs are widened to whole days in the viewer's timezone.
 */
export function buildActivityQuery(
  address: string,
  filters: ActivityFilters = {},
): string {
  const params = new URLSearchParams({ address });
  if (filters.from) {
    params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  }
  if (filters.to) {
    params.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  }
  if (filters.types?.length) params.set("types", filters.types.join(","));
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}

/** The API wraps successful bodies in `{ success, data }`; accept both shapes. */
export function unwrapApiData<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body && "success" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}
