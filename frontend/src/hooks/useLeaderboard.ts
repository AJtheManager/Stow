import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  ALL_REGIONS,
  availableRegions,
  findCurrentUser,
  nearbyCompetitors,
  rankEntries,
  withRankChanges,
  type LeaderboardEntry,
  type LeaderboardPrivacy,
  type LeaderboardTimeframe,
  type LeaderboardType,
  type RankedEntry,
} from "@/lib/leaderboardCalculations";

export type LeaderboardStatus = "loading" | "ready" | "error";

export interface UseLeaderboardOptions {
  type: LeaderboardType;
  timeframe: LeaderboardTimeframe;
  /** Region to show, or `ALL_REGIONS` (default). Applied client-side. */
  region?: string;
  /** The viewer, so their row and the users around them can be found. */
  currentUserId?: string | null;
  /** Users shown above and below the viewer in `nearby`. Defaults to 2. */
  nearbyRadius?: number;
  /**
   * Re-fetches in the background every `pollIntervalMs` (without flipping
   * `status` back to "loading") so ranks and movement stay up to date.
   * Defaults to 15 seconds; pass 0 to turn polling off.
   */
  pollIntervalMs?: number;
}

export interface UseLeaderboardReturn {
  /** The ranked board after region and privacy rules, with movement filled in. */
  ranked: RankedEntry[];
  /** Regions that can be filtered on (never includes hidden users' regions). */
  regions: string[];
  /** The viewer's row, or `null` if they are hidden or not on this board. */
  currentUser: RankedEntry | null;
  /** The viewer and the users ranked just above and below them. */
  nearby: RankedEntry[];
  status: LeaderboardStatus;
  error: Error | null;
  /** When the data was last successfully loaded. */
  updatedAt: Date | null;
  refetch: () => void;
}

export const DEFAULT_POLL_INTERVAL_MS = 15_000;

const PRIVACY_VALUES: readonly LeaderboardPrivacy[] = [
  "public",
  "anonymous",
  "hidden",
];

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Turns the API response (`{ entries: [...] }` or a bare array) into
 * well-formed entries, dropping anything unusable.
 *
 * Privacy fails closed: an entry whose privacy setting is missing or not
 * recognised is treated as "hidden" so it can never leak onto the board.
 */
export function parseLeaderboardResponse(body: unknown): LeaderboardEntry[] {
  const raw = Array.isArray(body)
    ? body
    : body && typeof body === "object" && "entries" in body
      ? (body as { entries: unknown }).entries
      : null;
  if (!Array.isArray(raw)) return [];

  const entries: LeaderboardEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.userId !== "string" || candidate.userId === "") continue;

    const values = (candidate.values ?? {}) as Record<string, unknown>;
    entries.push({
      userId: candidate.userId,
      displayName:
        typeof candidate.displayName === "string" ? candidate.displayName : "",
      region: typeof candidate.region === "string" ? candidate.region : "",
      privacy: PRIVACY_VALUES.includes(candidate.privacy as LeaderboardPrivacy)
        ? (candidate.privacy as LeaderboardPrivacy)
        : "hidden",
      values: {
        totalSaved: numberOrZero(values.totalSaved),
        streak: numberOrZero(values.streak),
        goalsCompleted: numberOrZero(values.goalsCompleted),
      },
    });
  }
  return entries;
}

interface Snapshots {
  latest: LeaderboardEntry[];
  /** The data before the most recent change, used to work out movement. */
  earlier: LeaderboardEntry[] | null;
}

export function useLeaderboard({
  type,
  timeframe,
  region = ALL_REGIONS,
  currentUserId = null,
  nearbyRadius = 2,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseLeaderboardOptions): UseLeaderboardReturn {
  const [snapshots, setSnapshots] = useState<Snapshots>({
    latest: [],
    earlier: null,
  });
  const [status, setStatus] = useState<LeaderboardStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);
  const loadedTimeframe = useRef<LeaderboardTimeframe | null>(null);
  const hasData = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // A different timeframe is a different board: ranks from the old one
    // are not comparable, so start clean. A manual refetch or a poll of the
    // same board keeps what is on screen.
    if (loadedTimeframe.current !== timeframe) {
      loadedTimeframe.current = timeframe;
      hasData.current = false;
      setSnapshots({ latest: [], earlier: null });
      setStatus("loading");
      setError(null);
    }

    async function load() {
      // Background = refreshing a board that is already showing.
      const background = hasData.current;
      try {
        const response = await apiFetch(
          `/api/leaderboard?timeframe=${encodeURIComponent(timeframe)}`,
        );
        if (!response.ok) {
          throw new Error(`Failed to load leaderboard (${response.status})`);
        }
        const next = parseLeaderboardResponse(await response.json());
        if (cancelled) return;

        setSnapshots(({ latest, earlier }) =>
          // Only move `earlier` forward when something actually changed, so
          // a rank movement stays visible until the next real change.
          JSON.stringify(next) === JSON.stringify(latest)
            ? { latest, earlier }
            : { latest: next, earlier: background ? latest : null },
        );
        hasData.current = true;
        setUpdatedAt(new Date());
        setError(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        // A failed background refresh keeps the last good board on screen.
        if (!background) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus("error");
        }
      }
    }

    void load();
    const timer =
      pollIntervalMs > 0 ? setInterval(() => void load(), pollIntervalMs) : null;

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [timeframe, pollIntervalMs, refetchCount]);

  const ranked = useMemo(() => {
    const options = { type, region, currentUserId };
    const latest = rankEntries(snapshots.latest, options);
    const earlier = snapshots.earlier
      ? rankEntries(snapshots.earlier, options)
      : null;
    return withRankChanges(latest, earlier);
  }, [snapshots, type, region, currentUserId]);

  const regions = useMemo(() => availableRegions(snapshots.latest), [snapshots]);
  const currentUser = useMemo(
    () => findCurrentUser(ranked, currentUserId),
    [ranked, currentUserId],
  );
  const nearby = useMemo(
    () => nearbyCompetitors(ranked, currentUserId, nearbyRadius),
    [ranked, currentUserId, nearbyRadius],
  );

  const refetch = useCallback(() => setRefetchCount(count => count + 1), []);

  return { ranked, regions, currentUser, nearby, status, error, updatedAt, refetch };
}
