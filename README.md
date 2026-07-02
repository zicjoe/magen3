# Magen3

**Magen3 is a Web3 execution firewall and safety gateway for autonomous agents.**

Magen3 is **not** the agent. It is the external policy, approval, and audit layer that independent AI agents connect to before taking Casper/Web3 actions.

## Current product split

```text
Magen3
→ security gateway / admin dashboard / policies / audit / Casper proof

YieldBot AI or any external agent
→ independent agent app that calls Magen3 before execution
```

## Real-world flow

```text
User connects Casper Wallet to Magen3
→ registers an external agent
→ creates a policy for that agent
→ copies Gateway URL / Agent ID / API key into the external agent
→ external agent receives a user task
→ external agent identifies with Agent ID + API key
→ external agent sends the intended action plus its connected execution wallet to Magen3 Gateway API
→ Magen3 returns Allowed / Blocked / Review Required
→ blocked/review actions stop
→ allowed actions may request wallet signing in the external agent
→ audit and Casper proof are visible in Magen3
```

## What is implemented

- Real Casper Wallet browser-extension connection
- Wallet-scoped agents, policies, and audit logs
- Connected Agents for registered external autonomous agents
- Policy Management for Agent Shield rules
- Agent Gateway API for external agents
- Gateway sync endpoint for external agents: `GET /api/agent-gateway/me?agentId=...`
- Per-agent integration details, API key status, and copyable code snippet inside Connected Agents
- Audit Log with Decision Proof and Execution Proof sections
- Manual proof fallback hidden under Advanced sections
- Backend API using Node's built-in HTTP server
- Railway PostgreSQL support through Drizzle ORM
- Casper Testnet audit registry contract
- Casper deploy helper scripts
- Public config endpoint for gateway/contract metadata

## Removed from the main Magen3 app

The in-app Agent Runner, External Agent demo, and standalone Gateway Integration pages were removed from the main product flow. Those flows now belong in a separate standalone agent app such as YieldBot AI, while gateway setup lives inside each Connected Agents record. Magen3 now stays focused on being the security gateway.

## Live Casper proof

Magen3 audit registry contract on Casper Testnet:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

First real `record_decision` deploy hash:

```text
c95359f46a5709cc10d4e014dadc29b6b9734629b475b5d58f8ba2fa0394f668
```

These are public Testnet values. Never commit or share `secret_key.pem`.

## Requirements

- Node.js 20+
- pnpm 10+
- Casper Wallet browser extension
- PostgreSQL for real persistent storage
- Ubuntu / WSL for Casper CLI deployment commands
- Rust only if rebuilding the Casper contract

Enable pnpm if needed:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

## Local setup

Install dependencies:

```bash
pnpm install
```

Start backend API:

```bash
pnpm dev:backend
```

Start frontend:

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

Backend health:

```text
http://localhost:8787/api/health
```

Public gateway config:

```text
http://localhost:8787/api/public-config
```

## Environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Important local values:

```env
VITE_API_URL=http://localhost:8787
VITE_CASPER_NETWORK=casper-testnet
VITE_CASPER_RPC_URL=https://node.testnet.casper.network/rpc
VITE_MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf

DATABASE_URL=
DATABASE_SSL=false
ALLOW_MEMORY_STORE=false
CASPER_NETWORK=casper-testnet
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=manual-real-deploy
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

For real Railway demo, use PostgreSQL and disable memory fallback:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
ALLOW_MEMORY_STORE=false
NODE_ENV=production
CORS_ORIGIN=*
CASPER_NETWORK=casper-testnet
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=manual-real-deploy
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
PNPM_CONFIG_REGISTRY=https://registry.npmjs.org/
```

## Railway backend settings

```text
Build Command:
node -e "console.log('Magen3 backend build step skipped')"

Start Command:
pnpm start

Health Check Path:
/api/health
```

## Agent Gateway API

External agents call:

```http
GET /api/agent-gateway/me?agentId=MAG-AGENT-...
```

to verify Agent ID + API key and confirm that an active policy exists.

Then they submit action intents to:

```http
POST /api/agent-gateway/intents
```

Agent identity comes from `agentId` plus `x-magen3-agent-key` or `Authorization: Bearer <api-key>`.

The `walletAddress` / `executionWalletAddress` in the request is the execution wallet connected inside the external agent. It does not need to match the Magen3 owner wallet that registered the agent.

Example payload:

```json
{
  "source": "yieldbot-ai",
  "agentId": "MAG-AGENT-...",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to trusted-validator-demo",
  "reason": "YieldBot prepared this action and is requesting approval before execution.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "trusted-validator-demo",
    "targetType": "Trusted Contract"
  }
}
```

Magen3 returns a decision, risk level, audit ID, Casper payload, and whether execution is approved. See `docs/AGENT_GATEWAY_API.md` and `docs/GATEWAY_INTEGRATION.md`.

## Casper contract commands

Prepare Rust toolchain:

```bash
pnpm rust:prepare
```

Build contract:

```bash
pnpm contract:build
pnpm contract:check
```

Generate install command:

```bash
pnpm casper:install:cmd
```

Generate `record_decision` command from a copied payload:

```bash
pnpm casper:record:cmd -- --payload=./payload.json
```

## Demo script

```text
1. Open Magen3
2. Connect real Casper Wallet
3. Register external agent
4. Create policy for that agent
5. Open Connected Agents and copy Agent ID / Gateway URL / API key
6. Open YieldBot AI on its own domain
7. Connect YieldBot to Magen3
8. Ask YieldBot to perform a safe action
9. YieldBot calls Magen3 and receives Allowed
10. Ask YieldBot to perform a risky action
11. YieldBot calls Magen3 and receives Blocked
12. Return to Magen3 Audit Log
13. Show wallet-scoped audit history, Casper proof, and execution proof
```
