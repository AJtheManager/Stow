import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { apiFetch, ApiError } from "@/lib/api";
import {
  accountKey,
  validateNickname,
  type AccountKind,
  type NicknameError,
} from "@/lib/nicknames";

// ---------------------------------------------------------------------------
// Nickname store
//
// Nicknames are personal labels kept in the browser, per wallet address.
// They're mirrored in memory so they still work (for the session) when
// localStorage is unavailable, and components sharing a store stay in sync
// through a tiny subscribe/notify layer.
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "stow:account-nicknames:";
const EMPTY = "{}";

/** In-memory copy, used for addresses whose writes to localStorage failed. */
const memory = new Map<string, string>();
const memoryOnly = new Set<string>();
const listeners = new Set<() => void>();

const storageKey = (address: string) => `${STORAGE_PREFIX}${address}`;

function readRaw(address: string | null): string {
  if (!address) return EMPTY;
  if (memoryOnly.has(address)) return memory.get(address) ?? EMPTY;
  try {
    return window.localStorage.getItem(storageKey(address)) ?? EMPTY;
  } catch {
    // localStorage unavailable (private mode, blocked): use the in-memory copy.
    return memory.get(address) ?? EMPTY;
  }
}

function writeRaw(address: string, raw: string): void {
  memory.set(address, raw);
  try {
    window.localStorage.setItem(storageKey(address), raw);
    memoryOnly.delete(address);
  } catch {
    // Storage is blocked or full: keep this address's nicknames in memory
    // so they still work for the rest of the session.
    memoryOnly.add(address);
  }
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Picks up changes made in other tabs.
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(STORAGE_PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function parse(raw: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export interface UseNicknamesReturn {
  nicknames: Record<string, string>;
  getNickname: (kind: AccountKind, id: string) => string | null;
  /** Validates and stores a nickname; returns the validation error, if any. */
  setNickname: (
    kind: AccountKind,
    id: string,
    nickname: string,
  ) => NicknameError | null;
  clearNickname: (kind: AccountKind, id: string) => void;
}

/** Reads and writes the address's account nicknames. */
export function useNicknames(address: string | null): UseNicknamesReturn {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(address),
    () => EMPTY,
  );
  const nicknames = useMemo(() => parse(raw), [raw]);

  const getNickname = useCallback(
    (kind: AccountKind, id: string) => nicknames[accountKey(kind, id)] ?? null,
    [nicknames],
  );

  const setNickname = useCallback(
    (kind: AccountKind, id: string, nickname: string) => {
      const result = validateNickname(nickname);
      if (!result.ok) return result.error;
      if (!address) return null;
      const current = parse(readRaw(address));
      current[accountKey(kind, id)] = result.value;
      writeRaw(address, JSON.stringify(current));
      return null;
    },
    [address],
  );

  const clearNickname = useCallback(
    (kind: AccountKind, id: string) => {
      if (!address) return;
      const current = parse(readRaw(address));
      delete current[accountKey(kind, id)];
      writeRaw(address, JSON.stringify(current));
    },
    [address],
  );

  return { nicknames, getNickname, setNickname, clearNickname };
}

// ---------------------------------------------------------------------------
// Account list
// ---------------------------------------------------------------------------

export interface SavingsAccount {
  kind: AccountKind;
  /** On-chain id. */
  id: string;
  /** Name the app gives the account (goal name, or "Locked plan #id"). */
  name: string;
  nickname: string | null;
  /** Nickname when set, otherwise `name`. */
  displayName: string;
  /** Balance in stroops. */
  balance: string;
  href: string;
}

export type SavingsAccountsStatus = "loading" | "ready" | "error";

export interface UseSavingsAccountsReturn {
  accounts: SavingsAccount[];
  status: SavingsAccountsStatus;
  error: Error | null;
  refetch: () => void;
}

interface BaseAccount {
  kind: AccountKind;
  id: string;
  name: string;
  balance: string;
  href: string;
}

const PAGE_SIZE = 100;

/** Pages through an owner-scoped list endpoint and returns every item. */
async function fetchAll<T, K extends string>(
  path: string,
  address: string,
  key: K,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      address,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const response = await apiFetch(`${path}?${query}`);
    if (!response.ok) {
      throw new ApiError(
        `Failed to load savings accounts: ${response.statusText}`,
        response.status,
      );
    }
    const body = (await response.json()) as {
      total: number;
      limit: number;
    } & Record<K, T[]>;
    const items = body[key];
    all.push(...items);
    if (items.length === 0 || page * body.limit >= body.total) break;
  }
  return all;
}

/**
 * Lists the address's locked plans and goals as savings accounts, with any
 * nickname the user has given them.
 */
export function useSavingsAccounts(
  address: string | null,
): UseSavingsAccountsReturn {
  const [base, setBase] = useState<BaseAccount[]>([]);
  const [status, setStatus] = useState<SavingsAccountsStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);
  const { getNickname } = useNicknames(address);

  const load = useCallback(async () => {
    if (!address) return;
    setStatus("loading");
    setError(null);
    try {
      const [plans, goals] = await Promise.all([
        fetchAll<{ on_chain_id: string; balance: string }, "plans">(
          "/api/savings/locked",
          address,
          "plans",
        ),
        fetchAll<
          { on_chain_id: string; name: string; current_amount: string },
          "goals"
        >("/api/savings/goals", address, "goals"),
      ]);
      setBase([
        ...plans.map((p) => ({
          kind: "locked" as const,
          id: p.on_chain_id,
          name: `Locked plan #${p.on_chain_id}`,
          balance: p.balance,
          href: `/savings/locked/${p.on_chain_id}`,
        })),
        ...goals.map((g) => ({
          kind: "goal" as const,
          id: g.on_chain_id,
          name: g.name,
          balance: g.current_amount,
          href: `/savings/goals/${g.on_chain_id}`,
        })),
      ]);
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Unknown error occurred"),
      );
      setStatus("error");
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load, refetchCount]);

  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  const accounts = useMemo<SavingsAccount[]>(
    () =>
      base.map((account) => {
        const nickname = getNickname(account.kind, account.id);
        return { ...account, nickname, displayName: nickname ?? account.name };
      }),
    [base, getNickname],
  );

  return { accounts, status, error, refetch };
}
