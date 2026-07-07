# Casper Rust Troubleshooting

## `cargo` is not recognized
Install Rust with `rustup-init.exe`, then close and reopen PowerShell.

## `casper-contract 4.0.0` build error
If the build output says `Compiling casper-contract v4.0.0`, the project is still using the older contract dependency or an old lockfile.

Run:

```powershell
cd c:\dev\magen3
pnpm contract:doctor
Get-Content contracts\magen3-audit-registry\Cargo.toml
```

The contract dependency lines should be:

```toml
casper-contract = "5.1.1"
casper-types = "6.1.0"
```

If `Cargo.lock` exists and pins the old crate, remove it:

```powershell
Remove-Item contracts\magen3-audit-registry\Cargo.lock -Force -ErrorAction SilentlyContinue
Remove-Item contracts\magen3-audit-registry\target -Recurse -Force -ErrorAction SilentlyContinue
pnpm contract:build
```

## Nightly toolchain
This project's `contract:build` script uses `cargo +nightly`.

Install nightly and the Wasm target:

```powershell
rustup toolchain install nightly
rustup target add wasm32-unknown-unknown --toolchain nightly
```


## Final pinned build fix

Magen3 now pins the Casper contract build to `nightly-2024-08-01` and pins `base64ct` to `=1.6.0`. This avoids two opposite compatibility issues:

1. Newer Rust nightlies reject the internal `#[no_mangle]` handler used inside `casper-contract`.
2. Older Casper-compatible nightlies cannot parse newer `base64ct` releases that require Rust 2024 / Cargo 1.85+.

Use this exact reset before building:

```powershell
cd c:\dev\magen3
rustup toolchain install nightly-2024-08-01
rustup target add wasm32-unknown-unknown --toolchain nightly-2024-08-01
Remove-Item contracts\magen3-audit-registry\Cargo.lock -Force -ErrorAction SilentlyContinue
Remove-Item contracts\magen3-audit-registry\target -Recurse -Force -ErrorAction SilentlyContinue
pnpm contract:build
pnpm contract:check
```

The successful build should show `base64ct v1.6.0`, not `base64ct v1.8.3`.


## Fixed dependency pins

Magen3 pins the Casper contract build to `nightly-2024-08-01` and pins transitive RustCrypto crates that moved to Rust 2024:

```toml
base64ct = "=1.6.0"
zeroize = "=1.8.1"
```

If Cargo still downloads `base64ct v1.8.x` or `zeroize v1.9.x`, delete the contract lockfile and target folder, then rebuild:

```powershell
Remove-Item contracts\magen3-audit-registry\Cargo.lock -Force -ErrorAction SilentlyContinue
Remove-Item contracts\magen3-audit-registry\target -Recurse -Force -ErrorAction SilentlyContinue
pnpm contract:build
```
