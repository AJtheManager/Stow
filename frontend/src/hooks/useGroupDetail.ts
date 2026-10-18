import { useState, useCallback, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";

export interface GroupMember {
  address: string;
  contributed: string;
  /** Basis-point split for settlement (0–10000); 0 until shares are set. */
  share_bps?: number;
}

export interface GroupDetail {
  on_chain_id: string;
  name: string;
  /** Stellar address of the creator; receives settlement rounding dust. */
  creator?: string | null;
  balance: string;
  /** Whether the group still accepts members; shares/settle need it closed. */
  open?: boolean;
  settled: boolean;
  members: GroupMember[];
}

export type GroupDetailStatus = "loading" | "ready" | "not-found" | "error";

export interface UseGroupDetailReturn {
  group: GroupDetail | null;
  status: GroupDetailStatus;
  error: Error | null;
  /** When `group` was last successfully loaded (initial fetch or background poll). */
  updatedAt: Date | null;
  refetch: () => void;
}

export interface UseGroupDetailOptions {
  /**
   * When set, re-fetches the group every `pollIntervalMs` in the background
   * (without flipping `status` back to "loading"), so views like the
   * contribution leaderboard stay up to date in near real time.
   */
  pollIntervalMs?: number;
}

export function useGroupDetail(
  groupId: string | null,
  { pollIntervalMs }: UseGroupDetailOptions = {},
): UseGroupDetailReturn {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [status, setStatus] = useState<GroupDetailStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  const fetchGroup = useCallback(async () => {
    if (groupId === null) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await apiFetch(`/api/savings/groups/${groupId}`);

      if (response.status === 404) {
        setGroup(null);
        setStatus("not-found");
        return;
      }

      if (!response.ok) {
        throw new ApiError(
          `Failed to load group: ${response.statusText}`,
          response.status,
        );
      }

      const data: GroupDetail = await response.json();
      setGroup(data);
      setUpdatedAt(new Date());
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error occurred"));
      setStatus("error");
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup, refetchCount]);

  useEffect(() => {
    if (groupId === null || !pollIntervalMs || pollIntervalMs <= 0) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const response = await apiFetch(`/api/savings/groups/${groupId}`);
        if (!response.ok) return; // keep showing the last good snapshot
        const data: GroupDetail = await response.json();
        if (!cancelled) {
          setGroup(data);
          setUpdatedAt(new Date());
        }
      } catch {
        // Background refresh failures are non-fatal; the next tick retries.
      }
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [groupId, pollIntervalMs]);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  return { group, status, error, updatedAt, refetch };
}
