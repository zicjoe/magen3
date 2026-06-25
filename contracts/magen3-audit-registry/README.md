# Magen3 Audit Registry — Casper Contract Foundation

This folder contains the Casper smart-contract foundation for Magen3.

The contract has one core job:

> Store an auditable hash/status of every Magen3 security decision on Casper Testnet.

For the hackathon MVP, the backend already prepares a deterministic payload for each decision. The next blockchain step is to deploy this contract to Casper Testnet and call `record_decision` with the payload runtime arguments.

## Contract entrypoint

`record_decision`

Stores:

- decision ID
- wallet address
- agent ID
- shield type
- action type
- decision: Allowed / Blocked / Review Required
- risk level
- risk score
- amount
- target
- policy used
- reason hash
- payload hash

The raw sensitive explanation does not need to be stored on-chain. The contract stores a proof/hash trail.

## Backend endpoints already prepared

- `GET /api/casper/status`
- `POST /api/audit-logs/:id/casper-payload`
- `POST /api/audit-logs/:id/casper-confirm`

`casper-payload` returns the runtime args expected by this contract.
`casper-confirm` saves the real Casper deploy hash after the transaction is sent.

## MVP recording mode

Until the deployed contract hash is added, the app can still use mock recording mode:

```env
CASPER_RECORDING_MODE=mock
MAGEN3_CONTRACT_HASH=
```

After deployment:

```env
CASPER_RECORDING_MODE=manual
MAGEN3_CONTRACT_HASH=hash-...
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
```
