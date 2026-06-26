# Casper Build Locks

Magen3 uses pinned Rust/Cargo dependencies for the Casper smart contract build.

## Why

Casper contract crates use low-level `no_std` Rust/Wasm patterns. Newer Rust nightlies can break those internals, while some newer transitive dependencies now require Rust 2024. To keep the build reproducible, the project pins both the Rust nightly and specific transitive crates.

## Current pinned build setup

```text
Rust toolchain: nightly-2024-08-01
Target: wasm32-unknown-unknown
casper-contract: 5.1.1
casper-types: 6.1.0
base64ct: 1.6.0
zeroize: 1.8.1
```

## Clean rebuild

```powershell
pnpm rust:prepare
Remove-Item contracts\magen3-audit-registry\Cargo.lock -Force -ErrorAction SilentlyContinue
Remove-Item contracts\magen3-audit-registry\target -Recurse -Force -ErrorAction SilentlyContinue
pnpm contract:build
pnpm contract:check
```
