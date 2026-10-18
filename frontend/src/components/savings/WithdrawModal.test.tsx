import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import WithdrawModal from "./WithdrawModal";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;

/** 100 XLM, in stroops. */
const BALANCE = "1000000000";

function renderModal(props: Partial<React.ComponentProps<typeof WithdrawModal>> = {}) {
  return render(
    <WithdrawModal
      open={true}
      onClose={vi.fn()}
      account="GADDR"
      balance={BALANCE}
      {...props}
    />,
  );
}

function enterAmount(value: string) {
  fireEvent.change(screen.getByLabelText(/amount \(xlm\)/i), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: /^withdraw$/i }));
}

describe("WithdrawModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the available balance and focuses the amount input", () => {
    renderModal();

    expect(screen.getByTestId("withdraw-available-balance")).toHaveTextContent("100");
    expect(screen.getByLabelText(/amount \(xlm\)/i)).toHaveFocus();
  });

  it("blocks an amount above the current balance without calling the API", async () => {
    renderModal();

    enterAmount("150");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /exceeds your available balance/i,
      );
    });
    expect(
      screen.queryByRole("button", { name: /confirm withdrawal/i }),
    ).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("blocks an empty amount", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /^withdraw$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /enter an amount to withdraw/i,
      );
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("fills the full balance with Max", () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /max/i }));

    expect(screen.getByLabelText(/amount \(xlm\)/i)).toHaveValue("100");
  });

  it("asks for confirmation before withdrawing", () => {
    renderModal();

    enterAmount("60");

    expect(
      screen.getByRole("button", { name: /confirm withdrawal/i }),
    ).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("withdraws on confirm and updates the balance view on success", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ owner: "GADDR", balance: "400000000" }),
    } as Response);
    const onWithdrawn = vi.fn();

    renderModal({ onWithdrawn });

    enterAmount("60");
    fireEvent.click(screen.getByRole("button", { name: /confirm withdrawal/i }));

    await waitFor(() => {
      expect(screen.getByText(/withdrawal complete/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("withdraw-new-balance")).toHaveTextContent("40");
    expect(onWithdrawn).toHaveBeenCalledWith("400000000");

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/savings/flexible/withdraw",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ owner: "GADDR", amount: "600000000" }),
      }),
    );
  });

  it("shows a pending state and disables confirm while submitting", async () => {
    let resolveFetch: (value: Response) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderModal();

    enterAmount("10");
    fireEvent.click(screen.getByRole("button", { name: /confirm withdrawal/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /withdrawing/i })).toBeDisabled();
    });

    await act(async () => {
      resolveFetch!({
        ok: true,
        json: async () => ({ owner: "GADDR", balance: "900000000" }),
      } as Response);
    });
  });

  it("shows an error state on API failure and stays open", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as Response);
    const onClose = vi.fn();
    const onWithdrawn = vi.fn();

    renderModal({ onClose, onWithdrawn });

    enterAmount("10");
    fireEvent.click(screen.getByRole("button", { name: /confirm withdrawal/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /failed to withdraw|internal server error/i,
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onWithdrawn).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
