"use client";

import { Check } from "lucide-react";
import {
  GOAL_TEMPLATES,
  recommendedMonthlyContribution,
  type GoalTemplate,
} from "@/lib/goalTemplates";
import { formatNumber } from "@/lib/currency";

export interface GoalTemplatePickerProps {
  /** Id of the currently applied template, if any. */
  selectedId: string | null;
  onSelect: (template: GoalTemplate) => void;
  templates?: readonly GoalTemplate[];
}

/**
 * Grid of pre-built goal templates (emergency fund, vacation, ...). Picking
 * one fills the goal form with its recommended parameters; the user can
 * still edit everything before creating the goal.
 */
export default function GoalTemplatePicker({
  selectedId,
  onSelect,
  templates = GOAL_TEMPLATES,
}: GoalTemplatePickerProps) {
  return (
    <fieldset className="rounded-2xl border border-border bg-card p-6">
      <legend className="float-left w-full text-sm font-medium text-foreground mb-1">
        Start from a template
      </legend>
      <p className="clear-left text-xs text-muted mb-4">
        Pick a template for recommended settings — you can change anything
        before creating your goal.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((template) => {
          const Icon = template.icon;
          const isSelected = template.id === selectedId;
          const monthly = recommendedMonthlyContribution(
            template.targetAmount,
            template.recommendedMonths,
          );

          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              aria-pressed={isSelected}
              className={`relative flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                isSelected
                  ? "border-brand/60 bg-brand/10"
                  : "border-border bg-background hover:bg-card/70"
              }`}
            >
              <Icon
                className="h-5 w-5 shrink-0 text-brand mt-0.5"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {template.name}
                </span>
                <span className="block text-xs text-muted mt-0.5">
                  {template.description}
                </span>
                <span className="block text-xs text-foreground mt-2">
                  {formatNumber(Number(template.targetAmount))} XLM ·{" "}
                  {template.recommendedMonths} months
                  {monthly !== null && (
                    <span className="text-muted">
                      {" "}
                      (~
                      {formatNumber(monthly, { maximumFractionDigits: 2 })}{" "}
                      XLM/mo)
                    </span>
                  )}
                </span>
              </span>
              {isSelected && (
                <Check
                  className="absolute right-3 top-3 h-4 w-4 text-brand"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
