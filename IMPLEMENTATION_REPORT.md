# Magen3 Oracle Validation Foundation — Implementation Report

## Release status

Oracle Validation has moved from **Planned** to **Foundation Available**.

It is integrated into the real Magen3 Gateway decision path and can deterministically produce **Allowed**, **Blocked**, or **Review Required** outcomes from configured policy rules. It is not marked Live because Magen3 does not bundle or certify a production oracle provider, does not verify cryptographic price attestations, and cannot claim that an operator-supplied feed represents universal market truth.

## Implemented protection

For price-sensitive actions such as Swap, Deposit to Vault, Oracle Data Update, or intents carrying explicit oracle metadata, Magen3 now validates:

- Required base asset, quote asset, and proposed execution price
- Freshness and availability of the configured oracle feed
- Exact asset-pair availability
- Observation freshness
- Minimum independent-source quorum
- Minimum aggregate confidence
- Maximum spread between sources
- Execution-quote timestamp freshness
- Maximum deviation between the proposed price and the median reference price
- Explicit behavior when the feed or requested pair is unavailable

Duplicate observations from the same provider are collapsed case-insensitively to the newest observation. One provider therefore cannot satisfy a multi-source quorum or skew the median by repeating the same source record.

Every result emits structured Oracle Validation findings with status, severity, rule, message, evidence, and remediation. The findings are used by the deterministic Risk Assessment Engine and persisted in Audit Logs.

## Policy controls

The following optional fields are supported under `policy.structuredRules`:

```json
{
  "oracleValidationMode": "Review",
  "oracleValidationUnavailableAction": "Warn",
  "oracleValidationMaxAgeSeconds": 120,
  "oracleValidationMaxDeviationBps": 300,
  "oracleValidationMaxSourceSpreadBps": 500,
  "oracleValidationMinConfidence": 70,
  "oracleValidationMinSources": 2
}
```

Behavior:

- **Observe:** record anomalies without changing the authorization outcome produced by other modules.
- **Review:** convert Oracle policy violations to Review Required.
- **Enforce:** block Oracle policy violations.
- **Warn / Review / Block:** define the result when the feed or requested pair is unavailable.

Legacy policies remain backward compatible and use Observe-compatible defaults unless Oracle controls are explicitly configured.

## Gateway request fields

The existing Gateway endpoint and action envelope are unchanged. Price-sensitive integrations may add:

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

`executionPrice` is quote asset per base asset. When it is absent, Magen3 may derive the proposed price from `expectedOutput / amount` when the required values are valid.

## Feed configuration

No new environment variable is mandatory. With no feed configured, the module reports `unavailable` and follows the active policy’s unavailable-feed behavior.

Configure exactly one source:

```env
# Inline adapter output
ORACLE_VALIDATION_FEED_JSON={"version":"1","source":"Reviewed oracle adapter","generatedAt":"CURRENT_ISO_TIMESTAMP","observations":[]}

# Or a local file
ORACLE_VALIDATION_FEED_PATH=backend/data/oracle-validation.example.json

# Or a remote HTTPS adapter
ORACLE_VALIDATION_FEED_URL=https://oracle.example/feed.json
ORACLE_VALIDATION_API_KEY=provider-secret

ORACLE_VALIDATION_CACHE_TTL_MS=60000
ORACLE_VALIDATION_MAX_FEED_AGE_MS=300000
ORACLE_VALIDATION_REQUEST_TIMEOUT_MS=2500
```

Production remote feeds require HTTPS, reject redirects, use bounded response sizes, enforce timeouts, and never expose provider credentials through public status responses.

## Synthetic demonstration feed

The repository includes:

```text
backend/data/oracle-validation.example.json
```

Its values are synthetic and intended only for controlled testnet demonstrations. Refresh its timestamps immediately before use:

```bash
pnpm oracle:refresh-example-feed
```

Then set:

```env
ORACLE_VALIDATION_FEED_PATH=backend/data/oracle-validation.example.json
```

Do not describe the synthetic feed as live market data.

## Product experience

Oracle Validation is now represented in:

- Gateway responses
- Structured module findings
- Adaptive Security Pipeline
- Risk Assessment and deterministic decision explanations
- Audit Logs and original-intent evidence
- Security Coverage
- Integration Health
- Dashboard operational status
- Settings operational status
- Policy creation and editing
- Intent Playground examples and result context
- TypeScript SDK types
- MCP schema and guidance
- README and developer documentation

The Intent Playground includes compliant-price, excessive-deviation, and stale-quote scenarios.

## Operational endpoint

```http
GET /api/oracle-validation/status
```

The endpoint returns only sanitized operational information:

- available, stale, or unavailable state
- safe source label
- generated and fetched timestamps
- observation count
- pair count
- age and freshness limit
- sanitized error information

It does not return observations, provider credentials, raw local paths, or raw remote URLs.

## Database and compatibility

There is **no database migration** for this release.

Preserved:

- Existing Agent IDs
- Existing API-key hashes and authentication headers
- Existing Gateway endpoint
- Existing policies and audit records
- Casper contract hash and decision-proof relayer flow
- Wallet connection and signing boundary
- YieldBot and Codex integration behavior
- JavaScript and Python SDK authentication
- MCP authentication model
- Railway and Vercel configuration

Oracle fields are additive and optional. Existing integrations that do not submit them continue to work under legacy-compatible policy defaults.

## Major files changed

### Backend

- `backend/lib/oracleValidation.mjs`
- `backend/lib/oracleValidation.test.mjs`
- `backend/lib/oracleValidation.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/data/seed.mjs`
- `backend/data/oracle-validation.example.json`
- `backend/lib/frontendSecurityModel.test.mjs`

### Frontend

- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`

### SDK and MCP

- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`

### Documentation and configuration

- `.env.example`
- `package.json`
- `README.md`
- `docs/ORACLE_VALIDATION.md`
- `docs/README.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MCP_SERVER.md`
- `scripts/oracle/refresh-example-feed.mjs`

## Verification performed

Verified successfully:

- **96/96 backend and security tests**
- **13 focused Oracle Validation unit tests** within the backend suite
- **4 Oracle Gateway/policy integration tests** within the backend suite
- **6/6 JavaScript SDK tests**
- **2/2 Python SDK tests**
- **4/4 MCP core tests**
- All backend and script `.mjs` files passed Node syntax checking
- **57 TypeScript/TSX source files** passed syntax transpilation
- Modified frontend source passed a semantic TypeScript check using temporary declarations for unavailable third-party packages
- TypeScript SDK compiled successfully with the available global TypeScript compiler
- Authenticated HTTP Gateway smoke test produced **Allowed → Review Required → Blocked** using the real API routes
- HTTP smoke test verified Oracle pipeline states `completed → warning → failed`
- Audit record creation was verified for all three outcomes
- Sanitized `/api/oracle-validation/status` behavior was verified
- Synthetic-feed timestamp refresh script was verified

The package registry returned HTTP 503 during a clean dependency installation attempt. Therefore these could not be honestly rerun in this sandbox:

- Full root dependency installation
- Full project `pnpm typecheck` against actual React/Vite packages
- Complete Vite production build
- Full MCP server dependency build and stdio startup

Run the complete repository verification locally before pushing:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Local replacement and run

Keep the existing `.git`, local `.env` files, and private relayer-key files. Replace the remaining project files with the extracted release.

```bash
pnpm install --frozen-lockfile
pnpm dev:backend
```

In another terminal:

```bash
pnpm dev:frontend
```

No environment changes are required unless Oracle Validation should use a configured feed.

## Railway and Vercel deployment

No change is required to `railway.json` or `vercel.json`.

Recommended deployment order:

1. Add optional Oracle feed variables to Railway when needed.
2. Deploy the backend.
3. Confirm `/api/health` and `/api/oracle-validation/status`.
4. Deploy the frontend.
5. Test the Intent Playground with a fresh controlled feed.
6. Confirm Oracle findings and pipeline stages appear in Audit Logs.

Keep provider API keys only in Railway variables, never in GitHub or Vercel frontend variables.

## Current module status

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

### Preview

- None

### Planned

- Bridge Controls
- Compliance Controls

## Suggested commit message

```text
feat(oracle-validation): add deterministic price integrity foundation

Add freshness-checked multi-source price validation, source quorum,
confidence, spread, quote freshness, and execution-price deviation rules.

Integrate Oracle findings with the Gateway, Risk Assessment, Security
Pipeline, Audit Logs, policies, Security Coverage, Integration Health,
Intent Playground, SDKs, MCP, operational status, and documentation.

Preserve existing endpoints, authentication, data, Casper integration,
wallet signing, Railway, Vercel, YieldBot, and Codex compatibility.
```

## Manual QA checklist

- Connect Casper Wallet and confirm wallet-gated pages remain consistent.
- Register or use a Trading or dApp-capable agent.
- Create a policy with Oracle mode Review.
- Configure and refresh the synthetic feed for controlled testing.
- Run the compliant-price Playground example and confirm Allowed.
- Run the deviation example and confirm Review Required.
- Switch the policy to Enforce and confirm the same deviation is Blocked.
- Run the stale-quote example and confirm the expected policy outcome.
- Confirm Oracle findings contain pair, reference price, proposed price, deviation, source count, confidence, and remediation.
- Confirm the Oracle pipeline stage reflects completed, warning, or failed truthfully.
- Confirm new decisions appear automatically in Audit Logs.
- Confirm the public status endpoint does not expose raw observations or credentials.
- Remove or disable the synthetic feed before presenting production-style market coverage.
