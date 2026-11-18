import { describe, it, expect } from "vitest";
import {
  NICKNAME_MAX_LENGTH,
  accountKey,
  countCharacters,
  matchesSearch,
  validateNickname,
} from "./nicknames";

describe("validateNickname", () => {
  it("accepts 3 to 50 characters", () => {
    expect(validateNickname("abc")).toEqual({ ok: true, value: "abc" });
    const max = "x".repeat(NICKNAME_MAX_LENGTH);
    expect(validateNickname(max)).toEqual({ ok: true, value: max });
  });

  it("rejects fewer than 3 characters", () => {
    expect(validateNickname("ab")).toEqual({ ok: false, error: "too-short" });
    expect(validateNickname("")).toEqual({ ok: false, error: "too-short" });
  });

  it("rejects more than 50 characters", () => {
    expect(validateNickname("x".repeat(51))).toEqual({
      ok: false,
      error: "too-long",
    });
  });

  it("trims and collapses whitespace before counting", () => {
    expect(validateNickname("  Rainy   day  ")).toEqual({
      ok: true,
      value: "Rainy day",
    });
    expect(validateNickname("  ab  ")).toEqual({
      ok: false,
      error: "too-short",
    });
  });

  it("rejects control characters", () => {
    expect(validateNickname("bad\u0007name")).toEqual({
      ok: false,
      error: "invalid-characters",
    });
  });

  it("counts an emoji as one character, however it is encoded", () => {
    expect(countCharacters("🐖")).toBe(1);
    expect(countCharacters("👨‍👩‍👧")).toBe(1);
    expect(countCharacters("🇳🇬")).toBe(1);
    expect(validateNickname("🐖🐖🐖")).toEqual({ ok: true, value: "🐖🐖🐖" });
    expect(validateNickname("🐖🐖")).toEqual({ ok: false, error: "too-short" });
    // 50 emoji are 100+ UTF-16 units but still valid.
    expect(validateNickname("🐖".repeat(50)).ok).toBe(true);
    expect(validateNickname("🐖".repeat(51))).toEqual({
      ok: false,
      error: "too-long",
    });
  });

  it("keeps emoji mixed with text intact", () => {
    expect(validateNickname("Holiday fund 🌴")).toEqual({
      ok: true,
      value: "Holiday fund 🌴",
    });
  });
});

describe("accountKey", () => {
  it("namespaces ids by kind", () => {
    expect(accountKey("locked", "7")).toBe("locked:7");
    expect(accountKey("goal", "7")).toBe("goal:7");
  });
});

describe("matchesSearch", () => {
  it("matches everything for an empty query", () => {
    expect(matchesSearch("", ["anything"])).toBe(true);
    expect(matchesSearch("   ", [])).toBe(true);
  });

  it("is case-insensitive and matches substrings", () => {
    expect(matchesSearch("holi", ["Holiday fund"])).toBe(true);
    expect(matchesSearch("HOLIDAY", ["holiday fund"])).toBe(true);
    expect(matchesSearch("rent", ["Holiday fund"])).toBe(false);
  });

  it("requires every term to match some field", () => {
    expect(matchesSearch("holiday goal", ["Holiday fund", "Goal"])).toBe(true);
    expect(matchesSearch("holiday plan", ["Holiday fund", "Goal"])).toBe(false);
  });

  it("finds emoji", () => {
    expect(matchesSearch("🌴", ["Holiday fund 🌴"])).toBe(true);
    expect(matchesSearch("🐖", ["Holiday fund 🌴"])).toBe(false);
  });

  it("ignores empty fields", () => {
    expect(matchesSearch("x", [null, undefined, "x"])).toBe(true);
    expect(matchesSearch("x", [null, undefined])).toBe(false);
  });
});
