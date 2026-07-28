# Agent Deletion Implementation Report

## Summary

This release adds a permanent agent-deletion workflow while preserving Magen3's security history and keeping revocation as the immediate incident-response control.

## Product behaviour

Connected Agents → Access now contains a single danger zone with two distinct actions:

- **Revoke Agent** — immediately disables Gateway access but keeps the registration visible.
- **Delete Agent** — permanently removes the revoked registration, API credential material, and assigned policies.

The deletion dialog explains retained and removed data, lists blocking conditions, requires the exact agent name, and disables confirmation until all safeguards are satisfied.

## Backend

Added:

- `DELETE /api/agents/:agentId`
- `backend/lib/agentDeletion.mjs`
- `deleteAgent` in PostgreSQL and memory stores
- DELETE in CORS allowed methods

Backend enforcement requires:

- owner-wallet match;
- exact-name confirmation;
- prior revocation;
- no pending/configuration-required approvals;
- no active agent-scoped pause;
- no unresolved or signature-awaiting execution.

PostgreSQL deletion removes assigned policies first to satisfy the existing foreign key, then deletes the agent registration in one database transaction.

## Preserved evidence

Deletion does not remove:

- audit logs;
- gateway request records;
- action-review and approval records;
- approval signature challenges;
- Casper proof evidence;
- execution reconciliation history;
- inactive emergency-pause history.

Historical records already carry the agent name, policy name, wallet scope, findings, decision and proof evidence needed for later review.

## Frontend

Updated:

- `src/app/App.tsx`
- `src/app/lib/api.ts`

The Connected Agents Access tab now provides the deletion action and guarded confirmation dialog. Successful deletion removes the agent and assigned policies from live state and clears its local onboarding credential acknowledgement.

## Database and deployment

No database migration is required. Existing tables and foreign keys are preserved.

No new environment variables are required.

Railway and Vercel configuration are unchanged.

## Tests

Added:

- `backend/lib/agentDeletion.test.mjs`
- `backend/lib/agentDeletion.gateway.integration.test.mjs`

Coverage includes:

- active-agent deletion rejection;
- operational blocker reporting;
- exact-name confirmation;
- revoke-before-delete requirement;
- policy removal;
- agent removal;
- audit and Gateway-history preservation;
- post-deletion Gateway rejection.
