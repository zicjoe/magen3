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
- Deterministic organizational tier resolution
- Named approver groups and role-specific quorum
- Timed backup and emergency escalation
- Execution delays and bounded signing windows

Security boundary:

- Signature-enabled policies require a one-time Casper Wallet message signature from each counted reviewer.
- Challenges bind the exact approval, response, reviewer, nonce, chain, domain, and expiry.
- Magen3 verifies Ed25519 and Secp256k1 signatures and stores only hashes plus verification metadata.
- Legacy policies remain unsigned unless the operator enables the new field.
- Magen3 never signs or broadcasts the blockchain transaction. A completed workflow permits only the next human-controlled wallet-signing step.

The control remains Foundation Available until the real deployed browser flow is verified end to end.

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
  "approvalRequireRejectComment": true,
  "requireCryptographicReviewerSignature": true,
  "approvalSignatureLifetimeSeconds": 300,
  "requireReviewerChainBinding": true,
  "requireApprovalDomainSeparation": true,
  "approvalSignatureChainName": "casper-test"
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
| `requireCryptographicReviewerSignature` | Requires a verified Casper Wallet message signature before a response counts. |
| `approvalSignatureLifetimeSeconds` | One-time challenge lifetime from 30 to 1800 seconds. |
| `requireReviewerChainBinding` | Binds the signed challenge to the configured Casper chain. |
| `requireApprovalDomainSeparation` | Binds signatures to `magen3.approval-response.v1`. |
| `approvalSignatureChainName` | Expected Casper chain name, such as `casper-test`. |

For Treasury Operations and Enterprise Automation, the registration wizard recommends Quorum mode. Other starter policies default to a single approval while remaining editable.

## Organizational approval rules

When `approvalOrganizationalQuorumEnabled` is true, the workflow additionally resolves named groups and deterministic tiers from `approvalGroups`, `approvalTiers`, `approvalOrganizationDefaults`, and `approvalEscalationRules`. The public approval response includes `resolvedTier`, `groupProgress`, escalation evidence, execution-delay state, execution-window state, and the final `mayProceedToSigning` authorization.

A request is not Approved until both total distinct quorum and every required role quota pass. Activated backup reviewers may satisfy only the roles that explicitly designate their group. Execution remains blocked during a configured delay and after the signing window expires. See `APPROVAL_ESCALATION_ORGANIZATIONAL_QUORUM.md` for the complete policy contract.

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

The response includes `reviewStatus`, total and role quorum progress, resolved tier, escalation history, execution delay/window state, expiry, exact binding, and `mayProceedToSigning`.

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
- Resolved organizational tier and named role progress
- Timed escalation and backup-reviewer state
- Execution delay and signing-window state
- Exact-intent binding hash
- Expiry
- Previous responses
- Approve or Reject controls

The connected wallet must match a configured approver. For signature-enabled requests, Magen3 creates a one-time challenge, opens Casper Wallet message signing, verifies the signer and exact challenge bytes, then records the response. Duplicate responses and replayed challenges are rejected. A rejection comment is enforced when the policy requires one.

## Audit evidence

Approval evidence is stored alongside the original audit record:

- Approval request ID
- Approval state
- Binding hash
- Required and received approvals
- Resolved tier, required groups, direct membership, and backup substitutions
- Escalation history and next escalation
- Execution delay and signing window
- Expiry and resolution timestamps
- Security Pipeline stage
- Execution state
- Signature-required state
- Reviewer signature verification result and timestamp
- Signature algorithm and hash
- Challenge, nonce, domain, and chain hashes/bindings

The original `Review Required` decision is preserved. Approval does not rewrite it to `Allowed`; it records that the exact reviewed request completed its separate human authorization workflow.

## Execution boundary

Before accepting an execution hash, Magen3 checks either:

1. The original decision was `Allowed`, or
2. The original decision was `Review Required`, its approval request is still `Approved`, all named role and total quorum rules pass, its delay has elapsed, and its signing window is still open.

Blocked, rejected, pending, configuration-required, and expired requests cannot attach execution proof.

## Operational endpoint

```http
GET /api/approval-workflow/status
```

With wallet-scoped counts:

```http
GET /api/approval-workflow/status?walletAddress=CASPER_PUBLIC_KEY
```

The endpoint reports pending, approved, rejected, expired, signature-enabled, organizational, escalated, delayed, and open-window counts plus the cryptographic and organizational security boundaries.

## Recommended production posture

- Use distinct approver wallets for treasury and enterprise agents.
- Enable separation of duties when the execution wallet must not self-approve.
- Use short approval windows for high-risk actions.
- Require rejection comments.
- Treat reviewer message signing and execution transaction signing as separate security boundaries.
- Re-run Magen3 when any protected parameter changes.
- Keep the workflow in Foundation status until the deployed Casper Wallet signing flow is independently verified end to end.
