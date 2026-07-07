# Casper Deployment Playbook

Magen3 currently uses Casper Testnet as the decision-proof and audit layer. The gateway and policy layer are chain-agnostic, but the decision proof records are anchored through the deployed Magen3 audit registry contract on Casper Testnet.

## Contract

Current contract hash:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

Never commit or share relayer private keys.

## Environment

```env
CASPER_NETWORK=casper-testnet
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=relayer
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
CASPER_CLIENT_BIN=casper-client
CASPER_RELAYER_SECRET_KEY_B64=
CASPER_RELAYER_SECRET_KEY_PEM=
CASPER_RELAYER_SECRET_KEY_PATH=
CASPER_CALL_PAYMENT_MOTES=5000000000
```

Use exactly one relayer key source. For Railway, prefer `CASPER_RELAYER_SECRET_KEY_B64`.

## Build Contract

```bash
pnpm rust:prepare
pnpm contract:build
pnpm contract:check
```

## Generate Commands

Install command:

```bash
pnpm casper:install:cmd
```

Record decision command from a copied payload:

```bash
pnpm casper:record:cmd -- --payload=./payload.json
```

## Railway Notes

Use the Dockerfile builder so `casper-client` is available to the backend relayer.

```text
Builder:
Dockerfile

Start Command:
pnpm start

Health Check Path:
/api/health
```

If Railway uses Nixpacks instead of the Dockerfile, decision proof recording can fail with `spawn casper-client ENOENT`.
