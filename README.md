# Magen3

**Magen3 is a Web3 execution firewall and safety gateway for autonomous agents.**

Magen3 is **not** the agent. It is the external policy, approval, and audit layer that independent AI agents connect to before taking Web3 actions.

## Cross-chain positioning

Magen3 is designed to be chain-agnostic at the policy and gateway layer.

The current MVP uses Casper Testnet as the decision-proof and audit layer. External agents can still describe actions intended for other execution environments in the gateway intent payload. Magen3 reviews the intent before execution, returns `Allowed`, `Blocked`, or `Review Required`, and records the decision proof on Casper.

```text
External agent intent
→ Magen3 Gateway API
→ policy decision
→ target-chain wallet/protocol execution only if allowed
→ Casper decision proof for auditability
```

In production, this model can support adapters for EVM chains, Solana, Casper, and other ecosystems while keeping Casper as the verifiable audit/proof layer.

## Current product split

```text
Magen3
→ security gateway / admin dashboard / policies / audit / Casper decision proof

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
→ external agent sends the intended action, target chain, and connected execution wallet to Magen3 Gateway API
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
- Cross-chain intent convention for target-chain action review
- Gateway sync endpoint for external agents: `GET /api/agent-gateway/me?agentId=...`
- Per-agent integration details, API key status, and copyable code snippet inside Connected Agents
- Agent Skill Kit exports for Claude, Codex `SKILL.md`, custom agents, `.env`, and API snippets
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

## Decision proof vs execution proof

Magen3 tracks two different Casper footprints:

| Proof | Meaning | Blocked action | Allowed action |
| --- | --- | --- | --- |
| Decision Proof Hash | Casper deploy hash proving Magen3 reviewed the intent and recorded Allowed / Blocked / Review Required | Yes | Yes |
| Execution Deploy Hash | Casper deploy hash proving the execution wallet actually signed/submitted the approved action | No | Only after signing |

Blocked and review-required actions should not have execution hashes. They can still have decision proof hashes because Magen3 can prove what it stopped.

## Automatic decision proof recording

Every Agent Gateway decision is recordable. Magen3 does not use a "recommended events only" rule.

When an external agent submits an intent, Magen3:

```text
validates Agent ID + API key
checks the assigned policy
creates the database audit record
queues/attempts the Casper record_decision proof
stores the returned Decision Proof Hash when the relayer succeeds
```

If the backend relayer is not configured, the audit record stays queued with a decision payload hash and relayer note. Magen3 does not create fake deploy hashes.

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
CASPER_RECORDING_MODE=relayer
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
CASPER_RECORDING_MODE=relayer
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
CASPER_CLIENT_BIN=casper-client
CASPER_RELAYER_SECRET_KEY_B64=
CASPER_RELAYER_SECRET_KEY_PEM=
CASPER_RELAYER_SECRET_KEY_PATH=
CASPER_CALL_PAYMENT_MOTES=5000000000
NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
PNPM_CONFIG_REGISTRY=https://registry.npmjs.org/
```

Use exactly one relayer key source. Keep it backend-only and fund the relayer account with Casper Testnet CSPR.

Relayer options:

```env
CASPER_RECORDING_MODE=relayer
CASPER_CLIENT_BIN=casper-client
CASPER_RELAYER_SECRET_KEY_B64=
CASPER_RELAYER_SECRET_KEY_PEM=
CASPER_RELAYER_SECRET_KEY_PATH=
CASPER_CALL_PAYMENT_MOTES=5000000000
```

For Railway, prefer `CASPER_RELAYER_SECRET_KEY_B64` and leave `CASPER_RELAYER_SECRET_KEY_PATH` and `CASPER_RELAYER_SECRET_KEY_PEM` unset. Generate it from WSL or Linux with:

```bash
head -1 ~/magen3-relayer/secret_key.pem
tail -1 ~/magen3-relayer/secret_key.pem
base64 -w 0 ~/magen3-relayer/secret_key.pem
```

The first and last commands should show PEM headers like `BEGIN PRIVATE KEY` and `END PRIVATE KEY`. Paste only the single-line base64 output into Railway. Do not paste `public_key_hex`, the file path, quotes, or a manually copied multiline key into `CASPER_RELAYER_SECRET_KEY_B64`.

## Railway backend settings

```text
Builder:
Dockerfile

Start Command:
pnpm start

Health Check Path:
/api/health
```

The Dockerfile installs Rust and `casper-client` so the backend decision-proof relayer can run `casper-client put-deploy` on Railway. If Railway is left on Nixpacks, decision proof recording fails with `spawn casper-client ENOENT`.

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

For transfer intents, `targetType: "Wallet Address"` is supported. Add trusted recipient wallet addresses to the policy's trusted targets list when those transfers should be allowed automatically within the policy limits. Unknown or untrusted wallet recipients still require review or are blocked depending on risk mode.

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
