/**
 * Savings account nicknames: validation, keys and search matching.
 *
 * Lengths are counted in user-perceived characters (grapheme clusters), so an
 * emoji such as 🐖 or 👨‍👩‍👧 counts as one character rather than its UTF-16 length.
 */

export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 50;

export type NicknameError = "too-short" | "too-long" | "invalid-characters";

export const NICKNAME_ERROR_MESSAGES: Record<NicknameError, string> = {
  "too-short": `Nickname must be at least ${NICKNAME_MIN_LENGTH} characters.`,
  "too-long": `Nickname must be at most ${NICKNAME_MAX_LENGTH} characters.`,
  "invalid-characters": "Nickname can't contain control characters.",
};

export type NicknameValidation =
  { ok: true; value: string } | { ok: false; error: NicknameError };

/** Kinds of savings account a nickname can be attached to. */
export type AccountKind = "locked" | "goal";

/** Number of user-perceived characters in `value`. */
export function countCharacters(value: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
    ).length;
  }
  return Array.from(value).length;
}

/**
 * Trims and collapses whitespace, then checks the 3-50 character limit.
 * Returns the cleaned value to store when valid.
 */
export function validateNickname(raw: string): NicknameValidation {
  const value = raw.trim().replace(/\s+/g, " ");
  if (/\p{Cc}/u.test(value)) return { ok: false, error: "invalid-characters" };

  const length = countCharacters(value);
  if (length < NICKNAME_MIN_LENGTH) return { ok: false, error: "too-short" };
  if (length > NICKNAME_MAX_LENGTH) return { ok: false, error: "too-long" };
  return { ok: true, value };
}

/** Storage key for an account's nickname. */
export function accountKey(kind: AccountKind, id: string): string {
  return `${kind}:${id}`;
}

function normalizeForSearch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

/**
 * Whether every whitespace-separated term in `query` appears in at least one
 * of `fields` (case-insensitive). An empty query matches everything.
 */
export function matchesSearch(
  query: string,
  fields: (string | null | undefined)[],
): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = fields
    .filter((f): f is string => Boolean(f))
    .map(normalizeForSearch);
  return terms.every((term) => haystack.some((field) => field.includes(term)));
}
