//! Automatic savings round-ups (issue #622).
//!
//! An owner opts in with [`enable`] and picks a [`RoundupLevel`]. Each
//! external transaction reported through [`record_transaction`] is rounded up
//! to the next multiple of the level's step. The difference is deposited into
//! the owner's flexible savings and a `roundup_deposit` event is emitted.
//!
//! The owner authorizes each call, so the difference is taken from the
//! owner's own token balance, the same as a manual deposit.

use soroban_sdk::{Address, Env};

use crate::error::Error;
use crate::events::TOPIC_ROUNDUP_DEPOSIT;
use crate::storage::{extend_instance_ttl, extend_persistent_ttl};
use crate::types::{DataKey, RoundupConfig, RoundupLevel};

fn step(level: RoundupLevel) -> i128 {
    match level {
        RoundupLevel::Nearest1 => 1,
        RoundupLevel::Nearest5 => 5,
        RoundupLevel::Nearest10 => 10,
    }
}

/// Amount needed to round `amount` up to the next multiple of the level's step.
///
/// Returns `0` when `amount` is already a multiple of the step.
pub fn roundup_difference(amount: i128, level: RoundupLevel) -> Result<i128, Error> {
    let step = step(level);
    let remainder = amount.checked_rem(step).ok_or(Error::DivisionByZero)?;
    Ok(if remainder == 0 { 0 } else { step - remainder })
}

fn load(env: &Env, owner: &Address) -> Option<RoundupConfig> {
    let key = DataKey::Roundup(owner.clone());
    let config = env.storage().persistent().get(&key);
    if config.is_some() {
        extend_persistent_ttl(env, &key);
    }
    config
}

fn store(env: &Env, config: &RoundupConfig) {
    let key = DataKey::Roundup(config.owner.clone());
    env.storage().persistent().set(&key, config);
    extend_persistent_ttl(env, &key);
}

/// Turn on round-ups for `owner` at `level`. Re-enabling changes the level
/// and keeps the running totals.
pub fn enable(env: &Env, owner: Address, level: RoundupLevel) -> Result<(), Error> {
    extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;
    owner.require_auth();

    let config = match load(env, &owner) {
        Some(mut existing) => {
            existing.level = level;
            existing
        }
        None => RoundupConfig {
            owner: owner.clone(),
            level,
            tracked_total: 0,
            deposited_total: 0,
        },
    };
    store(env, &config);
    Ok(())
}

/// Read `owner`'s round-up configuration and totals.
///
/// # Errors
/// - [`Error::NotFound`] if the owner never enabled round-ups.
pub fn get_config(env: &Env, owner: Address) -> Result<RoundupConfig, Error> {
    load(env, &owner).ok_or(Error::NotFound)
}

/// Record an external transaction of `amount` for `owner`, and deposit its
/// round-up difference into the owner's flexible savings.
///
/// Returns the amount deposited (zero when `amount` is already a multiple of
/// the owner's step).
///
/// # Errors
/// - [`Error::InvalidAmount`] if `amount` is not positive.
/// - [`Error::NotFound`]     if the owner never enabled round-ups.
/// - Any error from the flexible deposit (pause, emergency, token failure).
pub fn record_transaction(env: &Env, owner: Address, amount: i128) -> Result<i128, Error> {
    extend_instance_ttl(env);
    crate::admin::require_not_paused(env)?;

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    let mut config = load(env, &owner).ok_or(Error::NotFound)?;
    let difference = roundup_difference(amount, config.level)?;

    config.tracked_total = config
        .tracked_total
        .checked_add(amount)
        .ok_or(Error::Overflow)?;
    if difference > 0 {
        // The flexible deposit requires the owner's auth. Calling
        // `require_auth` here as well would fail: Soroban rejects a second
        // authorization of the same address within one invocation.
        crate::flexible::deposit(env, owner.clone(), difference)?;
        config.deposited_total = config
            .deposited_total
            .checked_add(difference)
            .ok_or(Error::Overflow)?;
        env.events().publish(
            (TOPIC_ROUNDUP_DEPOSIT, owner.clone()),
            (amount, difference, config.deposited_total),
        );
    } else {
        owner.require_auth();
    }
    store(env, &config);
    Ok(difference)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::{String, TryFromVal};

    use crate::test::register_vault;

    #[test]
    fn difference_rounds_up_to_each_level() {
        // (amount, level, expected difference)
        let cases = [
            (123, RoundupLevel::Nearest1, 0),
            (123, RoundupLevel::Nearest5, 2),
            (123, RoundupLevel::Nearest10, 7),
            (120, RoundupLevel::Nearest10, 0),
            (121, RoundupLevel::Nearest5, 4),
            (4, RoundupLevel::Nearest5, 1),
        ];
        for (amount, level, expected) in cases {
            assert_eq!(roundup_difference(amount, level).unwrap(), expected);
        }
    }

    #[test]
    fn transaction_deposits_difference_into_savings() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, token, owner) = register_vault(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token).mint(&owner, &1_000);

        vault.enable_roundup(&owner, &RoundupLevel::Nearest10);
        let diff = vault.record_roundup_transaction(&owner, &123);

        assert_eq!(diff, 7);
        assert_eq!(vault.get_account(&owner).balance, 7);
        let config = vault.roundup_config(&owner);
        assert_eq!(config.tracked_total, 123);
        assert_eq!(config.deposited_total, 7);
    }

    #[test]
    fn emits_roundup_deposit_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, token, owner) = register_vault(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token).mint(&owner, &1_000);

        vault.enable_roundup(&owner, &RoundupLevel::Nearest10);
        vault.record_roundup_transaction(&owner, &123);

        let expected = String::from_str(&env, TOPIC_ROUNDUP_DEPOSIT);
        let emitted = env.events().all().iter().any(|(_, topics, _)| {
            topics
                .get(0)
                .and_then(|v| String::try_from_val(&env, &v).ok())
                == Some(expected.clone())
        });
        assert!(emitted, "a roundup_deposit event must be emitted");
    }

    #[test]
    fn exact_multiple_saves_nothing() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, _token, owner) = register_vault(&env);

        vault.enable_roundup(&owner, &RoundupLevel::Nearest5);
        assert_eq!(vault.record_roundup_transaction(&owner, &40), 0);
        let config = vault.roundup_config(&owner);
        assert_eq!(config.tracked_total, 40);
        assert_eq!(config.deposited_total, 0);
    }

    #[test]
    fn requires_enable_and_positive_amount() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, _token, owner) = register_vault(&env);

        assert_eq!(
            vault.try_record_roundup_transaction(&owner, &10),
            Err(Ok(Error::NotFound))
        );
        vault.enable_roundup(&owner, &RoundupLevel::Nearest1);
        assert_eq!(
            vault.try_record_roundup_transaction(&owner, &0),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn re_enabling_changes_level_and_keeps_totals() {
        let env = Env::default();
        env.mock_all_auths();
        let (vault, token, owner) = register_vault(&env);
        soroban_sdk::token::StellarAssetClient::new(&env, &token).mint(&owner, &1_000);

        vault.enable_roundup(&owner, &RoundupLevel::Nearest10);
        vault.record_roundup_transaction(&owner, &123);
        vault.enable_roundup(&owner, &RoundupLevel::Nearest5);

        let config = vault.roundup_config(&owner);
        assert_eq!(config.level, RoundupLevel::Nearest5);
        assert_eq!(config.tracked_total, 123);
        assert_eq!(config.deposited_total, 7);
        assert_eq!(vault.record_roundup_transaction(&owner, &123), 2);
    }
}
