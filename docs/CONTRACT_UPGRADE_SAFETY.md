# Contract Upgrade Safety

**Status:** Live  
**Protection area:** Contract & Permission Safety  
**Gateway metadata:** `action.contractUpgrade`

Contract Upgrade Safety prevents unauthorized, unexpected, or insufficiently reviewed implementation changes before wallet signing. It reuses Contract Validation, Privileged Action Controls, exact Human Approval binding, organizational quorum, the Security Pipeline, Audit Logs, and Casper decision proofs.

## Metadata

```json
{
  "action": {
    "type": "Contract Interaction",
    "target": "contract-...",
    "entryPoint": "upgrade_to",
    "chainName": "casper-test",
    "privilegedAction": {
      "classifiedAction": "Proxy Upgrade",
      "implementation": "contract-...",
      "network": "casper-test"
    },
    "contractUpgrade": {
      "contract": "contract-...",
      "package": "contract-package-...",
      "currentImplementation": "contract-...",
      "requestedImplementation": "contract-...",
      "currentCodeHash": "64-hex-characters",
      "requestedCodeHash": "64-hex-characters",
      "packageVersion": "2",
      "upgradeAdministrator": "01...",
      "requestedAt": "2026-07-24T10:00:00.000Z",
      "executeAfter": "2026-07-24T10:30:00.000Z",
      "network": "casper-test"
    }
  }
}
```

Do not submit private keys, administrator signatures, wallet approvals, or raw signed transactions.

## Deterministic checks

- Exact target contract or package binding
- Exact network binding
- Current implementation evidence
- Requested implementation structure
- Current/requested implementation difference
- Approved implementation allowlist
- Blocked implementation denylist
- Optional proposed code-hash requirement
- Authorized upgrade administrator
- Configured upgrade delay and `executeAfter`
- Canonical protected-parameter SHA-256 fingerprint
- Exact Human Approval binding
- Configurable minimum approval quorum

## Policy fields

- `contractUpgradeControlsEnabled`
- `contractUpgradeMode`: `Observe`, `Review`, or `Enforce`
- `contractUpgradeApprovedImplementations`
- `contractUpgradeBlockedImplementations`
- `contractUpgradeRequiresApproval`
- `contractUpgradeQuorum`
- `contractUpgradeDelaySeconds`
- `contractUpgradeRequireCodeHash`
- `contractUpgradeRequireAdministrator`
- `contractUpgradeApprovedAdministrators`
- `contractUpgradeUnknownImplementationAction`: `Warn`, `Review`, or `Block`

## Decision behavior

A blocked implementation, target mismatch, malformed implementation, unauthorized administrator, invalid code hash, or invalid delay can produce `Blocked`. Unknown or incomplete evidence follows the configured Observe, Review, or Enforce behavior. When approval is required, the exact fingerprint and minimum quorum are carried into the existing Human Approval workflow.

## Security boundary

Magen3 validates unsigned authorization metadata before signing. Structural validity does not guarantee that an implementation is economically or functionally safe. Code review, bytecode analysis, stateful simulation, and trusted chain-data providers remain separate controls and roadmap work.
