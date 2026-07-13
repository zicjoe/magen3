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
