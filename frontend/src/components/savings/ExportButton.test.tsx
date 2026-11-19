import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportButton from "./ExportButton";
import { downloadTransactionsCsv } from "@/lib/exportTransactions";

vi.mock("@/lib/exportTransactions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/exportTransactions")>()),
  downloadTransactionsCsv: vi.fn(),
}));

const download = vi.mocked(downloadTransactionsCsv);

describe("ExportButton", () => {
  beforeEach(() => {
    download.mockReset();
  });

  it("exports the address's transactions with the current filters", async () => {
    download.mockResolvedValue();
    const filters = { from: "2026-11-01", to: "2026-11-30" };
    render(<ExportButton address="GABC" filters={filters} />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(download).toHaveBeenCalledWith("GABC", filters, expect.any(Object));
  });

  it("is disabled without an address or when disabled", () => {
    const { rerender } = render(<ExportButton address={null} />);
    expect(screen.getByRole("button", { name: /export csv/i })).toBeDisabled();

    rerender(<ExportButton address="GABC" disabled />);
    expect(screen.getByRole("button", { name: /export csv/i })).toBeDisabled();

    rerender(<ExportButton address="GABC" />);
    expect(screen.getByRole("button", { name: /export csv/i })).toBeEnabled();
  });

  it("shows progress while exporting and prevents a second click", async () => {
    let finish!: () => void;
    let report!: (p: { bytesReceived: number }) => void;
    download.mockImplementation(
      (_address, _filters, options) =>
        new Promise<void>((resolve) => {
          report = options!.onProgress!;
          finish = resolve;
        }),
    );
    render(<ExportButton address="GABC" />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    const button = screen.getByRole("button", { name: /export csv/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Preparing export…");

    act(() => report({ bytesReceived: 2_621_440 }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Exporting… 2.5 MB received",
      ),
    );

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(button).toBeEnabled();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("shows an error and re-enables the button when the export fails", async () => {
    download.mockRejectedValue(
      new Error("Failed to export transactions: Server Error"),
    );
    render(<ExportButton address="GABC" />);

    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to export transactions: Server Error",
    );
    expect(screen.getByRole("button", { name: /export csv/i })).toBeEnabled();
  });

  it("clears a previous error when retrying", async () => {
    download.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce();
    render(<ExportButton address="GABC" />);
    const click = () =>
      userEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await click();
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await click();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
