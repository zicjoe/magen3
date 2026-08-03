# Magen3 Integration Contract Synchronization

## Release summary

This release synchronizes the integration experience across Connected Agents, guided onboarding, downloaded environment files, the Developer Portal, REST examples, the public TypeScript SDK, Python SDK, MCP server, Codex/Agent Skills exports, Gateway public metadata, and repository documentation.

The correction is developer-experience focused. It does not change existing Agent IDs, API keys, policies, audit records, database schema, Casper decision-proof contract, Railway deployment model, or Vercel deployment model.

## Canonical public contract

All new integration surfaces use exactly:

```env
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=YOUR_PRIVATE_AGENT_KEY
```

`MAGEN3_GATEWAY_URL` means the Magen3 API **base URL only**. Official clients append `/api/agent-gateway/me`, `/intents`, approval, execution-reconciliation, and x402-settlement routes internally.

The raw API key belongs only in backend secret configuration. Generated source snippets and Agent Skills no longer embed the one-time key. The dedicated `.env` export remains the intended place to save it.

## Corrected surfaces

- Guided onboarding `.env` download and integration snippets
- Connected Agent credential export, API snippet, and Agent Skills Kit
- Developer Portal TypeScript, Python, MCP, Codex, cURL, and environment examples
- TypeScript SDK package, environment loader, URL normalization, README, and tests
- Python SDK environment loader, URL normalization, README, and tests
- MCP environment parser, README, and tests
- Root README and `.env.example`
- Gateway `/api/public-config` and `/api/agent-gateway/spec` integration metadata
- JavaScript and Python examples
- Current and archived integration documentation
- Windows-compatible Python SDK test runner
- Automated integration-contract verification

## Public TypeScript SDK update

The existing package remains `@magen3/sdk`; no second SDK was created.

This synchronized release is prepared as:

```text
@magen3/sdk@0.4.0-beta.1
```

Consumers install or update through the beta channel:

```bash
pnpm add @magen3/sdk@beta
# or, when already installed
pnpm update @magen3/sdk@beta
```

The preferred initialization is now:

```ts
import { Magen3Client } from "@magen3/sdk";

const magen3 = Magen3Client.fromEnv(process.env);
```

## Backward compatibility

The TypeScript SDK, Python SDK, and MCP server still accept these old API-key names temporarily:

- `MAGEN3_AGENT_KEY`
- `MAGEN3_AGENT_API_KEY`

New downloads and documentation use only `MAGEN3_API_KEY`.

The TypeScript and Python SDKs also normalize an accidentally supplied full Agent Gateway URL, such as `/api/agent-gateway/intents`, back to the API base URL. This prevents duplicated-route 404 errors without continuing to teach the incorrect format.

## Security boundary

- API keys are not exposed in frontend runtime variables.
- Generated JavaScript, Python, Codex, and Agent Skills snippets use environment-variable names or placeholders rather than embedding the raw key.
- The one-time key may be included only in the explicit `.env` credential export requested by the user.
- SDKs, MCP, and REST clients still authenticate through `x-magen3-agent-key` or the existing supported Bearer mode.

## Verification completed

- Integration-contract verifier: passed.
- TypeScript SDK compilation: passed.
- TypeScript SDK tests: 30 passed.
- Python SDK tests: 24 passed.
- MCP core tests: 23 passed.
- Backend regression suite: 378 passed.
- TypeScript/TSX syntax parsing for the modified frontend, SDK, integration helper, and MCP source: passed.
- JavaScript/MJS syntax validation for modified backend, scripts, and examples: passed.
- npm package dry run: passed; exactly five intended SDK files were selected.
- Packed SDK installation and import from an independent consumer project: passed.

The environment could not retrieve pnpm packages from its configured registry, so the exact full `pnpm verify`, Vite production build, and complete MCP transport/protocol suite were not rerun here. Run them after extraction in the normal repository environment before deployment.

## Deployment and migration

No database migration, Casper contract change, API-key rotation, or secret-value change is required. Existing credentials remain valid.

After deployment, publish `@magen3/sdk@0.4.0-beta.1` using the existing beta tag. External agents can then update the same package; they do not install a replacement SDK.
