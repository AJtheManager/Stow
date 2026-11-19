"use client";

import { useId, useState } from "react";
import { Pencil } from "lucide-react";
import { useNicknames } from "@/hooks/useSavingsAccount";
import {
  NICKNAME_ERROR_MESSAGES,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  countCharacters,
  type AccountKind,
  type NicknameError,
} from "@/lib/nicknames";

export interface NicknameEditorProps {
  /** Current nickname, or null when none is set. */
  nickname: string | null;
  /** Saves a nickname; returns a validation error, or null on success. */
  onSave: (nickname: string) => NicknameError | null;
  /** Removes the nickname. */
  onClear: () => void;
}

/**
 * Shows an account's nickname with inline editing. Validates length
 * (3-50 characters, emoji count as one) before saving.
 */
export default function NicknameEditor({
  nickname,
  onSave,
  onClear,
}: NicknameEditorProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<NicknameError | null>(null);

  const startEditing = () => {
    setDraft(nickname ?? "");
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const saveError = onSave(draft);
    if (saveError) {
      setError(saveError);
      return;
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {nickname ? (
          <>
            <span
              data-testid="nickname-display"
              className="text-lg font-semibold text-foreground break-words"
            >
              {nickname}
            </span>
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit nickname"
              className="rounded-lg p-1.5 text-muted transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-sm font-medium text-muted hover:text-foreground hover:underline"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Add nickname
          </button>
        )}
      </div>
    );
  }

  const count = countCharacters(draft.trim());

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-foreground"
      >
        Nickname
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id={inputId}
          type="text"
          value={draft}
          autoFocus
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          placeholder="e.g. Holiday fund 🌴"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">
        {count}/{NICKNAME_MAX_LENGTH} characters (minimum {NICKNAME_MIN_LENGTH})
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-400">
          {NICKNAME_ERROR_MESSAGES[error]}
        </p>
      )}
    </form>
  );
}

/**
 * `NicknameEditor` bound to one account's stored nickname. `owner` is the
 * wallet address the nickname is kept under.
 */
export function AccountNicknameEditor({
  kind,
  id,
  owner,
}: {
  kind: AccountKind;
  id: string;
  owner: string;
}) {
  const { getNickname, setNickname, clearNickname } = useNicknames(owner);
  return (
    <NicknameEditor
      nickname={getNickname(kind, id)}
      onSave={(value) => setNickname(kind, id, value)}
      onClear={() => clearNickname(kind, id)}
    />
  );
}
