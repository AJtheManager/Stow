"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { validateTopUpAmount, type TopUpAmountError } from "@/hooks/useLockedTopUp";
import {
  parseUnlockDate,
  useCreateLockedPlan,
  validateUnlockDate,
  type UnlockDateError,
} from "@/hooks/useCreateLockedPlan";

export interface LockedPlanFormProps {
  /** Stellar account that owns and funds the new plan. */
  owner: string;
  /** Called with the new plan's on-chain id when the user moves on from the success state. */
  onCreated: (planId: string) => void;
}

const AMOUNT_ERROR_MESSAGES: Record<TopUpAmountError, string> = {
  required: "Enter an amount to lock.",
  invalid: "Enter a valid number, e.g. 25 or 25.5.",
  "too-small": "Amount must be greater than zero.",
  "too-precise": "Amounts can have at most 7 decimal places.",
};

const UNLOCK_DATE_ERROR_MESSAGES: Record<UnlockDateError, string> = {
  required: "Choose an unlock date.",
  invalid: "Enter a valid date.",
  "not-future": "Unlock date must be in the future.",
};

/** Tomorrow as "YYYY-MM-DD" in local time, for the date input's `min`. */
function tomorrowInputValue(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Form for opening a locked savings plan: an amount plus a future unlock
 * date, a confirmation step, then pending/success/error states. Funds can't
 * be withdrawn before the unlock date, so the confirmation spells that out.
 */
export default function LockedPlanForm({ owner, onCreated }: LockedPlanFormProps) {
  const [amount, setAmount] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [amountError, setAmountError] = useState<TopUpAmountError | null>(null);
  const [dateError, setDateError] = useState<UnlockDateError | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const { status, error, isLoading, createLockedPlan, reset } =
    useCreateLockedPlan();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextAmountError = validateTopUpAmount(amount);
    const nextDateError = validateUnlockDate(unlockDate);
    setAmountError(nextAmountError);
    setDateError(nextDateError);
    if (nextAmountError || nextDateError) return;

    reset();
    setShowConfirm(true);
  };

  const handleConfirmCreate = async () => {
    if (isLoading) return; // guards against double-submit

    // Re-check the date: the user may have sat on the confirm step past it.
    const nextDateError = validateUnlockDate(unlockDate);
    const unlockAt = parseUnlockDate(unlockDate);
    if (nextDateError || !unlockAt) {
      setDateError(nextDateError ?? "invalid");
      setShowConfirm(false);
      return;
    }

    const plan = await createLockedPlan(owner, amount, unlockAt);
    if (plan) {
      setCreatedPlanId(plan.on_chain_id);
    }
    // On failure, keep the confirm step open so the error message stays
    // visible instead of silently reverting to the form.
  };

  const formattedAmount = Number(amount.replace(",", ".")).toLocaleString(
    undefined,
    { maximumFractionDigits: 7 },
  );
  const formattedDate = parseUnlockDate(unlockDate)?.toLocaleDateString(
    undefined,
    { year: "numeric", month: "long", day: "numeric" },
  );

  if (status === "success" && createdPlanId !== null) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-col items-center text-center">
        <CheckCircle2 className="h-12 w-12 text-brand mb-4" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Locked plan created
        </h2>
        <p className="text-sm text-muted mb-6">
          {formattedAmount} XLM is locked until {formattedDate}.
        </p>
        <button
          type="button"
          onClick={() => onCreated(createdPlanId)}
          className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
        >
          View plan
        </button>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Confirm locked plan
          </h2>
          <p className="text-sm text-muted mb-1">
            Amount: <span className="text-foreground">{formattedAmount} XLM</span>
          </p>
          <p className="text-sm text-muted mb-3">
            Unlocks on: <span className="text-foreground">{formattedDate}</span>
          </p>
          <p className="text-sm text-muted">
            These funds can&apos;t be withdrawn before the unlock date.
          </p>
        </div>

        {status === "error" && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error?.message ?? "Failed to create locked plan. Please try again."}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConfirmCreate}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Creating..." : "Confirm and lock funds"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <label
            htmlFor="locked-amount"
            className="block text-sm font-medium text-foreground mb-2"
          >
            Amount (XLM)
          </label>
          <input
            id="locked-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError(null);
            }}
            placeholder="e.g. 500"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/50"
            aria-invalid={amountError !== null}
            aria-describedby={amountError ? "locked-amount-error" : undefined}
          />
          {amountError && (
            <p
              id="locked-amount-error"
              role="alert"
              className="mt-2 text-sm text-red-400"
            >
              {AMOUNT_ERROR_MESSAGES[amountError]}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="locked-unlock-date"
            className="block text-sm font-medium text-foreground mb-2"
          >
            Unlock date
          </label>
          <input
            id="locked-unlock-date"
            type="date"
            min={tomorrowInputValue()}
            value={unlockDate}
            onChange={(e) => {
              setUnlockDate(e.target.value);
              setDateError(null);
            }}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/50"
            aria-invalid={dateError !== null}
            aria-describedby={dateError ? "locked-unlock-date-error" : undefined}
          />
          {dateError && (
            <p
              id="locked-unlock-date-error"
              role="alert"
              className="mt-2 text-sm text-red-400"
            >
              {UNLOCK_DATE_ERROR_MESSAGES[dateError]}
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-6 py-3 text-sm font-medium text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
      >
        Create locked plan
      </button>
    </form>
  );
}
