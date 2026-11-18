import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  DEFAULT_POLL_INTERVAL_MS,
  parseLeaderboardResponse,
  useLeaderboard,
  type UseLeaderboardOptions,
} from "./useLeaderboard";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = vi.mocked(api.apiFetch);

function raw(
  userId: string,
  totalSaved: number,
  extra: Record<string, unknown> = {},
) {
  return {
    userId,
    displayName: `User ${userId}`,
    region: "NG",
    privacy: "public",
    values: { totalSaved, streak: 0, goalsCompleted: 0 },
    ...extra,
  };
}

function ok(entries: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ entries }) } as Response;
}

function failure(status = 500): Response {
  return { ok: false, status, json: async () => ({}) } as Response;
}

const defaults: UseLeaderboardOptions = {
  type: "totalSaved",
  timeframe: "allTime",
  currentUserId: "me",
  pollIntervalMs: 1000,
};

/** Lets pending promises settle (and timers fire) inside act(). */
async function advance(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup(options: Partial<UseLeaderboardOptions> = {}) {
  return renderHook(
    (props: UseLeaderboardOptions) => useLeaderboard(props),
    { initialProps: { ...defaults, ...options } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockApiFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseLeaderboardResponse", () => {
  it("accepts an { entries } object or a bare array", () => {
    expect(parseLeaderboardResponse({ entries: [raw("a", 1)] })).toHaveLength(1);
    expect(parseLeaderboardResponse([raw("a", 1)])).toHaveLength(1);
  });

  it("returns [] for anything that is not a list", () => {
    expect(parseLeaderboardResponse(null)).toEqual([]);
    expect(parseLeaderboardResponse("nope")).toEqual([]);
    expect(parseLeaderboardResponse({ entries: "x" })).toEqual([]);
    expect(parseLeaderboardResponse({})).toEqual([]);
  });

  it("drops entries with no usable user id", () => {
    const parsed = parseLeaderboardResponse([
      raw("a", 1),
      { ...raw("b", 1), userId: "" },
      { ...raw("c", 1), userId: 7 },
      null,
      "x",
    ]);

    expect(parsed.map(e => e.userId)).toEqual(["a"]);
  });

  it("fails closed: unknown or missing privacy becomes hidden", () => {
    const parsed = parseLeaderboardResponse([
      raw("a", 1, { privacy: "everyone" }),
      raw("b", 1, { privacy: undefined }),
      raw("c", 1, { privacy: "anonymous" }),
    ]);

    expect(parsed.map(e => e.privacy)).toEqual(["hidden", "hidden", "anonymous"]);
  });

  it("coerces missing or invalid metric values to 0", () => {
    const [entry] = parseLeaderboardResponse([
      raw("a", 1, { values: { totalSaved: "12", streak: Number.NaN } }),
    ]);

    expect(entry.values).toEqual({ totalSaved: 0, streak: 0, goalsCompleted: 0 });
  });
});

describe("useLeaderboard", () => {
  it("starts loading, then returns the ranked board", async () => {
    mockApiFetch.mockResolvedValue(ok([raw("a", 100), raw("b", 300)]));
    const { result } = setup();

    expect(result.current.status).toBe("loading");

    await advance();

    expect(result.current.status).toBe("ready");
    expect(result.current.ranked.map(r => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
    expect(result.current.updatedAt).toBeInstanceOf(Date);
  });

  it("requests the board for the chosen timeframe", async () => {
    mockApiFetch.mockResolvedValue(ok([]));
    setup({ timeframe: "weekly" });
    await advance();

    expect(mockApiFetch).toHaveBeenCalledWith("/api/leaderboard?timeframe=weekly");
  });

  it("ranks by the selected type", async () => {
    mockApiFetch.mockResolvedValue(
      ok([
        raw("a", 100, { values: { totalSaved: 100, streak: 50, goalsCompleted: 0 } }),
        raw("b", 300, { values: { totalSaved: 300, streak: 5, goalsCompleted: 0 } }),
      ]),
    );
    const { result } = setup({ type: "streak" });
    await advance();

    expect(result.current.ranked[0].userId).toBe("a");
  });

  it("filters by region without refetching", async () => {
    mockApiFetch.mockResolvedValue(
      ok([raw("a", 100, { region: "NG" }), raw("b", 300, { region: "KE" })]),
    );
    const { result, rerender } = setup();
    await advance();
    expect(result.current.ranked).toHaveLength(2);
    expect(result.current.regions).toEqual(["KE", "NG"]);

    rerender({ ...defaults, region: "KE" });

    expect(result.current.ranked.map(r => r.userId)).toEqual(["b"]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  describe("privacy", () => {
    it("never exposes hidden users", async () => {
      mockApiFetch.mockResolvedValue(
        ok([raw("a", 100), raw("h", 900, { privacy: "hidden", region: "JP" })]),
      );
      const { result } = setup();
      await advance();

      expect(result.current.ranked.map(r => r.userId)).toEqual(["a"]);
      expect(result.current.regions).toEqual(["NG"]);
      expect(JSON.stringify(result.current)).not.toContain("User h");
    });

    it("masks anonymous users' names", async () => {
      mockApiFetch.mockResolvedValue(
        ok([raw("a", 100, { privacy: "anonymous", displayName: "Real Name" })]),
      );
      const { result } = setup();
      await advance();

      expect(result.current.ranked[0].displayName).toBe("Anonymous saver");
    });
  });

  it("finds the viewer and the users around them", async () => {
    mockApiFetch.mockResolvedValue(
      ok(
        ["a", "b", "me", "d", "e", "f"].map((id, i) => raw(id, 600 - i * 100)),
      ),
    );
    const { result } = setup({ nearbyRadius: 1 });
    await advance();

    expect(result.current.currentUser).toMatchObject({ userId: "me", rank: 3 });
    expect(result.current.nearby.map(r => r.userId)).toEqual(["b", "me", "d"]);
  });

  it("has no current user when the viewer is hidden", async () => {
    mockApiFetch.mockResolvedValue(
      ok([raw("a", 100), raw("me", 500, { privacy: "hidden" })]),
    );
    const { result } = setup();
    await advance();

    expect(result.current.currentUser).toBeNull();
    expect(result.current.nearby).toEqual([]);
  });

  describe("real-time updates", () => {
    it("polls on the interval and re-ranks", async () => {
      mockApiFetch
        .mockResolvedValueOnce(ok([raw("a", 100), raw("me", 50)]))
        .mockResolvedValue(ok([raw("a", 100), raw("me", 400)]));
      const { result } = setup();
      await advance();
      expect(result.current.currentUser?.rank).toBe(2);

      await advance(1000);

      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      expect(result.current.currentUser?.rank).toBe(1);
    });

    it("reports how far each user moved since the last change", async () => {
      mockApiFetch
        .mockResolvedValueOnce(ok([raw("a", 100), raw("me", 50)]))
        .mockResolvedValue(ok([raw("a", 100), raw("me", 400)]));
      const { result } = setup();
      await advance();
      expect(result.current.currentUser?.rankChange).toBeNull();

      await advance(1000);

      expect(result.current.currentUser?.rankChange).toBe(1);
      expect(result.current.ranked.find(r => r.userId === "a")?.rankChange).toBe(
        -1,
      );
    });

    it("keeps a movement visible while polls return unchanged data", async () => {
      mockApiFetch
        .mockResolvedValueOnce(ok([raw("a", 100), raw("me", 50)]))
        .mockResolvedValue(ok([raw("a", 100), raw("me", 400)]));
      const { result } = setup();
      await advance();
      await advance(1000);
      expect(result.current.currentUser?.rankChange).toBe(1);

      await advance(3000);

      expect(result.current.currentUser?.rankChange).toBe(1);
    });

    it("keeps the last good board when a background refresh fails", async () => {
      mockApiFetch
        .mockResolvedValueOnce(ok([raw("a", 100)]))
        .mockResolvedValue(failure());
      const { result } = setup();
      await advance();

      await advance(1000);

      expect(result.current.status).toBe("ready");
      expect(result.current.error).toBeNull();
      expect(result.current.ranked).toHaveLength(1);
    });

    it("does not poll when the interval is 0", async () => {
      mockApiFetch.mockResolvedValue(ok([raw("a", 100)]));
      setup({ pollIntervalMs: 0 });
      await advance();

      await advance(60_000);

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it("stops polling after unmount", async () => {
      mockApiFetch.mockResolvedValue(ok([raw("a", 100)]));
      const { unmount } = setup();
      await advance();

      unmount();
      await advance(5000);

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it("defaults to a 15 second poll", () => {
      expect(DEFAULT_POLL_INTERVAL_MS).toBe(15_000);
    });
  });

  describe("timeframe changes", () => {
    it("fetches the new board and drops the old movement", async () => {
      mockApiFetch
        .mockResolvedValueOnce(ok([raw("a", 100), raw("me", 50)]))
        .mockResolvedValueOnce(ok([raw("a", 100), raw("me", 400)]))
        .mockResolvedValue(ok([raw("me", 10), raw("a", 5)]));
      const { result, rerender } = setup();
      await advance();
      await advance(1000);
      expect(result.current.currentUser?.rankChange).toBe(1);

      rerender({ ...defaults, timeframe: "monthly" });
      expect(result.current.status).toBe("loading");
      expect(result.current.ranked).toEqual([]);

      await advance();

      expect(mockApiFetch).toHaveBeenLastCalledWith(
        "/api/leaderboard?timeframe=monthly",
      );
      expect(result.current.status).toBe("ready");
      expect(result.current.currentUser?.rankChange).toBeNull();
    });
  });

  describe("errors", () => {
    it("reports an error when the first load fails", async () => {
      mockApiFetch.mockResolvedValue(failure(503));
      const { result } = setup();
      await advance();

      expect(result.current.status).toBe("error");
      expect(result.current.error?.message).toMatch(/503/);
      expect(result.current.ranked).toEqual([]);
    });

    it("reports an error when the request throws", async () => {
      mockApiFetch.mockRejectedValue(new Error("offline"));
      const { result } = setup();
      await advance();

      expect(result.current.status).toBe("error");
      expect(result.current.error?.message).toBe("offline");
    });

    it("recovers when refetch succeeds", async () => {
      mockApiFetch
        .mockResolvedValueOnce(failure())
        .mockResolvedValue(ok([raw("a", 100)]));
      const { result } = setup({ pollIntervalMs: 0 });
      await advance();
      expect(result.current.status).toBe("error");

      act(() => result.current.refetch());
      await advance();

      expect(result.current.status).toBe("ready");
      expect(result.current.error).toBeNull();
      expect(result.current.ranked).toHaveLength(1);
    });

    it("treats a malformed body as an empty board", async () => {
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: true }),
      } as Response);
      const { result } = setup();
      await advance();

      expect(result.current.status).toBe("ready");
      expect(result.current.ranked).toEqual([]);
    });
  });
});
