# Magen3

Magen3 is a Web3 execution firewall for autonomous agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions.

This version is a runnable **Vite + React + TypeScript** app using **pnpm**, plus a backend API with an optional **Railway PostgreSQL + Drizzle** persistence layer.

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

Next wiring targets:

- Railway-hosted backend API
- Railway PostgreSQL service using `DATABASE_URL`
- Real Casper wallet connection
- Casper Testnet smart contract for policy and decision records
- Real Casper deploy hashes instead of generated placeholders

## Simple architecture

```text
Frontend
  → Backend API
    → Drizzle ORM
      → PostgreSQL on Railway
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
→ Record decision with mock Casper hash
→ Audit log updates
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
DATABASE_URL=<Railway Postgres connection string>
DATABASE_SSL=true
CORS_ORIGIN=<your frontend URL>
BACKEND_PORT=8787
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
```

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
