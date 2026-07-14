# Casper Deployment Playbook

Magen3 currently uses Casper Testnet as the decision-proof and audit layer. The gateway and policy layer are chain-agnostic, but the decision proof records are anchored through the deployed Magen3 audit registry contract on Casper Testnet.

## Deployed Contract

| Item | Value |
| --- | --- |
| Network | `casper-testnet` |
| Chain name | `casper-test` |
| Entry point | `record_decision` |
| Contract hash | `b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf` |
| Runtime contract hash | `hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf` |
| Contract package hash | `ab9d4d27b6851b7656e421780257bb7abe6427d2e4cccb16c012c453bd4282c7` |

Never commit or share relayer private keys.

## Representative Decision Proofs

These Casper Testnet deploys demonstrate the three decisions produced by the live Agent Shield. They are policy decision proofs, not the separate wallet-signed execution transactions.

| Decision | Deploy hash | Explorer |
| --- | --- | --- |
| `Allowed` | `3db936eded9355b7397833757314fbed28e9077b8a53851ef84adaaa6cdfc239` | [View on CSPR.live](https://testnet.cspr.live/deploy/3db936eded9355b7397833757314fbed28e9077b8a53851ef84adaaa6cdfc239) |
| `Blocked` | `002bbc461b277c1eb154550f765ed15f5e63732ce4d497c60866260e3e018807` | [View on CSPR.live](https://testnet.cspr.live/deploy/002bbc461b277c1eb154550f765ed15f5e63732ce4d497c60866260e3e018807) |
| `Review Required` | `439c0be2842cbbaf685665a9569c83094a2ced0fb51233f3f7d9fc585aaac851` | [View on CSPR.live](https://testnet.cspr.live/deploy/439c0be2842cbbaf685665a9569c83094a2ced0fb51233f3f7d9fc585aaac851) |

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
