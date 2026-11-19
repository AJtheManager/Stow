//! Per-member contribution limits for group pools.
//!
//! Limits are stored apart from the `Group` record so existing groups (and
//! the `Group` XDR layout) are untouched. A value of `0` disables a limit.
//!
//! - `min_contribution` applies to every individual contribution.
//! - `max_contribution` caps a member's cumulative total in the pool.

use soroban_sdk::{Address, Env};

use crate::error::Error;
use crate::storage;
use crate::types::{DataKey, GroupLimits};

/// Validate and store the limits for `group_id`.
///
/// Rejects negative values, and a minimum above a non-zero maximum, with
/// `InvalidParameters`. All-zero limits are not stored.
pub fn set(env: &Env, group_id: u64, min: i128, max: i128) -> Result<(), Error> {
    if min < 0 || max < 0 || (max > 0 && min > max) {
        return Err(Error::InvalidParameters);
    }
    if min == 0 && max == 0 {
        return Ok(());
    }
    let key = DataKey::GroupLimits(group_id);
    env.storage().persistent().set(
        &key,
        &GroupLimits {
            min_contribution: min,
            max_contribution: max,
        },
    );
    storage::extend_persistent_ttl(env, &key);
    Ok(())
}

/// Limits for a group; both zero when none were configured.
pub fn get(env: &Env, group_id: u64) -> GroupLimits {
    let key = DataKey::GroupLimits(group_id);
    match env.storage().persistent().get(&key) {
        Some(limits) => {
            storage::extend_persistent_ttl(env, &key);
            limits
        }
        None => GroupLimits {
            min_contribution: 0,
            max_contribution: 0,
        },
    }
}

/// Cumulative amount `member` has contributed to `group_id`.
pub fn member_total(env: &Env, group_id: u64, member: &Address) -> i128 {
    let key = DataKey::GroupContribution(group_id, member.clone());
    match env.storage().persistent().get(&key) {
        Some(total) => {
            storage::extend_persistent_ttl(env, &key);
            total
        }
        None => 0,
    }
}

/// Enforce the group's limits for a contribution of `amount` and record it
/// against the member's running total.
///
/// Errors: `GroupContributionBelowMinimum`, `GroupContributionAboveMaximum`,
/// `Overflow`. Call before moving tokens; a failure reverts the whole call.
pub fn check_and_record(
    env: &Env,
    group_id: u64,
    member: &Address,
    amount: i128,
) -> Result<(), Error> {
    let limits = get(env, group_id);
    if limits.min_contribution > 0 && amount < limits.min_contribution {
        return Err(Error::GroupContributionBelowMinimum);
    }

    let total = member_total(env, group_id, member)
        .checked_add(amount)
        .ok_or(Error::Overflow)?;
    if limits.max_contribution > 0 && total > limits.max_contribution {
        return Err(Error::GroupContributionAboveMaximum);
    }

    let key = DataKey::GroupContribution(group_id, member.clone());
    env.storage().persistent().set(&key, &total);
    storage::extend_persistent_ttl(env, &key);
    Ok(())
}
