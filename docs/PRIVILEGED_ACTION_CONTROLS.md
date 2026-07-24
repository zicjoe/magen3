# Privileged Action Controls

Status: **Live**

Location: **Agent Shield → Contract & Permission Safety → Privileged Actions**

Privileged Action Controls deterministically classify supported administrative smart-contract calls before wallet signing. The control does not label every contract call as privileged and does not use a language model to authorize execution.

## Supported classifications

- Ownership Transfer
- Administrator Change
- Proxy Upgrade
- Implementation Change
- Role Grant
- Role Revoke
- Mint
- Burn
- Pause
- Unpause
- Freeze
- Emergency Withdrawal
- Treasury Withdrawal
- Oracle Replacement
- Fee Recipient Change
- Bridge Validator Change
- Permission Change

A request activates this control when it includes `action.privilegedAction` or when its entry point or method signature matches Magen3's supported deterministic method map. Unrelated generic contract calls are skipped.

## Request metadata

```json
{
  "action": {
    "type": "Contract Interaction",
    "target": "contract-hash-...",
    "entryPoint": "transfer_ownership",
    "chainName": "casper-test",
    "privilegedAction": {
      "classifiedAction": "Ownership Transfer",
      "contract": "contract-hash-...",
      "entryPoint": "transfer_ownership",
      "currentValue": "01...",
      "requestedValue": "01...",
      "recipient": "01...",
      "classifierSource": "my-agent-adapter",
      "classifierVersion": "1.0.0",
      "network": "casper-test"
    }
  }
}
```

Supported fields:

- `classifiedAction`
- `contract`
- `package`
- `entryPoint`
- `methodSignature`
- `currentValue`
- `requestedValue`
- `role`
- `recipient`
- `implementation`
- `classifierSource`
- `classifierVersion`
- `network`

Only unsigned, non-secret metadata belongs in this object. Never send administrator private keys, wallet secrets, signatures, raw signed transactions, or provider credentials.

## Deterministic checks

The control evaluates:

- Supported action classification
- Consistency between adapter classification and the supported method map
- Classifier source and version
- Contract and package binding
- Network binding
- Explicit blocked-action policy
- Review-required action policy
- Approved administrator or privileged recipient policy
- Approved implementation policy
- Required role metadata
- Required positive amount metadata
- Material change between current and requested protected values
- Canonical SHA-256 protected-parameter fingerprint
- Human Approval requirement
- Per-action quorum requirement

Malformed identities, contradictory classifications, blocked actions, target or network mismatches, invalid protected parameters, and prohibited implementations fail closed.

## Policy fields

Privileged Action Controls use the active policy's `structuredRules`:

```json
{
  "privilegedActionControlsEnabled": true,
  "privilegedActionMode": "Review",
  "privilegedActionsRequiringReview": [
    "Ownership Transfer",
    "Proxy Upgrade",
    "Role Grant"
  ],
  "privilegedActionsBlocked": [
    "Emergency Withdrawal"
  ],
  "approvedAdministrators": [
    "01..."
  ],
  "approvedImplementations": [
    "contract-hash-..."
  ],
  "privilegedActionQuorumRules": {
    "Ownership Transfer": 2,
    "Proxy Upgrade": 2
  },
  "unknownPrivilegedAction": "Review"
}
```

Modes:

- `Observe`: record policy-level violations as warnings where the rule is not intrinsically unsafe.
- `Review`: route policy-level violations and review-listed actions to Human Approval.
- `Enforce`: block policy-level violations.

`unknownPrivilegedAction` accepts `Warn`, `Review`, or `Block`.

## Human Approval binding

When a supported action requires review, Magen3 reuses the existing Human Approval workflow:

1. The full normalized original intent is stored.
2. Protected privileged parameters are hashed into `parameterFingerprint`.
3. The approval request binds to the exact audit record and intent.
4. The required approval count is the greater of the base workflow quorum and the action-specific quorum.
5. Magen3 never silently lowers quorum when too few approvers are configured; the request becomes `Configuration Required`.
6. Changing the implementation, recipient, role, amount, contract, method, network, or requested value requires a fresh decision and approval binding.

Current reviewer responses remain wallet-scoped rather than separately cryptographically signed, so Human Approval & Quorum remains **Foundation Available** even though Privileged Action Controls enforcement is Live.

## Structured findings and audit evidence

Findings use the shared model:

- `pass`
- `warning`
- `fail`
- `unavailable`
- `skipped`

Audit records can contain:

- Declared and resolved classification
- Classifier source and version
- Contract, package, entry point, and method signature
- Current and requested protected values
- Role, recipient, and implementation
- Network
- Protected-parameter fingerprint
- Classification status
- Whether approval is required
- Required approval count
- Structured findings and remediation

Raw signing material is rejected and is not persisted.

## Intent Playground

The current release includes:

- Approved privileged mint
- Ownership transfer requiring review
- Unapproved proxy implementation
- Unknown privileged method
- Contradictory privileged classification

For clean results, configure the exact test contract as trusted and provide the relevant approved administrator or implementation in the active policy.

## Compatibility

- Existing Agent IDs and API keys are unchanged.
- Existing policies remain valid. The new control activates only when `privilegedActionControlsEnabled` is explicitly `true`.
- Existing generic contract calls without privileged metadata remain compatible.
- Supported entry points may be classified even without explicit metadata when the policy enables the control.
- No database migration is required because existing JSON audit and structured-policy fields store the additive evidence.
- JavaScript, Python, MCP, Codex, Railway, Vercel, Casper proof, and relayer contracts remain backward compatible.

## Security boundary

Privileged Action Controls prove that Magen3 applied configured deterministic rules to the supplied unsigned intent metadata. They do not prove that an arbitrary unsupported method is harmless, that adapter metadata is universally truthful, that a contract implementation is economically safe, or that a wallet will execute the approved transaction unchanged. Real adapters should supply reliable metadata, and wallet or transaction construction must preserve exact parameter binding.
