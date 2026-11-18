import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CalculatorPage from "./page";

function field(name: RegExp | string): HTMLInputElement {
  return screen.getByLabelText(name) as HTMLInputElement;
}

function setValue(name: RegExp | string, value: string) {
  fireEvent.change(field(name), { target: { value } });
}

function finalBalanceText(): string {
  const label = screen.getByText("Projected final balance");
  return label.nextElementSibling?.textContent ?? "";
}

describe("CalculatorPage", () => {
  it("shows a projection for the default inputs", () => {
    render(<CalculatorPage />);

    expect(
      screen.getByRole("heading", { name: "Savings calculator", level: 1 }),
    ).toBeInTheDocument();
    expect(finalBalanceText()).toMatch(/^[\d,]+\.\d{2} USDC$/);
    expect(screen.getByText("Total principal")).toBeInTheDocument();
    expect(
      screen.getByText("Interest earned", { selector: "dt" }),
    ).toBeInTheDocument();
  });

  it("provides every requested input", () => {
    render(<CalculatorPage />);

    expect(field("Initial amount")).toHaveValue(1000);
    expect(field("Monthly deposit")).toHaveValue(100);
    expect(field("Duration")).toHaveValue(10);
    expect(field("Interest rate")).toHaveValue(5);
    expect(screen.getByLabelText("Compounding")).toHaveValue("monthly");
  });

  it("shows exact principal for the default inputs", () => {
    render(<CalculatorPage />);

    // 1,000 + 100 * 120 months
    const principal = screen.getByText("Total principal").nextElementSibling;
    expect(principal).toHaveTextContent("13,000.00 USDC");
  });

  it("recalculates immediately when an input changes", () => {
    render(<CalculatorPage />);
    const before = finalBalanceText();

    setValue("Monthly deposit", "500");

    expect(finalBalanceText()).not.toBe(before);
    const principal = screen.getByText("Total principal").nextElementSibling;
    expect(principal).toHaveTextContent("61,000.00 USDC");
  });

  it("recalculates when the compounding frequency changes", () => {
    render(<CalculatorPage />);
    const monthly = finalBalanceText();

    fireEvent.change(screen.getByLabelText("Compounding"), {
      target: { value: "daily" },
    });

    expect(finalBalanceText()).not.toBe(monthly);
  });

  it("offers every compounding frequency", () => {
    render(<CalculatorPage />);

    const options = within(screen.getByLabelText("Compounding"))
      .getAllByRole("option")
      .map(option => option.textContent);
    expect(options).toEqual([
      "Daily",
      "Weekly",
      "Monthly",
      "Quarterly",
      "Annually",
    ]);
  });

  it("shows a year-by-year table with one row per year", () => {
    render(<CalculatorPage />);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // header + 10 years
    expect(rows).toHaveLength(11);
    expect(
      within(table).getAllByRole("columnheader").map(h => h.textContent),
    ).toEqual(["Year", "Principal", "Interest", "Balance"]);
  });

  it("labels a partial final year", () => {
    render(<CalculatorPage />);

    setValue("Duration", "1.5");

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveTextContent("2 (6 mo)");
  });

  it("renders an accessible chart that describes the projection", () => {
    render(<CalculatorPage />);

    const chart = screen.getByRole("img", { name: /projected savings growth/i });
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAccessibleDescription(/principal.*interest/i);
  });

  describe("validation", () => {
    it("treats an empty amount as zero without showing an error", () => {
      render(<CalculatorPage />);

      setValue("Initial amount", "");

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      const principal = screen.getByText("Total principal").nextElementSibling;
      expect(principal).toHaveTextContent("12,000.00 USDC");
    });

    it("flags a negative amount and hides the stale projection", () => {
      render(<CalculatorPage />);

      setValue("Initial amount", "-5");

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Initial amount cannot be negative",
      );
      expect(field("Initial amount")).toHaveAttribute("aria-invalid", "true");
      expect(screen.queryByText("Projected final balance")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        /fix the highlighted fields/i,
      );
    });

    it("links the error message to its input", () => {
      render(<CalculatorPage />);

      setValue("Interest rate", "150");

      const input = field("Interest rate");
      const message = screen.getByRole("alert");
      expect(message).toHaveTextContent("Interest rate cannot exceed 100%");
      expect(input).toHaveAttribute("aria-describedby", message.id);
    });

    it("rejects a duration beyond 50 years", () => {
      render(<CalculatorPage />);

      setValue("Duration", "51");

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Duration cannot exceed 50 years",
      );
    });

    it("requires a duration", () => {
      render(<CalculatorPage />);

      setValue("Duration", "");

      expect(screen.getByRole("alert")).toHaveTextContent(
        /duration must be a number/i,
      );
    });

    it("rejects a duration that is not a whole number of months", () => {
      render(<CalculatorPage />);

      setValue("Duration", "0.1");

      expect(screen.getByRole("alert")).toHaveTextContent(
        /whole number of months/i,
      );
    });

    it("recovers once the invalid value is fixed", () => {
      render(<CalculatorPage />);

      setValue("Interest rate", "-1");
      expect(screen.queryByText("Projected final balance")).not.toBeInTheDocument();

      setValue("Interest rate", "4");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("Projected final balance")).toBeInTheDocument();
    });

    it("shows every invalid field at once", () => {
      render(<CalculatorPage />);

      setValue("Initial amount", "-1");
      setValue("Monthly deposit", "-1");

      expect(screen.getAllByRole("alert")).toHaveLength(2);
    });
  });

  describe("edge cases", () => {
    it("shows zero interest at a 0% rate", () => {
      render(<CalculatorPage />);

      setValue("Interest rate", "0");

      const interest = screen.getByText("Interest earned", {
        selector: "dt",
      }).nextElementSibling;
      expect(interest).toHaveTextContent("0.00 USDC");
      expect(finalBalanceText()).toBe("13,000.00 USDC");
    });

    it("handles zero initial amount and zero deposits", () => {
      render(<CalculatorPage />);

      setValue("Initial amount", "0");
      setValue("Monthly deposit", "0");

      expect(finalBalanceText()).toBe("0.00 USDC");
      expect(screen.getByText(/Interest makes up 0.0%/)).toBeInTheDocument();
    });

    it("stays readable for very large amounts", () => {
      render(<CalculatorPage />);

      setValue("Initial amount", "1000000000");
      setValue("Monthly deposit", "1000000000");
      setValue("Duration", "50");
      setValue("Interest rate", "100");

      expect(finalBalanceText()).toMatch(/USDC$/);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
