# Agent Lifecycle: Revoke and Delete

Magen3 separates emergency access revocation from permanent deletion.

## Revoke agent

Revoke is the immediate security action.

- The Agent ID and API key stop authenticating to the Gateway.
- The agent remains visible in Connected Agents.
- Assigned policies remain available for inspection.
- Audit Logs, approvals, Gateway history, Casper proofs, and execution evidence remain unchanged.

Use revoke when an agent or credential may be compromised, or when execution must stop immediately.

## Permanently delete agent

Permanent deletion is available under:

**Connected Agents → select an agent → Access → Permanently delete agent**

Deletion removes:

- the connected-agent registration;
- the stored API-key hash and preview;
- policies assigned to that agent;
- local onboarding completion state for that agent.

Deletion preserves read-only historical evidence:

- Audit Logs and structured findings;
- Human Approval records and reviewer responses;
- Gateway request history;
- Casper decision-proof and execution-proof evidence;
- completed or resumed emergency-control history.

## Safety requirements

Magen3 permits permanent deletion only when:

1. The agent has already been revoked.
2. No approval request is Pending or Configuration Required.
3. No agent-scoped emergency pause is Active.
4. No execution is submitted, pending, uncertain, replaced, or awaiting signature.
5. The connected owner wallet matches the agent owner.
6. The user types the exact agent name in the confirmation dialog.

These checks run in the backend for both PostgreSQL and memory-store mode. The UI displays the same blockers, but frontend state cannot bypass backend enforcement.

## API

```http
DELETE /api/agents/:agentId
Content-Type: application/json

{
  "walletAddress": "CONNECTED_OWNER_WALLET",
  "confirmation": "Exact Agent Name"
}
```

Successful response:

```json
{
  "ok": true,
  "deletedAgent": {
    "id": "MAG-AGENT-...",
    "name": "Exact Agent Name"
  },
  "deletedPolicyIds": ["POL-..."],
  "preservedEvidence": {
    "auditLogs": 4,
    "approvals": 1,
    "gatewayRequests": 3
  }
}
```

The endpoint does not accept API keys as deletion authority. It requires the connected owner wallet.
