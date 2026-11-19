import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NicknameEditor from "./NicknameEditor";
import { validateNickname } from "@/lib/nicknames";

/** onSave stub with the real validation, like the hook. */
const saver = () =>
  vi.fn((value: string) => {
    const result = validateNickname(value);
    return result.ok ? null : result.error;
  });

describe("NicknameEditor", () => {
  it("offers to add a nickname when none is set", () => {
    render(
      <NicknameEditor nickname={null} onSave={saver()} onClear={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: /add nickname/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("nickname-display")).toBeNull();
  });

  it("saves a new nickname", async () => {
    const onSave = saver();
    render(
      <NicknameEditor nickname={null} onSave={onSave} onClear={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /add nickname/i }),
    );
    await userEvent.type(screen.getByLabelText("Nickname"), "Holiday fund");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("Holiday fund");
    expect(screen.queryByLabelText("Nickname")).toBeNull();
  });

  it("edits an existing nickname, starting from its current value", async () => {
    const onSave = saver();
    render(
      <NicknameEditor nickname="Old name" onSave={onSave} onClear={vi.fn()} />,
    );

    expect(screen.getByTestId("nickname-display")).toHaveTextContent(
      "Old name",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /edit nickname/i }),
    );

    const input = screen.getByLabelText("Nickname");
    expect(input).toHaveValue("Old name");
    await userEvent.clear(input);
    await userEvent.type(input, "New name");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("New name");
  });

  it("saves with Enter", async () => {
    const onSave = saver();
    render(
      <NicknameEditor nickname={null} onSave={onSave} onClear={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /add nickname/i }),
    );
    await userEvent.type(
      screen.getByLabelText("Nickname"),
      "Quick save{Enter}",
    );

    expect(onSave).toHaveBeenCalledWith("Quick save");
  });

  it("blocks a nickname that is too short and keeps editing", async () => {
    render(
      <NicknameEditor nickname={null} onSave={saver()} onClear={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /add nickname/i }),
    );
    await userEvent.type(screen.getByLabelText("Nickname"), "ab");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /at least 3 characters/i,
    );
    expect(screen.getByLabelText("Nickname")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("blocks a nickname that is too long", async () => {
    render(
      <NicknameEditor nickname={null} onSave={saver()} onClear={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /add nickname/i }),
    );
    await userEvent.type(screen.getByLabelText("Nickname"), "x".repeat(51));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /at most 50 characters/i,
    );
  });

  it("clears the error once the user types again", async () => {
    render(
      <NicknameEditor nickname={null} onSave={saver()} onClear={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /add nickname/i }),
    );
    await userEvent.type(screen.getByLabelText("Nickname"), "ab");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.type(screen.getByLabelText("Nickname"), "c");

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders emoji nicknames and counts them as single characters", async () => {
    const onSave = saver();
    render(
      <NicknameEditor
        nickname="Beach 🏖️🌴"
        onSave={onSave}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByTestId("nickname-display")).toHaveTextContent(
      "Beach 🏖️🌴",
    );

    await userEvent.click(
      screen.getByRole("button", { name: /edit nickname/i }),
    );
    const input = screen.getByLabelText("Nickname");
    await userEvent.clear(input);
    await userEvent.type(input, "🐖🐖🐖");

    expect(screen.getByText(/3\/50 characters/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("🐖🐖🐖");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels with the button or Escape without saving", async () => {
    const onSave = saver();
    render(
      <NicknameEditor nickname="Keep me" onSave={onSave} onClear={vi.fn()} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /edit nickname/i }),
    );
    await userEvent.type(screen.getByLabelText("Nickname"), " changed");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("nickname-display")).toHaveTextContent("Keep me");

    await userEvent.click(
      screen.getByRole("button", { name: /edit nickname/i }),
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("nickname-display")).toHaveTextContent("Keep me");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("removes the nickname", async () => {
    const onClear = vi.fn();
    render(
      <NicknameEditor
        nickname="Gone soon"
        onSave={saver()}
        onClear={onClear}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
