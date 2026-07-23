# x402 Payment Controls

x402 Payment Controls protects an autonomous agent **before it creates `PAYMENT-SIGNATURE` or submits payment to a facilitator**.

Status: **Foundation Available**.

The module is not marked Live because Magen3 does not sign payments, operate a facilitator, guarantee merchant behavior, or independently confirm that a paid resource is correct or safe. It authorizes the declared payment requirements and reconciles settlement evidence reported by the external payment adapter.

## Secure flow

```text
Paid HTTP request
→ Receive HTTP 402 / PAYMENT-REQUIRED
→ Decode and select one PaymentRequirements entry
→ Build x402 Payment intent
→ Magen3 Agent Gateway
→ Wallet and x402 Payment Controls
→ Allowed / Blocked / Review Required
→ Create PAYMENT-SIGNATURE only when Allowed
→ Facilitator verification and settlement
→ Report settlement to Magen3
→ Reconcile transaction and resource-delivery state
→ Audit Log and Casper decision proof
```

Magen3 never accepts private keys, mnemonics, wallet approvals, `PAYMENT-SIGNATURE`, or a signed payment payload.

## Intent schema

Send the existing authenticated Gateway request:

```http
POST /api/agent-gateway/intents
x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json
```

```json
{
  "source": "Autonomous API Agent",
  "agentId": "MAG-AGENT-...",
  "executionWalletAddress": "0x2222222222222222222222222222222222222222",
  "goal": "Purchase one approved API response",
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
      "requestId": "payment-unique-001",
      "paymentRequiredHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "settlementStatus": "not_submitted",
      "settlementAttempt": 0
    }
  }
}
```

`validUntil` may be supplied as an explicit adapter-derived expiration. When `maxTimeoutSeconds` is used, `requirementsReceivedAt` must be the stable time at which the original `PAYMENT-REQUIRED` response was received. Magen3 does not invent this time because doing so would weaken replay binding.

For `POST`, `PUT`, `PATCH`, and `DELETE`, include `requestBodyHash`, the SHA-256 hash of the exact request body that will be retried after payment.

## Deterministic checks

The module evaluates:

- Explicit policy enablement
- Protocol version and scheme
- HTTP method
- Canonical paid-resource URL
- HTTPS requirement
- Embedded credentials and secret-like query parameters
- `action.target` and resource URL equality
- Merchant hostname and resource binding
- Approved and blocked merchants
- CAIP-2 network format and allowlist
- Payment asset allowlist
- EVM or Solana recipient structure
- Recipient allowlist
- Facilitator allowlist
- Positive atomic amount
- Asset decimal configuration
- Atomic/display amount consistency
- Per-payment, daily, monthly, and hourly limits
- Human-review threshold
- Authorization expiry or timeout window
- Unique request identifier
- `PAYMENT-REQUIRED` hash
- Unsafe-method request-body hash
- Canonical request fingerprint
- Settlement-attempt limit
- Ambiguous-settlement retry prevention
- Prior audit fingerprint replay

An unavailable validator or missing required metadata never silently becomes a pass.

## Policy fields

Configure these under `structuredRules`:

```json
{
  "x402ControlsEnabled": true,
  "x402ControlMode": "Review",
  "x402UnavailableAction": "Review",
  "x402AllowedVersions": ["2"],
  "x402AllowedSchemes": ["exact"],
  "x402AllowedMethods": ["GET", "HEAD", "POST"],
  "x402AllowedNetworks": ["eip155:84532"],
  "x402AllowedAssets": ["USDC"],
  "x402AssetDecimals": { "USDC": 6 },
  "x402AllowedFacilitators": ["https://x402.org/facilitator"],
  "x402AllowedMerchants": ["api.example.com"],
  "x402BlockedMerchants": [],
  "x402AllowedRecipients": ["0x1111111111111111111111111111111111111111"],
  "x402MaxPayment": 5,
  "x402DailyLimit": 25,
  "x402MonthlyLimit": 250,
  "x402ReviewThreshold": 3,
  "x402MaxPaymentsPerHour": 20,
  "x402MaxAuthorizationLifetimeSeconds": 600,
  "x402RequireHttps": true,
  "x402RequirePaymentRequiredHash": true,
  "x402RequireBodyHashForUnsafeMethods": true,
  "x402RequireRequestId": true,
  "x402RequireClientFingerprint": false,
  "x402PreventAmbiguousRetry": true,
  "x402MaxSettlementAttempts": 1
}
```

For production-style use, use exact merchant, recipient, facilitator, asset, and network allowlists. Keep `exact` as the only scheme until usage-metered authorization has been separately implemented and tested.

## Settlement reconciliation

After an Allowed decision and real facilitator activity, report status with the same connected-agent credential:

```http
POST /api/agent-gateway/x402/settlements
x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json
```

```json
{
  "agentId": "MAG-AGENT-...",
  "auditLogId": "AUD-...",
  "status": "confirmed",
  "requestFingerprint": "64-character-Magen3-fingerprint",
  "transactionHash": "0x64-character-transaction-hash",
  "attempt": 1,
  "facilitatorReference": "opaque-provider-reference",
  "resourceDelivered": true,
  "note": "Resource response received after confirmation."
}
```

Settlement transitions are monotonic:

- Confirmed settlement requires a transaction hash.
- Resource delivery can be true only for a confirmed settlement.
- Attempt numbers cannot move backwards.
- A failed settlement can be retried only with a higher attempt number.
- A recorded transaction hash cannot be replaced.
- Confirmed settlement cannot regress.
- Resource delivery cannot be reverted.

If settlement is `pending`, `submitted`, or `uncertain`, do not automatically authorize a duplicate payment. Reconcile the existing transaction or facilitator reference first.

## UI placement

x402 appears under:

- Agent Shield → Protection Modules
- Agent registration → Recommended Protection
- Agent Details → Protection and Activity
- Policies → x402 Payment Controls
- Intent Playground → x402 examples
- Audit Logs → payment requirements, findings, fingerprint, settlement, and delivery timeline
- Dashboard and Settings → operational status
- Developer Portal, SDKs, MCP, and Docs

It is not a separate top-level product or execution capability.

## Status endpoint

```http
GET /api/x402-payment-controls/status
```

The response describes supported protocol versions, schemes, recipient families, request binding, replay protection, settlement reporting, and the signing boundary. It exposes no credentials or signed payloads.

## Security boundary and limitations

A passing decision means the submitted payment requirements satisfied the active Magen3 policy. It does not prove:

- The merchant will return correct or safe content
- The facilitator is always available or honest
- The payment token or network is risk-free
- The resource response is free from prompt injection
- Settlement has completed until reported and reconciled
- Multi-instance spending reservations are globally atomic under concurrent requests

Use a low-balance payment wallet, keep the treasury wallet separate, treat paid content as untrusted input, and require review for new merchants, recipients, facilitators, unusual amounts, or ambiguous settlement.
