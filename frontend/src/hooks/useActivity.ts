import { useState, useCallback, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  buildActivityQuery,
  unwrapApiData,
  type ActivityFilters,
  type ActivityItem,
} from "@/lib/activity";

export type ActivityStatus = "loading" | "ready" | "error";

export interface UseActivityReturn {
  items: ActivityItem[];
  status: ActivityStatus;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches the address's activity timeline from `GET /api/savings/activity`,
 * refetching whenever the filters change. Mirrors `useSavingsSummary`'s
 * fetch-on-mount/refetch shape.
 */
export function useActivity(
  address: string | null,
  filters: ActivityFilters = {},
): UseActivityReturn {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [status, setStatus] = useState<ActivityStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  // Serialised so callers can pass a fresh object literal each render.
  const query = address ? buildActivityQuery(address, filters) : null;

  const fetchActivity = useCallback(async () => {
    if (!query) return;

    setStatus("loading");
    setError(null);

    try {
      const response = await apiFetch(`/api/savings/activity?${query}`);

      if (!response.ok) {
        throw new ApiError(
          `Failed to load activity: ${response.statusText}`,
          response.status,
        );
      }

      const data = unwrapApiData<ActivityItem[]>(await response.json());
      setItems(Array.isArray(data) ? data : []);
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Unknown error occurred"),
      );
      setStatus("error");
    }
  }, [query]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity, refetchCount]);

  const refetch = useCallback(() => {
    setRefetchCount((c) => c + 1);
  }, []);

  return { items, status, error, refetch };
}
