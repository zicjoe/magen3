# Magen3 Casper Deployment Playbook

This guide turns the current Magen3 mock recorder into a real Casper Testnet audit flow.

The goal is:

```text
Magen3 decision → Casper runtime args → signed Casper deploy → deploy hash saved in PostgreSQL
```

## What this version gives you

- A complete Rust contract package scaffold for the Magen3 audit registry
- A build command for the contract Wasm
- A command generator for installing the contract on Casper Testnet
- A command generator for calling `record_decision` with a prepared Magen3 payload
- Backend support for confirming and saving the real deploy hash

## 1. Install local tools

You need Rust and `casper-client` on the machine where you will build/deploy the contract.

Check Rust:

```powershell
rustc --version
cargo --version
```

Add the Wasm target:

```powershell
rustup target add wasm32-unknown-unknown
```

Check Casper client:

```powershell
casper-client --version
```

## 2. Build the Magen3 audit registry contract

From the project root:

```powershell
pnpm contract:build
pnpm contract:check
```

Expected Wasm path:

```text
contracts/magen3-audit-registry/target/wasm32-unknown-unknown/release/magen3_audit_registry.wasm
```

## 3. Prepare your deploy environment

Create `.env` from `.env.example`, then set these values locally:

```env
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_CHAIN_NAME=casper-test
CASPER_SECRET_KEY_PATH=./keys/secret_key.pem
CASPER_INSTALL_PAYMENT_MOTES=150000000000
CASPER_CALL_PAYMENT_MOTES=5000000000
```

Do not commit private keys or `.env`.

## 4. Print the contract install command

```powershell
pnpm casper:install:cmd
```

Copy the printed command into your terminal and run it.

After the deploy finalizes, query your account named keys and find:

```text
magen3_audit_registry_contract
```

That is the contract hash for Magen3.

## 5. Add the contract hash to Railway

In Railway → `magen3` service → Variables, set:

```env
CASPER_RECORDING_MODE=manual
MAGEN3_CONTRACT_HASH=hash-your-real-contract-hash
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_CHAIN_NAME=casper-test
```

Redeploy the backend.

Check:

```text
https://your-railway-backend-url.up.railway.app/api/casper/status
```

You want `contractConfigured` to be `true`.

## 6. Prepare a real decision payload

In the app:

```text
Audit Log → open record → Prepare Payload → Copy JSON
```

Save it locally as:

```text
payload.json
```

## 7. Print the record_decision command

```powershell
pnpm casper:record:cmd -- --payload=./payload.json
```

Run the printed `casper-client put-deploy` command.

## 8. Confirm the deploy hash in Magen3

After Casper returns a deploy hash:

```text
Audit Log → open same record → Real Casper Deploy Hash → Confirm Real Deploy Hash
```

Magen3 saves that deploy hash in PostgreSQL.

## 9. Demo line

For the buildathon video, say:

> Magen3 prepares a deterministic audit payload for every firewall decision. The decision is recorded through a Casper Testnet deploy, and the resulting deploy hash is saved back into the Magen3 audit log for transparent proof of execution.

## Current limitation

This version uses a manual Casper deploy flow. That is acceptable for getting the first real Testnet proof working. The next version can replace the manual step with wallet-signed deploys from the frontend.
