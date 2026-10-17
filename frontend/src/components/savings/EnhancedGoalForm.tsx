"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastProvider";
import { useFormValidation } from "@/hooks/useFormValidation";
import { validators } from "@/lib/validation";
import { useCreateGoal } from "@/hooks/useCreateGoal";
import FormField from "@/components/ui/FormField";
import Input from "@/components/ui/Input";
import FormError from "@/components/ui/FormError";

export interface EnhancedGoalFormProps {
  /** Called with the newly created goal's on-chain id once creation succeeds. */
  onCreated: (goalId: string) => void;
}

const STROOPS_PER_XLM = 10_000_000;

/**
 * Converts a user-entered XLM amount (e.g. "12.5") into a whole-stroop
 * integer string suitable for the contract's `i128` target_amount, or
 * `null` if the input isn't a finite, strictly positive number.
 */
function parseXlmToStroops(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const xlm = Number(trimmed);
  if (!Number.isFinite(xlm) || xlm <= 0) return null;

  return Math.floor(xlm * STROOPS_PER_XLM).toString();
}

/**
 * Enhanced GoalForm with improved validation feedback.
 * Demonstrates the new form validation system with FormField components.
 */
export default function EnhancedGoalForm({ onCreated }: EnhancedGoalFormProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { showToast, updateToast } = useToast();
  const { status, error, isLoading, createGoal } = useCreateGoal();

  const form = useFormValidation({
    fields: {
      name: {
        value: "",
        rules: [
          validators.required("Goal name"),
          validators.minLength(2, "Goal name"),
          validators.maxLength(50, "Goal name"),
        ],
      },
      targetAmount: {
        value: "",
        rules: [
          validators.required("Target amount"),
          validators.positiveNumber("Target amount"),
        ],
      },
    },
    validateOnChange: true,
    validateOnBlur: true,
  });

  const handleSubmit = async (values: { name: string; targetAmount: string }) => {
    const stroops = parseXlmToStroops(values.targetAmount);
    if (!stroops) {
      form.setFieldError("targetAmount", "Invalid amount");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmCreate = async () => {
    const stroops = parseXlmToStroops(form.values.targetAmount);
    if (!stroops) return;

    const toastId = showToast({
      variant: "pending",
      message: "Creating goal...",
    });

    try {
      const goal = await createGoal(form.values.name.trim(), stroops);
      if (goal) {
        updateToast(toastId, {
          variant: "success",
          message: `Goal "${form.values.name}" created successfully!`,
          duration: 5000,
        });
        onCreated(goal.on_chain_id);
        form.resetForm();
        setShowConfirm(false);
      } else {
        updateToast(toastId, {
          variant: "error",
          message: error?.message ?? "Failed to create goal. Please try again.",
        });
      }
    } catch (err) {
      updateToast(toastId, {
        variant: "error",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  if (showConfirm) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Confirm new goal
          </h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-muted">Name</dt>
              <dd className="text-foreground font-medium">{form.values.name}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Target</dt>
              <dd className="text-foreground font-medium">
                {Number(form.values.targetAmount).toLocaleString(undefined, {
                  maximumFractionDigits: 7,
                })}{" "}
                XLM
              </dd>
            </div>
          </dl>
        </div>

        {status === "error" && (
          <FormError
            message={error?.message ?? "Failed to create goal. Please try again."}
          />
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConfirmCreate}
            disabled={isLoading}
            className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {isLoading ? "Creating..." : "Confirm and create goal"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-card disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <FormField
          label="Goal name"
          error={form.touched.name ? form.errors.name : undefined}
          hint="Give your savings goal a memorable name"
          required
        >
          <Input
            type="text"
            value={form.values.name}
            onChange={(e) => form.handleChange("name", e.target.value)}
            onBlur={() => form.handleBlur("name")}
            placeholder="e.g. New laptop"
            error={!!(form.touched.name && form.errors.name)}
            disabled={form.isSubmitting}
          />
        </FormField>

        <FormField
          label="Target amount (XLM)"
          error={form.touched.targetAmount ? form.errors.targetAmount : undefined}
          hint="Enter the amount you want to save in XLM"
          required
        >
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={form.values.targetAmount}
            onChange={(e) => form.handleChange("targetAmount", e.target.value)}
            onBlur={() => form.handleBlur("targetAmount")}
            placeholder="e.g. 500"
            error={!!(form.touched.targetAmount && form.errors.targetAmount)}
            disabled={form.isSubmitting}
          />
        </FormField>
      </div>

      <button
        type="submit"
        disabled={form.isSubmitting || !form.isValid}
        className="w-full rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-6 py-3 text-sm font-medium text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
      >
        Create goal
      </button>
    </form>
  );
}
