# Magen3

**Magen3 is a Web3 execution firewall and security gateway for autonomous agents.**

Magen3 sits between agent intent and blockchain execution. External agents send proposed actions to the Magen3 Gateway before wallet signing. Magen3 checks the action against the active policy, returns `Allowed`, `Blocked`, or `Review Required`, and records the decision for auditability with Casper Testnet proofs.

Magen3 is not the agent. It is the policy, approval, and audit layer that independent AI agents connect to before they take Web3 actions.

## Problem Statement

Web3 systems fail when unsafe execution reaches wallets, contracts, bridges, DAOs, or oracle-driven workflows before a policy check happens. Wallet drainers, compromised contracts, risky bridge routes, oracle manipulation, DAO treasury mistakes, and AI-agent execution errors all share the same core issue: the transaction is often evaluated too late.

Magen3 is designed to reduce preventable execution failures by enforcing policy before execution. It does not claim to prevent every exploit. Its role is to add a programmable security gateway between intent and signing.

## Product Model

```text
External agent intent
-> Magen3 Gateway API
-> policy decision
-> target-chain wallet/protocol execution only if allowed
-> Casper decision proof for auditability
```

Magen3 is chain-agnostic at the gateway and policy layer. Casper Testnet is the current proof and audit layer. External agents can still describe actions intended for Casper, EVM chains, Solana, or other execution environments in the gateway intent payload.

## Current Product Split

```text
Magen3
-> security gateway, admin dashboard, policies, audit logs, Casper decision proofs

External agents
-> independent apps that call Magen3 before requesting wallet signing
```

## Shield Modules

Agent Shield is live. The other Shield modules are preview modules that show the broader security platform direction.

| Group | Modules | Status |
| --- | --- | --- |
| Execution Shields | Agent Shield, Wallet Shield, Contract Shield, DAO Shield | Agent Shield live; others preview |
| Infrastructure Shields | Bridge Shield, Oracle Shield, Access Shield | Preview |
| Intelligence Shields | RWA Shield, Simulation Shield, Threat Intel Shield | Preview |

## Connected Agents

Connected Agents are external AI apps, bots, or autonomous systems allowed to call Magen3.

The flow is:

```text
Connect owner wallet
-> register external agent
-> copy Agent ID, Gateway URL, Verify URL, and one-time API key
-> create or attach a policy to that agent
-> external agent calls Magen3 before wallet signing
```

## API Key Model

- API keys are one key per Connected Agent.
- API keys are not global for the whole app.
- API keys are not one key per policy.
- Policies attach to agents.
- Raw API keys are shown once after registration or rotation.
- If the raw key is lost, rotate the key from Connected Agents.

Agent identity comes from `agentId` plus `x-magen3-agent-key` or `Authorization: Bearer <api-key>`.

## Policy Model

Policies define what an agent is allowed to do. A policy can define transaction limits, daily limits, trusted targets, blocked action types, approval thresholds, and risk mode.

If an agent has no active policy, Magen3 fails closed and does not approve execution.

## Decision Proof vs Execution Proof

Magen3 tracks two different proof concepts:

| Proof | Meaning | Can exist for blocked actions? | Created by |
| --- | --- | --- | --- |
| Casper Decision Proof | Proves Magen3 reviewed the intent and recorded `Allowed`, `Blocked`, or `Review Required` | Yes | Magen3 relayer or manual proof flow |
| Execution Proof | Proves the execution wallet signed/submitted the real transaction | No | External wallet or execution layer |

Blocked and review-required actions should not have execution hashes. They can still have decision proofs because Magen3 can prove what it stopped or escalated.

## Agent Gateway API

Verify a connected agent:

```http
GET /api/agent-gateway/me?agentId=MAG-AGENT-...
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

Submit an intent:

```http
POST /api/agent-gateway/intents
x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json
```

```json
{
  "source": "yieldbot-ai",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "The agent prepared this action and needs Magen3 approval before execution.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}
```

The execution wallet in the request can differ from the Magen3 owner wallet. The owner wallet manages the connected agent and policy in Magen3; the execution wallet signs in the external agent after approval.

## Implemented Surface

- Landing page with Docs access from landing navigation.
- Dashboard with gateway/proof status.
- Grouped Shield Modules.
- Connected Agents registration, per-agent API keys, rotation, revoke flow, and copyable integration details.
- Policies attached to agents.
- Audit Logs with Casper Decision Proof and Execution Proof fields.
- Settings with workspace and environment information.
- In-app Docs with architecture, quick start, shield modules, API keys, gateway examples, security model, case study, proofs, troubleshooting, and FAQ.
- Backend Agent Gateway API with Node HTTP server.
- PostgreSQL storage through Drizzle ORM.
- Casper Testnet audit registry support and relayer configuration.
- Vercel-ready Vite SPA routing.
- Railway-ready backend deployment.

## Local Setup

Requirements:

- Node.js 20+
- pnpm 10+
- Casper Wallet browser extension
- PostgreSQL for persistent storage
- Rust only if rebuilding the Casper contract

Enable pnpm if needed:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

Install dependencies:

```bash
pnpm install
```

Start the backend:

```bash
pnpm dev:backend
```

Start the frontend:

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

## Environment Variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Key values:

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

## Railway Backend Notes

Use PostgreSQL and keep memory fallback disabled:

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

Use exactly one relayer key source. Keep the relayer key backend-only and fund the relayer account with Casper Testnet CSPR.

Railway settings:

```text
Builder:
Dockerfile

Start Command:
pnpm start

Health Check Path:
/api/health
```

The Dockerfile installs Rust and `casper-client` so the backend decision-proof relayer can run `casper-client put-deploy` on Railway. If Railway is left on Nixpacks, decision proof recording can fail with `spawn casper-client ENOENT`.

## Vercel Frontend Notes

The frontend is a Vite SPA. `vercel.json` keeps all routes pointed to `index.html` so direct navigation and refresh work.

Set:

```env
VITE_API_URL=https://YOUR_RAILWAY_BACKEND_URL
```

## Casper Contract Commands

Prepare Rust:

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

Generate a `record_decision` command from a copied payload:

```bash
pnpm casper:record:cmd -- --payload=./payload.json
```

## Documentation

Current product documentation lives in:

- `docs/README.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`

Older implementation notes are kept under `docs/archive/` when they are useful for project history but should not be treated as current public product documentation.
