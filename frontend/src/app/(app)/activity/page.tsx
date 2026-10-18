"use client";

import { useState } from "react";
import { Activity, Download, Loader2 } from "lucide-react";
import { useSession } from "@/context/SessionProvider";
import { useActivity } from "@/hooks/useActivity";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  downloadActivityCsv,
  type ActivityType,
} from "@/lib/activity";
import ActivityTimeline from "@/components/activity/ActivityTimeline";
import { EmptyState } from "@/components/ui/EmptyState";
import ErrorRetry from "@/components/ui/ErrorRetry";

/**
 * Account activity timeline: every deposit, withdrawal and goal milestone
 * from `GET /api/savings/activity`, filterable by date range and activity
 * type, with a CSV export of the filtered transaction history.
 */
export default function ActivityPage() {
  const { address } = useSession();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rangeInvalid = Boolean(from && to && from > to);
  const filters = rangeInvalid
    ? { types }
    : { from: from || undefined, to: to || undefined, types };
  const { items, status, error, refetch } = useActivity(address, filters);

  const hasFilters = Boolean(from || to || types.length);

  const toggleType = (type: ActivityType) => {
    setTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    );
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setTypes([]);
  };

  const handleExport = async () => {
    if (!address) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await downloadActivityCsv(address, filters);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export transactions",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-brand" />
            <h1 className="text-3xl font-semibold text-foreground">Activity</h1>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={!address || isExporting || rangeInvalid}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Export CSV
          </button>
        </div>

        <div className="mb-6 space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="activity-from"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                From
              </label>
              <input
                id="activity-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
            <div>
              <label
                htmlFor="activity-to"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                To
              </label>
              <input
                id="activity-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
          </div>

          {rangeInvalid && (
            <p role="alert" className="text-sm text-red-500">
              The start date must be on or before the end date.
            </p>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-foreground">
              Activity type
            </legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((type) => {
                const selected = types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                      selected
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {ACTIVITY_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-brand hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {exportError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
          >
            {exportError}
          </div>
        )}

        {status === "error" ? (
          <ErrorRetry error={error} onRetry={refetch} />
        ) : status === "loading" ? (
          <div
            className="flex items-center justify-center py-12"
            data-testid="activity-loading"
          >
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            testId="activity-empty"
            title={hasFilters ? "No matching activity" : "No activity yet"}
            description={
              hasFilters
                ? "Try widening the date range or selecting other activity types."
                : "Deposits, withdrawals and goal milestones will show up here."
            }
          />
        ) : (
          <ActivityTimeline items={items} groupByDate />
        )}
      </div>
    </div>
  );
}
