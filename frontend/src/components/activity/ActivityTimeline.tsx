import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Flag,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { formatUsdc } from "@/lib/currency";
import {
  ACTIVITY_TYPE_LABELS,
  type ActivityItem,
  type ActivityType,
} from "@/lib/activity";

const ACTIVITY_ICONS: Record<ActivityType, LucideIcon> = {
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  goal_created: Flag,
  goal_contribution: Target,
  goal_reached: Trophy,
};

const ACTIVITY_TONES: Record<ActivityType, string> = {
  deposit: "bg-brand/10 text-brand",
  withdrawal: "bg-brand-3/10 text-brand-3",
  goal_created: "bg-brand-2/10 text-brand-2",
  goal_contribution: "bg-brand-2/10 text-brand-2",
  goal_reached: "bg-brand/10 text-brand",
};

function formatAmount(item: ActivityItem): string | null {
  if (item.amount === null) return null;
  const amount = formatUsdc(item.amount, { withSymbol: true });
  if (item.type === "deposit") return `+${amount}`;
  if (item.type === "withdrawal") return `−${amount}`;
  if (item.type === "goal_created") return `Target ${amount}`;
  return amount;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Groups already-sorted items by calendar day, preserving order. */
function groupByDay(items: ActivityItem[]): [string, ActivityItem[]][] {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const day = formatDay(item.occurred_at);
    const group = groups.get(day);
    if (group) group.push(item);
    else groups.set(day, [item]);
  }
  return [...groups.entries()];
}

export interface ActivityTimelineProps {
  items: ActivityItem[];
  /** Group entries under a date heading (the full timeline view). */
  groupByDate?: boolean;
  className?: string;
}

/**
 * Vertical timeline of account activity — deposits, withdrawals and goal
 * milestones — newest first.
 */
export default function ActivityTimeline({
  items,
  groupByDate = false,
  className = "",
}: ActivityTimelineProps) {
  const groups: [string | null, ActivityItem[]][] = groupByDate
    ? groupByDay(items)
    : [[null, items]];

  return (
    <div className={`space-y-6 ${className}`} data-testid="activity-timeline">
      {groups.map(([day, dayItems]) => (
        <section key={day ?? "all"} aria-label={day ?? "Recent activity"}>
          {day && (
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
              {day}
            </h3>
          )}
          <ol className="relative space-y-4 border-l border-border pl-6">
            {dayItems.map((item) => {
              const Icon = ACTIVITY_ICONS[item.type];
              const amount = formatAmount(item);
              return (
                <li
                  key={item.id}
                  className="relative"
                  data-testid="activity-item"
                >
                  <span
                    className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${ACTIVITY_TONES[item.type]}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {ACTIVITY_TYPE_LABELS[item.type]}
                        {item.goal_name && (
                          <span className="text-muted"> · {item.goal_name}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        <time dateTime={item.occurred_at}>
                          {groupByDate
                            ? formatTime(item.occurred_at)
                            : `${formatDay(item.occurred_at)}, ${formatTime(item.occurred_at)}`}
                        </time>
                      </p>
                    </div>
                    {amount && (
                      <p className="shrink-0 text-sm font-semibold text-foreground">
                        {amount}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
