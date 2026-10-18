"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Wallet,
} from "lucide-react";
import { useSession } from "@/context/SessionProvider";
import { useFlexibleBalance } from "@/hooks/useFlexibleBalance";
import { useActivity } from "@/hooks/useActivity";
import { formatUsdc } from "@/lib/currency";
import type { ActivityFilters } from "@/lib/activity";
import ActivityTimeline from "@/components/activity/ActivityTimeline";
import DepositModal from "@/components/savings/DepositModal";
import { EmptyState } from "@/components/ui/EmptyState";
import ErrorRetry from "@/components/ui/ErrorRetry";

const RECENT_ACTIVITY_FILTERS: ActivityFilters = {
  types: ["deposit", "withdrawal"],
  limit: 5,
};

/**
 * Flexible savings: the address's current flexible balance from `GET
 * /api/savings/accounts/:address`, deposit/withdraw actions, and the most
 * recent flexible deposits and withdrawals.
 */
export default function FlexibleSavingsPage() {
  const { address } = useSession();
  const router = useRouter();
  const [depositOpen, setDepositOpen] = useState(false);

  const balance = useFlexibleBalance(address);
  const activity = useActivity(address, RECENT_ACTIVITY_FILTERS);

  const amount = balance.account?.amount ?? "0";
  const hasBalance = /^\d+$/.test(amount) && BigInt(amount) > BigInt(0);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <Wallet className="h-8 w-8 text-brand" />
          <h1 className="text-3xl font-semibold text-foreground">
            Flexible savings
          </h1>
        </div>

        {balance.status === "error" ? (
          <ErrorRetry error={balance.error} onRetry={balance.refetch} />
        ) : (
          <div className="rounded-2xl border border-brand/40 bg-brand/10 p-6">
            <p className="text-sm font-medium text-brand">Available balance</p>
            {balance.status === "loading" ? (
              <div
                className="mt-3 h-9 w-48 animate-pulse rounded-lg bg-border"
                data-testid="flexible-balance-loading"
              />
            ) : (
              <p
                className="mt-3 text-3xl font-semibold text-foreground"
                data-testid="flexible-balance"
              >
                {formatUsdc(amount, { withSymbol: true })}
              </p>
            )}
            <p className="mt-2 text-sm text-muted">
              Withdraw any time — no lock-up period.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDepositOpen(true)}
                disabled={!address}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                Deposit
              </button>
              <button
                type="button"
                onClick={() => router.push("/ramps/withdraw")}
                disabled={!hasBalance}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                Withdraw
              </button>
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">Recent activity</h2>
            <Link
              href="/activity"
              className="text-sm font-medium text-brand hover:underline"
            >
              View all
            </Link>
          </div>

          {activity.status === "error" ? (
            <ErrorRetry error={activity.error} onRetry={activity.refetch} />
          ) : activity.status === "loading" ? (
            <div
              className="flex items-center justify-center py-8"
              data-testid="flexible-activity-loading"
            >
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : activity.items.length === 0 ? (
            <EmptyState
              testId="flexible-activity-empty"
              title="No activity yet"
              description="Your flexible deposits and withdrawals will show up here."
              action={{
                label: "Make a deposit",
                onClick: () => setDepositOpen(true),
              }}
            />
          ) : (
            <ActivityTimeline items={activity.items} />
          )}
        </div>
      </div>

      {address && (
        <DepositModal
          open={depositOpen}
          onClose={() => {
            setDepositOpen(false);
            balance.refetch();
            activity.refetch();
          }}
          account={address}
        />
      )}
    </div>
  );
}
