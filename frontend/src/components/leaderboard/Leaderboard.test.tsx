import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Leaderboard, {
  LeaderboardView,
  formatLeaderboardValue,
  type LeaderboardViewProps,
} from "./Leaderboard";
import {
  rankEntries,
  withRankChanges,
  type LeaderboardEntry,
  type RankedEntry,
} from "@/lib/leaderboardCalculations";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = vi.mocked(api.apiFetch);

function raw(
  userId: string,
  totalSaved: number,
  extra: Partial<LeaderboardEntry> & { streak?: number; goals?: number } = {},
): LeaderboardEntry {
  const { streak = 0, goals = 0, ...rest } = extra;
  return {
    userId,
    displayName: `User ${userId}`,
    region: "NG",
    privacy: "public",
    values: { totalSaved, streak, goalsCompleted: goals },
    ...rest,
  };
}

function ok(entries: LeaderboardEntry[]): Response {
  return { ok: true, status: 200, json: async () => ({ entries }) } as Response;
}

function view(overrides: Partial<LeaderboardViewProps> = {}) {
  const ranked = overrides.ranked ?? [];
  const props: LeaderboardViewProps = {
    type: "totalSaved",
    timeframe: "allTime",
    region: "all",
    regions: ["KE", "NG"],
    ranked,
    currentUser: ranked.find(r => r.isCurrentUser) ?? null,
    nearby: [],
    hasViewer: true,
    status: "ready",
    onTypeChange: vi.fn(),
    onTimeframeChange: vi.fn(),
    onRegionChange: vi.fn(),
    ...overrides,
  };
  render(<LeaderboardView {...props} />);
  return props;
}

function board(entries: LeaderboardEntry[], currentUserId = "me"): RankedEntry[] {
  return rankEntries(entries, { type: "totalSaved", currentUserId });
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("formatLeaderboardValue", () => {
  it("formats each leaderboard type with its unit", () => {
    expect(formatLeaderboardValue("totalSaved", 1234.5)).toBe("1,234.5 USDC");
    expect(formatLeaderboardValue("streak", 12)).toBe("12 days");
    expect(formatLeaderboardValue("goalsCompleted", 3)).toBe("3 goals");
  });

  it("uses the singular for one", () => {
    expect(formatLeaderboardValue("streak", 1)).toBe("1 day");
    expect(formatLeaderboardValue("goalsCompleted", 1)).toBe("1 goal");
  });
});

describe("LeaderboardView", () => {
  it("lists savers in rank order with their values", () => {
    view({ ranked: board([raw("a", 100), raw("b", 300), raw("c", 200)]) });

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining("User b"),
      expect.stringContaining("User c"),
      expect.stringContaining("User a"),
    ]);
    expect(rows[0]).toHaveTextContent("300 USDC");
  });

  describe("trophies", () => {
    it("awards gold, silver and bronze to the top three", () => {
      view({
        ranked: board([raw("a", 400), raw("b", 300), raw("c", 200), raw("d", 100)]),
      });

      const [first, second, third, fourth] = within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1);
      expect(first).toHaveTextContent("Gold trophy");
      expect(second).toHaveTextContent("Silver trophy");
      expect(third).toHaveTextContent("Bronze trophy");
      expect(fourth).not.toHaveTextContent(/trophy/i);
    });

    it("awards nothing when nobody has saved anything", () => {
      view({ ranked: board([raw("a", 0), raw("b", 0)]) });

      expect(screen.queryByText(/trophy/i)).not.toBeInTheDocument();
    });
  });

  describe("your position", () => {
    it("highlights the viewer's row and shows their rank", () => {
      view({ ranked: board([raw("a", 300), raw("me", 200)]) });

      const position = screen.getByLabelText("Your position");
      expect(position).toHaveTextContent("#2");
      expect(position).toHaveTextContent("200 USDC");

      const row = screen.getByText("User me").closest("tr")!;
      expect(row).toHaveAttribute("aria-current", "true");
      expect(within(row).getByText("You")).toBeInTheDocument();
    });

    it("explains when the viewer is not on the board", () => {
      view({ ranked: board([raw("a", 300)]), currentUser: null });

      expect(screen.getByText(/you are not shown on this leaderboard/i)).toBeInTheDocument();
    });

    it("shows nothing about the viewer when signed out", () => {
      view({ ranked: board([raw("a", 300)]), hasViewer: false });

      expect(screen.queryByLabelText("Your position")).not.toBeInTheDocument();
      expect(screen.queryByText(/not shown on this leaderboard/i)).not.toBeInTheDocument();
    });
  });

  describe("position changes", () => {
    const before = board([raw("a", 300), raw("me", 100)]);
    const after = withRankChanges(
      board([raw("a", 300), raw("me", 500)]),
      before,
    );

    it("shows who moved up and who moved down", () => {
      view({ ranked: after });

      const meRow = screen.getByText("User me").closest("tr")!;
      const aRow = screen.getByText("User a").closest("tr")!;
      expect(within(meRow).getByText("Up 1")).toBeInTheDocument();
      expect(within(aRow).getByText("Down 1")).toBeInTheDocument();
    });

    it("shows the viewer's movement in their position card", () => {
      view({ ranked: after });

      expect(within(screen.getByLabelText("Your position")).getByText("Up 1")).toBeInTheDocument();
    });

    it("marks a user with no history as new and an unmoved one as no change", () => {
      const unchanged = withRankChanges(before, before);
      view({ ranked: [...unchanged.slice(0, 1), { ...unchanged[1], rankChange: null }] });

      expect(screen.getByText("No change")).toBeInTheDocument();
      expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    });
  });

  describe("filters", () => {
    it("marks the active leaderboard type and switches on click", () => {
      const props = view({ type: "streak" });

      expect(screen.getByRole("button", { name: "Streaks" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Total saved" })).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(screen.getByRole("button", { name: "Goals completed" }));
      expect(props.onTypeChange).toHaveBeenCalledWith("goalsCompleted");
    });

    it("offers every timeframe and reports changes", () => {
      const props = view();

      const select = screen.getByLabelText("Timeframe");
      expect(within(select).getAllByRole("option").map(o => o.textContent)).toEqual([
        "All time",
        "This month",
        "This week",
      ]);

      fireEvent.change(select, { target: { value: "weekly" } });
      expect(props.onTimeframeChange).toHaveBeenCalledWith("weekly");
    });

    it("offers all regions plus each known region and reports changes", () => {
      const props = view({ regions: ["KE", "NG"] });

      const select = screen.getByLabelText("Region");
      expect(within(select).getAllByRole("option").map(o => o.textContent)).toEqual([
        "All regions",
        "KE",
        "NG",
      ]);

      fireEvent.change(select, { target: { value: "KE" } });
      expect(props.onRegionChange).toHaveBeenCalledWith("KE");
    });
  });

  describe("states", () => {
    it("shows a loading message", () => {
      view({ status: "loading" });

      expect(screen.getByRole("status")).toHaveTextContent(/loading leaderboard/i);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows the error and lets the user retry", () => {
      const onRetry = vi.fn();
      view({ status: "error", error: new Error("boom"), onRetry });

      expect(screen.getByRole("alert")).toHaveTextContent("boom");
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("falls back to a generic message when the error has none", () => {
      view({ status: "error", error: null });

      expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded/i);
    });

    it("shows an empty state when nobody is on the board", () => {
      view({ ranked: [], hasViewer: false });

      expect(screen.getByText(/nobody is on this leaderboard yet/i)).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("shows when the data was last updated", () => {
      view({ updatedAt: new Date("2026-09-01T10:30:00Z") });

      expect(screen.getByText(/live - updated/i)).toBeInTheDocument();
    });
  });

  describe("nearby competitors", () => {
    const many = board(
      Array.from({ length: 12 }, (_, i) => raw(i === 6 ? "me" : `u${i}`, 1200 - i * 10)),
    );

    it("shows the users around the viewer on a long board", () => {
      const nearby = many.slice(4, 9);
      view({ ranked: many, nearby });

      const section = screen.getByRole("heading", { name: "Around you" }).parentElement!;
      expect(within(section).getAllByRole("row")).toHaveLength(6);
      expect(within(section).getByText("User me")).toBeInTheDocument();
    });

    it("is left out on a short board where the full list already shows everyone", () => {
      const small = board([raw("a", 3), raw("me", 2), raw("c", 1)]);
      view({ ranked: small, nearby: small });

      expect(screen.queryByRole("heading", { name: "Around you" })).not.toBeInTheDocument();
    });
  });

  describe("privacy", () => {
    it("shows an anonymous saver by their masked name", () => {
      view({
        ranked: board([raw("a", 100, { privacy: "anonymous", displayName: "Real Name" })]),
      });

      expect(screen.getByText("Anonymous saver")).toBeInTheDocument();
      expect(screen.queryByText("Real Name")).not.toBeInTheDocument();
    });
  });
});

describe("Leaderboard (connected)", () => {
  const entries = [
    raw("a", 900, { region: "NG", streak: 2, goals: 9 }),
    raw("me", 500, { region: "KE", streak: 40, goals: 1 }),
    raw("c", 300, { region: "NG", streak: 5, goals: 4 }),
    raw("secret", 9999, { region: "NG", privacy: "hidden" }),
  ];

  function rowNames(): string[] {
    return within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1)
      .map(row => within(row).getAllByRole("cell")[1].textContent ?? "");
  }

  it("loads the board and ranks savers correctly", async () => {
    mockApiFetch.mockResolvedValue(ok(entries));
    render(<Leaderboard currentUserId="me" pollIntervalMs={0} />);

    await screen.findByRole("table");

    expect(rowNames().map(n => n.replace("You", ""))).toEqual([
      expect.stringContaining("User a"),
      expect.stringContaining("User me"),
      expect.stringContaining("User c"),
    ]);
    expect(screen.getByLabelText("Your position")).toHaveTextContent("#2");
  });

  it("never shows a user who opted out", async () => {
    mockApiFetch.mockResolvedValue(ok(entries));
    render(<Leaderboard currentUserId="me" pollIntervalMs={0} />);

    await screen.findByRole("table");

    expect(screen.queryByText("User secret")).not.toBeInTheDocument();
    expect(screen.queryByText(/9,999/)).not.toBeInTheDocument();
  });

  it("re-ranks when the leaderboard type changes", async () => {
    mockApiFetch.mockResolvedValue(ok(entries));
    render(<Leaderboard currentUserId="me" pollIntervalMs={0} />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Streaks" }));

    expect(rowNames()[0]).toContain("User me");
    expect(screen.getByLabelText("Your position")).toHaveTextContent("#1");
    expect(screen.getByLabelText("Your position")).toHaveTextContent("40 days");
  });

  it("filters by region and re-ranks within it", async () => {
    mockApiFetch.mockResolvedValue(ok(entries));
    render(<Leaderboard currentUserId="me" pollIntervalMs={0} />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "NG" } });

    expect(rowNames()).toHaveLength(2);
    expect(screen.queryByText("User me")).not.toBeInTheDocument();
    expect(screen.getByText(/you are not shown on this leaderboard/i)).toBeInTheDocument();
  });

  it("refetches when the timeframe changes", async () => {
    mockApiFetch.mockResolvedValue(ok(entries));
    render(<Leaderboard currentUserId="me" pollIntervalMs={0} />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("Timeframe"), { target: { value: "weekly" } });

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith("/api/leaderboard?timeframe=weekly"),
    );
    await screen.findByRole("table");
  });

  it("updates ranks and shows movement as new data arrives", async () => {
    mockApiFetch
      .mockResolvedValueOnce(ok([raw("a", 900), raw("me", 100)]))
      .mockResolvedValue(ok([raw("a", 900), raw("me", 1500)]));
    render(<Leaderboard currentUserId="me" pollIntervalMs={30} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Your position")).toHaveTextContent("#1"),
    );
    expect(within(screen.getByLabelText("Your position")).getByText("Up 1")).toBeInTheDocument();
  });

  it("shows an error with a working retry", async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) } as Response)
      .mockResolvedValue(ok(entries));
    render(<Leaderboard currentUserId="me" pollIntervalMs={0} />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByRole("table");
  });

  it("does not claim a position when signed out", async () => {
    mockApiFetch.mockResolvedValue(ok(entries));
    render(<Leaderboard pollIntervalMs={0} />);

    await screen.findByRole("table");

    expect(screen.queryByLabelText("Your position")).not.toBeInTheDocument();
  });
});
