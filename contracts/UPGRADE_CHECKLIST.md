# Contract upgrade safety checklist

Run through this checklist before calling `upgrade(caller, new_wasm_hash)` on a
deployed contract (see the `upgrade` entry in [`savings-vault/README.md`](savings-vault/README.md)).

An upgrade swaps the contract's Wasm in place. It keeps the contract address
and **all existing storage**, and nothing on-chain checks that the new code can
still read that storage or keeps the old code's invariants. Every item below
is a manual check. Copy the checklist into the upgrade PR description and tick
each box with a link to the evidence (a diff, test output, or a testnet
transaction).

---

## 1. Storage layout compatibility

Soroban stores `#[contracttype]` values as XDR. Keys and values are encoded by
**variant/field name**, not by position, so a compatible change is one that
leaves every name and type already in storage readable.

### `DataKey` (`src/types.rs`)

- [ ] No existing `DataKey` variant was **renamed or removed**. A renamed
      variant is a new key: the old entries are still on the ledger but the
      new code can never find them (for example, renaming `Locked(u64)` would
      make every locked plan read as `NotFound`).
- [ ] No existing variant's **payload type changed** (for example,
      `Locked(u64)` → `Locked(u32)` or `Flexible(Address)` →
      `Flexible(String)`).
- [ ] New variants are **additions only**, and the code treats a missing value
      as a safe default (for example, `DepositCap` / `MinDeposit` absent means
      `0`, so no limit).
- [ ] **Storage durability did not change** for any existing key (instance,
      persistent or temporary). Moving `Token` from instance to persistent
      storage, for example, makes the new code read an empty slot.

### Stored structs (`FlexibleAccount`, `LockedPlan`, `Goal`, `Group`, …)

- [ ] No field was **renamed, removed, or changed in type** (for example,
      `balance: i128` → `balance: u128`, or `unlock_at: u64` → `unlock_at: i64`).
- [ ] No field was **added** to a struct that already has entries on the
      ledger, unless a migration step rewrites every existing entry first.
      Decoding an old entry fails when a field the new struct expects is
      missing. A new `Option<_>` field does not avoid this, because the field
      is absent from the old XDR, not `None`. Put new data under a new
      `DataKey` variant, or migrate the entries.
- [ ] `#[contracttype]` enums stored as values (for example, status enums) keep
      their existing variants and payloads.

### Counters, TTLs and singletons

- [ ] The id counters (`NextLockedId`, `NextGoalId`, `NextGroupId`) are **never
      re-seeded or reset**. Re-seeding them overwrites existing plans, goals
      and groups.
- [ ] Changes to the TTL constants (`PERSISTENT_BUMP_AMOUNT`,
      `PERSISTENT_LIFETIME_THRESHOLD`, and the instance values) are
      deliberate, and no live entry can expire during the rollout.
- [ ] If the change needs a migration, it is **idempotent**, admin-gated, and
      runs as a separate call after the upgrade. It must not run from
      `upgrade` itself, because the new code only takes effect after that
      invocation returns.

### How to verify

1. Diff the stored types against the deployed release tag:
   `git diff <deployed-tag> -- contracts/savings-vault/src/types.rs contracts/savings-vault/src/storage.rs`.
2. Deploy the **currently deployed** Wasm to testnet (or a local sandbox),
   write fixture state through every product (flexible, locked, goal, group),
   then `upgrade` to the candidate Wasm.
3. Read every fixture back through the new code (`get_account`, `locked_plan`,
   `goal`, `group`, `token`, `admin`, `deposit_cap`, `min_deposit`), and run
   one state-changing call per product (deposit, withdraw, top-up and so on).
   Every read must decode and every value must be unchanged.

---

## 2. Function selector collision check

Soroban dispatches by **exported function name** (a `Symbol` of at most 32
characters), not by a hashed selector as on the EVM. A selector "collision"
here means an entrypoint whose name now resolves to different behaviour than
existing callers (the backend, the indexer, the frontend, scripts) expect.

- [ ] No existing `pub fn` on the `#[contractimpl]` block (`src/lib.rs`) was
      **renamed or removed**. Callers invoke by name, and a missing name fails
      at runtime, not at build time.
- [ ] No existing entrypoint **changed its argument list or argument types**
      while keeping its name (for example,
      `withdraw(owner, amount)` → `withdraw(owner, amount, to)`). Invocations
      from older clients would fail to decode or, worse, still decode with
      different meaning. Add a new name (for example `withdraw_to`) instead.
- [ ] No existing entrypoint **changed its return type**. The backend and the
      indexer decode these responses.
- [ ] No **new** entrypoint reuses a name the contract exported in an earlier
      release, and every name is at most 32 characters and unique in the
      contract.
- [ ] `Error` discriminants (`src/error.rs`) were **not renumbered or reused**.
      Clients map error codes (for example `AlreadyInitialized = 1`,
      `NotInitialized = 2`) to user-facing messages, so new errors take new
      numbers only.
- [ ] **Event topics and payload shapes** (`src/events.rs`) are unchanged, or
      `EVENT_SCHEMA_VERSION` was bumped and the indexer handles both versions.
- [ ] `upgrade` itself is still exported, still admin-gated, and still has the
      same signature. Otherwise the contract can never be upgraded again.

### How to verify

1. Build both Wasms and diff their interfaces:
   `stellar contract inspect --wasm <deployed>.wasm` against
   `stellar contract inspect --wasm <candidate>.wasm`.
   Every function, argument, return type and error code in the deployed
   interface must appear unchanged in the candidate interface.
2. `grep` the backend (`backend/src/soroban`, `backend/src/indexer`) and the
   frontend for every entrypoint and event name the diff touched.

---

## 3. Initialization validation

`initialize` is not auth-gated: whoever calls it first becomes the admin. An
upgrade must not reopen that window or leave the contract half-configured.

- [ ] The `AlreadyInitialized` guard in `initialize` is unchanged. It checks
      `DataKey::Admin` in instance storage, so that key's name and durability
      must stay the same (see section 1).
- [ ] The new code does **not** add a second initializer (for example
      `initialize_v2`) that anyone can call to overwrite `Admin` or `Token`. Any
      new setup step for added config is admin-gated and idempotent.
- [ ] Every new config value the new code reads has a safe default when absent,
      or is set in the same rollout through an admin-gated setter **before**
      user traffic depends on it.
- [ ] After the upgrade, `admin()` and `token()` return the same addresses as
      before, and `Paused` is in the intended state.
- [ ] Calling `initialize` again after the upgrade returns
      `Error::AlreadyInitialized`.
- [ ] For a **fresh** deployment, `initialize` is called in the same script or
      transaction batch as the deploy (see `savings-vault/scripts/deploy_testnet.sh`),
      so nobody can front-run it.

### How to verify

On the testnet fixture from section 1, after the upgrade:

```bash
stellar contract invoke --id $CONTRACT_ID --network testnet -- admin
stellar contract invoke --id $CONTRACT_ID --network testnet -- token
# Must fail with AlreadyInitialized (#1):
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- initialize --admin <any-address> --token <any-address>
```

---

## Rollout

- [ ] The candidate Wasm hash in the upgrade call matches the hash of the build
      from the reviewed commit (`stellar contract upload` prints it).
- [ ] The upgrade was rehearsed on testnet using the checks above.
- [ ] The `upgraded` event was observed after mainnet execution, and the
      indexer kept processing events without errors.
- [ ] A rollback plan exists: keep the previously deployed Wasm hash, which can
      be passed back to `upgrade` as long as the new code did not migrate
      storage into a shape the old code can't read.
