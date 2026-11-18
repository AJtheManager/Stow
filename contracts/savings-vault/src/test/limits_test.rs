//! Group contribution limits (#579).

use soroban_sdk::{testutils::Address as _, token::StellarAssetClient, Address, Env, String};

use crate::error::Error;
use crate::{SavingsVault, SavingsVaultClient};

const UNIT: i128 = 10_000_000; // 1 token (7 decimals)

struct Ctx<'a> {
    client: SavingsVaultClient<'a>,
    token: Address,
}

fn ctx(env: &Env) -> Ctx<'_> {
    env.mock_all_auths();
    let client = SavingsVaultClient::new(env, &env.register(SavingsVault, ()));
    let admin = Address::generate(env);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(env))
        .address();
    client.initialize(&admin, &token);
    Ctx { client, token }
}

fn mint(env: &Env, token: &Address, recipient: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(recipient, &amount);
}

fn funded_member(env: &Env, c: &Ctx, group_id: u64, amount: i128) -> Address {
    let member = Address::generate(env);
    mint(env, &c.token, &member, amount);
    c.client.group_join(&member, &group_id);
    member
}

fn new_group(env: &Env, c: &Ctx, min: i128, max: i128) -> u64 {
    let creator = Address::generate(env);
    c.client
        .group_create_with_limits(&creator, &String::from_str(env, "limits"), &min, &max)
}

#[test]
fn limits_configured_at_creation_are_stored() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);

    let limits = c.client.group_limits(&id);
    assert_eq!(limits.min_contribution, 5 * UNIT);
    assert_eq!(limits.max_contribution, 50 * UNIT);
}

#[test]
fn group_created_without_limits_is_unlimited() {
    let env = Env::default();
    let c = ctx(&env);
    let creator = Address::generate(&env);
    let id = c
        .client
        .group_create(&creator, &String::from_str(&env, "plain"));

    let limits = c.client.group_limits(&id);
    assert_eq!(limits.min_contribution, 0);
    assert_eq!(limits.max_contribution, 0);

    let member = funded_member(&env, &c, id, 1_000 * UNIT);
    c.client.group_contribute(&member, &id, &1);
    c.client.group_contribute(&member, &id, &(999 * UNIT));
    assert_eq!(c.client.group(&id).balance, 1 + 999 * UNIT);
}

#[test]
fn deposit_below_minimum_is_rejected() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);
    let member = funded_member(&env, &c, id, 100 * UNIT);

    let result = c.client.try_group_contribute(&member, &id, &(5 * UNIT - 1));
    assert_eq!(result, Err(Ok(Error::GroupContributionBelowMinimum)));

    assert_eq!(c.client.group(&id).balance, 0);
    assert_eq!(c.client.group_member_contribution(&id, &member), 0);
}

#[test]
fn deposit_at_minimum_is_accepted() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);
    let member = funded_member(&env, &c, id, 100 * UNIT);

    c.client.group_contribute(&member, &id, &(5 * UNIT));
    assert_eq!(c.client.group_member_contribution(&id, &member), 5 * UNIT);
}

#[test]
fn deposit_above_maximum_is_rejected() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);
    let member = funded_member(&env, &c, id, 100 * UNIT);

    let result = c
        .client
        .try_group_contribute(&member, &id, &(50 * UNIT + 1));
    assert_eq!(result, Err(Ok(Error::GroupContributionAboveMaximum)));

    assert_eq!(c.client.group(&id).balance, 0);
    assert_eq!(c.client.group_member_contribution(&id, &member), 0);
}

#[test]
fn deposit_up_to_maximum_is_accepted() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);
    let member = funded_member(&env, &c, id, 100 * UNIT);

    c.client.group_contribute(&member, &id, &(50 * UNIT));
    assert_eq!(c.client.group_member_contribution(&id, &member), 50 * UNIT);
}

#[test]
fn maximum_applies_to_cumulative_total() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);
    let member = funded_member(&env, &c, id, 100 * UNIT);

    c.client.group_contribute(&member, &id, &(30 * UNIT));
    c.client.group_contribute(&member, &id, &(15 * UNIT));

    // 45 contributed; another 6 would reach 51 > 50.
    let result = c.client.try_group_contribute(&member, &id, &(6 * UNIT));
    assert_eq!(result, Err(Ok(Error::GroupContributionAboveMaximum)));

    // Exactly filling the remaining headroom is still fine.
    c.client.group_contribute(&member, &id, &(5 * UNIT));
    assert_eq!(c.client.group_member_contribution(&id, &member), 50 * UNIT);
    assert_eq!(c.client.group(&id).balance, 50 * UNIT);
}

#[test]
fn limits_enforced_consistently_across_members() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 5 * UNIT, 50 * UNIT);
    let a = funded_member(&env, &c, id, 100 * UNIT);
    let b = funded_member(&env, &c, id, 100 * UNIT);
    let creator = c.client.group(&id).creator;
    mint(&env, &c.token, &creator, 100 * UNIT);

    for member in [&a, &b, &creator] {
        assert_eq!(
            c.client.try_group_contribute(member, &id, &(UNIT)),
            Err(Ok(Error::GroupContributionBelowMinimum)),
        );
        assert_eq!(
            c.client.try_group_contribute(member, &id, &(51 * UNIT)),
            Err(Ok(Error::GroupContributionAboveMaximum)),
        );
        c.client.group_contribute(member, &id, &(50 * UNIT));
    }

    // Each member is capped independently of what others contributed.
    assert_eq!(c.client.group(&id).balance, 150 * UNIT);
    assert_eq!(
        c.client.try_group_contribute(&a, &id, &(5 * UNIT)),
        Err(Ok(Error::GroupContributionAboveMaximum)),
    );
}

#[test]
fn view_returns_accurate_contribution_totals() {
    let env = Env::default();
    let c = ctx(&env);
    let id = new_group(&env, &c, 0, 0);
    let a = funded_member(&env, &c, id, 100 * UNIT);
    let b = funded_member(&env, &c, id, 100 * UNIT);
    let outsider = Address::generate(&env);

    assert_eq!(c.client.group_member_contribution(&id, &a), 0);

    c.client.group_contribute(&a, &id, &(7 * UNIT));
    c.client.group_contribute(&a, &id, &(3 * UNIT));
    c.client.group_contribute(&b, &id, &(4 * UNIT));

    assert_eq!(c.client.group_member_contribution(&id, &a), 10 * UNIT);
    assert_eq!(c.client.group_member_contribution(&id, &b), 4 * UNIT);
    assert_eq!(c.client.group_member_contribution(&id, &outsider), 0);
    assert_eq!(c.client.group(&id).balance, 14 * UNIT);
}

#[test]
fn view_functions_reject_unknown_group() {
    let env = Env::default();
    let c = ctx(&env);
    let who = Address::generate(&env);

    assert_eq!(c.client.try_group_limits(&999), Err(Ok(Error::NotFound)));
    assert_eq!(
        c.client.try_group_member_contribution(&999, &who),
        Err(Ok(Error::NotFound)),
    );
}

#[test]
fn invalid_limits_rejected_at_creation() {
    let env = Env::default();
    let c = ctx(&env);
    let creator = Address::generate(&env);
    let name = String::from_str(&env, "bad");

    // min above max
    assert_eq!(
        c.client
            .try_group_create_with_limits(&creator, &name, &(10 * UNIT), &(5 * UNIT)),
        Err(Ok(Error::InvalidParameters)),
    );
    // negative values
    assert_eq!(
        c.client
            .try_group_create_with_limits(&creator, &name, &-1, &(5 * UNIT)),
        Err(Ok(Error::InvalidParameters)),
    );
    assert_eq!(
        c.client
            .try_group_create_with_limits(&creator, &name, &0, &-1),
        Err(Ok(Error::InvalidParameters)),
    );
}

#[test]
fn minimum_only_and_maximum_only_limits_work() {
    let env = Env::default();
    let c = ctx(&env);

    let min_only = new_group(&env, &c, 2 * UNIT, 0);
    let m = funded_member(&env, &c, min_only, 1_000 * UNIT);
    assert_eq!(
        c.client.try_group_contribute(&m, &min_only, &UNIT),
        Err(Ok(Error::GroupContributionBelowMinimum)),
    );
    c.client.group_contribute(&m, &min_only, &(900 * UNIT));

    let max_only = new_group(&env, &c, 0, 10 * UNIT);
    let m = funded_member(&env, &c, max_only, 1_000 * UNIT);
    c.client.group_contribute(&m, &max_only, &1);
    assert_eq!(
        c.client.try_group_contribute(&m, &max_only, &(10 * UNIT)),
        Err(Ok(Error::GroupContributionAboveMaximum)),
    );
}
