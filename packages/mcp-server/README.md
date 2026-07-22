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

## Oracle Validation

For Swap and other oracle-sensitive actions, an MCP client may provide `outputAsset` and `action.oracle` with `baseAsset`, `quoteAsset`, `executionPrice`, and `quoteTimestamp`. Magen3 compares the submitted quote with a configured multi-source reference feed and returns deterministic findings for freshness, source quorum, confidence, cross-source spread, and price deviation.

The MCP client never sends oracle-provider credentials. Those remain backend environment variables. Oracle Validation is Foundation Available, not Live, because Magen3 does not bundle or certify a production oracle feed. Treat the final Magen3 decision—not an individual oracle finding—as the authorization result.


## Bridge Controls

For `Bridge` actions, provide `action.bridge` with the provider-supplied source and destination chains, provider, route ID, destination address, asset, fee, output bounds, quote timestamps, and confirmation requirements. Inspect `bridgeControlsContext` and structured Bridge Controls findings before continuing.

Bridge Controls is Foundation Available. It validates declared route metadata and configured policy boundaries but does not certify a bridge provider, destination-chain finality, or cross-chain message delivery.
