# Magen3

Magen3 is a Web3 execution firewall for autonomous agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions.

This version is a runnable **Vite + React + TypeScript** app using **pnpm**, plus a lightweight local backend API. It includes the first working product flow: agent registration, policy activation, action analysis, API-backed audit records, and mock Casper transaction hashes.

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
- Frontend fallback mode when backend is offline

Next wiring targets:

- Persistent database for agents, policies, and audit records
- Real Casper wallet connection
- Casper Testnet smart contract for policy and decision records
- Real Casper deploy hashes instead of generated placeholders

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
→ Simulate Web3 action
→ Magen3 analyzes policy rules through the API
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

## Local setup

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

## Frontend-only fallback

The frontend still works if the backend is not running. In that mode, the top bar shows **Local Fallback**, and the app uses in-memory local state.

For the best demo, run both the backend and frontend.

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
