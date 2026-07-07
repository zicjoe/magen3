# Magen3 Casper Testnet Integration Plan

Magen3 now has the foundation for real Casper Testnet audit recording.

## Current v6 status

Done:

- Backend prepares deterministic Casper runtime arguments for every audit decision.
- Backend exposes Casper status and payload endpoints.
- Backend can save a real Casper deploy hash after a transaction is submitted.
- Contract source scaffold exists in `contracts/magen3-audit-registry`.
- Contract Cargo project and helper scripts are available for manual Testnet deployment.

Still to wire next:

- Compile/deploy the Casper contract to Testnet.
- Add the deployed contract hash to Railway as `MAGEN3_CONTRACT_HASH`.
- Connect a browser Casper wallet or backend signer to submit deploys directly.

## Endpoints

### Check Casper config

```text
GET /api/casper/status
```

### Prepare payload for an audit decision

```text
POST /api/audit-logs/:id/casper-payload
```

Returns:

- decision payload
- payload hash
- contract entrypoint
- runtime args
- configured network/RPC/contract hash

### Save real Casper deploy hash

```text
POST /api/audit-logs/:id/casper-confirm
Content-Type: application/json

{
  "deployHash": "your-real-casper-deploy-hash"
}
```

## Railway variables

```env
CASPER_NETWORK=casper-testnet
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=mock
MAGEN3_CONTRACT_HASH=
```

After contract deployment:

```env
CASPER_RECORDING_MODE=manual
MAGEN3_CONTRACT_HASH=hash-your-deployed-contract-hash
```


## Deployment helper scripts

```bash
pnpm contract:build
pnpm contract:check
pnpm casper:install:cmd
pnpm casper:record:cmd -- --payload=./payload.json
```

See `docs/CASPER_DEPLOYMENT_PLAYBOOK.md` for the full step-by-step process.
