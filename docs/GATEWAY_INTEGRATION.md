# Magen3 Gateway Integration

Magen3 is the execution-control layer. External agents remain independent applications and call Agent Shield before requesting a wallet signature or submitting a blockchain action.

## Integration Flow

```text
Register agent
→ select one or more execution capabilities
→ assign an active policy
→ copy the Agent ID and one-time API key
→ verify gateway access
→ submit every execution intent to Magen3
→ inspect Allowed / Blocked / Review Required
→ request wallet signing only when Allowed
→ attach the execution hash after successful submission
```

## Required Values

| Value | Source |
| --- | --- |
| Agent ID | Registration completion or Agent Control Center |
| Agent API key | Shown once after registration or rotation |
| Gateway URL | Registration quick start, Developer Portal, Settings, or public config |
| Verify URL | Registration quick start, Developer Portal, Settings, or public config |
| Active policy | Policy assigned to the registered agent |
| Execution wallet | Supplied by the external agent for each requested action |

## Execution Capabilities

A registered agent can select several capabilities rather than one rigid type:

- Trading
- Wallet Management
- Treasury Operations
- dApp Interactions
- Enterprise Automation
- Custom

Capabilities provide configuration context and recommendations. They do not bypass policy enforcement. The active policy remains the source of enforceable limits.

## Verify the Integration

```bash
curl "https://YOUR_API_HOST/api/agent-gateway/me?agentId=MAG-AGENT-..." \
  -H "x-magen3-agent-key: YOUR_AGENT_API_KEY"
```

Treat `gatewayReady: false` as a stop condition. It normally means that the agent does not have an active policy.

## Submit an Intent

```bash
curl -X POST "https://YOUR_API_HOST/api/agent-gateway/intents" \
  -H "Content-Type: application/json" \
  -H "x-magen3-agent-key: YOUR_AGENT_API_KEY" \
  -d '{
    "source": "YieldBot AI",
    "agentId": "MAG-AGENT-...",
    "targetChain": "casper-testnet",
    "executionWalletAddress": "01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "goal": "Transfer 5 CSPR to an approved wallet",
    "reason": "The agent prepared this action and needs Magen3 approval.",
    "action": {
      "type": "Transfer",
      "amount": 5,
      "asset": "CSPR",
      "target": "01bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "targetType": "Wallet Address"
    }
  }'
```

Use only action names accepted by the current backend schema. The in-app Intent Playground includes working examples for the actions available in the current interface.

Wallet Validation is live. The execution wallet must be a valid Casper signing public key. Transfer targets must be classified as `Wallet Address` and use a supported public-key or account-hash format. Never send a private key.


## Submit a Contract Intent

```bash
curl -X POST "https://YOUR_API_HOST/api/agent-gateway/intents" \
  -H "Content-Type: application/json" \
  -H "x-magen3-agent-key: YOUR_AGENT_API_KEY" \
  -d '{
    "source": "Autonomous dApp Agent",
    "agentId": "MAG-AGENT-...",
    "targetChain": "casper-testnet",
    "executionWalletAddress": "01aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "goal": "Call an approved vault contract",
    "action": {
      "type": "Contract Interaction",
      "target": "contract-package-hash-<64-hex-characters>",
      "targetType": "Trusted Contract",
      "contractIdentifierType": "Package Hash",
      "entryPoint": "deposit",
      "contractVersion": 1,
      "chainName": "casper-test",
      "preflight": {
        "paymentAmountMotes": "5000000000",
        "gasPriceTolerance": 1,
        "ttl": "30m",
        "timestamp": "2026-07-22T10:00:00.000Z",
        "runtimeArgs": {
          "amount": "1000000000"
        }
      }
    }
  }'
```

Contract Validation is live. A direct contract call must provide a valid Contract Hash or Package Hash and a structurally valid entry point. High-level actions such as Swap remain compatible when the adapter has not resolved the exact entry point; Magen3 still evaluates contract identity, target classification, network context, and active policy controls. A `Trusted Contract` label never grants trust by itself—the exact identifier must be approved by the active policy.

Contract policy controls use:

- `trustedContracts` for approved exact contract/package identifiers
- `structuredRules.blockedContracts` for explicit deny rules
- `structuredRules.allowedEntryPoints` for optional entry-point restrictions


## Add Execution Preflight Metadata

Execution Integrity also supports Live Lifecycle & Replay controls. New adapters should attach `action.lifecycle` before calling the Gateway:

```json
{
  "intentId": "intent:agent-operation-0001",
  "idempotencyKey": "idempotency:agent-operation-0001",
  "createdAt": "2026-07-23T10:00:00.000Z",
  "expiresAt": "2026-07-23T10:10:00.000Z",
  "attempt": 0
}
```

Generate a new intent ID and idempotency key for every new business action. For a retry, first reconcile the earlier audit, then reference it with `retryOf` and increment `attempt`. Do not retry a pending, uncertain, or confirmed execution. Magen3 computes and audits the canonical intent fingerprint.

Execution Simulation is Foundation Available. When the execution adapter has prepared construction metadata, include `action.preflight`:

```json
{
  "paymentAmountMotes": "5000000000",
  "gasPriceTolerance": 1,
  "ttl": "30m",
  "timestamp": "2026-07-22T10:00:00.000Z"
}
```

Swap adapters may also send `slippageBps`, `expectedOutput`, and `minimumReceived`. Contract adapters may send a JSON `runtimeArgs` summary. Magen3 validates structure and freshness before signing, but full stateful speculative execution remains unavailable. Do not send wallet approvals, transaction-level signatures, raw signed deploys, or wallet secrets. Public contract arguments belong only inside `runtimeArgs`.

## Configure Threat Intelligence behavior

Threat Intelligence is Foundation Available. The Magen3 operator configures the feed on the backend; the external agent does not send provider credentials or a feed URL in each intent. The active policy controls whether matches are observed, require review, or are enforced, plus the minimum confidence and stale/unavailable-feed behavior.

External agents should inspect `moduleFindings` and `threatIntelligenceContext`:

- A fresh no-match finding means only that no configured exact indicator matched the submitted identifier.
- A match may leave the decision Allowed in Observe mode, require review, or block execution depending on policy.
- A stale or unavailable feed is never a pass and may require review or block under fail-closed policies.
- Do not attempt to bypass a decision by changing identifier formatting; Wallet Validation and Contract Validation normalize supported forms before matching.


## Add Oracle Validation metadata

For a priced Swap or DeFi action, include the proposed quote in the intent rather than provider credentials:

```json
{
  "action": {
    "type": "Swap",
    "amount": 10,
    "asset": "CSPR",
    "outputAsset": "USD",
    "oracle": {
      "baseAsset": "CSPR",
      "quoteAsset": "USD",
      "executionPrice": 0.025,
      "quoteTimestamp": "2026-07-22T15:00:00.000Z"
    }
  }
}
```

The operator-configured feed is evaluated server-side. External agents should inspect Oracle Validation findings and `oracleValidationContext`, including feed status, requested pair, reference price, deviation, source quorum, confidence, and remediation. Never treat a stale/unavailable feed or an Observe-mode warning as proof that a price is safe.

## Add Bridge Controls metadata

For a provider-selected cross-chain route, include `action.bridge` and the exact bridge contract or package identifier used on Casper:

```json
{
  "action": {
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
}
```

Inspect `bridgeControlsContext` and Bridge Controls findings. An `Allowed` decision means the declared route satisfies configured controls; it does not prove provider solvency, destination-chain finality, or successful message delivery. Continue only to explicit wallet review and signing.

## Add Compliance Controls evidence

For actions covered by the active policy, send non-sensitive verification and screening evidence under `action.compliance`. Use provider labels, opaque references, timestamps, two-letter jurisdiction codes, status values, and optional data hashes. Do not send names, identity documents, addresses, contact information, documents, selfies, or biometrics; the Gateway rejects raw personal identity data.

External verification providers remain responsible for personal-data handling. Magen3 evaluates the submitted status and freshness against the policy, records structured findings, and returns a sanitized `complianceControlsContext`. An optional operator-configured exact-match feed can add wallet, account-hash, contract/package, VASP-ID, and jurisdiction restrictions.

Authorize only from the final `Allowed` decision and `executionApproved`. A clear screening status, valid attestation, or configured-feed no-match does not guarantee legal compliance. See `COMPLIANCE_CONTROLS.md`.

## Decision Handling

```ts
const response = await submitIntent(intent);

switch (response.result.decision) {
  case "Allowed":
    // Ask the execution wallet to review and sign the real transaction.
    break;
  case "Review Required":
    // Pause automation and request authorized human review.
    break;
  case "Blocked":
    // Stop. Do not submit the transaction.
    break;
}
```

Do not infer authorization from `risk`, `riskScore`, HTTP success, or a friendly message. The only execution-authorizing condition is:

```ts
response.result.decision === "Allowed" && response.executionApproved === true
```

## Deterministic Guidance

For Blocked and Review Required outcomes, use these fields to build user guidance:

- `primaryReason`
- `triggeredRule`
- `suggestedResolution`
- `moduleFindings`
- `pipelineStages`
- `threatIntelligenceContext`
- `oracleValidationContext`
- `bridgeControlsContext`
- `complianceControlsContext`

The core authorization decision is deterministic. Do not replace it with a language-model decision. A user-facing model may summarize evidence only if it cannot override Agent Shield.

## API Key Rotation

Raw API keys are shown once. If the external agent loses a key, rotate it in the Agent Control Center and update that external app immediately.

Rotation affects only the selected agent. Existing Agent IDs, policies, other agents, and Casper proofs are unchanged.

## Secure Credential Handling

- Store the API key in a server-side secret manager or protected environment variable.
- Never commit it to source control.
- Never expose it in browser logs, analytics, screenshots, URLs, or audit payloads.
- Do not reuse one agent credential across unrelated applications.
- Revoke an agent immediately when its integration should no longer call the Gateway.

## Recommended External-Agent Behavior

1. Verify the registered agent during startup or before high-risk execution.
2. Submit every supported blockchain intent before wallet signing.
3. Stop on Blocked.
4. Pause on Review Required.
5. Request signing only on Allowed.
6. Show the wallet the exact transaction it is being asked to sign.
7. Attach the real execution hash to the corresponding audit record after successful submission.
8. Treat unavailable modules as missing coverage, not as passed checks.

## Owner Wallet and Execution Wallet

The Magen3 owner wallet registers and manages the agent. The external agent may submit a different execution wallet with each request. The execution wallet is captured in audit evidence and signs the real transaction only after approval.

## Proof Model

Magen3 records Decision Proofs on Casper Testnet when the proof relayer is configured. Execution Proofs come from the external wallet or execution layer after an Allowed action is signed and submitted.

The existing Casper contract hash remains unchanged. Gateway and data-model upgrades do not require redeploying the audit contract.

## Playground and SDKs

Use the in-app Intent Playground to validate payloads and inspect pipeline stages before connecting an external agent. The JavaScript/TypeScript SDK, Python SDK, MCP server, Codex skill, and browser-use style integrations all use the same Agent ID, API key, Gateway request, and final decision model.

See also:

- `AGENT_GATEWAY_API.md`
- `OFFICIAL_SDKS.md`
- `MCP_SERVER.md`
- `CONNECTED_WALLET_EXECUTION.md`
- `THREAT_INTELLIGENCE.md`

## Add contract runtime-argument evidence

For exact contract and entry-point enforcement, include public unsigned values in `action.preflight.runtimeArgs`. Do not flatten them into the top-level action or send encoded signed deploy bytes. Magen3 applies the active Contract Argument Policy before wallet signing and returns `contractArgumentPoliciesContext` plus structured findings.

External agents must stop on Blocked, pause on Review Required, and request wallet signing only when `result.decision === "Allowed"` and `executionApproved === true`. Changing a protected runtime argument after Human Approval changes both the argument fingerprint and the exact-intent approval binding.

See `CONTRACT_ARGUMENT_POLICIES.md` for policy examples and the security boundary.
