import type { LucideIcon } from "lucide-react";
import {
  GraduationCap,
  Home,
  Laptop,
  LifeBuoy,
  Plane,
  Car,
} from "lucide-react";

/**
 * Pre-built savings goal templates. Each template only seeds the goal form
 * with recommended parameters — every field stays editable before the goal
 * is created, so a template is a starting point rather than a fixed preset.
 */
export interface GoalTemplate {
  id: string;
  /** Default goal name applied to the form. */
  name: string;
  description: string;
  icon: LucideIcon;
  /** Recommended target amount, in XLM (decimal string, as typed by a user). */
  targetAmount: string;
  /** Suggested time to reach the target, in months; used to derive a monthly pace. */
  recommendedMonths: number;
}

export const GOAL_TEMPLATES: readonly GoalTemplate[] = [
  {
    id: "emergency-fund",
    name: "Emergency fund",
    description: "A safety net covering 3–6 months of essential expenses.",
    icon: LifeBuoy,
    targetAmount: "3000",
    recommendedMonths: 12,
  },
  {
    id: "vacation",
    name: "Vacation",
    description: "Travel, accommodation and spending money for a trip.",
    icon: Plane,
    targetAmount: "1500",
    recommendedMonths: 6,
  },
  {
    id: "new-laptop",
    name: "New laptop",
    description: "Upgrade your work or study setup without debt.",
    icon: Laptop,
    targetAmount: "1000",
    recommendedMonths: 5,
  },
  {
    id: "education",
    name: "Education",
    description: "Tuition, courses or certifications.",
    icon: GraduationCap,
    targetAmount: "2500",
    recommendedMonths: 10,
  },
  {
    id: "car",
    name: "Car",
    description: "A down payment or a full purchase of a vehicle.",
    icon: Car,
    targetAmount: "5000",
    recommendedMonths: 18,
  },
  {
    id: "home-deposit",
    name: "Home deposit",
    description: "Save toward rent deposit or a down payment on a home.",
    icon: Home,
    targetAmount: "10000",
    recommendedMonths: 24,
  },
];

export function getGoalTemplate(id: string): GoalTemplate | undefined {
  return GOAL_TEMPLATES.find((template) => template.id === id);
}

/**
 * Monthly contribution needed to reach `targetAmount` (XLM) in `months`, or
 * `null` when either input isn't a finite positive number.
 */
export function recommendedMonthlyContribution(
  targetAmount: string,
  months: number,
): number | null {
  const target = Number(targetAmount);
  if (!Number.isFinite(target) || target <= 0) return null;
  if (!Number.isFinite(months) || months <= 0) return null;
  return target / months;
}
