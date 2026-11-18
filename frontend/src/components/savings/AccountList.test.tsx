import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountList from "./AccountList";
import type { SavingsAccount } from "@/hooks/useSavingsAccount";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const account = (overrides: Partial<SavingsAccount>): SavingsAccount => ({
  kind: "locked",
  id: "1",
  name: "Locked plan #1",
  nickname: null,
  displayName: "Locked plan #1",
  balance: "50000000",
  href: "/savings/locked/1",
  ...overrides,
});

const accounts = [
  account({
    id: "1",
    nickname: "Holiday fund 🌴",
    displayName: "Holiday fund 🌴",
  }),
  account({
    id: "2",
    name: "Locked plan #2",
    displayName: "Locked plan #2",
    href: "/savings/locked/2",
  }),
  account({
    kind: "goal",
    id: "9",
    name: "New laptop",
    displayName: "New laptop",
    href: "/savings/goals/9",
  }),
];

const names = () =>
  screen.getAllByTestId("account-display-name").map((el) => el.textContent);

describe("AccountList", () => {
  it("shows the nickname prominently, with the account name beneath", () => {
    render(<AccountList accounts={accounts} />);

    const [first] = screen.getAllByRole("link");
    expect(within(first).getByTestId("account-display-name")).toHaveTextContent(
      "Holiday fund 🌴",
    );
    expect(first).toHaveTextContent("Locked plan · Locked plan #1");
    expect(first).toHaveAttribute("href", "/savings/locked/1");
  });

  it("falls back to the account name without a nickname", () => {
    render(<AccountList accounts={accounts} />);

    expect(names()).toEqual([
      "Holiday fund 🌴",
      "Locked plan #2",
      "New laptop",
    ]);
  });

  it("finds accounts by nickname", async () => {
    render(<AccountList accounts={accounts} />);

    await userEvent.type(screen.getByRole("searchbox"), "holiday");

    expect(names()).toEqual(["Holiday fund 🌴"]);
  });

  it("finds accounts by emoji in the nickname", async () => {
    render(<AccountList accounts={accounts} />);

    await userEvent.type(screen.getByRole("searchbox"), "🌴");

    expect(names()).toEqual(["Holiday fund 🌴"]);
  });

  it("still finds accounts by their original name or kind", async () => {
    render(<AccountList accounts={accounts} />);
    const search = screen.getByRole("searchbox");

    await userEvent.type(search, "laptop");
    expect(names()).toEqual(["New laptop"]);

    await userEvent.clear(search);
    await userEvent.type(search, "#1");
    expect(names()).toEqual(["Holiday fund 🌴"]);

    await userEvent.clear(search);
    await userEvent.type(search, "goal");
    expect(names()).toEqual(["New laptop"]);
  });

  it("explains when nothing matches", async () => {
    render(<AccountList accounts={accounts} />);

    await userEvent.type(screen.getByRole("searchbox"), "zzz");

    expect(screen.getByTestId("account-list-no-match")).toHaveTextContent(
      "zzz",
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows loading and empty states", () => {
    const { rerender } = render(<AccountList accounts={[]} isLoading />);
    expect(screen.getByTestId("account-list-loading")).toBeInTheDocument();

    rerender(<AccountList accounts={[]} />);
    expect(screen.getByTestId("account-list-empty")).toBeInTheDocument();
  });
});
