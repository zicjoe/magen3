#![no_std]
#![no_main]

extern crate alloc;

use alloc::string::{String, ToString};
use casper_contract::{contract_api::{runtime, storage}, unwrap_or_revert::UnwrapOrRevert};
use casper_types::{
    CLType, EntryPoint, EntryPointAccess, EntryPointType, EntryPoints, Key, Parameter, RuntimeArgs, URef,
};

const DECISIONS_DICT: &str = "magen3_decisions";
const CONTRACT_PACKAGE_NAME: &str = "magen3_audit_registry_package";
const CONTRACT_ACCESS_UREF: &str = "magen3_audit_registry_access";
const CONTRACT_HASH_NAME: &str = "magen3_audit_registry_contract";

fn get_decisions_dict() -> URef {
    runtime::get_key(DECISIONS_DICT)
        .and_then(Key::into_uref)
        .unwrap_or_revert()
}

#[no_mangle]
pub extern "C" fn record_decision() {
    let decision_id: String = runtime::get_named_arg("decision_id");
    let wallet_address: String = runtime::get_named_arg("wallet_address");
    let agent_id: String = runtime::get_named_arg("agent_id");
    let shield: String = runtime::get_named_arg("shield");
    let action_type: String = runtime::get_named_arg("action_type");
    let decision: String = runtime::get_named_arg("decision");
    let risk: String = runtime::get_named_arg("risk");
    let risk_score: u32 = runtime::get_named_arg("risk_score");
    let amount: String = runtime::get_named_arg("amount");
    let target: String = runtime::get_named_arg("target");
    let policy_used: String = runtime::get_named_arg("policy_used");
    let reason_hash: String = runtime::get_named_arg("reason_hash");
    let payload_hash: String = runtime::get_named_arg("payload_hash");

    let value = decision_id.clone()
        + "|" + &wallet_address
        + "|" + &agent_id
        + "|" + &shield
        + "|" + &action_type
        + "|" + &decision
        + "|" + &risk
        + "|" + &risk_score.to_string()
        + "|" + &amount
        + "|" + &target
        + "|" + &policy_used
        + "|" + &reason_hash
        + "|" + &payload_hash;

    storage::dictionary_put(get_decisions_dict(), &decision_id, value);
}

#[no_mangle]
pub extern "C" fn call() {
    let mut entry_points = EntryPoints::new();

    entry_points.add_entry_point(EntryPoint::new(
        "record_decision",
        vec![
            Parameter::new("decision_id", CLType::String),
            Parameter::new("wallet_address", CLType::String),
            Parameter::new("agent_id", CLType::String),
            Parameter::new("shield", CLType::String),
            Parameter::new("action_type", CLType::String),
            Parameter::new("decision", CLType::String),
            Parameter::new("risk", CLType::String),
            Parameter::new("risk_score", CLType::U32),
            Parameter::new("amount", CLType::String),
            Parameter::new("target", CLType::String),
            Parameter::new("policy_used", CLType::String),
            Parameter::new("reason_hash", CLType::String),
            Parameter::new("payload_hash", CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Contract,
    ));

    let decisions_uref = storage::new_dictionary(DECISIONS_DICT).unwrap_or_revert();
    runtime::put_key(DECISIONS_DICT, decisions_uref.into());

    let (package_hash, access_uref) = storage::create_contract_package_at_hash();
    let (contract_hash, _version) = storage::add_contract_version(package_hash, entry_points, Default::default());

    runtime::put_key(CONTRACT_PACKAGE_NAME, package_hash.into());
    runtime::put_key(CONTRACT_ACCESS_UREF, access_uref.into());
    runtime::put_key(CONTRACT_HASH_NAME, contract_hash.into());
}
