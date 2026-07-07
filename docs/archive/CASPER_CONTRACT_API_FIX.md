# Casper Contract API Fix

The Magen3 audit registry contract now follows the Casper 5.1.x contract API shape.

## What changed

- `EntryPoint` and `EntryPoints` are imported from `casper_types::addressable_entity`.
- `EntryPointType::Called` is used instead of the older `EntryPointType::Contract` variant.
- `EntryPointPayment::Caller` is provided as the required sixth argument to `EntryPoint::new`.
- `storage::new_contract(...)` is used for the first install instead of manually creating a package and immediately calling `add_contract_version(...)`.
- The `magen3_decisions` dictionary is stored in the contract named keys so `record_decision` can access it from the stored-contract context.

## Build commands

```powershell
pnpm rust:prepare
Remove-Item contracts\magen3-audit-registry\Cargo.lock -Force -ErrorAction SilentlyContinue
Remove-Item contracts\magen3-audit-registry\target -Recurse -Force -ErrorAction SilentlyContinue
pnpm contract:build
pnpm contract:check
```
