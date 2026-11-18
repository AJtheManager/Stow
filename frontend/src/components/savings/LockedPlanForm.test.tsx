import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LockedPlanForm from "./LockedPlanForm";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const mockApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;

function dateInputValue(daysFromToday: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fillAndSubmit(amount: string, unlockDate: string) {
  fireEvent.change(screen.getByLabelText(/amount \(xlm\)/i), {
    target: { value: amount },
  });
  fireEvent.change(screen.getByLabelText(/unlock date/i), {
    target: { value: unlockDate },
  });
  fireEvent.click(screen.getByRole("button", { name: /create locked plan/i }));
}

describe("LockedPlanForm", () => {
  const onCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a past unlock date without calling the API", async () => {
    render(<LockedPlanForm owner="GADDR" onCreated={onCreated} />);

    fillAndSubmit("100", "2000-01-01");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /unlock date must be in the future/i,
      );
    });
    expect(
      screen.queryByRole("button", { name: /confirm and lock funds/i }),
    ).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("rejects today's date, since it isn't in the future", async () => {
    render(<LockedPlanForm owner="GADDR" onCreated={onCreated} />);

    fillAndSubmit("100", dateInputValue(0));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /unlock date must be in the future/i,
      );
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("requires an amount and an unlock date", async () => {
    render(<LockedPlanForm owner="GADDR" onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: /create locked plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter an amount to lock/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/choose an unlock date/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("submits valid input after confirmation and shows success", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        on_chain_id: "7",
        owner: "GADDR",
        balance: "1000000000",
        unlock_at: new Date().toISOString(),
      }),
    } as Response);

    render(<LockedPlanForm owner="GADDR" onCreated={onCreated} />);

    fillAndSubmit("100", dateInputValue(30));

    expect(mockApiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    await waitFor(() => {
      expect(screen.getByText(/locked plan created/i)).toBeInTheDocument();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/savings/locked",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.owner).toBe("GADDR");
    expect(body.amount).toBe("1000000000");
    expect(new Date(body.unlock_at).getTime()).toBeGreaterThan(Date.now());

    fireEvent.click(screen.getByRole("button", { name: /view plan/i }));
    expect(onCreated).toHaveBeenCalledWith("7");
  });

  it("shows a pending state while creating", async () => {
    mockApiFetch.mockReturnValueOnce(new Promise<Response>(() => {}));

    render(<LockedPlanForm owner="GADDR" onCreated={onCreated} />);

    fillAndSubmit("100", dateInputValue(30));
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
    });
  });

  it("shows an error on API failure and keeps the confirm step open", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ message: "Vault unavailable" }),
    } as Response);

    render(<LockedPlanForm owner="GADDR" onCreated={onCreated} />);

    fillAndSubmit("100", dateInputValue(30));
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/vault unavailable/i);
    });
    expect(
      screen.getByRole("button", { name: /confirm and lock funds/i }),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("LockedPlanForm nickname", () => {
  const onCreated = vi.fn();
  const createdResponse = {
    ok: true,
    json: async () => ({
      on_chain_id: "7",
      owner: "GNICK",
      balance: "1000000000",
      unlock_at: new Date().toISOString(),
    }),
  } as Response;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  function fillNickname(value: string) {
    fireEvent.change(screen.getByLabelText(/nickname \(optional\)/i), {
      target: { value },
    });
  }

  it("saves the nickname with the new plan on creation", async () => {
    mockApiFetch.mockResolvedValueOnce(createdResponse);
    render(<LockedPlanForm owner="GNICK" onCreated={onCreated} />);

    fillNickname("Holiday fund 🌴");
    fillAndSubmit("100", dateInputValue(30));
    expect(screen.getByText("Holiday fund 🌴")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    await screen.findByText(/locked plan created/i);
    const stored = JSON.parse(
      window.localStorage.getItem("stow:account-nicknames:GNICK")!,
    );
    expect(stored).toEqual({ "locked:7": "Holiday fund 🌴" });
  });

  it("stores nothing when no nickname is entered", async () => {
    mockApiFetch.mockResolvedValueOnce(createdResponse);
    render(<LockedPlanForm owner="GNICK" onCreated={onCreated} />);

    fillAndSubmit("100", dateInputValue(30));
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    await screen.findByText(/locked plan created/i);
    expect(window.localStorage.getItem("stow:account-nicknames:GNICK")).toBeNull();
  });

  it("blocks an invalid nickname before the confirm step", () => {
    render(<LockedPlanForm owner="GNICK" onCreated={onCreated} />);

    fillNickname("ab");
    fillAndSubmit("100", dateInputValue(30));

    expect(screen.getByRole("alert")).toHaveTextContent(/at least 3 characters/i);
    expect(
      screen.queryByRole("button", { name: /confirm and lock funds/i }),
    ).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("does not save the nickname when creation fails", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ message: "Vault unavailable" }),
    } as Response);
    render(<LockedPlanForm owner="GNICK" onCreated={onCreated} />);

    fillNickname("Should not stick");
    fillAndSubmit("100", dateInputValue(30));
    fireEvent.click(screen.getByRole("button", { name: /confirm and lock funds/i }));

    await screen.findByRole("alert");
    expect(window.localStorage.getItem("stow:account-nicknames:GNICK")).toBeNull();
  });
});

