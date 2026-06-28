# Magen3

**Magen3 is a Web3 execution firewall for autonomous agents.**

It checks important Web3 actions before execution, classifies the action as **Allowed**, **Blocked**, or **Review Required**, stores the audit trail in the backend database, and anchors the final decision on **Casper Testnet**.

## Buildathon status

Magen3 now has the full MVP proof flow working:

```text
Connect real Casper Wallet
→ Register AI agent
→ Create Agent Shield policy
→ Review a Web3 action
→ Generate a Magen3 risk decision
→ Store the audit record in PostgreSQL / fallback memory
→ Deploy Casper audit registry contract
→ Record a real decision on Casper Testnet
→ Confirm and display Casper proof in Audit Log
```

## Live Casper proof

Deployed Magen3 audit registry contract on Casper Testnet:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

First real `record_decision` deploy hash:

```text
c95359f46a5709cc10d4e014dadc29b6b9734629b475b5d58f8ba2fa0394f668
```

These are public Testnet values. Never commit or share `secret_key.pem`.

## What is implemented

- Premium Vite + React + TypeScript frontend
- Real Casper Wallet browser-extension connection
- Agent Shield flow for registering AI agents
- Policy creation and activation
- Rule-based Magen3 policy engine
- Action review flow with Allowed / Blocked / Review Required decisions
- Audit Log with Casper Proof section
- Backend API using Node's built-in HTTP server
- Railway PostgreSQL support through Drizzle ORM
- Automatic database table creation when `DATABASE_URL` exists
- In-memory fallback when the database is unavailable
- Casper Testnet audit contract in `contracts/magen3-audit-registry`
- Casper deploy helper scripts
- Manual real deploy-hash confirmation for signed Casper transactions
- Dashboard demo-readiness checklist

## Product flow

```text
Wallet connects
→ Agent Shield registers the autonomous agent
→ Policy defines allowed limits and blocked actions
→ Action Review simulates a requested Web3 action
→ Magen3 analyzes policy, amount, target, risk, and permissions
→ Decision is created
→ Audit Log stores the decision
→ Casper payload is prepared
→ record_decision is sent to Casper Testnet
→ Audit Log displays the real Casper deploy hash and explorer link
```

## Requirements

- Node.js 20+
- pnpm 10+
- Casper Wallet browser extension for real wallet connect
- Ubuntu / WSL for Casper CLI deploy commands
- Rust for building the Casper contract

Enable pnpm if needed:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

## Local frontend/backend setup

Install dependencies:

```bash
pnpm install
```

Start backend API in terminal 1:

```bash
pnpm dev:backend
```

Start frontend in terminal 2:

```bash
pnpm dev
```

Open:

```text
http://localhost:5173
```

Backend health check:

```text
http://localhost:8787/api/health
```

## Environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Important values:

```env
VITE_API_URL=http://localhost:8787
VITE_CASPER_NETWORK=casper-testnet
VITE_CASPER_RPC_URL=https://node.testnet.casper.network/rpc
VITE_MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf

CASPER_NETWORK=casper-testnet
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=mock
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

For Railway, set `DATABASE_URL=${{Postgres.DATABASE_URL}}` and `DATABASE_SSL=true`.

## Railway backend settings

Use these service settings:

```text
Build Command:
node -e "console.log('Magen3 backend build step skipped')"

Start Command:
pnpm start

Health Check Path:
/api/health
```

Recommended Railway variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
NODE_ENV=production
CORS_ORIGIN=*
CASPER_NETWORK=casper-testnet
CASPER_CHAIN_NAME=casper-test
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=mock
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

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

Use this route during the demo:

```text
1. Open Magen3 landing page
2. Launch App
3. Connect real Casper Wallet
4. Register an AI agent in Agent Shield
5. Create and activate a policy
6. Go to Action Review
7. Simulate a Web3 action
8. Show Magen3 decision: Allowed / Blocked / Review Required
9. Open Audit Log
10. Open the audit record
11. Show Casper Proof: contract hash, deploy hash, network, explorer link
```

See `docs/DEMO_WALKTHROUGH.md` and `docs/BUILDATHON_SUBMISSION.md` for the final presentation script and submission copy.

## v16: Agent Runner Demo

Magen3 now includes an **Agent Runner** page. This lets the demo show a goal-driven AI agent flow instead of only manual action entry.

Flow:

```text
Agent goal → Generated Web3 action → Magen3 policy review → Decision → Audit log → Casper proof
```

The Agent Runner is safe for MVP testing: it does not move funds or execute transactions directly. It creates structured action requests and forces them through Agent Shield before they can be recorded.

Example goals:

```text
Stake 15 CSPR to trusted-validator-demo
Transfer 9000 CSPR to unknown-wallet
Call unknown contract to mint 5000 tokens
Claim 8 CSPR rewards from trusted staking contract
```

See `docs/AGENT_RUNNER_DEMO.md` for the full demo flow.



## Agent Gateway API

Magen3 now includes a real Agent Gateway endpoint for external AI agents:

```http
POST /api/agent-gateway/intents
```

External agents send structured Web3 intents to this endpoint before wallet signing or contract execution. Magen3 checks the active policy, creates an audit log, and returns a Casper `record_decision` payload. See `docs/AGENT_GATEWAY_API.md`.

## v18: Real External Agent Client

Magen3 now includes a small real external-agent test client:

```text
examples/real-agent-client
```

This client does not use the app UI. It sends structured action intents directly to:

```http
POST /api/agent-gateway/intents
```

Run it locally:

```bash
pnpm dev:backend
pnpm agent:test:safe
pnpm agent:test:risky
pnpm agent:test:review
```

Run a custom goal:

```bash
pnpm agent:test -- --goal "Stake 15 CSPR to 0xStakingContract123"
```

This gives the demo a real external-agent flow:

```text
External agent client → Magen3 Gateway API → decision → audit log → Casper payload
```

The latest Casper payload is saved to:

```text
examples/real-agent-client/last-casper-payload.json
```

Use it with:

```bash
pnpm casper:record:cmd -- --payload=./examples/real-agent-client/last-casper-payload.json
```

See `docs/REAL_AGENT_CLIENT.md` for the full test flow.

## v19: External Agent Demo

v19 adds a customer-facing external agent demo at **External Agent** in the sidebar.

This screen demonstrates the real Magen3 product flow: a user interacts with their own AI agent, the agent calls the Magen3 Gateway API before execution, Magen3 returns Allowed / Blocked / Review Required, and the response is shown back inside the agent chat while Magen3 stores the audit trail and Casper proof.

Demo script:

```text
Open Magen3 dashboard → confirm the agent and policy
Open External Agent → ask YieldBot to stake 15 CSPR
YieldBot calls Magen3 Gateway → Magen3 allows the action
Ask YieldBot to transfer 9000 CSPR to an unknown wallet
YieldBot calls Magen3 Gateway → Magen3 blocks the action
Open Audit Log → show the decision and Casper proof section
```

## v20: Real data and wallet-scoped activity

Magen3 no longer shows global seeded activity to every user. The connected Casper public key now scopes the product experience:

- a connected wallet only sees its own agents, policies, and audit logs;
- agents are registered under the connected wallet;
- policies can only be created for agents owned by that wallet;
- external agent gateway requests are evaluated against the wallet address sent by the external agent;
- mock/seed agents, policies, and audit logs are no longer inserted;
- automatic local mock Casper recording is disabled.

For real demo/production, keep PostgreSQL enabled and do not use temporary memory storage. See `docs/REAL_DATA_WALLET_SCOPING.md`.


## v21 Railway migration health fix

This version keeps the real-data wallet scoping from v20 and adds compatibility migrations for Railway databases that were created by older Magen3 versions. It adds missing `owner_wallet_address`, `wallet_address`, and `tx_hash` columns before startup queries run, preventing Railway health checks from failing during the v20 upgrade.

### Approved Execution Proof

Magen3 now separates the audit trail into two real-world proofs:

- **Decision Proof**: the Magen3 policy decision recorded on Casper through `record_decision`.
- **Execution Proof**: the real Casper deploy hash from the approved transaction after the wallet owner signs.

For demo purposes, the External Agent page now behaves like a customer-owned agent: it asks Magen3 for permission first, receives Allowed / Blocked / Review Required feedback, and only Allowed actions can receive an execution deploy hash. Blocked and Review Required actions cannot be marked as executed.

See `docs/APPROVED_EXECUTION_FLOW.md`.
