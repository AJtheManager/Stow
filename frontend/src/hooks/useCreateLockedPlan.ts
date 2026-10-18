import { useState, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { LockedPlan } from "./useLockedPlanDetail";
import { parseTopUpAmountToStroops } from "./useLockedTopUp";

export type UnlockDateError = "required" | "invalid" | "not-future";

/**
 * Parses a `<input type="date">` value ("YYYY-MM-DD") as midnight local
 * time on that day, or `null` if it isn't a real calendar date.
 */
export function parseUnlockDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * The vault contract's `locked_create` rejects `unlock_at <= now` with
 * `InvalidUnlockTime`; this mirrors it client-side so a past (or today's)
 * date is caught before anything is signed or sent.
 */
export function validateUnlockDate(
  value: string,
  now: Date = new Date(),
): UnlockDateError | null {
  if (!value.trim()) return "required";

  const date = parseUnlockDate(value);
  if (!date) return "invalid";
  if (date.getTime() <= now.getTime()) return "not-future";

  return null;
}

export type CreateLockedPlanStatus = "idle" | "pending" | "success" | "error";

export interface UseCreateLockedPlanReturn {
  status: CreateLockedPlanStatus;
  error: Error | null;
  isLoading: boolean;
  /**
   * Creates a locked plan for `owner` funded with `amount` (decimal XLM,
   * sent as stroops) that unlocks at `unlockAt`. Resolves with the new plan,
   * or `null` on failure (`status`/`error` describe it).
   */
  createLockedPlan: (
    owner: string,
    amount: string,
    unlockAt: Date,
  ) => Promise<LockedPlan | null>;
  reset: () => void;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Opens a locked plan via `POST /api/savings/locked` (mirrors the vault
 * contract's `locked_create(owner, amount, unlock_at)`). Each call carries a
 * fresh `Idempotency-Key`, so a network retry of the same attempt can't
 * create (and fund) two plans.
 */
export function useCreateLockedPlan(): UseCreateLockedPlanReturn {
  const [status, setStatus] = useState<CreateLockedPlanStatus>("idle");
  const [error, setError] = useState<Error | null>(null);

  const createLockedPlan = useCallback(
    async (
      owner: string,
      amount: string,
      unlockAt: Date,
    ): Promise<LockedPlan | null> => {
      setStatus("pending");
      setError(null);

      try {
        const response = await apiFetch("/api/savings/locked", {
          method: "POST",
          headers: { "Idempotency-Key": newIdempotencyKey() },
          body: JSON.stringify({
            owner,
            amount: parseTopUpAmountToStroops(amount),
            unlock_at: unlockAt.toISOString(),
          }),
        });

        if (!response.ok) {
          let errorMessage = `Failed to create locked plan: ${response.statusText}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // Response body is not JSON, use default message
          }
          throw new ApiError(errorMessage, response.status);
        }

        const data: LockedPlan = await response.json();
        setStatus("success");
        return data;
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error("Unknown error occurred"),
        );
        setStatus("error");
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    isLoading: status === "pending",
    createLockedPlan,
    reset,
  };
}
