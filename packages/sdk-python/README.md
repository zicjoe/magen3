# magen3-sdk

Official Python SDK for Magen3, a modular Web3 execution firewall.

## Configuration

```env
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=YOUR_PRIVATE_AGENT_KEY
```

`MAGEN3_GATEWAY_URL` is the API base URL only. Use `Magen3Client.from_env()` to load the canonical configuration. Legacy API-key aliases remain accepted during migration.

```python
from magen3 import Magen3Client
client = Magen3Client.from_env()
```

## Wallet transfer

```python
from magen3 import Magen3Client

client = Magen3Client(gateway_url, agent_id, api_key)
decision = client.check_intent({
    "executionWalletAddress": "CASPER_PUBLIC_KEY",
    "action": {
        "type": "Transfer",
        "amount": 2,
        "asset": "CSPR",
        "target": "RECIPIENT_PUBLIC_KEY",
        "targetType": "Wallet Address",
        "preflight": {
            "paymentAmountMotes": "5000000000",
            "gasPriceTolerance": 1,
            "ttl": "30m",
            "timestamp": "2026-07-22T10:00:00.000Z",
        },
    },
})
```

## Contract call

```python
decision = client.check_intent({
    "executionWalletAddress": "CASPER_PUBLIC_KEY",
    "targetChain": "casper-testnet",
    "action": {
        "type": "Contract Call",
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
            "runtimeArgs": {"amount": "1000000000"},
        },
    },
})
```

A trusted-looking target label never bypasses policy enforcement. Contract identifiers, entry points, network context, blocked-contract controls, and approved-contract controls are evaluated by the live Contract Validation module.

Execution Simulation is Foundation Available. It validates supplied construction metadata without claiming full stateful execution. Never include private keys, wallet approvals, transaction-level signatures, or raw signed transactions. Public contract arguments belong only inside `runtimeArgs`.

Threat Intelligence findings and the sanitized `threatIntelligenceContext` are returned in the normal decision dictionary when the backend is configured with a feed. A no-match result is not a guarantee of safety.

The SDK never signs or broadcasts blockchain transactions.

## Token Approval & Permit Safety

Submit normalized, unsigned permission metadata before a wallet creates an approval or permit signature:

```python
decision = client.check_intent({
    "executionWalletAddress": "0x0000000000000000000000000000000000000001",
    "targetChain": "ethereum-sepolia",
    "action": {
        "type": "Contract Call",
        "target": "0x1111111111111111111111111111111111111111",
        "targetType": "Trusted Contract",
        "tokenPermission": {
            "permissionType": "Fungible Token Approval",
            "owner": "0x0000000000000000000000000000000000000001",
            "tokenContract": "0x1111111111111111111111111111111111111111",
            "spender": "0x2222222222222222222222222222222222222222",
            "approvalAmount": 25,
            "intendedTransactionAmount": 20,
            "unlimited": False,
            "network": "ethereum-sepolia",
        },
    },
})
```

The response can include `tokenPermissionControlsContext` plus structured findings for spender policy, amount and ratio limits, unlimited authority, permit lifetime and nonce requirements, NFT operator authority, batch limits, allowance-reset expectations, and replay status. Generic contract calls without `action["tokenPermission"]` remain compatible and are not classified as approvals.

Never send a permit signature, wallet signature, signed authorization, private key, seed phrase, or mnemonic through the Gateway. Magen3 stores a canonical permission fingerprint and enough sanitized metadata to detect replay or protected-parameter mutation without retaining raw signed authority.

## AI-native review routing and explanations

A `Review Required` decision is not execution authorization, but it does not automatically require a human. Show `get_agent_message(decision)` to the user and inspect `decision["reviewResolution"]["humanActionRequired"]`. Autonomous reviews require the agent to follow the returned remediation and resubmit the same bound goal.

```python
from magen3 import get_agent_message, is_execution_approved

print(get_agent_message(decision))
if is_execution_approved(decision):
    pass  # Submit only the exact evaluated action.
elif decision.get("reviewResolution", {}).get("humanActionRequired"):
    pass  # Poll the exact-bound approval request.
else:
    pass  # Remediate using decisionExplanation and resubmit.
```


## Field-specific instruction-integrity explanations

Use the official helper so the Gateway receives a canonical original snapshot and compatible hashes:

```python
from magen3 import create_instruction_integrity_binding, get_agent_message

intent["action"]["instructionIntegrity"] = create_instruction_integrity_binding(
    intent,
    goal_id=stable_goal_id,
    original_user_request=original_user_request,
    initiated_by="user",
    intent_source="user",
    user_confirmed=True,
)

decision = client.check_intent(intent)
print(get_agent_message(decision))
```

Preserve the original binding while retrying the same goal. The Gateway may return `decisionExplanation.code`, `field`, `expected`, `received`, and `mismatchFields` so developer tooling can identify the exact protected parameter that is missing, malformed, or changed. Show `agentMessage` to the ordinary user and keep technical hashes in developer details.

## Human approval polling

Poll the exact-bound request by approval ID or audit ID only when `humanActionRequired` is true:

```python
approval = client.get_approval(decision["approval"]["id"])["approval"]
if not approval.get("mayProceedToSigning"):
    return
```

For signature-enabled policies, the approval dictionary exposes `signatureRequired`, `verifiedApprovalsReceived`, and sanitized verified-response evidence. Only verified Casper Ed25519 or Secp256k1 reviewer responses count toward quorum. Human Approval & Quorum remains Foundation Available pending deployed browser verification. The agent SDK cannot create approval challenges, approve a request, access a reviewer wallet, sign, or broadcast. `Pending`, `Configuration Required`, `Rejected`, and `Expired` all require execution to remain stopped. Organizational policies also expose resolved tier, required role progress, escalation, execution delay, and signing-window state. Use only `mayProceedToSigning`; an `Approved` status can still be locked by delay or an expired execution window.

## Oracle Validation

Trading and DeFi intents can submit exact quote metadata without any wallet secret:

```python
decision = client.evaluate_intent({
    "action": {
        "type": "Swap",
        "amount": 10,
        "token": "CSPR",
        "outputAsset": "USD",
        "target": "contract-package-<64-hex>",
        "oracle": {
            "baseAsset": "CSPR",
            "quoteAsset": "USD",
            "executionPrice": 0.025,
            "quoteTimestamp": "2026-07-22T12:00:00.000Z",
        },
    }
})
```

The normal decision dictionary may include `oracleValidationContext` and structured Oracle Validation findings. The backend operator controls the feed and policy thresholds. Oracle Validation is Foundation Available; a passing comparison is not a guarantee that a market price is correct or that execution will succeed.


## Bridge Controls metadata

Python integrations may include an `action["bridge"]` dictionary with source and destination chains, provider, route ID, destination address, fee, output bounds, quote timestamps, and confirmation requirements. The normal response may include `bridgeControlsContext` and structured Bridge Controls findings.

Bridge Controls is Foundation Available. A passing result means the submitted route metadata satisfied the configured policy; it does not guarantee provider solvency, destination finality, or cross-chain delivery.

## Compliance Controls evidence

Python integrations may include an `action["compliance"]` dictionary containing only non-sensitive status, provider, opaque reference, timestamp, jurisdiction, hash, risk-rating, and VASP-ID fields. The normal response may include `complianceControlsContext` and structured findings. Do not send raw personal identity data. Compliance Controls is Foundation Available and does not make a legal determination.

## x402 Payment Controls

Submit decoded x402 requirements before creating the payment signature:

```python
received_at = "2026-07-23T12:00:00.000Z"
decision = client.check_intent({
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
            "requirementsReceivedAt": received_at,
            "requestId": "python-payment-001",
            "paymentRequiredHash": "b" * 64,
        },
    },
})
```

After real settlement, call `client.report_x402_settlement(...)` with the audit ID, Magen3 request fingerprint, settlement status, attempt number, transaction hash when confirmed, and resource-delivery state. Never include `PAYMENT-SIGNATURE` or a signed payment payload in the intent.


## Privileged Action Controls

Python callers can pass unsigned `action["privilegedAction"]` metadata with a supported classification, exact contract/method/network binding, sanitized current/requested values, and proposed administrator or implementation. The response can include `privilegedActionControlsContext`. Never send private keys, signatures, or raw signed transactions.

## Emergency Circuit Breaker responses

The Python client passes through `result["emergencyControlsContext"]` and the optional top-level `emergencyPause`. These fields explain the matching scope, manual or automatic trigger, enforcement action, reason, expiry, and approval-gated resume state.

The SDK cannot activate, resume, or bypass a pause. Stop on both `Blocked` and `Review Required`; never retry through a different action label, route, provider, wallet, or idempotency key to avoid the control.


## Contract Upgrade Safety

Python callers may include unsigned `action["contractUpgrade"]` metadata containing the current and requested implementation, optional code hashes, upgrade administrator, network, and any configured `executeAfter` time. Inspect `result["contractUpgradeSafetyContext"]` for the exact parameter fingerprint, policy mode, delay, and required approval quorum. Never send administrator private keys, signatures, or raw signed transactions.

## Contract Argument Policies

Python callers place public unsigned contract arguments in `action["preflight"]["runtimeArgs"]`. The response may include `result["contractArgumentPoliciesContext"]` with the exact contract, entry point, matching rule, evaluated names, violations, and canonical fingerprint. Never place private keys, signatures, wallet approvals, raw signed transactions, or secret application data in runtime arguments.

## Agent Instruction Integrity

Use `create_instruction_integrity_binding()` for sensitive or externally influenced execution. It generates a stable goal hash, backend-compatible parameter hashes, and a non-secret original protected-parameter snapshot. Preserve the original binding while retrying the same user goal. The Gateway returns `instructionIntegrityContext` plus field-specific `decisionExplanation` diagnostics when available. Do not send private prompts, raw documents, credentials, wallet secrets, or signatures. Magen3 verifies supplied deterministic evidence and does not claim to detect every prompt-injection attack.


## Tool & MCP Integrity

Python callers may include public unsigned `action["toolIntegrity"]` evidence with the exact MCP server/tool identity, version, SHA-256 hashes, transport assertion, origin, credential-scope label, and permission scopes. Inspect `result["toolMcpIntegrityContext"]`. Do not send MCP credentials, private keys, signatures, or secret tool output.


## Delegation & Session Key Safety

Pass a public `action["delegation"]` object when execution uses delegated authority or a session key. Bind the exact delegate, Casper delegating wallet, network, contracts, methods, assets, amount/frequency limits, validity period, depth, redelegation flag, nonce, and chain. A connected wallet adapter may supply a transient `attestationSignature`; Magen3 verifies it and returns sanitized `delegationSafetyContext` containing only the attestation/signature hashes and verification evidence. Never send a private session key, mnemonic, seed phrase, or raw signed transaction.

### Build the canonical delegation message

Use `build_delegation_attestation_message(delegation, agent_id)` before requesting a Casper Wallet message signature. `hash_delegation_attestation(delegation, agent_id)` returns the optional SHA-256 binding. These helpers do not access wallet secrets or sign transactions.


## RPC & Chain Integrity

Submit public `action.rpcIntegrity` evidence only when it was collected by a trusted adapter. Magen3 checks approved provider identity, expected network binding, freshness, quorum agreement, and failover policy. Never send provider credentials or fabricate observations.


## Gas Sponsorship & Fee Safety

The Python SDK passes through `action.feeSafety` and the returned `gasSponsorshipFeeSafetyContext`. Trusted adapters must collect real fee, sponsor, payer, expiry, and budget evidence. The SDK never creates sponsorships or signs transactions.

## Execution & Settlement Reconciliation

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

Polling uses only RPC endpoints configured on the Magen3 backend. Do not send signed transactions, wallet signatures, private keys, or provider URLs.

## Trading Route Integrity

The Python client passes additive `action.tradingRoute` metadata through unchanged. Supply only public route evidence such as the exact quote ID, router, ordered token/pool path, amounts, fee recipients, and trusted calldata/payload hashes. Never include signatures, signing material, or provider credentials.
