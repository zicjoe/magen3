# Human Approval & Quorum

Human Approval & Quorum turns a deterministic `Review Required` decision into a controlled workflow under **Policy & Approval Controls**.

It does not create a separate product or bypass the three Magen3 decision outcomes. The original Gateway decision remains `Review Required`; the approval workflow determines whether that exact reviewed intent may later continue to human-controlled wallet signing before expiry.

## Status

**Foundation Available**

Implemented today:

- Exact-intent SHA-256 binding
- Single-approver and quorum modes
- Authorized approver wallet lists
- Optional owner-wallet fallback
- Approval expiry
- Separation-of-duties policy
- Required rejection comments
- Duplicate-response prevention
- Immediate rejection finality
- Audit and Security Pipeline updates
- Agent polling by approval ID or audit ID
- Execution-hash rejection until quorum completes
- Approval invalidation after expiry

Security boundary:

- Approval responses are currently scoped to configured Casper public-key addresses and the connected Magen3 application workflow.
- Casper Wallet does not provide a generic message-signing flow in the integration used by this project; cryptographic approver attestations remain a future hardening step.
- Magen3 never signs or broadcasts the blockchain transaction. A completed workflow permits only the next human-controlled wallet-signing step.

Because of that boundary, the module is not labeled Live yet.

## End-to-end flow

```text
External agent submits intent
→ Magen3 authenticates agent
→ Active policy produces Review Required
→ Magen3 stores the audit record
→ Magen3 computes an exact-intent approval binding hash
→ Approval request enters Pending state
→ Authorized wallets approve or reject
→ Quorum reached before expiry
→ Approval becomes Approved
→ Agent polls approval status
→ Unchanged intent may continue to wallet signing
→ Execution hash is attached after the real transaction is submitted
```

A changed amount, target, execution wallet, action, policy, or original intent produces a different binding hash and requires a new Gateway decision.

## Policy fields

Approval settings live under `structuredRules`:

```json
{
  "approvalWorkflowEnabled": true,
  "approvalWorkflowMode": "Quorum",
  "approvalRequiredCount": 2,
  "approvalApproverWallets": [
    "01...",
    "01..."
  ],
  "approvalExpiryMinutes": 60,
  "approvalAllowOwnerFallback": true,
  "approvalSeparationOfDuties": true,
  "approvalRequireRejectComment": true
}
```

### Fields

| Field | Meaning |
| --- | --- |
| `approvalWorkflowEnabled` | Creates an approval request when the final decision is Review Required. |
| `approvalWorkflowMode` | `Single` or `Quorum`. |
| `approvalRequiredCount` | Number of distinct approvals required, from 1 to 10. |
| `approvalApproverWallets` | Casper public keys permitted to respond. |
| `approvalExpiryMinutes` | Time window before the exact approval expires. |
| `approvalAllowOwnerFallback` | Adds the agent-owner wallet when no separate approver list is sufficient. |
| `approvalSeparationOfDuties` | Prevents the execution wallet from approving its own request. |
| `approvalRequireRejectComment` | Requires a reason when rejecting. |

For Treasury Operations and Enterprise Automation, the registration wizard recommends Quorum mode. Other starter policies default to a single approval while remaining editable.

## Approval states

| State | Meaning |
| --- | --- |
| `Configuration Required` | Workflow is enabled but no eligible approver is available. |
| `Pending` | Waiting for distinct authorized responses. |
| `Approved` | Required quorum completed before expiry. |
| `Rejected` | An authorized approver rejected the exact request. |
| `Expired` | The approval window ended before execution. |

A rejected or expired request cannot be revived. Submit a new intent to obtain a new decision and binding.

## Gateway response

A Review Required response can include:

```json
{
  "result": {
    "decision": "Review Required"
  },
  "approval": {
    "id": "APR-...",
    "auditLogId": "AUD-...",
    "reviewStatus": "Pending",
    "bindingHash": "<sha256>",
    "requiredApprovals": 2,
    "approvalsReceived": 0,
    "remainingApprovals": 2,
    "expiresAt": "2026-07-23T12:00:00.000Z",
    "mayProceedToSigning": false
  }
}
```

## Agent polling

Agents can poll by approval ID or audit ID using their existing Agent ID and API key:

```http
GET /api/agent-gateway/approvals/APR-OR-AUDIT-ID?agentId=MAG-AGENT-ID
x-magen3-agent-key: YOUR_AGENT_KEY
```

The response includes `reviewStatus`, quorum progress, expiry, exact binding, and `mayProceedToSigning`.

TypeScript:

```ts
const status = await client.getApproval(response.approval.id);
if (!status.approval.mayProceedToSigning) {
  // Stop. Do not sign or execute.
}
```

Python:

```python
status = client.get_approval(response["approval"]["id"])
if not status["approval"]["mayProceedToSigning"]:
    # Stop. Do not sign or execute.
    pass
```

MCP:

```text
magen3_get_approval
```

## Reviewer workflow

Authorized reviewers use:

```text
Policies
→ Human Approval Queue
```

The queue shows:

- Agent and action
- Amount and destination
- Policy and reason
- Quorum progress
- Exact-intent binding hash
- Expiry
- Previous responses
- Approve or Reject controls

The connected wallet must match a configured approver. Duplicate responses are rejected. A rejection comment is enforced when the policy requires one.

## Audit evidence

Approval evidence is stored alongside the original audit record:

- Approval request ID
- Approval state
- Binding hash
- Required and received approvals
- Expiry and resolution timestamps
- Security Pipeline stage
- Execution state

The original `Review Required` decision is preserved. Approval does not rewrite it to `Allowed`; it records that the exact reviewed request completed its separate human authorization workflow.

## Execution boundary

Before accepting an execution hash, Magen3 checks either:

1. The original decision was `Allowed`, or
2. The original decision was `Review Required` and its approval request is still `Approved` and unexpired.

Blocked, rejected, pending, configuration-required, and expired requests cannot attach execution proof.

## Operational endpoint

```http
GET /api/approval-workflow/status
```

With wallet-scoped counts:

```http
GET /api/approval-workflow/status?walletAddress=CASPER_PUBLIC_KEY
```

The endpoint reports pending, approved, rejected, and expired requests and repeats the current cryptographic-signature limitation.

## Recommended production posture

- Use distinct approver wallets for treasury and enterprise agents.
- Enable separation of duties when the execution wallet must not self-approve.
- Use short approval windows for high-risk actions.
- Require rejection comments.
- Never treat an approval as a wallet signature.
- Re-run Magen3 when any protected parameter changes.
- Keep the workflow in Foundation status until cryptographic approver attestations are added and independently tested.
