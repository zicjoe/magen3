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
    "targetType": "Wallet Address"
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
    "modulesEvaluated": ["Identity and Authentication", "Policy Enforcement", "Wallet Validation", "Contract Validation", "Execution Simulation", "Threat Intelligence", "Oracle Validation", "Bridge Controls", "Risk Assessment"],
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
| `Allowed` | The agent may request wallet signing. Magen3 does not sign for the user. |
| `Blocked` | Stop. Do not submit the blockchain transaction. |
| `Review Required` | Pause automatic execution and request an authorized human decision. |

Only `Allowed` sets `executionApproved` to `true`.

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
| `auditLog.executionTxHash` | Real execution deploy/transaction hash attached after an Allowed action is signed and submitted. |

Blocked and review-required actions can receive decision proofs, but they must not receive execution hashes.

## Attach an Execution Hash

After an Allowed action is signed and submitted by the execution wallet, attach its real deploy or transaction hash to the matching audit record using the existing execution-confirmation route exposed by the application integration flow. Magen3 rejects execution hashes for Blocked or Review Required decisions.

## Failure States

| State | Behavior |
| --- | --- |
| Unknown Agent ID | Authentication fails; the Gateway does not authorize execution. |
| Missing or invalid API key | Authentication fails. |
| Revoked agent | Gateway access is rejected. |
| No active policy | Magen3 fails closed. |
| Hard policy, wallet-validation, contract-validation, execution-preflight, or enforced threat-intelligence violation | `Blocked`. |
| Review threshold or review condition | `Review Required`. |
| Threat feed stale or unavailable | Warn, Review Required, or Blocked according to the active policy; never silently passed. |
| Unavailable roadmap module | Reported honestly as `unavailable`; it is not silently counted as protection. |

## API Discovery

The running backend exposes the current machine-readable gateway description at:

```http
GET /api/agent-gateway/spec
```

Magen3 does not custody keys or sign blockchain transactions. It controls whether an external agent may proceed to the signing step and records the resulting security evidence.
