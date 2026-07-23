# Magen3 x402 Payment Controls Foundation — Implementation Report

## Release summary

x402 Payment Controls has been added to **Agent Shield** as a **Foundation Available** protection module. It is integrated across the existing Magen3 Gateway, Policy Engine, Risk Assessment, Security Pipeline, Audit Logs, Security Coverage, Integration Health, Intent Playground, SDKs, MCP server, Developer documentation, Dashboard, Settings, and agent onboarding recommendations.

The module is not labeled Live because Magen3 does not sign payment authorizations, operate a facilitator, certify merchants, independently verify facilitator settlement, or guarantee that a paid resource is safe or delivered. It authorizes declared payment requirements before signing and reconciles authenticated settlement reports afterward.

The release preserves the existing Gateway endpoint, per-agent API authentication, Agent IDs, API-key hashes, policy records, audit records, Casper decision-proof contract and relayer, wallet boundary, YieldBot and Codex flows, SDK authentication, MCP authentication, Railway configuration, and Vercel configuration.

## Product placement

x402 Payment Controls is not a separate top-level product or sidebar item. It appears in:

- Agent Shield → Protection Modules
- Agent registration → Recommended Protection
- Agent Details → Protection and Integration Health
- Policies → x402 Payment Controls
- Security Pipeline
- Audit Logs
- Dashboard and Settings operational status
- Intent Playground
- Developer Portal, SDK, MCP, README, and Docs

## Deterministic authorization checks

The Gateway evaluates an `x402 Payment` intent before a wallet creates `PAYMENT-SIGNATURE` or submits payment to a facilitator.

Checks include:

1. x402 Payment Controls must be explicitly enabled by the active policy.
2. Allowed protocol versions; the foundation defaults to version 2.
3. Allowed schemes; the foundation defaults to `exact`.
4. Allowed HTTP methods.
5. Absolute and canonical paid-resource URL.
6. HTTPS requirement outside local development.
7. Rejection of embedded URL credentials and secret-like query parameters.
8. `x402 Merchant` target classification.
9. Exact binding between `action.target` and the canonical resource URL.
10. Merchant-domain binding to the resource hostname.
11. Approved and blocked merchants.
12. CAIP-2 network structure and network allowlist.
13. Asset allowlist and asset-decimal configuration.
14. EVM and Solana recipient-address structure.
15. Recipient allowlist.
16. Facilitator identity and allowlist.
17. Positive atomic payment amount.
18. Atomic/display amount consistency.
19. Maximum amount per payment.
20. Daily and monthly x402 spending limits.
21. Maximum payments per hour.
22. High-value review threshold.
23. Explicit expiry or version-2 timeout derived from a supplied PAYMENT-REQUIRED receipt time.
24. Maximum authorization lifetime.
25. Unique request identifier.
26. SHA-256 binding to the decoded PAYMENT-REQUIRED object.
27. Request-body binding for unsafe HTTP methods.
28. Deterministic canonical request fingerprint.
29. Optional client-fingerprint verification.
30. Maximum settlement attempts.
31. Ambiguous-settlement retry prevention.
32. Replay detection against prior Magen3 audit records.

The Gateway never invents a PAYMENT-REQUIRED receipt timestamp and never treats missing required metadata as a pass.

## Signing-material boundary

The Gateway rejects payment and wallet signing material before audit persistence, including:

- Private or secret keys
- Mnemonics
- `PAYMENT-SIGNATURE`
- Signed payment payloads
- Wallet approvals
- Raw signed deploys or transactions

Magen3 receives payment requirements and non-secret settlement evidence only.

## Request fingerprint

Magen3 computes a deterministic SHA-256 fingerprint from the authorized payment context:

- Protocol version
- Payment scheme
- HTTP method
- Canonical resource URL
- Merchant domain
- Recipient
- Asset
- CAIP-2 network
- Atomic amount
- Expiry or timeout context
- Request-body hash
- PAYMENT-REQUIRED hash
- Request ID

The fingerprint binds authorization, replay prevention, audit evidence, and settlement reporting to the same payment request.

## Settlement reconciliation

New authenticated route:

```http
POST /api/agent-gateway/x402/settlements
```

The route requires the existing connected-agent identity and API key. It only accepts settlement updates for an Allowed x402 audit record belonging to that agent.

Supported states:

- `submitted`
- `pending`
- `confirmed`
- `failed`
- `uncertain`

Controls include:

- Request fingerprint must match the original authorization.
- Attempt count must remain within policy.
- Attempts cannot move backward.
- Retrying a failed payment requires a higher attempt number.
- A confirmed settlement cannot regress.
- A recorded transaction hash cannot be changed.
- Resource delivery can only be true for a confirmed settlement.
- Recorded resource delivery cannot be reverted.

Settlement and resource-delivery states update the existing Audit Log and Security Pipeline. No payment signature or private key is stored.

## Public capability status

New endpoint:

```http
GET /api/x402-payment-controls/status
```

It returns sanitized capability information only, including Foundation Available status, supported version, supported scheme, and settlement-reporting availability.

## Policy controls

The existing `structuredRules` object now supports:

- `x402ControlsEnabled`
- `x402ControlMode`: `Observe`, `Review`, or `Enforce`
- `x402UnavailableAction`: `Warn`, `Review`, or `Block`
- `x402AllowedVersions`
- `x402AllowedSchemes`
- `x402AllowedMethods`
- `x402AllowedNetworks`
- `x402AllowedAssets`
- `x402AssetDecimals`
- `x402AllowedFacilitators`
- `x402AllowedMerchants`
- `x402BlockedMerchants`
- `x402AllowedRecipients`
- `x402MaxPayment`
- `x402DailyLimit`
- `x402MonthlyLimit`
- `x402ReviewThreshold`
- `x402MaxPaymentsPerHour`
- `x402MaxAuthorizationLifetimeSeconds`
- `x402RequireHttps`
- `x402RequirePaymentRequiredHash`
- `x402RequireBodyHashForUnsafeMethods`
- `x402RequireRequestId`
- `x402RequireClientFingerprint`
- `x402PreventAmbiguousRetry`
- `x402MaxSettlementAttempts`

Existing policies remain unchanged. An x402 payment is intentionally blocked until x402 Payment Controls is explicitly enabled and configured for the agent.

## Decision behavior

### Allowed

A complete exact-scheme payment satisfies merchant, resource, recipient, network, asset, facilitator, amount, expiry, request-binding, replay, frequency, and budget controls.

### Review Required

Examples include:

- A merchant or recipient is not approved under Review mode.
- Payment exceeds the configured review threshold.
- Required information is unavailable and policy selects Review.
- A non-hard policy violation occurs under Review mode.

### Blocked

Examples include:

- x402 controls are disabled.
- Resource or merchant substitution.
- Secret-bearing resource URL.
- Malformed CAIP-2 network or recipient.
- Unsupported version or scheme under Enforce mode.
- Expired or excessive authorization lifetime.
- Atomic/display amount substitution.
- Payment, daily, monthly, or frequency limit breach.
- Fingerprint mismatch.
- Replayed request fingerprint.
- Retry while settlement is submitted, pending, confirmed, or uncertain.
- Settlement attempt exceeds policy.

## Intent Playground

Added examples:

- Approved x402 API payment
- New x402 merchant
- x402 payment above limit
- Expired x402 requirement
- Ambiguous x402 settlement retry

The result view shows merchant, resource, recipient, network, asset, atomic/display amount, facilitator, expiry, request fingerprint, findings, decision, remediation, pipeline stages, audit identifier, and settlement state.

For an Allowed example, the Playground can report a test settlement through the authenticated settlement endpoint without exposing a payment signature.

## Audit improvements

x402 audit records show:

- Payment wallet separately from the Casper owner wallet
- Merchant and paid resource
- Protocol version and scheme
- HTTP method
- Recipient
- Asset and amount
- CAIP-2 network
- Facilitator
- Request and body binding hashes
- Request fingerprint
- Authorization expiry
- Decision findings and remediation
- Settlement state and attempt
- Settlement transaction hash
- Facilitator reference
- Resource-delivery state
- Casper decision-proof status

The UI no longer presents an x402 settlement transaction as a Casper execution transaction.

## SDK and MCP changes

### TypeScript SDK

- x402 intent metadata types
- Timeout and PAYMENT-REQUIRED receipt-time support
- Authenticated `reportX402Settlement()` method

### Python SDK

- x402 intent pass-through
- Authenticated settlement-reporting method

### MCP server

- x402 intent schema
- `magen3_report_x402_settlement` tool
- Explicit signing-material boundary
- Updated protocol expectations

## Database and environment

- **No database migration**
- **No new mandatory environment variable**
- No Casper contract change
- No Railway configuration change
- No Vercel configuration change

## Compatibility

Preserved:

- Existing Agent IDs
- Existing API-key hashes and headers
- Existing Gateway endpoint
- Existing policy and audit records
- Existing Casper contract hash and decision-proof relayer
- Existing wallet connection and signing boundary
- YieldBot integration
- Codex integration
- Existing SDK and MCP authentication
- Railway and Vercel deployment configuration

## Major files changed

- `backend/lib/x402PaymentControls.mjs`
- `backend/lib/x402PaymentControls.test.mjs`
- `backend/lib/x402PaymentControls.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/lib/walletValidation.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/data/seed.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/src/magen3/client.py`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/test/protocol.test.mjs`
- `examples/sdk-js/check-x402-payment.mjs`
- `examples/sdk-python/check_x402_payment.py`
- `docs/X402_PAYMENT_CONTROLS.md`
- Gateway, platform, SDK, MCP, README, and package documentation

## Verification completed

- **151/151 backend and security tests passed**
- **21/21 focused x402 tests passed**
- **9/9 TypeScript SDK tests passed**
- **5/5 Python SDK tests passed**
- **5/5 MCP core tests passed**
- Authenticated Gateway authorization and settlement persistence verified
- Allowed, Review Required, and Blocked outcomes verified
- Replay after confirmed settlement verified as Blocked
- Signing-material rejection before audit persistence verified
- Monotonic settlement-state enforcement verified
- Backend and script syntax checks passed
- **57 TypeScript/TSX implementation files** passed syntax transpilation
- Focused semantic frontend typecheck passed
- Fresh ZIP extraction, exclusion, and backend verification passed with a temporary TypeScript test dependency

The package registry returned HTTP 503 during the final dependency installation. Therefore the full dependency-backed root typecheck, Vite production build, full MCP protocol startup test, and aggregate `pnpm verify` could not be rerun in this sandbox. Run the local verification commands below before pushing.

## Local verification

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Current protection-module status

### Live

- Identity and Authentication
- Policy Enforcement
- Wallet Validation
- Contract Validation
- Risk Assessment

### Foundation Available

- Execution Simulation
- Threat Intelligence
- Oracle Validation
- Bridge Controls
- Compliance Controls
- x402 Payment Controls

### Preview

- None

### Planned

- None

## Suggested commit

```text
feat(x402): add payment authorization and settlement controls
```

Suggested body:

```text
Add exact-scheme v2 resource, merchant, recipient, CAIP-2 network, asset,
facilitator, atomic amount, timeout, request-binding, replay, budget, and
settlement-reconciliation checks before payment signing.

Integrate x402 Payment Controls with Agent Shield, policies, Security
Pipeline, Audit Logs, Security Coverage, Integration Health, Intent
Playground, SDKs, MCP, and documentation while preserving the existing
Gateway, Casper proof, Railway, and Vercel contracts.
```

## Manual QA checklist

1. Replace the project files while preserving `.git`, local `.env` files, and private relayer keys.
2. Install dependencies and run the local verification commands.
3. Connect Casper Wallet and open a test agent's Policy.
4. Enable x402 Payment Controls and configure exact scheme, Base Sepolia, USDC decimals, merchant, recipient, facilitator, and payment limits.
5. Run `Approved x402 API payment` in the Intent Playground and confirm Allowed.
6. Confirm x402 findings and pipeline stages appear in the response and Audit Logs.
7. Use `Report test settlement` and confirm settlement and resource-delivery stages update.
8. Resubmit the same fingerprint and confirm replay is Blocked.
9. Run `New x402 merchant` and confirm policy-appropriate Review Required or Blocked.
10. Run `x402 payment above limit` and confirm the amount rule is explained.
11. Run `Expired x402 requirement` and confirm Blocked.
12. Run `Ambiguous x402 settlement retry` and confirm automatic retry prevention.
13. Confirm `/api/x402-payment-controls/status` responds after Railway deployment.
14. Confirm x402 audit records keep settlement transaction evidence separate from the Casper decision proof.
15. Test desktop and mobile policy, Playground, Agent Shield, and Audit views.
