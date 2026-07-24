# Tool & MCP Integrity

## Status

**Live** under **Agent Shield → Agent Trust & Access → Tool & MCP Integrity**.

## Purpose

Tool & MCP Integrity prevents an autonomous agent from silently switching to an unknown, changed, or over-privileged MCP server or tool before wallet signing. The final authorization remains deterministic and uses the existing `Allowed`, `Blocked`, and `Review Required` outcomes.

## Intent metadata

Submit public unsigned evidence under `action.toolIntegrity`:

- `mcpServerId` or `mcpServerUrl`
- `toolName` and optional `toolVersion`
- SHA-256 `manifestHash`
- SHA-256 `schemaHash`
- optional SHA-256 `descriptionHash`
- `permissionScopes`
- non-secret `credentialScope` label
- `tls` secure-transport assertion
- `toolOrigin`
- optional `approvedAt`

Never submit MCP credentials, private keys, wallet signatures, raw signed transactions, or secret tool output.

## Deterministic checks

The control evaluates:

- approved MCP server ID or URL
- approved server manifest binding
- approved server/tool pair
- required manifest and schema evidence
- tool manifest, schema, and description hash changes
- version changes
- origin changes
- TLS/secure-transport requirements
- requested permission-scope containment
- credential-scope containment
- `capability:*` scope containment within registered agent capabilities

An unavailable required hash never passes silently. Unknown identities follow the configured Warn, Review, or Block action. Material hash changes, disallowed transport, origin mismatch, credential-scope mismatch, or agent-capability overreach fail closed.

## Official Magen3 MCP bindings

The official `@magen3/mcp-server` supplies stable evidence automatically when downstream metadata is absent:

- server ID: `magen3-official-mcp`
- version: `0.4.0`
- tools: `magen3_check_intent` and `magen3_require_allowed`
- exact manifest, schema, and description hashes
- least-privilege Magen3 intent scopes
- origin: `@magen3/mcp-server`
- credential-scope label: `agent-gateway`

New policy forms begin with exact bindings for these tools. Explicit downstream-tool metadata is preserved instead of overwritten.

## Policy fields

- `toolIntegrityEnabled`
- `toolIntegrityMode`
- `approvedMcpServers`
- `approvedTools`
- `requireManifestHash`
- `requireSchemaHash`
- `requireTls`
- `allowToolVersionChanges`
- `unknownToolAction`
- `permissionExpansionAction`

## Audit evidence

Audit records store sanitized server/tool identity, version, hashes, permission scopes, credential-scope label, transport state, origin, approval matches, material-change state, violations, findings, and remediation. Secrets are not stored.

## Compatibility

Legacy policies without `toolIntegrityEnabled: true` remain compatible. Requests that do not indicate tool use are skipped. No database migration or environment variable is required.

## Limitations

The control verifies deterministic adapter-supplied evidence and exact policy bindings. It does not inspect arbitrary tool source code, prove a publisher is honest, eliminate supply-chain risk, or detect every semantic manipulation.
