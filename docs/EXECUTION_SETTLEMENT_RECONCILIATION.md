# Execution & Settlement Reconciliation

**Protection area:** Execution Integrity  
**Control status:** Foundation Available  
**Milestone:** Phase 3, milestone 13

Execution & Settlement Reconciliation tracks what happened after Magen3 authorized an intent. It preserves the authorization-to-finality timeline, prevents unsafe duplicate submissions, links replacement transactions, and records confirmation, delivery, refund, or failure evidence in the existing Audit Log.

The control remains **Foundation Available**, not Live. Magen3 now includes authenticated reporting and optional Casper/EVM RPC polling, but Live status still requires configured providers and a deployed end-to-end test proving real submission, polling, finality, retry prevention, replacement behavior, and final Audit updates.

## Security boundary

Magen3 accepts only public execution-state evidence. Never send:

- private keys, seed phrases, or mnemonics;
- raw or signed transactions;
- wallet signatures;
- signed x402 payment payloads;
- sponsor or Paymaster credentials;
- arbitrary RPC URLs.

The polling endpoint uses backend-configured RPC endpoints only. Request bodies cannot choose a provider URL, preventing the endpoint from becoming an SSRF proxy.

## States

The canonical states are:

| State | Meaning |
|---|---|
| `not_submitted` | No blockchain submission has been recorded. |
| `submitted` | A transaction identifier is bound and submission was reported. |
| `pending` | The transaction exists but has not satisfied finality requirements. |
| `confirmed` | Required confirmations or explicit finality were reached. |
| `failed` | Execution failed with a recorded reason. |
| `uncertain` | The outcome cannot be established safely, including finality timeout. |
| `replaced` | The original transaction is linked to an explicit replacement. |
| `refunded` | A refund transaction or reconciled refund state was recorded. |
| `delivered` | Finality and the required resource/destination delivery were recorded. |

Existing aliases such as `executed`, `settled`, and existing x402 settlement names are normalized for backward compatibility.

## Deterministic controls

The reconciliation state machine enforces:

- Agent API-key authentication and audit ownership.
- Execution only for an `Allowed` decision or an exact-bound, currently executable approved review.
- Transaction-hash binding across updates.
- Canonical comparison of Casper hash prefixes and `0x` forms.
- Monotonic state transitions.
- Maximum submission attempts.
- Higher attempt numbers for retries after failure.
- No new attempt while the previous execution is pending or uncertain.
- Explicit replacement permission and replacement identity.
- Required confirmations or explicit finality.
- Finality deadline and automatic transition to `uncertain` after timeout.
- Resource delivery only after execution confirmation.
- Refund tracking.
- Append-only reconciliation history, capped to the latest 100 events.
- Rejection of signing material and secrets.

## Policy fields

These fields live in the active policy's `structuredRules` object:

```json
{
  "reconciliationEnabled": true,
  "maximumSubmissionAttempts": 3,
  "pendingRetryAction": "Block",
  "uncertainRetryAction": "Block",
  "requiredConfirmations": 1,
  "finalityTimeoutSeconds": 3600,
  "replacementAllowed": true,
  "resourceDeliveryRequired": false
}
```

Legacy policies use additive, non-breaking defaults. Reconciliation does not require existing agents, keys, or policies to be recreated.

## Authenticated reporting endpoint

```http
POST /api/agent-gateway/executions/reconcile
x-magen3-agent-key: <agent-key>
Content-Type: application/json
```

Example submission report:

```json
{
  "agentId": "MAG-AGENT-...",
  "auditLogId": "AUD-...",
  "status": "submitted",
  "transactionHash": "a0f1...64-hex-characters...",
  "attempt": 1,
  "chainName": "casper-test",
  "provider": "casper-wallet",
  "providerReference": "submission-opaque-reference"
}
```

Example confirmation report:

```json
{
  "agentId": "MAG-AGENT-...",
  "auditLogId": "AUD-...",
  "status": "confirmed",
  "transactionHash": "a0f1...64-hex-characters...",
  "attempt": 1,
  "confirmations": 2,
  "finalized": true,
  "observedAt": "2026-07-26T12:00:00.000Z",
  "provider": "trusted-casper-adapter"
}
```

Example replacement report:

```json
{
  "agentId": "MAG-AGENT-...",
  "auditLogId": "AUD-ORIGINAL-...",
  "status": "replaced",
  "attempt": 1,
  "replacementTransactionHash": "b0f2...64-hex-characters...",
  "replacementAuditLogId": "AUD-REPLACEMENT-..."
}
```

The replacement audit must belong to the same connected agent and must differ from the original audit.

## Optional polling endpoint

```http
POST /api/agent-gateway/executions/poll
x-magen3-agent-key: <agent-key>
Content-Type: application/json
```

```json
{
  "agentId": "MAG-AGENT-...",
  "auditLogId": "AUD-...",
  "chainFamily": "casper",
  "chainName": "casper-test"
}
```

`transactionHash` is optional when it is already bound to the audit. Supported `chainFamily` values are `casper` and `evm`. Do not send `rpcUrl`, `rpcEndpoint`, `providerUrl`, or `endpoint`; these fields are rejected.

### Polling environment variables

```env
# Disabled by default
RECONCILIATION_POLLING_ENABLED=true

# Casper polling. Existing CASPER_RPC_URL is used when the dedicated value is absent.
RECONCILIATION_CASPER_RPC_URL=https://node.testnet.casper.network/rpc

# Optional EVM polling for EVM execution adapters.
RECONCILIATION_EVM_RPC_URL=https://approved-evm-rpc.example

# 1,000–60,000 milliseconds; default 10,000.
RECONCILIATION_POLL_TIMEOUT_MS=10000
```

Only HTTPS endpoints are accepted, except localhost HTTP for local development. Public status responses expose configuration booleans, never endpoint URLs or credentials.

## Audit and pipeline updates

Reconciliation updates the existing Audit Log with:

- execution status and transaction hash;
- attempt count;
- confirmations and required confirmations;
- finality deadline and finalized time;
- replacement links;
- failure reason;
- settlement, resource-delivery, and refund status;
- provider label and last-checked time;
- normalized current reconciliation record;
- append-only history;
- `Execution Submitted`, `Execution Confirmed or Failed`, and `Settlement Reconciled` pipeline stages;
- a structured `Execution & Settlement Reconciliation` finding.

New audit records appear through the existing automatic audit refresh path; wallet reconnection and full-page refresh are not required.

## SDKs

### TypeScript

```ts
await client.reportExecutionReconciliation({
  auditLogId: "AUD-...",
  status: "pending",
  transactionHash: "0x...",
  attempt: 1,
  confirmations: 0,
});

await client.pollExecutionReconciliation({
  auditLogId: "AUD-...",
  chainFamily: "casper",
  chainName: "casper-test",
});
```

### Python

```python
client.report_execution_reconciliation({
    "auditLogId": "AUD-...",
    "status": "pending",
    "transactionHash": "0x...",
    "attempt": 1,
})

client.poll_execution_reconciliation({
    "auditLogId": "AUD-...",
    "chainFamily": "casper",
    "chainName": "casper-test",
})
```

## MCP tools

- `magen3_report_execution_reconciliation`
- `magen3_poll_execution_reconciliation`

The polling tool selects only a backend-configured Casper or EVM adapter. It cannot provide an RPC URL or bypass the reconciliation state machine.

## x402 compatibility

The existing `POST /api/agent-gateway/x402/settlements` route remains supported. x402 settlement updates now also populate the general reconciliation fields and timeline while preserving the existing x402 request fingerprint, facilitator reference, delivery state, and route contract.

## Live criteria still outstanding

The control can move to Live only after all of the following are verified in a deployed environment:

1. Real authorized transaction submission.
2. Real Casper or supported EVM state polling.
3. Confirmation and finality behavior under the configured network.
4. Duplicate retry prevention while pending and uncertain.
5. Replacement transaction linking and final tracking.
6. Final Audit Log update without manual refresh or wallet reconnection.
7. Provider outage and timeout behavior.
8. Railway and Vercel end-to-end verification.
