"use client";

import { useToast } from "@/context/ToastProvider";
import { useFormValidation } from "@/hooks/useFormValidation";
import { validators } from "@/lib/validation";
import { apiFetch, ApiError } from "@/lib/api";
import FormField from "./FormField";
import Input from "./Input";
import { ArrowRight, Loader2 } from "lucide-react";

/**
 * Enhanced waitlist form component demonstrating the improved form validation system.
 * This can replace the existing WaitlistForm.tsx when ready to upgrade.
 */
export default function EnhancedWaitlistForm() {
  const { showToast, updateToast } = useToast();

  const form = useFormValidation({
    fields: {
      email: {
        value: "",
        rules: [
          validators.required("Email"),
          validators.email("Email"),
        ],
      },
    },
    validateOnChange: true,
    validateOnBlur: true,
  });

  const onSubmit = async (values: { email: string }) => {
    const toastId = showToast({
      variant: "pending",
      message: "Joining waitlist...",
    });

    try {
      const response = await apiFetch("/api/waitlist", {
        method: "POST",
        body: JSON.stringify({ email: values.email }),
        skipAuth: true,
      });

      if (response.status === 409) {
        updateToast(toastId, {
          variant: "info",
          message: "You're already on the waitlist!",
        });
        form.resetForm();
        return;
      }

      if (!response.ok) {
        let message = "Something went wrong. Please try again.";
        try {
          const data = await response.json();
          message = data.message || data.error || message;
        } catch {
          // response wasn't JSON, keep default message
        }
        throw new ApiError(message, response.status);
      }

      updateToast(toastId, {
        variant: "success",
        message: "You're on the list — we'll be in touch!",
      });
      form.resetForm();
    } catch (err) {
      updateToast(toastId, {
        variant: "error",
        message:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <div className="mx-auto mt-9 w-full max-w-md">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex w-full flex-col gap-3 sm:flex-row"
      >
        <div className="flex-1">
          <FormField
            label="Email address"
            error={form.touched.email ? form.errors.email : undefined}
            required
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={form.values.email}
              onChange={(e) => form.handleChange("email", e.target.value)}
              onBlur={() => form.handleBlur("email")}
              error={!!(form.touched.email && form.errors.email)}
              disabled={form.isSubmitting}
            />
          </FormField>
        </div>

        <button
          type="submit"
          disabled={form.isSubmitting || !form.isValid}
          className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-6 py-3.5 text-sm font-semibold text-background shadow-xl shadow-brand/25 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100 sm:self-end sm:h-fit"
        >
          {form.isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Joining…
            </>
          ) : (
            <>
              Join waitlist
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
