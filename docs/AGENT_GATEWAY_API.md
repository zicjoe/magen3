# Magen3 Agent Gateway API

Magen3 is a modular execution firewall for autonomous blockchain agents. External agents call the Gateway before requesting wallet signing or blockchain execution. Agent Shield authenticates the agent, loads its configuration and active policy, runs deterministic protection checks, returns **Allowed**, **Blocked**, or **Review Required**, stores an audit record, and submits a Casper Decision Proof when the relayer is configured.

## Authentication

Every registered agent has its own API key.

- The Agent ID and API key identify one registered external agent.
- Policies attach to agents; they do not have separate API keys.
- Raw API keys are shown once after registration or rotation.
- Magen3 stores the credential hash and a masked preview, not the recoverable raw key.

Send the key with either header:

```http
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

or:

```http
Authorization: Bearer YOUR_AGENT_API_KEY
```

## Verify Agent

```http
GET /api/agent-gateway/me?agentId=MAG-AGENT-...
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

The response confirms the registered agent, execution capabilities, active policy, and whether the Gateway is ready for that identity.

```json
{
  "ok": true,
  "agent": {
    "id": "MAG-AGENT-...",
    "name": "YieldBot AI",
    "status": "Active",
    "executionCapabilities": ["Trading", "Wallet Management", "dApp Interactions"],
    "apiKeyPreview": "mg3_live_...f91a"
  },
  "activePolicy": {
    "id": "POL-...",
    "name": "DeFi Automation Policy",
    "status": "Active"
  },
  "gatewayReady": true,
  "endpoint": "/api/agent-gateway/intents"
}
```

## Submit Intent

```http
POST /api/agent-gateway/intents
x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json
```

```json
{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "executionWalletAddress": "01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "goal": "Transfer 5 CSPR to an approved wallet",
  "reason": "The agent prepared this action and needs Magen3 approval before execution.",
  "action": {
    "type": "Transfer",
    "amount": 5,
    "asset": "CSPR",
    "target": "01bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "targetType": "Wallet Address",
    "lifecycle": {
      "intentId": "intent:transfer-20260723-0001",
      "idempotencyKey": "idempotency:transfer-20260723-0001",
      "createdAt": "2026-07-23T10:00:00.000Z",
      "expiresAt": "2026-07-23T10:10:00.000Z",
      "attempt": 0
    }
  }
}
```

`executionWalletAddress` is the wallet that would sign the real action after an Allowed decision. It must be a structurally valid Casper Ed25519 or Secp256k1 public key. `walletAddress` remains accepted for compatibility and should describe the same execution wallet.

For `Transfer`, `targetType` must be `Wallet Address`. The destination must be a supported Casper public key or `account-hash-...` identifier. The Trusted Targets list, transaction limits, daily spending, and review threshold are then evaluated by live Wallet Validation.

### Contract intent

```json
{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "executionWalletAddress": "01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "goal": "Call an approved vault contract",
  "action": {
    "type": "Contract Interaction",
    "amount": 0,
    "asset": "CSPR",
    "target": "contract-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "targetType": "Trusted Contract",
    "contractIdentifierType": "Contract Hash",
    "entryPoint": "deposit",
    "chainName": "casper-test"
  }
}
```

Contract Validation applies to `Contract Interaction`, `Swap`, `Deposit to Vault`, `RWA Proof Update`, `Oracle Data Update`, and requests using a contract-oriented target type.

- `contractIdentifierType` accepts `Contract Hash` or `Package Hash`.
- Explicit `contract-...`, `contract-hash-...`, `contract-package-...`, `contract-package-hash-...`, and `package-...` identifiers are supported.
- Generic `hash-...` or raw 64-character hashes require `contractIdentifierType` because the bytes alone do not distinguish a contract from a package.
- `entryPoint` is required for contract-call actions.
- `contractVersion` is optional for Package Hash calls and must be a positive integer.
- `chainName` is optional for backward compatibility; when present, it must match the backend `CASPER_CHAIN_NAME`.
- The `Trusted Contract` label does not grant approval. The exact identifier must appear in the policy's Trusted Targets.
- `structuredRules.blockedContracts` always blocks exact matches.
- `structuredRules.allowedEntryPoints` optionally restricts callable methods.

### Lifecycle and replay metadata

New integrations should include `action.lifecycle` so Magen3 can bind the decision to one exact business intent and prevent duplicate execution:

```json
{
  "intentId": "intent:transfer-20260723-0001",
  "idempotencyKey": "idempotency:transfer-20260723-0001",
  "sequence": 42,
  "createdAt": "2026-07-23T10:00:00.000Z",
  "expiresAt": "2026-07-23T10:10:00.000Z",
  "attempt": 0
}
```

Lifecycle & Replay is Live inside the Execution Integrity protection area. Magen3 computes a canonical SHA-256 fingerprint over the protected parameters and checks prior audit records for reused intent IDs, reused or mutated idempotency keys, duplicate fingerprints, reused transaction hashes, expired authorization, sequence rollback, unsafe retries, and already confirmed execution.

`retryOf` and `replacementOf` must reference a prior Magen3 audit ID owned by the same agent. Do not set both. A non-zero `attempt` requires one of those references. `intentFingerprint` is optional; when supplied, it must exactly match Magen3's independently computed fingerprint.

Existing integrations remain accepted. Legacy policies do not silently activate strict duplicate-fingerprint enforcement; new starter policies enable the lifecycle controls with secure defaults.

### Execution preflight metadata

Add an optional `action.preflight` object after the execution adapter has prepared transaction-construction values:

```json
{
  "paymentAmountMotes": "5000000000",
  "gasPriceTolerance": 1,
  "ttl": "30m",
  "timestamp": "2026-07-22T10:00:00.000Z",
  "slippageBps": 300,
  "expectedOutput": 9.8,
  "minimumReceived": 9.5,
  "runtimeArgs": {
    "amount": "1000000000"
  },
  "transactionHash": "optional-64-character-hex-hash"
}
```

Execution Simulation is **Foundation Available**. It validates supplied construction metadata and can block malformed or expired requests. It does not claim that the transaction executed against Casper global state. Omitted legacy fields remain backward compatible and produce explained warnings rather than an implicit simulation pass.

Never send private keys, secret keys, seed phrases, wallet approvals, transaction-level signatures, or raw signed transactions to the intent endpoint. Such material is rejected before normalization and is not stored in the audit log. Public contract arguments may be represented only inside `action.preflight.runtimeArgs`.

### Threat Intelligence evaluation

Threat Intelligence is **Foundation Available** and requires an operator-configured feed. The Gateway normalizes the submitted execution wallet and target when they are supported wallet, account-hash, Contract Hash, or Package Hash identifiers, then performs deterministic exact matching. It does not derive related identities or claim that a no-match target is safe.

Policy behavior is read from `structuredRules`:

```json
{
  "threatIntelligenceMode": "Review",
  "threatIntelligenceMinConfidence": 70,
  "threatIntelligenceUnavailableAction": "Warn"
}
```

A fresh feed can produce a pass or a structured match finding. A stale or unavailable feed produces `unavailable` or `fail` according to policy and is never counted as a pass. The response exposes only sanitized source and indicator evidence; provider credentials are never returned.


### Oracle Validation evaluation

Oracle Validation is **Foundation Available**. For price-sensitive actions, the external agent can include `action.outputAsset` and an `action.oracle` object:

```json
{
  "outputAsset": "USD",
  "oracle": {
    "baseAsset": "CSPR",
    "quoteAsset": "USD",
    "executionPrice": 0.025,
    "quoteTimestamp": "2026-07-22T15:00:00.000Z"
  }
}
```

The backend operator configures the feed; agents never submit provider credentials. The active policy controls maximum quote age, maximum price deviation, maximum source spread, minimum confidence, minimum sources, validation mode, and unavailable-feed behavior. Exact asset-pair matching is used and a stale or unavailable feed never counts as a pass.

### Bridge Controls evaluation

Bridge Controls is **Foundation Available**. Bridge and cross-chain transfer intents can include `action.bridge`:

```json
{
  "type": "Bridge",
  "amount": 10,
  "asset": "CSPR",
  "target": "contract-package-hash-...",
  "targetType": "Bridge Contract",
  "contractIdentifierType": "Package Hash",
  "chainName": "casper-test",
  "bridge": {
    "sourceChain": "casper-test",
    "destinationChain": "ethereum-sepolia",
    "provider": "Reviewed Bridge Adapter",
    "routeId": "route-001",
    "destinationAddress": "0x0000000000000000000000000000000000000001",
    "asset": "CSPR",
    "feeBps": 50,
    "expectedOutput": 9.95,
    "minimumReceived": 9.8,
    "quoteTimestamp": "2026-07-22T15:00:00.000Z",
    "quoteExpiresAt": "2026-07-22T15:05:00.000Z",
    "sourceConfirmations": 2,
    "destinationConfirmations": 12
  }
}
```

The active policy controls approved providers, source and destination chains, blocked destination chains, allowed assets, maximum amount and fee, quote freshness and expiry, confirmation requirements, enforcement mode, and unavailable-metadata behavior. The response includes structured Bridge Controls findings and `bridgeControlsContext`.

Magen3 validates submitted route metadata only. It does not certify bridge provider solvency, liquidity, contract safety, destination finality, or cross-chain delivery.

### x402 Payment Controls evaluation

x402 Payment Controls is **Foundation Available**. An x402 payment uses an EVM or Solana payment wallet independently from the connected Casper owner wallet:

```json
{
  "executionWalletAddress": "0x2222222222222222222222222222222222222222",
  "action": {
    "type": "x402 Payment",
    "amount": 1,
    "asset": "USDC",
    "target": "https://api.example.com/data",
    "targetType": "x402 Merchant",
    "x402": {
      "version": 2,
      "scheme": "exact",
      "resourceUrl": "https://api.example.com/data",
      "method": "GET",
      "merchantDomain": "api.example.com",
      "payTo": "0x1111111111111111111111111111111111111111",
      "asset": "USDC",
      "network": "eip155:84532",
      "facilitator": "https://x402.org/facilitator",
      "amountAtomic": "1000000",
      "maxTimeoutSeconds": 300,
      "requirementsReceivedAt": "2026-07-23T12:00:00.000Z",
      "requestId": "payment-001",
      "paymentRequiredHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "settlementStatus": "not_submitted",
      "settlementAttempt": 0
    }
  }
}
```

`action.target` must equal the canonical `resourceUrl`, and `targetType` must be `x402 Merchant`. The display amount must equal the value derived from `amountAtomic` and the policy's `x402AssetDecimals`. For unsafe HTTP methods, include `requestBodyHash`.

After a real payment attempt, reconcile the Allowed audit record:

```http
POST /api/agent-gateway/x402/settlements
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

```json
{
  "agentId": "MAG-AGENT-...",
  "auditLogId": "AUD-...",
  "status": "confirmed",
  "requestFingerprint": "64-character-fingerprint-returned-by-Magen3",
  "transactionHash": "0x64-character-transaction-hash",
  "attempt": 1,
  "resourceDelivered": true
}
```

Never send `PAYMENT-SIGNATURE`, private keys, mnemonics, signed payment payloads, wallet approvals, or secret-bearing URLs. See [`X402_PAYMENT_CONTROLS.md`](X402_PAYMENT_CONTROLS.md).

### Compliance Controls evaluation

Compliance Controls is **Foundation Available**. Actions covered by the active policy may include non-sensitive evidence under `action.compliance`:

```json
{
  "originatorJurisdiction": "NG",
  "beneficiaryJurisdiction": "GB",
  "counterpartyType": "VASP",
  "originatorAttestation": {
    "status": "Verified",
    "provider": "Reviewed Identity Provider",
    "reference": "att_originator_123",
    "issuedAt": "2026-07-22T12:00:00.000Z",
    "expiresAt": "2026-07-23T12:00:00.000Z"
  },
  "beneficiaryAttestation": {
    "status": "Verified",
    "provider": "Reviewed Identity Provider",
    "reference": "att_beneficiary_456",
    "issuedAt": "2026-07-22T12:00:00.000Z",
    "expiresAt": "2026-07-23T12:00:00.000Z"
  },
  "travelRule": {
    "status": "Complete",
    "reference": "travel_rule_789",
    "dataHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "screening": {
    "status": "Clear",
    "provider": "Reviewed Screening Provider",
    "reference": "screening_123",
    "screenedAt": "2026-07-22T12:00:00.000Z"
  },
  "riskRating": "Low",
  "originatorVaspId": "vasp-originator",
  "beneficiaryVaspId": "vasp-beneficiary"
}
```

The Gateway rejects raw names, dates of birth, identity-document and tax identifiers, addresses, contact information, documents, selfies, and biometric data. Verification providers retain personal data; Magen3 accepts only statuses, provider labels, opaque references, timestamps, jurisdiction codes, and hashes.

The active policy controls required actions, attestation and screening requirements, Travel Rule threshold, jurisdiction and counterparty rules, accepted providers, freshness, maximum risk rating, enforcement mode, and unavailable-evidence behavior. An optional operator-configured feed provides exact wallet, account-hash, contract/package, VASP-ID, and jurisdiction matches. A clear result or feed no-match is not a guarantee of legal compliance.

## Decision Response

The top-level response preserves the existing contract and adds structured explanation data inside `result` and `auditLog`.

```json
{
  "ok": true,
  "executionApproved": true,
  "result": {
    "decision": "Allowed",
    "risk": "Low",
    "riskScore": 18,
    "reason": "The action matches the active policy.",
    "primaryReason": "The action matches the active policy.",
    "triggeredRule": "Policy checks passed",
    "suggestedResolution": "Request wallet signing and record the execution hash after submission.",
    "recommendedAction": "Request wallet signature before execution",
    "capabilityContext": ["Trading", "Wallet Management", "dApp Interactions"],
    "modulesEvaluated": ["Identity and Authentication", "Policy Enforcement", "Wallet Validation", "Contract Validation", "Execution Simulation", "Execution Integrity", "Threat Intelligence", "Oracle Validation", "Bridge Controls", "Compliance Controls", "Risk Assessment"],
    "moduleFindings": [
      {
        "module": "Wallet Validation",
        "status": "pass",
        "severity": "info",
        "rule": "Valid execution wallet format",
        "message": "Execution wallet uses a valid Ed25519 public key format.",
        "evidence": { "format": "ed25519-public-key" },
        "remediation": "No change is required."
      }
    ],
    "pipelineStages": [
      { "id": "intent-received", "label": "Intent received", "status": "completed", "timestamp": "2026-07-21T12:00:00.000Z" },
      { "id": "agent-authentication", "label": "Agent authenticated", "status": "completed", "timestamp": "2026-07-21T12:00:00.000Z" },
      { "id": "decision", "label": "Decision returned", "status": "completed", "timestamp": "2026-07-21T12:00:00.000Z" },
      { "id": "casper-proof", "label": "Casper proof", "status": "pending" }
    ],
    "threatIntelligenceContext": {
      "status": "available",
      "sourceType": "remote",
      "sourceName": "Reviewed Casper intelligence",
      "generatedAt": "2026-07-21T11:55:00.000Z",
      "indicatorCount": 182,
      "activeIndicatorCount": 176,
      "mode": "Review",
      "unavailableAction": "Warn",
      "minConfidence": 70,
      "checkedEntities": [],
      "matchedIndicators": []
    },
    "oracleValidationContext": {
      "status": "available",
      "sourceName": "Reviewed oracle adapter",
      "requestedPair": "CSPR/USD",
      "executionPrice": 0.025,
      "referencePrice": 0.02505,
      "deviationBps": 20,
      "sourceCount": 2,
      "confidence": 94,
      "mode": "Review"
    }
  },
  "auditLog": {
    "id": "AUD-...",
    "shield": "Agent Shield",
    "decision": "Allowed",
    "decisionProofStatus": "queued",
    "txHash": "",
    "executionStatus": "approved_pending_signature",
    "executionTxHash": ""
  },
  "nextAction": "Request wallet signature before execution"
}
```

### Finding states

| State | Meaning |
| --- | --- |
| `pass` | The implemented check completed and passed. |
| `warning` | The check produced a review condition or non-blocking concern. |
| `fail` | The implemented check produced a blocking condition. |
| `unavailable` | The relevant module is not currently enforced; this is never treated as a pass. |
| `skipped` | The check was not relevant to this intent or capability context. |

### Final decisions

| Decision | External-agent behavior |
| --- | --- |
| `Allowed` | Proceed only when `executionApproved` is also `true`, using the exact evaluated parameters. |
| `Blocked` | Stop, show `agentMessage`, and do not sign or submit. |
| `Review Required` | Stop and inspect `reviewResolution`: autonomously remediate and resubmit, or poll approval only when `humanActionRequired` is `true`. |

The initial intent response sets `executionApproved` to `true` only for `Allowed`. Every `Review Required` response remains non-executable. `reviewResolution.mode` distinguishes `agent_remediation` from `human_approval`, while `agentMessage` is safe to display directly and `decisionExplanation` supplies the exact reason, triggered rule, remediation, and backend instruction.

## Human Approval & Quorum

When a deterministic `Review Required` decision is explicitly routed to human or organizational approval, the response includes `reviewResolution.humanActionRequired: true` and an `approval` object. Autonomous remediation reviews return `approval: null`:

```json
{
  "decision": "Review Required",
  "executionApproved": false,
  "approval": {
    "id": "APR-...",
    "auditLogId": "AUD-...",
    "reviewStatus": "Pending",
    "bindingHash": "64-character-sha256",
    "requiredApprovals": 2,
    "approvalsReceived": 0,
    "remainingApprovals": 2,
    "expiresAt": "2026-07-23T11:00:00.000Z",
    "mayProceedToSigning": false
  }
}
```

The binding hash covers the audit ID, agent, action, amount, target, target type, execution wallet, policy, and original intent. Any protected parameter change requires a new Gateway decision and approval request.

### Poll approval as the external agent

```http
GET /api/agent-gateway/approvals/APR-...?agentId=MAG-AGENT-...
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

The path also accepts the associated audit ID. Continue to pause while `reviewStatus` is `Pending` or `Configuration Required`. Stop permanently for `Rejected` or `Expired`. Progress to the separate wallet-signing boundary only when `reviewStatus` is `Approved` and `mayProceedToSigning` is `true`.

### Reviewer queue

The wallet-scoped application reads:

```http
GET /api/approvals?walletAddress=CASPER_OWNER_OR_APPROVER_PUBLIC_KEY
```

For a signature-enabled policy, an eligible reviewer first requests a one-time challenge:

```http
POST /api/approvals/APR-.../challenge
Content-Type: application/json

{
  "walletAddress": "CASPER_APPROVER_PUBLIC_KEY",
  "response": "Approve"
}
```

Casper Wallet signs the returned exact `challenge.message`, then the reviewer responds through:

```http
POST /api/approvals/APR-.../respond
Content-Type: application/json

{
  "walletAddress": "CASPER_APPROVER_PUBLIC_KEY",
  "response": "Approve",
  "comment": "Reviewed exact recipient and amount",
  "challengeId": "APC-...",
  "signatureHex": "CASPER_WALLET_MESSAGE_SIGNATURE"
}
```

`response` accepts `Approve` or `Reject`. Rejection comments can be mandatory. Duplicate responses, unauthorized wallets, expired requests, and requester self-approval under separation-of-duties policy are rejected. One authorized rejection resolves the request as `Rejected`.

### Current maturity boundary

Cryptographic Reviewer Signatures is **Foundation Available**. Backend verification, one-time challenge persistence, replay protection, UI signing, audit evidence, and SDK/MCP response support are implemented. Signature-enabled policies count only verified Ed25519 or Secp256k1 responses toward quorum. The control is not marked Live until a deployed browser flow with the real Casper Wallet extension is verified end to end.

### Approval Escalation & Organizational Quorum

This control is **Live**. When enabled, the approval response can additionally include:

```json
{
  "resolvedTier": { "id": "high-value", "name": "High Value Treasury" },
  "groupProgress": [
    { "groupId": "treasury", "groupName": "Treasury", "required": 2, "received": 1, "remaining": 1, "satisfied": false }
  ],
  "escalationHistory": [],
  "nextEscalation": { "id": "activate-backup", "afterSeconds": 900 },
  "executionNotBefore": "",
  "executionWindowEndsAt": "2026-07-24T12:00:00.000Z",
  "executionDelayRemainingSeconds": 0,
  "executionWindowStatus": "not_started",
  "mayProceedToSigning": false
}
```

Tier and group resolution is deterministic. Only distinct eligible reviewers count, backup role substitution requires an activated explicit relationship, and the agent must remain stopped until `mayProceedToSigning` is true. See `APPROVAL_ESCALATION_ORGANIZATIONAL_QUORUM.md`.

## Owner Wallet and Execution Wallet

The owner wallet registers the agent, manages credentials, and controls its policy in Magen3. The execution wallet is supplied with each intent and signs the real blockchain action only after an Allowed decision. They can be different wallets.

## Audit and Proof Fields

| Field | Meaning |
| --- | --- |
| `auditLog.originalIntent` | Normalized external-agent request stored for auditability. |
| `auditLog.capabilityContext` | Registered capabilities considered for the decision. |
| `auditLog.moduleFindings` | Structured protection findings used by the deterministic decision engine. |
| `result.threatIntelligenceContext` | Sanitized feed freshness, checked identities, policy mode, and exact-match indicator summary. |
| `auditLog.pipelineStages` | Actual recorded state of the security pipeline and proof/execution timeline. |
| `auditLog.primaryReason` | Main deterministic explanation. |
| `auditLog.triggeredRule` | Policy rule most directly responsible for the outcome. |
| `auditLog.suggestedResolution` | Safe remediation based on policy evidence. |
| `auditLog.txHash` | Casper Decision Proof deploy/transaction hash when recorded. |
| `auditLog.approvalRequestId` | Exact-bound approval request created for a Review Required decision when the policy enables the workflow. |
| `auditLog.approvalStatus` | Current approval state: Pending, Approved, Rejected, Expired, or Configuration Required. |
| `auditLog.approvalBindingHash` | SHA-256 binding over the protected intent and policy context. |
| `auditLog.executionTxHash` | Real execution deploy/transaction hash attached after an Allowed action, or an unexpired Approved review, is signed and submitted. |

Blocked actions can receive decision proofs but must not receive execution hashes. Review Required actions also remain ineligible; autonomous reviews require a fresh Allowed decision after remediation, and human-escalated reviews require a current exact-bound approval.

## Attach an Execution Hash

After an Allowed action—or a human-escalated Review Required action with a completed, unexpired exact-bound approval—is signed and submitted by the execution wallet, attach its real deploy or transaction hash to the matching audit record using the existing execution-confirmation route. Autonomous remediation reviews must first be resubmitted and receive a fresh Allowed decision. Magen3 rejects execution hashes for Blocked, Pending, Rejected, Expired, or Configuration Required decisions.

## Failure States

| State | Behavior |
| --- | --- |
| Unknown Agent ID | Authentication fails; the Gateway does not authorize execution. |
| Missing or invalid API key | Authentication fails. |
| Revoked agent | Gateway access is rejected. |
| No active policy | Magen3 fails closed. |
| Hard policy, wallet-validation, contract-validation, execution-preflight, or enforced threat-intelligence violation | `Blocked`. |
| Review threshold or review condition | `Review Required`; `reviewResolution` chooses autonomous remediation or explicit human escalation. |
| Approval quorum incomplete or expired | Execution confirmation is rejected. |
| Threat feed stale or unavailable | Warn, Review Required, or Blocked according to the active policy; never silently passed. |
| Unavailable roadmap module | Reported honestly as `unavailable`; it is not silently counted as protection. |

## API Discovery

The running backend exposes the current machine-readable gateway description at:

```http
GET /api/agent-gateway/spec
```

Magen3 does not custody keys or sign blockchain transactions. It controls whether an external agent may proceed to the signing step and records the resulting security evidence.


## Token permission metadata

Explicit token approvals, permits, NFT operator authority, batch approval, and delegated spender permissions use `action.tokenPermission`. Generic contract calls should omit this object. Supported fields and policy behavior are documented in `TOKEN_PERMISSION_CONTROLS.md`.

The Gateway accepts unsigned metadata only. `signature`, `signatures`, approvals, raw signed permission payloads, private keys, and mnemonics are rejected.



## Privileged Action Controls

Supported administrative actions use `action.privilegedAction`. The object may include `classifiedAction`, `contract`, `package`, `entryPoint`, `methodSignature`, sanitized `currentValue` and `requestedValue`, `role`, `recipient`, `implementation`, classifier source/version, and network. A supported deterministic entry point can activate classification without the object, while unrelated generic calls remain skipped.

The result may include `privilegedActionControlsContext` with the resolved classification, protected-parameter fingerprint, classification status, approval requirement, and required approval count. Policy fields and the complete boundary are documented in `PRIVILEGED_ACTION_CONTROLS.md`. Never include administrator keys, signatures, raw signed transactions, mnemonics, or wallet secrets.

## Emergency Circuit Breaker

Emergency Circuit Breaker is a **Live** owner-controlled protection under Policy & Approval Controls. Active pause state is evaluated before ordinary authorization and checked again before execution confirmation. A matching `Blocked` pause takes precedence over `Review Required`.

The Gateway result may include:

```json
{
  "result": {
    "decision": "Blocked",
    "emergencyControlsContext": {
      "evaluated": true,
      "active": true,
      "automatic": false,
      "enforcementAction": "Blocked",
      "matchingPauses": [
        {
          "id": "EPAUSE-...",
          "agentId": "MAG-AGENT-...",
          "scopeType": "Agent",
          "scopeValue": "MAG-AGENT-...",
          "triggerType": "Manual",
          "reason": "Investigating repeated execution failures",
          "status": "Active",
          "createdAt": "2026-07-24T10:00:00.000Z",
          "expiresAt": "2026-07-24T11:00:00.000Z"
        }
      ]
    }
  },
  "emergencyPause": {
    "id": "EPAUSE-...",
    "scopeType": "Agent",
    "enforcementAction": "Blocked",
    "status": "Active"
  }
}
```

External agents must stop on both `Blocked` and `Review Required`. They must not change action labels, routes, tools, providers, idempotency keys, or wallets to bypass the pause.

### Owner pause management

```http
GET /api/emergency-controls/status?walletAddress=CASPER_OWNER_PUBLIC_KEY
GET /api/emergency-pauses?walletAddress=CASPER_OWNER_PUBLIC_KEY
POST /api/emergency-pauses
POST /api/emergency-pauses/EPAUSE-.../resume
```

Example manual activation:

```json
{
  "walletAddress": "CASPER_OWNER_PUBLIC_KEY",
  "agentId": "MAG-AGENT-...",
  "scopeType": "Agent",
  "scopeValue": "MAG-AGENT-...",
  "enforcementAction": "Blocked",
  "reason": "Investigating repeated execution failures",
  "expiresAt": "2026-07-24T11:00:00.000Z",
  "resumeRequiresApproval": false,
  "resumeQuorum": 1
}
```

Example direct resume:

```json
{
  "walletAddress": "CASPER_OWNER_PUBLIC_KEY",
  "reason": "Incident reviewed and execution path verified"
}
```

When the pause requires approval, the resume request creates an exact-bound Human Approval record. The pause remains active until the configured quorum resolves the request. Human Approval remains **Foundation Available** pending deployed Casper Wallet browser verification. When the policy enables reviewer signatures, only cryptographically verified responses count toward resume quorum.

Supported scopes are `Platform`, `All Execution`, `Agent`, `Capability`, `Action`, `Policy`, `Trading`, `Contract`, `Bridge`, and `x402`. Automatic pause triggers are opt-in policy behavior. See `EMERGENCY_CIRCUIT_BREAKER.md` for fields, thresholds, audit evidence, expiry, and the current wallet-scoped administrative boundary.


## Contract Argument Policies

For a direct contract call, submit public unsigned runtime arguments under `action.preflight.runtimeArgs`. When the active policy enables Contract Argument Policies, Magen3 matches the exact `action.target` and `action.entryPoint`, then applies required/allowed argument rules, types, numeric ranges, address allowlists/blocklists, boolean restrictions, and enums.

```json
{
  "action": {
    "type": "Contract Interaction",
    "target": "contract-package-hash-...",
    "contractIdentifierType": "Package Hash",
    "entryPoint": "transfer",
    "preflight": {
      "runtimeArgs": {
        "recipient": "01...",
        "amount": "25"
      }
    }
  }
}
```

The result may include `contractArgumentPoliciesContext` with the matching rule ID, evaluated arguments, violations, and canonical `parameterFingerprint`. Human Approval binds the complete normalized intent, including `runtimeArgs`.

Do not submit private keys, mnemonics, wallet signatures, raw signed transactions, wallet approvals, provider credentials, or secret application data. See `CONTRACT_ARGUMENT_POLICIES.md`.


## Agent Instruction Integrity

Submit minimal provenance under `action.instructionIntegrity`. Supported fields include `goalId`, `originalUserGoalHash`, `initiatedBy`, `intentSource`, `toolName`, `toolServer`, `sourceDomains`, `externalContentUsed`, `userConfirmed`, `sourceTrustLevel`, `parameterChangeReason`, `originalParameterHash`, `currentParameterHash`, optional non-secret `originalProtectedParameters`, `originalPermissionScopes`, and `currentPermissionScopes`. The response may include `instructionIntegrityContext`, a user-ready `agentMessage`, and structured `decisionExplanation` fields such as `code`, `field`, `expected`, `received`, and `mismatchFields`. Use the official SDK binding helpers where available. Never send private prompts, email/document bodies, credentials, signatures, or wallet secrets.


## Tool & MCP Integrity metadata

When a tool or MCP server participates in execution, submit `action.toolIntegrity` with `mcpServerId` or `mcpServerUrl`, `toolName`, optional `toolVersion`, SHA-256 `manifestHash`, `schemaHash`, optional `descriptionHash`, `permissionScopes`, non-secret `credentialScope`, `tls`, `toolOrigin`, and optional `approvedAt`. The response may include `toolMcpIntegrityContext` plus structured findings. Never submit server credentials, private keys, wallet signatures, or secret tool output. Legacy requests without tool use remain compatible.

## Delegation & Session Key Safety metadata

When an execution uses delegated authority, submit the public scope and transient Casper Wallet message signature under `action.delegation`. Supported fields include `delegationId`, `delegatingWallet`, `delegate`, optional public `sessionKey`, allowed networks/contracts/methods/assets, native and token limits, maximum transaction amount, rolling hourly frequency, validity, revocation status, depth, redelegation flag, nonce, chain name, optional canonical `attestationHash`, and transient `attestationSignature`.

Magen3 canonicalizes and domain-separates the attestation, verifies Ed25519 or Secp256k1 Casper signatures, and returns sanitized `delegationSafetyContext`. Raw delegation signatures and private session-key material are not persisted. See [Delegation & Session Key Safety](./DELEGATION_SESSION_KEY_SAFETY.md).


## RPC & Chain Integrity metadata

Trusted adapters may include `action.rpcIntegrity` with expected chain identity, selected provider, provider observations, and optional failover evidence. Observations can include TLS and synchronization state, latest block height and timestamp, timeout or rate-limit state, speculative-endpoint classification, and optional transaction-status or contract-state hashes. Magen3 returns sanitized `rpcChainIntegrityContext` and structured `RPC & Chain Integrity` findings. Never send RPC credentials or private provider configuration. See [RPC & Chain Integrity](./RPC_CHAIN_INTEGRITY.md).


## Gas Sponsorship & Fee Safety metadata

Trusted transaction adapters may include `action.feeSafety` with `chainFamily`, `chainName`, bounded public fee values, an approved `sponsor` or EVM `paymaster`, sponsorship ID, expiry, scopes, a SHA-256 evidence hash, expected and actual payer labels, availability, and rolling usage counters. Magen3 returns sanitized `gasSponsorshipFeeSafetyContext` and structured `Gas Sponsorship & Fee Safety` findings. Casper and EVM-only fields are isolated. Never send sponsor credentials, raw sponsor or Paymaster signatures, private keys, signed transactions, or wallet secrets. See [Gas Sponsorship & Fee Safety](./GAS_SPONSORSHIP_FEE_SAFETY.md).

## Execution reconciliation

Report public post-authorization state with `POST /api/agent-gateway/executions/reconcile` using the same connected-agent API key. Required fields are `agentId`, `auditLogId`, and `status`; transaction-bound states require a transaction identifier either in the update or already stored on the audit. Supported states are `submitted`, `pending`, `confirmed`, `failed`, `uncertain`, `replaced`, `refunded`, and `delivered`.

Optional provider polling is available at `POST /api/agent-gateway/executions/poll`. Supply `agentId`, `auditLogId`, and optionally `chainFamily`, `chainName`, or the already-authorized `transactionHash`. Caller-provided `rpcUrl`, `rpcEndpoint`, `providerUrl`, and `endpoint` fields are rejected. See [Execution & Settlement Reconciliation](./EXECUTION_SETTLEMENT_RECONCILIATION.md).
