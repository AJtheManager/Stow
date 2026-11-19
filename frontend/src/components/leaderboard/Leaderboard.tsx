"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Medal, Minus, Trophy } from "lucide-react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import {
  ALL_REGIONS,
  LEADERBOARD_TIMEFRAMES,
  LEADERBOARD_TYPES,
  describeRankChange,
  type LeaderboardTimeframe,
  type LeaderboardType,
  type RankedEntry,
  type TrophyTier,
} from "@/lib/leaderboardCalculations";
import { formatNumber } from "@/lib/currency";

export const TYPE_LABELS: Record<LeaderboardType, string> = {
  totalSaved: "Total saved",
  streak: "Streaks",
  goalsCompleted: "Goals completed",
};

export const TIMEFRAME_LABELS: Record<LeaderboardTimeframe, string> = {
  allTime: "All time",
  monthly: "This month",
  weekly: "This week",
};

const TROPHY_STYLES: Record<TrophyTier, { label: string; className: string }> = {
  gold: { label: "Gold trophy", className: "text-yellow-400" },
  silver: { label: "Silver trophy", className: "text-slate-300" },
  bronze: { label: "Bronze trophy", className: "text-amber-600" },
};

export function formatLeaderboardValue(
  type: LeaderboardType,
  value: number,
): string {
  switch (type) {
    case "totalSaved":
      return `${formatNumber(value, { maximumFractionDigits: 2 })} USDC`;
    case "streak":
      return `${formatNumber(value)} ${value === 1 ? "day" : "days"}`;
    case "goalsCompleted":
      return `${formatNumber(value)} ${value === 1 ? "goal" : "goals"}`;
  }
}

function RankChange({ change }: { change: number | null }) {
  const label = describeRankChange(change);
  if (change === null) {
    return <span className="text-xs text-muted">{label}</span>;
  }
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <Minus className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  const up = change > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        up ? "text-emerald-500" : "text-red-500"
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span aria-hidden="true">{Math.abs(change)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function TrophyBadge({ tier }: { tier: TrophyTier | null }) {
  if (!tier) return null;
  const { label, className } = TROPHY_STYLES[tier];
  const Icon = tier === "gold" ? Trophy : Medal;
  return (
    <span className={className} title={label}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function EntryRow({
  entry,
  type,
}: {
  entry: RankedEntry;
  type: LeaderboardType;
}) {
  return (
    <tr
      aria-current={entry.isCurrentUser ? "true" : undefined}
      className={entry.isCurrentUser ? "bg-brand/10" : "odd:bg-card/40"}
    >
      <td className="border-b border-border px-4 py-3 tabular-nums text-foreground">
        {entry.rank}
      </td>
      <td className="border-b border-border px-4 py-3 text-foreground">
        <span className="inline-flex items-center gap-2">
          <TrophyBadge tier={entry.trophy} />
          {entry.displayName}
          {entry.isCurrentUser ? (
            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs font-medium text-brand">
              You
            </span>
          ) : null}
        </span>
      </td>
      <td className="border-b border-border px-4 py-3 text-muted">
        {entry.region || "-"}
      </td>
      <td className="border-b border-border px-4 py-3 text-right tabular-nums font-medium text-foreground">
        {formatLeaderboardValue(type, entry.value)}
      </td>
      <td className="border-b border-border px-4 py-3 text-right">
        <RankChange change={entry.rankChange} />
      </td>
    </tr>
  );
}

function Table({
  entries,
  type,
  label,
}: {
  entries: RankedEntry[];
  type: LeaderboardType;
  label: string;
}) {
  return (
    <div
      className="overflow-x-auto rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-brand/50"
      tabIndex={0}
      aria-label={label}
    >
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-card">
            <th scope="col" className="w-16 border-b border-border px-4 py-3 font-medium text-muted">
              Rank
            </th>
            <th scope="col" className="border-b border-border px-4 py-3 font-medium text-muted">
              Saver
            </th>
            <th scope="col" className="border-b border-border px-4 py-3 font-medium text-muted">
              Region
            </th>
            <th scope="col" className="border-b border-border px-4 py-3 text-right font-medium text-muted">
              {TYPE_LABELS[type]}
            </th>
            <th scope="col" className="w-24 border-b border-border px-4 py-3 text-right font-medium text-muted">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <EntryRow key={entry.userId} entry={entry} type={type} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface LeaderboardViewProps {
  type: LeaderboardType;
  timeframe: LeaderboardTimeframe;
  region: string;
  regions: string[];
  ranked: RankedEntry[];
  currentUser: RankedEntry | null;
  nearby: RankedEntry[];
  /** Whether a viewer is signed in; explains why they may not be listed. */
  hasViewer: boolean;
  status: "loading" | "ready" | "error";
  error?: Error | null;
  updatedAt?: Date | null;
  onTypeChange: (type: LeaderboardType) => void;
  onTimeframeChange: (timeframe: LeaderboardTimeframe) => void;
  onRegionChange: (region: string) => void;
  onRetry?: () => void;
  className?: string;
}

/** The leaderboard UI with no data fetching, so it can be driven by any source. */
export function LeaderboardView({
  type,
  timeframe,
  region,
  regions,
  ranked,
  currentUser,
  nearby,
  hasViewer,
  status,
  error,
  updatedAt,
  onTypeChange,
  onTimeframeChange,
  onRegionChange,
  onRetry,
  className = "",
}: LeaderboardViewProps) {
  const baseId = useId();
  // Only show "Around you" when it adds something beyond the full list.
  const showNearby = currentUser !== null && nearby.length > 0 && ranked.length > 7;

  return (
    <section aria-labelledby={`${baseId}-title`} className={className}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${baseId}-title`} className="text-xl font-semibold text-foreground">
            Leaderboard
          </h2>
          {updatedAt ? (
            <p className="mt-1 text-xs text-muted">
              Live - updated {updatedAt.toLocaleTimeString()}
            </p>
          ) : null}
        </div>
      </div>

      <div
        role="group"
        aria-label="Leaderboard type"
        className="mb-4 flex flex-wrap gap-2"
      >
        {LEADERBOARD_TYPES.map(option => (
          <button
            key={option}
            type="button"
            aria-pressed={option === type}
            onClick={() => onTypeChange(option)}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/50 ${
              option === type
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {TYPE_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-4">
        <div>
          <label htmlFor={`${baseId}-timeframe`} className="block text-xs font-medium text-muted">
            Timeframe
          </label>
          <select
            id={`${baseId}-timeframe`}
            value={timeframe}
            onChange={event =>
              onTimeframeChange(event.target.value as LeaderboardTimeframe)
            }
            className="mt-1 min-h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {LEADERBOARD_TIMEFRAMES.map(option => (
              <option key={option} value={option}>
                {TIMEFRAME_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${baseId}-region`} className="block text-xs font-medium text-muted">
            Region
          </label>
          <select
            id={`${baseId}-region`}
            value={region}
            onChange={event => onRegionChange(event.target.value)}
            className="mt-1 min-h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <option value={ALL_REGIONS}>All regions</option>
            {regions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === "loading" ? (
        <p role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
          Loading leaderboard...
        </p>
      ) : status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-card p-5 text-sm">
          <p className="text-foreground">
            {error?.message || "The leaderboard could not be loaded."}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 min-h-11 rounded-lg border border-border px-4 font-medium text-brand focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {hasViewer ? (
            currentUser ? (
              <div
                aria-label="Your position"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/10 px-5 py-4"
              >
                <div>
                  <p className="text-xs font-medium text-muted">Your position</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    #{currentUser.rank}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-foreground">
                    {formatLeaderboardValue(type, currentUser.value)}
                  </p>
                  <RankChange change={currentUser.rankChange} />
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted">
                You are not shown on this leaderboard. You may have chosen to
                stay hidden, or you are outside the selected region.
              </p>
            )
          ) : null}

          {ranked.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
              Nobody is on this leaderboard yet.
            </p>
          ) : (
            <Table
              entries={ranked}
              type={type}
              label={`${TYPE_LABELS[type]} leaderboard`}
            />
          )}

          {showNearby ? (
            <div>
              <h3 className="mb-3 text-base font-semibold text-foreground">
                Around you
              </h3>
              <Table entries={nearby} type={type} label="Savers near your rank" />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export interface LeaderboardProps {
  /** The signed-in user, highlighted and used to find nearby competitors. */
  currentUserId?: string | null;
  initialType?: LeaderboardType;
  initialTimeframe?: LeaderboardTimeframe;
  initialRegion?: string;
  pollIntervalMs?: number;
  className?: string;
}

/** Self-contained leaderboard: owns its filters and keeps itself up to date. */
export default function Leaderboard({
  currentUserId = null,
  initialType = "totalSaved",
  initialTimeframe = "allTime",
  initialRegion = ALL_REGIONS,
  pollIntervalMs,
  className,
}: LeaderboardProps) {
  const [type, setType] = useState<LeaderboardType>(initialType);
  const [timeframe, setTimeframe] =
    useState<LeaderboardTimeframe>(initialTimeframe);
  const [region, setRegion] = useState(initialRegion);

  const board = useLeaderboard({
    type,
    timeframe,
    region,
    currentUserId,
    pollIntervalMs,
  });

  return (
    <LeaderboardView
      type={type}
      timeframe={timeframe}
      region={region}
      regions={board.regions}
      ranked={board.ranked}
      currentUser={board.currentUser}
      nearby={board.nearby}
      hasViewer={currentUserId !== null}
      status={board.status}
      error={board.error}
      updatedAt={board.updatedAt}
      onTypeChange={setType}
      onTimeframeChange={setTimeframe}
      onRegionChange={setRegion}
      onRetry={board.refetch}
      className={className}
    />
  );
}
