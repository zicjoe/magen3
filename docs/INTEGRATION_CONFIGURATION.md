# Magen3 Integration Configuration

This document is the canonical configuration contract for the public TypeScript SDK, Python SDK, MCP server, generated `.env` downloads, Developer Portal snippets, and examples.

## Required backend variables

```env
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=YOUR_PRIVATE_AGENT_KEY
```

- `MAGEN3_GATEWAY_URL` is the Magen3 API **base URL only**.
- `MAGEN3_AGENT_ID` is the Connected Agent identifier.
- `MAGEN3_API_KEY` is the one-time or rotated Connected Agent key.

Do not append `/api/agent-gateway/intents`, `/me`, or another route to `MAGEN3_GATEWAY_URL`. Official clients derive routes internally.

## Optional variables

```env
MAGEN3_TIMEOUT_MS=15000
MAGEN3_AUTH_MODE=header
```

`MAGEN3_AUTH_MODE` may be `header` or `bearer`. Header mode sends `x-magen3-agent-key`.

## Legacy aliases

The clients temporarily accept these older API-key names:

- `MAGEN3_AGENT_KEY`
- `MAGEN3_AGENT_API_KEY`

New downloads, examples, and documentation use only `MAGEN3_API_KEY`. Migrate existing deployments when practical.

## Public TypeScript SDK

```bash
pnpm add @magen3/sdk@beta
```

```ts
import { Magen3Client } from "@magen3/sdk";
const magen3 = Magen3Client.fromEnv(process.env);
const identity = await magen3.verifyAgent();
```

## Python SDK

```python
from magen3 import Magen3Client
client = Magen3Client.from_env()
identity = client.verify_agent()
```

## MCP server

```text
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=YOUR_PRIVATE_AGENT_KEY
```

Never put the API key in browser code, a `VITE_` variable, screenshots, or committed files.

## Milestone 25 Threat Intelligence providers

Provider origins are configured only by Magen3. To enable the GoPlus EVM address-security adapter, set `THREAT_INTELLIGENCE_GOPLUS_ENABLED=true` or include `goplus` in `THREAT_INTELLIGENCE_PROVIDERS`. `GOPLUS_API_KEY` may be supplied server-side when required. Configure provider timeout, retry, cache, rate-limit, response-size and circuit-breaker bounds with the `THREAT_INTELLIGENCE_PROVIDER_*` variables documented in `.env.example`.

## Milestone 27 compliance provider configuration

Production provider screening is opt-in. Configure `COMPLIANCE_PROVIDERS=ofac_api`, set `COMPLIANCE_OFAC_API_ENABLED=true`, and provide `COMPLIANCE_OFAC_API_KEY` on the backend only. Optional controls include `COMPLIANCE_OFAC_API_MIN_SCORE`, provider timeout/retry/cache/rate-limit/response-size/circuit-breaker settings, and the existing Compliance Controls policy settings. Do not place provider credentials in frontend environment variables.

The adapter origin is server-controlled and is not accepted from protected-intent requests. If a policy requires provider evidence and the provider is unconfigured or unavailable, the configured deterministic provider-unavailable action is applied; absence is never represented as a successful clean screening.
