import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionProvider";
import * as api from "@/lib/api";
import FlexibleSavingsPage from "./page";

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

vi.mock("@/components/savings/DepositModal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="deposit-modal" /> : null,
}));

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;
const mockUseSession = useSession as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

function mockApi({
  account = { account: "GADDR", amount: "125000000", created_at: "", updated_at: "" } as unknown,
  accountStatus = 200,
  activity = [] as unknown[],
} = {}) {
  mockApiFetch.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/savings/accounts/")) {
      return jsonResponse(account, accountStatus);
    }
    if (url.startsWith("/api/savings/activity")) {
      return jsonResponse(activity);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("FlexibleSavingsPage", () => {
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

  it("renders the flexible balance", async () => {
    mockApi();

    render(<FlexibleSavingsPage />);

    expect(screen.getByTestId("flexible-balance-loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("flexible-balance")).toHaveTextContent(
        "12.50 USDC",
      );
    });
  });

  it("opens the deposit modal from the deposit action", async () => {
    mockApi();

    render(<FlexibleSavingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("flexible-balance")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    expect(screen.getByTestId("deposit-modal")).toBeInTheDocument();
  });

  it("routes to the withdraw flow from the withdraw action", async () => {
    mockApi();

    render(<FlexibleSavingsPage />);

    const withdraw = screen.getByRole("button", { name: /withdraw/i });
    await waitFor(() => expect(withdraw).toBeEnabled());

    fireEvent.click(withdraw);

    expect(mockPush).toHaveBeenCalledWith("/ramps/withdraw");
  });

  it("disables withdraw and shows a zero balance when no account exists", async () => {
    mockApi({ account: { message: "Not found" }, accountStatus: 404 });

    render(<FlexibleSavingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("flexible-balance")).toHaveTextContent(
        "0.00 USDC",
      );
    });
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeDisabled();
  });

  it("renders recent activity", async () => {
    mockApi({
      activity: [
        {
          id: "evt-1",
          type: "deposit",
          amount: "50000000",
          goal_id: null,
          goal_name: null,
          tx_hash: "abc",
          ledger: 10,
          occurred_at: "2026-10-01T12:00:00.000Z",
        },
      ],
    });

    render(<FlexibleSavingsPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("activity-item")).toHaveLength(1);
    });
    expect(screen.getByText("+5.00 USDC")).toBeInTheDocument();
  });

  it("shows an empty state when there is no recent activity", async () => {
    mockApi();

    render(<FlexibleSavingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("flexible-activity-empty")).toBeInTheDocument();
    });
  });

  it("shows an error state with retry when the balance fails to load", async () => {
    mockApi({ account: {}, accountStatus: 500 });

    render(<FlexibleSavingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });
});
