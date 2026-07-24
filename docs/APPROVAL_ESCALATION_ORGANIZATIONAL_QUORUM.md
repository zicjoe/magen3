# Approval Escalation & Organizational Quorum

Approval Escalation & Organizational Quorum is a **Live** control inside:

```text
Agent Shield
→ Policy & Approval Controls
→ Approval Rules
```

It extends the existing exact-bound Human Approval workflow. It does not create a second approval system, change the three Gateway outcomes, sign transactions, or let agents approve their own work.

## Purpose

Real treasury, DAO, protocol, and enterprise workflows often need more than a flat `N-of-M` wallet list. Magen3 can now resolve deterministic approval tiers, require named organizational roles, activate approved backup reviewers after a delay, and constrain when an approved intent may proceed to human-controlled wallet signing.

Example:

- Below 1,000 CSPR: one Treasury approver.
- 1,000–10,000 CSPR: two Treasury approvers.
- Above 10,000 CSPR: two Treasury approvers plus one Security approver, followed by a 30-minute execution delay and a 15-minute signing window.

## Security boundary

- Tier resolution uses only explicit policy rules and normalized intent evidence.
- Every configured amount, action, capability, and contract condition on a tier must match.
- Higher priority and more specific matching tiers win deterministically.
- Group quotas require distinct reviewer wallets.
- The total approval quorum can be raised by role requirements; it is never silently reduced.
- When organizational quorum is enabled, the resolved tier or organizational default determines the approval count instead of inheriting one flat legacy quorum for every tier. Privileged-action policy can still raise that minimum.
- A backup reviewer can satisfy only the original role that explicitly names its backup group.
- Timed escalation adds authorized eligibility; it does not remove the original role requirement.
- Protected intent parameters remain bound by the existing approval SHA-256 binding.
- Cryptographic reviewer signatures remain a separate Foundation Available control pending deployed Casper Wallet verification.
- Magen3 never receives reviewer private keys, execution-wallet secrets, or raw signed transactions.

## Policy fields

All fields live under `structuredRules`:

```json
{
  "approvalWorkflowEnabled": true,
  "approvalWorkflowMode": "Quorum",
  "approvalRequiredCount": 3,
  "approvalExpiryMinutes": 120,
  "approvalOrganizationalQuorumEnabled": true,
  "approvalGroups": [
    {
      "id": "treasury",
      "name": "Treasury",
      "role": "Treasury Approver",
      "wallets": ["01...", "01..."],
      "backupGroupIds": ["backup"]
    },
    {
      "id": "security",
      "name": "Security",
      "role": "Security Approver",
      "wallets": ["01..."]
    },
    {
      "id": "backup",
      "name": "Backup Approvers",
      "role": "Backup Treasury Approver",
      "wallets": ["01..."]
    }
  ],
  "approvalTiers": [
    {
      "id": "high-value",
      "name": "High Value Treasury",
      "priority": 100,
      "minAmount": 10000,
      "actions": ["DAO Treasury Payment"],
      "capabilities": ["Treasury Operations"],
      "requiredGroups": [
        { "groupId": "treasury", "approvals": 2 },
        { "groupId": "security", "approvals": 1 }
      ],
      "requiredApprovals": 3,
      "executionDelaySeconds": 1800,
      "executionWindowSeconds": 900
    }
  ],
  "approvalEscalationRules": [
    {
      "id": "activate-backup-after-15m",
      "name": "Activate treasury backup",
      "afterSeconds": 900,
      "activateBackups": true
    }
  ],
  "approvalEmergencyGroupIds": ["security"],
  "approvalOrganizationDefaults": {
    "requiredGroups": [
      { "groupId": "treasury", "approvals": 1 }
    ],
    "requiredApprovals": 1
  },
  "approvalExecutionDelaySeconds": 0,
  "approvalExecutionWindowSeconds": 0
}
```

### Approver groups

Each group supports:

| Field | Meaning |
| --- | --- |
| `id` | Stable policy identifier. IDs must be unique. |
| `name` | Human-readable group name. |
| `role` | Organizational role shown in approval evidence. |
| `wallets` | Distinct authorized Casper reviewer wallets. |
| `backupGroupIds` | Groups that may satisfy this role only after a rule activates backups. |
| `emergency` | Optional marker for emergency-role documentation. Emergency activation still requires an explicit rule or group reference. |

### Approval tiers

A tier can match:

- `minAmount` and `maxAmount`
- `actions`
- agent `capabilities`
- exact `contracts` or targets

A tier also defines:

- `requiredGroups`
- `requiredApprovals`
- `executionDelaySeconds`
- `executionWindowSeconds`
- tier-specific `escalationRules`

When no tier matches, `approvalOrganizationDefaults` applies. If organizational quorum is enabled without a valid tier or default role requirement, the request becomes `Configuration Required`.

### Escalation rules

An escalation rule supports:

- `afterSeconds`
- `addGroupIds`
- `addApproverWallets`
- `requiredGroups`
- `requiredApprovals`
- `activateBackups`
- `activateEmergencyGroups`

Escalation is evaluated from the approval request creation time. It is persisted and audited. An escalation may add roles or increase quorum, but cannot reduce the already resolved requirements.

## Deterministic resolution

Magen3 resolves a tier in this order:

1. Keep only tiers where every configured condition matches.
2. Prefer higher `priority`.
3. Prefer the more specific tier.
4. Prefer the higher minimum amount.
5. Use stable tier ID ordering as the final deterministic tie-breaker.

The approval request persists the resolved tier so later policy edits cannot silently change the meaning of an already reviewed request.

## Group quorum

A response counts only when:

- The reviewer wallet is currently eligible.
- The reviewer has not already responded.
- Separation-of-duties rules pass.
- The signature verifies when the policy requires cryptographic reviewer signatures.
- The response belongs to a required role, directly or through an activated explicit backup substitution.

Approval becomes `Approved` only when:

- The total distinct verified approval count is reached; and
- Every required role group reaches its own distinct quota.

A reviewer who belongs to multiple groups is still one wallet for total quorum. Magen3 raises the total required count to at least the sum of role quotas so overlapping membership cannot weaken the rule.

## Execution delay and signing window

After quorum completes, Magen3 may set:

- `executionNotBefore`
- `executionWindowEndsAt`
- `executionDelayRemainingSeconds`
- `executionWindowStatus`: `not_started`, `delay`, `open`, or `expired`

`mayProceedToSigning` is true only when the request is Approved, its verified role and total quorum still pass, the delay has elapsed, and the signing window is open.

The execution delay must be shorter than the approval request expiry. An expired signing window requires a fresh intent and approval; it cannot be extended by an agent or MCP client.

## Gateway and SDK evidence

Approval polling exposes sanitized evidence:

```json
{
  "resolvedTier": {
    "id": "high-value",
    "name": "High Value Treasury"
  },
  "groupProgress": [
    {
      "groupId": "treasury",
      "groupName": "Treasury",
      "required": 2,
      "received": 2,
      "remaining": 0,
      "satisfied": true
    }
  ],
  "escalationHistory": [],
  "nextEscalation": null,
  "executionNotBefore": "2026-07-24T10:40:00.000Z",
  "executionWindowEndsAt": "2026-07-24T10:55:00.000Z",
  "executionWindowStatus": "open",
  "mayProceedToSigning": true
}
```

JavaScript, Python, and MCP can poll this state. They cannot define reviewer membership, submit human approval responses, activate an escalation early, shorten a delay, extend a signing window, or sign the blockchain transaction.

## Audit evidence

Audit records include:

- Resolved tier and matching context
- Required total quorum
- Required named groups and role progress
- Direct and backup-group membership for each response
- Activated escalation IDs and timestamps
- Next scheduled escalation
- Execution delay and window
- Configuration errors
- Approval binding hash
- Sanitized cryptographic signature verification evidence where enabled

## Configuration failures

Magen3 returns `Configuration Required` rather than weakening authorization when it detects:

- Duplicate group or tier IDs
- Unknown group references
- A role with insufficient possible distinct reviewers
- Total quorum larger than all possible reviewers
- Invalid amount ranges
- Execution delay that reaches or exceeds approval expiry
- Organizational quorum enabled without a tier or default required-group rule

## Backward compatibility

Legacy policies continue using the existing flat approver list and quorum. Organizational rules activate only when `approvalOrganizationalQuorumEnabled` is explicitly true. Existing approval requests retain their stored workflow context and do not require migration.

## Operational endpoint

```http
GET /api/approval-workflow/status
GET /api/approval-workflow/status?walletAddress=CASPER_PUBLIC_KEY
```

The status response reports organizational request, escalation, delay, and window counts without exposing private key material or raw reviewer signatures.
