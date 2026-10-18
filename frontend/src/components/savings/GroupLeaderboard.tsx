"use client";

import { useEffect, useMemo, useState } from "react";
import { Medal, Trophy } from "lucide-react";
import type { GroupMember } from "@/hooks/useGroupDetail";
import { formatNumber, formatStroopsAmount } from "@/lib/currency";

/**
 * How member identities are shown:
 *  - "full" — complete Stellar address.
 *  - "masked" — truncated address (GABC…WXYZ).
 *  - "anonymous" — "Member #n"; only the viewer's own row is identified.
 */
export type LeaderboardIdentityMode = "full" | "masked" | "anonymous";

/** How contributions are shown: XLM amount, share of the pool, or hidden (rank only). */
export type LeaderboardAmountMode = "amount" | "percent" | "hidden";

export interface GroupLeaderboardProps {
  members: GroupMember[];
  /** The viewer's address, highlighted as "You". */
  currentAddress?: string | null;
  /** When the data was last refreshed, shown as a live indicator. */
  updatedAt?: Date | null;
  defaultIdentityMode?: LeaderboardIdentityMode;
  defaultAmountMode?: LeaderboardAmountMode;
  className?: string;
}

const STORAGE_KEY = "stow.groupLeaderboard.privacy";

const IDENTITY_LABELS: Record<LeaderboardIdentityMode, string> = {
  full: "Full address",
  masked: "Masked",
  anonymous: "Anonymous",
};

const AMOUNT_LABELS: Record<LeaderboardAmountMode, string> = {
  amount: "Amount",
  percent: "Share %",
  hidden: "Hidden",
};

const RANK_STYLES = ["text-yellow-400", "text-slate-300", "text-amber-600"];

function maskAddress(address: string, visibleChars = 4): string {
  if (address.length <= visibleChars * 2 + 1) return address;
  return `${address.slice(0, visibleChars)}…${address.slice(-visibleChars)}`;
}

/** Stroop-string contributions compared as BigInt to avoid precision loss. */
function toBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

/**
 * Ranks a group pool's members by how much they've contributed. Defaults to
 * the most private display (anonymous members, share of pool rather than
 * amounts); viewers can choose how identities and amounts are shown, and
 * the choice is remembered on this device.
 */
export default function GroupLeaderboard({
  members,
  currentAddress = null,
  updatedAt = null,
  defaultIdentityMode = "anonymous",
  defaultAmountMode = "percent",
  className = "",
}: GroupLeaderboardProps) {
  const [identityMode, setIdentityMode] =
    useState<LeaderboardIdentityMode>(defaultIdentityMode);
  const [amountMode, setAmountMode] =
    useState<LeaderboardAmountMode>(defaultAmountMode);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        identity?: LeaderboardIdentityMode;
        amount?: LeaderboardAmountMode;
      };
      if (saved.identity && saved.identity in IDENTITY_LABELS) {
        setIdentityMode(saved.identity);
      }
      if (saved.amount && saved.amount in AMOUNT_LABELS) {
        setAmountMode(saved.amount);
      }
    } catch {
      // Storage unavailable or malformed — fall back to defaults.
    }
  }, []);

  const savePrivacy = (
    identity: LeaderboardIdentityMode,
    amount: LeaderboardAmountMode,
  ) => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ identity, amount }),
      );
    } catch {
      // Non-fatal: the choice just won't persist.
    }
  };

  const ranked = useMemo(() => {
    const total = members.reduce(
      (sum, m) => sum + toBigInt(m.contributed),
      BigInt(0),
    );
    return [...members]
      .sort((a, b) => {
        const diff = toBigInt(b.contributed) - toBigInt(a.contributed);
        if (diff !== BigInt(0)) return diff > BigInt(0) ? 1 : -1;
        return a.address.localeCompare(b.address);
      })
      .map((member, index) => ({
        member,
        rank: index + 1,
        percent:
          total > BigInt(0)
            ? Number((toBigInt(member.contributed) * BigInt(10_000)) / total) /
              100
            : 0,
      }));
  }, [members]);

  const displayName = (address: string, rank: number) => {
    if (identityMode === "anonymous") return `Member #${rank}`;
    if (identityMode === "masked") return maskAddress(address);
    return address;
  };

  return (
    <section
      aria-labelledby="group-leaderboard-title"
      className={`rounded-2xl border border-border bg-card p-6 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-brand" aria-hidden="true" />
          <h2
            id="group-leaderboard-title"
            className="text-lg font-semibold text-foreground"
          >
            Leaderboard
          </h2>
        </div>
        {updatedAt && (
          <span
            className="flex items-center gap-1.5 text-xs text-muted"
            aria-live="polite"
          >
            <span
              className="h-2 w-2 rounded-full bg-brand animate-pulse"
              aria-hidden="true"
            />
            Live · updated{" "}
            {updatedAt.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
        <div>
          <label
            htmlFor="leaderboard-identity"
            className="block text-xs font-medium text-muted mb-1"
          >
            Show members as
          </label>
          <select
            id="leaderboard-identity"
            value={identityMode}
            onChange={(e) => {
              const next = e.target.value as LeaderboardIdentityMode;
              setIdentityMode(next);
              savePrivacy(next, amountMode);
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {(Object.keys(IDENTITY_LABELS) as LeaderboardIdentityMode[]).map(
              (mode) => (
                <option key={mode} value={mode}>
                  {IDENTITY_LABELS[mode]}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label
            htmlFor="leaderboard-amount"
            className="block text-xs font-medium text-muted mb-1"
          >
            Show contributions as
          </label>
          <select
            id="leaderboard-amount"
            value={amountMode}
            onChange={(e) => {
              const next = e.target.value as LeaderboardAmountMode;
              setAmountMode(next);
              savePrivacy(identityMode, next);
            }}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {(Object.keys(AMOUNT_LABELS) as LeaderboardAmountMode[]).map(
              (mode) => (
                <option key={mode} value={mode}>
                  {AMOUNT_LABELS[mode]}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="text-muted">No contributions yet.</p>
      ) : (
        <ol className="space-y-2">
          {ranked.map(({ member, rank, percent }) => {
            const isYou = !!currentAddress && member.address === currentAddress;
            return (
              <li
                key={member.address}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  isYou ? "border-brand/40 bg-brand/10" : "border-border"
                }`}
              >
                <span className="flex w-8 shrink-0 items-center justify-center text-sm font-semibold text-foreground">
                  {rank <= 3 ? (
                    <Medal
                      className={`h-5 w-5 ${RANK_STYLES[rank - 1]}`}
                      aria-label={`Rank ${rank}`}
                    />
                  ) : (
                    <span aria-label={`Rank ${rank}`}>{rank}</span>
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 text-sm text-foreground ${
                    identityMode === "anonymous" ? "" : "font-mono break-all"
                  }`}
                  title={identityMode === "full" ? member.address : undefined}
                >
                  {displayName(member.address, rank)}
                  {isYou && (
                    <span className="ml-2 rounded-full bg-brand/20 px-2 py-0.5 font-sans text-xs font-medium text-brand">
                      You
                    </span>
                  )}
                </span>
                {amountMode !== "hidden" && (
                  <span className="text-sm text-muted whitespace-nowrap">
                    {amountMode === "amount"
                      ? `${formatStroopsAmount(member.contributed)} XLM`
                      : `${formatNumber(percent, { maximumFractionDigits: 2 })}%`}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
