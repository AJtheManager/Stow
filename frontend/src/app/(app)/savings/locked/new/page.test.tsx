import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionProvider";
import * as api from "@/lib/api";
import NewLockedPlanPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/context/SessionProvider", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;
const mockUseSession = useSession as unknown as ReturnType<typeof vi.fn>;

describe("NewLockedPlanPage", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
    mockUseSession.mockReturnValue({
      user: { id: "user-1" },
      address: "GADDR",
      loading: false,
    });
  });

  it("renders the amount and unlock date fields", () => {
    render(<NewLockedPlanPage />);

    expect(screen.getByLabelText(/amount \(xlm\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unlock date/i)).toBeInTheDocument();
  });

  it("navigates to the new plan after it is created", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        on_chain_id: "42",
        owner: "GADDR",
        balance: "500000000",
        unlock_at: "2099-01-01T00:00:00.000Z",
      }),
    } as Response);

    render(<NewLockedPlanPage />);

    fireEvent.change(screen.getByLabelText(/amount \(xlm\)/i), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/unlock date/i), {
      target: { value: "2099-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create locked plan/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    fireEvent.click(await screen.findByRole("button", { name: /view plan/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/savings/locked/42");
    });
  });
});
