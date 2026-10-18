import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRouter, usePathname } from "next/navigation";
import { SessionProvider } from "@/context/SessionProvider";
import AppLayout from "./layout";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

function renderLayout(children: React.ReactNode) {
  return render(
    <SessionProvider>
      <AppLayout>{children}</AppLayout>
    </SessionProvider>,
  );
}

describe("AppLayout", () => {
  const mockReplace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    });
    (usePathname as unknown as ReturnType<typeof vi.fn>).mockReturnValue("/savings");
    window.localStorage.clear();
  });

  it("shows a loading state before the session finishes hydrating", () => {
    renderLayout(<div>Protected content</div>);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("redirects to /login once hydration finishes with no session", async () => {
    renderLayout(<div>Protected content</div>);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/login?returnTo=%2Fsavings"),
    );
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /app navigation/i })).not.toBeInTheDocument();
  });

  it.each(["/dashboard", "/savings/locked/new", "/settings"])(
    "redirects the guarded route %s to sign in when logged out",
    async (route) => {
      (usePathname as unknown as ReturnType<typeof vi.fn>).mockReturnValue(route);

      renderLayout(<div>Protected content</div>);

      await waitFor(() =>
        expect(mockReplace).toHaveBeenCalledWith(
          `/login?returnTo=${encodeURIComponent(route)}`,
        ),
      );
      expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    },
  );

  it("renders children once a stored session hydrates successfully", async () => {
    window.localStorage.setItem(
      "stow-session",
      JSON.stringify({
        accessToken: "stored-token",
        user: { id: "user-1" },
        address: "GADDRESS123",
      }),
    );

    renderLayout(<div>Protected content</div>);

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("wraps children in the sidebar/topbar shell once signed in", async () => {
    window.localStorage.setItem(
      "stow-session",
      JSON.stringify({
        accessToken: "stored-token",
        user: { id: "user-1", email: "saver@example.com" },
        address: "GADDRESS123",
      }),
    );

    renderLayout(<div>Protected content</div>);

    expect(await screen.findByText("Protected content")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /sidebar/i })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Protected content");
    expect(screen.getByText("saver@example.com")).toBeInTheDocument();
  });
});
