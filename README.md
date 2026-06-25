# Magen3

Magen3 is a Web3 execution firewall for autonomous agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions.

This version is a runnable **Vite + React + TypeScript** app using **pnpm**, plus a backend API with an optional **Railway PostgreSQL + Drizzle** persistence layer and a **Casper Testnet audit-contract foundation**.

## Current status

Implemented now:

- Premium Magen3 frontend from the Figma export
- Local backend API using Node's built-in HTTP server
- API health check and bootstrap endpoint
- Mock Casper wallet connection through the backend
- Register Agent API flow
- Create / Activate Policy API flow
- Magen3 rule-based policy decision engine exposed through the API
- Action Review flow with Allowed / Blocked / Review Required decisions
- Record Decision flow with mock Casper transaction hash
- Audit Log backed by API state when backend is running
- PostgreSQL-ready database layer using Drizzle ORM
- Automatic database table creation when `DATABASE_URL` is available
- In-memory fallback when `DATABASE_URL` is missing or unreachable
- Railway deploy config with health check path
- Casper status endpoint and deterministic decision payload builder
- Casper audit registry smart-contract foundation in `contracts/magen3-audit-registry`
- Manual deploy-hash confirmation endpoint for the next wallet/contract wiring step
- Frontend Casper Recorder in the Audit Log drawer
- Runtime-args preview, payload hash display, copy JSON, mock recording, and real deploy-hash confirmation

Next wiring targets:

- Real Casper wallet connection
- Compile/deploy the Casper audit registry contract to Testnet
- Add the deployed contract hash as `MAGEN3_CONTRACT_HASH`
- Replace mock recording with wallet-signed Casper deploys
- Store real Casper deploy hashes in `audit_logs.tx_hash`

## Simple architecture

```text
Frontend
  → Backend API
    → Drizzle ORM
      → PostgreSQL on Railway
    → Casper payload builder
      → Casper Testnet audit registry
```

If no database is connected, the backend uses temporary in-memory storage so development can continue.

## Pages included

- Landing Page
- Dashboard
- Shields
- Agent Shield
- Policies
- Action Review
- Audit Log
- Settings

## Product flow

```text
Connect wallet
→ Register agent
→ Create policy
→ Store policy in Postgres when DATABASE_URL exists
→ Simulate Web3 action
→ Magen3 analyzes policy rules through the API
→ Store action review in Postgres when DATABASE_URL exists
→ Decision: Allowed / Blocked / Review Required
→ Prepare deterministic Casper payload
→ Open Casper Recorder from the Audit Log drawer
→ Preview runtime args and payload hash
→ Mock record for demo mode or paste a real Casper deploy hash after signing
→ Audit log updates with the saved deploy hash
```

## Requirements

- Node.js 20+
- pnpm 10+

If pnpm is not installed yet, enable it with Corepack:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

## Local setup without database

Install dependencies:

```bash
pnpm install
```

Start the backend API in terminal 1:

```bash
pnpm dev:backend
```

Start the frontend in terminal 2:

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

When no `DATABASE_URL` is set, the health response will show:

```json
{
  "storage": "memory"
}
```

## Local setup with PostgreSQL

Create `.env`:

```powershell
Copy-Item .env.example .env
```

Add your database URL:

```env
DATABASE_URL=postgresql://username:password@host:5432/database
DATABASE_SSL=false
```

Then run:

```bash
pnpm dev:backend
```

The backend will automatically create these tables if they do not exist:

```text
agents
policies
action_reviews
audit_logs
```

You can also run the migration command directly:

```bash
pnpm db:migrate
```

## Railway setup

Use Railway for both backend and PostgreSQL.

Recommended Railway variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
CORS_ORIGIN=*
NODE_ENV=production
CASPER_NETWORK=casper-testnet
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_RECORDING_MODE=mock
MAGEN3_CONTRACT_HASH=
```

Railway normally injects `PORT` automatically. The backend supports both `PORT` and `BACKEND_PORT`.

Start command:

```bash
pnpm start
```

Health check path:

```text
/api/health
```

When Railway Postgres is connected, the health response should show:

```json
{
  "storage": "postgres"
}
```


## Casper Recorder workflow

After creating or selecting an audit record:

```text
Audit Log → open record details → Prepare Payload
```

The drawer shows:

```text
Network
Entrypoint
Payload hash
Configured contract hash
Runtime args
```

For the current demo mode, click:

```text
Mock Record
```

When a real Casper deploy has been signed externally or through the next wallet integration step, paste the deploy hash into:

```text
Real Casper Deploy Hash → Confirm Real Deploy Hash
```

The backend then saves that deploy hash in `audit_logs.tx_hash`, so the dashboard and audit log count it as a Casper audit record.

## API endpoints

```text
GET  /api/health
GET  /api/bootstrap
POST /api/wallet/mock-connect
POST /api/agents
POST /api/policies
POST /api/actions/analyze
POST /api/audit-logs
POST /api/audit-logs/:id/record
GET  /api/casper/status
POST /api/audit-logs/:id/casper-payload
POST /api/audit-logs/:id/casper-confirm
```


## Casper audit-contract foundation

This version includes the first Casper integration layer. The backend can prepare the exact decision payload that should be recorded by the Casper contract.

Check Casper configuration:

```text
GET /api/casper/status
```

Prepare a decision payload for a specific audit log:

```text
POST /api/audit-logs/:id/casper-payload
```

After a real Casper deploy is submitted, save its deploy hash:

```text
POST /api/audit-logs/:id/casper-confirm
```

Body:

```json
{
  "deployHash": "real-casper-deploy-hash"
}
```

The smart-contract scaffold is here:

```text
contracts/magen3-audit-registry
```

For now, `POST /api/audit-logs/:id/record` still creates a safe mock transaction hash so the demo remains usable before the contract is deployed.

## Production build

```bash
pnpm build
```

## Preview production build

```bash
pnpm preview
```

## Environment variables

Copy `.env.example` to `.env` when wiring live services:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Package manager note

This project intentionally uses pnpm. Do not commit `package-lock.json` or `yarn.lock`. Run dependency commands with `pnpm`.
