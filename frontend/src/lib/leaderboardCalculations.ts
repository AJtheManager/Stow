/**
 * Savings leaderboard maths (#570): ranking, region filtering, privacy,
 * rank movement, trophies and "nearby competitors".
 *
 * Everything here is pure so it can be tested without a network or a DOM.
 * The API supplies one entry per user for the requested timeframe; this
 * module turns that list into what the UI shows.
 */

export type LeaderboardType = "totalSaved" | "streak" | "goalsCompleted";

export type LeaderboardTimeframe = "allTime" | "monthly" | "weekly";

export const LEADERBOARD_TYPES: readonly LeaderboardType[] = [
  "totalSaved",
  "streak",
  "goalsCompleted",
];

export const LEADERBOARD_TIMEFRAMES: readonly LeaderboardTimeframe[] = [
  "allTime",
  "monthly",
  "weekly",
];

/** Region filter value meaning "everyone". */
export const ALL_REGIONS = "all";

/**
 * How a user chose to appear:
 *  - "public": shown by display name.
 *  - "anonymous": ranked, but shown as "Saver" (their own row stays identified).
 *  - "hidden": opted out. Never shown and never counted, so ranks stay
 *    contiguous and nobody can infer a hidden user from a gap.
 */
export type LeaderboardPrivacy = "public" | "anonymous" | "hidden";

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  /** Region code or name, e.g. "NG" or "Europe". */
  region: string;
  privacy: LeaderboardPrivacy;
  /** Metric values for the timeframe the API was asked for. */
  values: Record<LeaderboardType, number>;
}

export type TrophyTier = "gold" | "silver" | "bronze";

export interface RankedEntry {
  userId: string;
  /** Name to display after privacy has been applied. */
  displayName: string;
  region: string;
  privacy: Exclude<LeaderboardPrivacy, "hidden">;
  value: number;
  /** 1-based. Equal values share a rank (1, 2, 2, 4). */
  rank: number;
  trophy: TrophyTier | null;
  isCurrentUser: boolean;
  /**
   * Places gained since the previous snapshot: positive moved up, negative
   * moved down, 0 unchanged, `null` if there is nothing to compare with.
   */
  rankChange: number | null;
}

export interface RankingOptions {
  type: LeaderboardType;
  /** Region to keep, or `ALL_REGIONS`. */
  region?: string;
  /** The viewer, kept identifiable and flagged on their own row. */
  currentUserId?: string | null;
}

export const ANONYMOUS_NAME = "Anonymous saver";

/** Gold, silver and bronze go to ranks 1-3 for users with a positive value. */
export function trophyForRank(rank: number, value: number): TrophyTier | null {
  if (value <= 0) return null;
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return null;
}

/** Sorted, de-duplicated regions present in the entries that may be shown. */
export function availableRegions(entries: LeaderboardEntry[]): string[] {
  const regions = new Set<string>();
  for (const entry of entries) {
    if (entry.privacy !== "hidden" && entry.region) regions.add(entry.region);
  }
  return [...regions].sort((a, b) => a.localeCompare(b));
}

function safeValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Ranks entries for one leaderboard.
 *
 * Order of operations matters for privacy: hidden users are dropped first,
 * then the region filter is applied, then ranks are assigned over what
 * remains. Ties share a rank and are listed by user id so the order is
 * stable between refreshes.
 */
export function rankEntries(
  entries: LeaderboardEntry[],
  { type, region = ALL_REGIONS, currentUserId = null }: RankingOptions,
): RankedEntry[] {
  const visible = entries.filter(
    entry =>
      entry.privacy !== "hidden" &&
      (region === ALL_REGIONS || entry.region === region),
  );

  const sorted = visible
    .map(entry => ({ entry, value: safeValue(entry.values?.[type]) }))
    .sort(
      (a, b) =>
        b.value - a.value || a.entry.userId.localeCompare(b.entry.userId),
    );

  let previousValue: number | null = null;
  let previousRank = 0;

  return sorted.map(({ entry, value }, index) => {
    const rank = value === previousValue ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;

    const isCurrentUser = entry.userId === currentUserId;
    const anonymous = entry.privacy === "anonymous" && !isCurrentUser;

    return {
      userId: entry.userId,
      displayName: anonymous ? ANONYMOUS_NAME : entry.displayName,
      region: entry.region,
      privacy: entry.privacy as RankedEntry["privacy"],
      value,
      rank,
      trophy: trophyForRank(rank, value),
      isCurrentUser,
      rankChange: null,
    };
  });
}

/**
 * Fills in `rankChange` by comparing against the previous ranking of the
 * same leaderboard. A user who was not on the previous list gets `null`.
 * Pass `null` for `previous` on the first load or after changing filters,
 * since ranks from a different leaderboard are not comparable.
 */
export function withRankChanges(
  current: RankedEntry[],
  previous: RankedEntry[] | null,
): RankedEntry[] {
  if (!previous) return current.map(entry => ({ ...entry, rankChange: null }));

  const previousRanks = new Map(previous.map(entry => [entry.userId, entry.rank]));
  return current.map(entry => {
    const before = previousRanks.get(entry.userId);
    return {
      ...entry,
      rankChange: before === undefined ? null : before - entry.rank,
    };
  });
}

/** The viewer's row, or `null` if they are hidden or not on this board. */
export function findCurrentUser(
  ranked: RankedEntry[],
  currentUserId: string | null | undefined,
): RankedEntry | null {
  if (!currentUserId) return null;
  return ranked.find(entry => entry.userId === currentUserId) ?? null;
}

/**
 * The viewer and up to `radius` users directly above and below them, in
 * leaderboard order. Near the top or bottom the window is shorter rather
 * than padded. Returns `[]` when the viewer is not on the board.
 */
export function nearbyCompetitors(
  ranked: RankedEntry[],
  currentUserId: string | null | undefined,
  radius = 2,
): RankedEntry[] {
  if (!currentUserId || radius < 0) return [];
  const index = ranked.findIndex(entry => entry.userId === currentUserId);
  if (index === -1) return [];
  return ranked.slice(Math.max(0, index - radius), index + radius + 1);
}

/** Human-readable movement, e.g. "Up 2", "Down 1", "No change", "New". */
export function describeRankChange(change: number | null): string {
  if (change === null) return "New";
  if (change > 0) return `Up ${change}`;
  if (change < 0) return `Down ${Math.abs(change)}`;
  return "No change";
}
