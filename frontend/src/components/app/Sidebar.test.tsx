import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const mockUsePathname = usePathname as unknown as ReturnType<typeof vi.fn>;

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/dashboard");
  });

  it("renders the product navigation links", () => {
    render(<Sidebar onSignOut={vi.fn()} />);

    expect(screen.getByRole("link", { name: /^dashboard$/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: /locked savings/i })).toHaveAttribute(
      "href",
      "/savings/locked/new",
    );
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("marks the link for the current section as active", () => {
    mockUsePathname.mockReturnValue("/savings/locked/abc");
    render(<Sidebar onSignOut={vi.fn()} />);

    expect(screen.getByRole("link", { name: /locked savings/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /^dashboard$/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("calls onSignOut when sign out is clicked", () => {
    const onSignOut = vi.fn();
    render(<Sidebar onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
