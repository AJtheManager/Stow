import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNicknames, useSavingsAccounts } from "./useSavingsAccount";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const ADDR = "GOWNER";

describe("useNicknames", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves a nickname and reads it back", () => {
    const { result } = renderHook(() => useNicknames(ADDR));
    expect(result.current.getNickname("locked", "1")).toBeNull();

    let error: unknown;
    act(() => {
      error = result.current.setNickname("locked", "1", "Rainy day 🌧️");
    });

    expect(error).toBeNull();
    expect(result.current.getNickname("locked", "1")).toBe("Rainy day 🌧️");
  });

  it("updates an existing nickname", () => {
    const { result } = renderHook(() => useNicknames(ADDR));
    act(() => void result.current.setNickname("goal", "9", "First name"));
    act(() => void result.current.setNickname("goal", "9", "Second name"));

    expect(result.current.getNickname("goal", "9")).toBe("Second name");
  });

  it("clears a nickname", () => {
    const { result } = renderHook(() => useNicknames(ADDR));
    act(() => void result.current.setNickname("goal", "9", "Temporary"));
    act(() => result.current.clearNickname("goal", "9"));

    expect(result.current.getNickname("goal", "9")).toBeNull();
  });

  it("rejects invalid nicknames without storing them", () => {
    const { result } = renderHook(() => useNicknames(ADDR));
    let tooShort: unknown;
    let tooLong: unknown;
    act(() => {
      tooShort = result.current.setNickname("locked", "1", "ab");
      tooLong = result.current.setNickname("locked", "1", "x".repeat(51));
    });

    expect(tooShort).toBe("too-short");
    expect(tooLong).toBe("too-long");
    expect(result.current.getNickname("locked", "1")).toBeNull();
  });

  it("keeps kinds apart when ids collide", () => {
    const { result } = renderHook(() => useNicknames(ADDR));
    act(() => void result.current.setNickname("locked", "1", "Locked one"));
    act(() => void result.current.setNickname("goal", "1", "Goal one"));

    expect(result.current.getNickname("locked", "1")).toBe("Locked one");
    expect(result.current.getNickname("goal", "1")).toBe("Goal one");
  });

  it("persists across mounts and is scoped per address", () => {
    const first = renderHook(() => useNicknames(ADDR));
    act(() => void first.result.current.setNickname("locked", "1", "Saved"));
    first.unmount();

    const again = renderHook(() => useNicknames(ADDR));
    expect(again.result.current.getNickname("locked", "1")).toBe("Saved");

    const other = renderHook(() => useNicknames("GSOMEONEELSE"));
    expect(other.result.current.getNickname("locked", "1")).toBeNull();
  });

  it("keeps every consumer in sync", () => {
    const a = renderHook(() => useNicknames(ADDR));
    const b = renderHook(() => useNicknames(ADDR));
    act(() => void a.result.current.setNickname("locked", "1", "Shared"));

    expect(b.result.current.getNickname("locked", "1")).toBe("Shared");
  });

  it("ignores corrupt stored data", () => {
    window.localStorage.setItem("stow:account-nicknames:" + ADDR, "not json");
    const { result } = renderHook(() => useNicknames(ADDR));

    expect(result.current.getNickname("locked", "1")).toBeNull();
    act(() => void result.current.setNickname("locked", "1", "Recovered"));
    expect(result.current.getNickname("locked", "1")).toBe("Recovered");
  });

  it("still works for the session when localStorage throws", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      const { result } = renderHook(() => useNicknames("GNOSTORAGE"));

      act(() => void result.current.setNickname("locked", "1", "In memory"));

      expect(result.current.getNickname("locked", "1")).toBe("In memory");
    } finally {
      setItem.mockRestore();
    }
  });
});

describe("useSavingsAccounts", () => {
  const json = (body: unknown) =>
    ({ ok: true, json: async () => body }) as Response;

  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/savings/locked")) {
        return json({
          plans: [{ on_chain_id: "3", owner: ADDR, balance: "50000000" }],
          total: 1,
          page: 1,
          limit: 100,
        });
      }
      return json({
        goals: [
          {
            on_chain_id: "8",
            owner: ADDR,
            name: "Vacation",
            current_amount: "25000000",
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
      });
    });
  });

  it("lists locked plans and goals, falling back to their names", async () => {
    const { result } = renderHook(() => useSavingsAccounts(ADDR));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(
      result.current.accounts.map((a) => [a.kind, a.id, a.displayName, a.href]),
    ).toEqual([
      ["locked", "3", "Locked plan #3", "/savings/locked/3"],
      ["goal", "8", "Vacation", "/savings/goals/8"],
    ]);
    expect(result.current.accounts.every((a) => a.nickname === null)).toBe(
      true,
    );
  });

  it("shows a nickname as the display name once set", async () => {
    const accounts = renderHook(() => useSavingsAccounts(ADDR));
    const nicknames = renderHook(() => useNicknames(ADDR));
    await waitFor(() => expect(accounts.result.current.status).toBe("ready"));

    act(
      () => void nicknames.result.current.setNickname("locked", "3", "Car 🚗"),
    );

    const locked = accounts.result.current.accounts.find((a) => a.id === "3")!;
    expect(locked.nickname).toBe("Car 🚗");
    expect(locked.displayName).toBe("Car 🚗");
    expect(locked.name).toBe("Locked plan #3");
  });

  it("pages through every result", async () => {
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const url = String(input);
      const page = Number(new URLSearchParams(url.split("?")[1]).get("page"));
      if (url.startsWith("/api/savings/locked")) {
        return json({
          plans: [{ on_chain_id: `p${page}`, owner: ADDR, balance: "1" }],
          total: 2,
          page,
          limit: 1,
        });
      }
      return json({ goals: [], total: 0, page: 1, limit: 100 });
    });

    const { result } = renderHook(() => useSavingsAccounts(ADDR));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.accounts.map((a) => a.id)).toEqual(["p1", "p2"]);
  });

  it("reports an error when a list fails to load", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
    } as Response);

    const { result } = renderHook(() => useSavingsAccounts(ADDR));
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.error?.message).toMatch(
      /Failed to load savings accounts/,
    );
  });

  it("does not fetch without an address", () => {
    renderHook(() => useSavingsAccounts(null));
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
