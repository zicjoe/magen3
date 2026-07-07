# Real Data and Wallet-Scoped Activity

Magen3 now treats the connected Casper public key as the tenant boundary.

## What changed

- Agents are created under the connected wallet.
- Policies can only be created for agents owned by the connected wallet.
- Audit logs are only returned for the connected wallet.
- Agent Gateway requests are evaluated against the wallet address submitted by the external agent.
- Seed/demo agents, seed policies, and seed audit logs are no longer inserted into the database.
- The backend no longer falls back to temporary memory storage unless `ALLOW_MEMORY_STORE=true` is explicitly set.
- Local/automatic mock Casper recording is disabled. Use `Prepare Payload`, sign a real Casper deploy, then confirm the real deploy hash.

## Real user flow

1. User connects Casper Wallet.
2. Magen3 loads only records where `wallet_address` or agent ownership matches that public key.
3. User registers an agent under that wallet.
4. User creates policy for that agent.
5. External agent sends an intent with the same `agentId` and `walletAddress`.
6. Magen3 checks only that wallet's registered agents, policies, and audit history.
7. Magen3 returns Allowed / Blocked / Review Required to the external agent.
8. Magen3 stores the audit record for that wallet only.
9. User prepares Casper payload and confirms the real Casper deploy hash.

## Production env expectations

Railway should have:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
CASPER_RECORDING_MODE=manual-real-deploy
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
ALLOW_MEMORY_STORE=false
```

Do not set `ALLOW_MEMORY_STORE=true` on the real Railway demo service.
