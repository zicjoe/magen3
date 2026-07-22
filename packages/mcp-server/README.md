# @magen3/mcp-server

Official local MCP server for Magen3, a modular Web3 execution firewall.

It exposes four tools over `stdio`:

- `magen3_verify_agent`
- `magen3_get_intent_schema`
- `magen3_check_intent`
- `magen3_require_allowed`

`magen3_require_allowed` is the recommended fail-closed gate. It returns an MCP error for Blocked, Review Required, authentication errors, schema errors, timeouts, and network failures.

The server never reads browser-wallet storage, handles private keys, signs transactions, broadcasts transactions, or deploys contracts.

## Environment

```text
MAGEN3_GATEWAY_URL=https://your-backend.example
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_AGENT_KEY=private-connected-agent-key
MAGEN3_TIMEOUT_MS=15000
MAGEN3_AUTH_MODE=header
```

## Build and run

```bash
pnpm mcp:build
node packages/mcp-server/dist/server.js
```

See `docs/MCP_SERVER.md` for Codex setup and testing.


## Contract intents

Contract-oriented actions may include these optional action fields:

- `contractIdentifierType`: `Contract Hash` or `Package Hash` when an ambiguous raw/hash-prefixed identifier needs explicit semantics
- `entryPoint`: required for direct Contract Interaction/Contract Call actions; optional for high-level actions such as Swap when the adapter has not resolved it
- `contractVersion`: optional positive package version; invalid with a Contract Hash
- `chainName`: optional Casper chain name checked against the Gateway configuration

A `targetType` value such as `Trusted Contract` never grants trust by itself. The exact contract or package identifier must be approved by the active Magen3 policy.


## Execution preflight

Actions may include a `preflight` object with `paymentAmountMotes`, `gasPriceTolerance`, `ttl`, `timestamp`, optional swap bounds, runtime arguments, and an optional transaction hash. Magen3 validates this metadata before signing. Full stateful speculative execution remains unavailable, and signing material is never accepted by the intent endpoint.


## Threat Intelligence

The response can include structured Threat Intelligence findings and sanitized `threatIntelligenceContext`. The backend operator configures the feed; MCP clients never send provider credentials. Stale or unavailable feeds never count as a pass, and the final decision remains the only authorization signal.
