# Instruction Integrity Explanation Implementation Report

## Purpose

Replace the generic instruction-provenance failure message with deterministic, field-specific explanations that an external AI agent can display directly to its user.

## User-facing behavior

Magen3 still fails closed. Nothing is signed or sent for `Blocked` or `Review Required` decisions. The difference is that the response now explains the exact problem whenever the submitted evidence makes that possible.

Examples:

- Amount mismatch: the prepared amount changed from the original value to the received value.
- Destination mismatch: the prepared destination changed after the original request.
- Missing binding: the agent omitted the goal ID or original-request hash.
- Invalid hash: the named hash is malformed.
- Adapter hash mismatch: the agent calculated the current transaction hash differently from Magen3.
- Source contradiction: the source category and external-content flag disagree.

Every response continues to expose `agentMessage`. Developer diagnostics are available under `decisionExplanation`:

- `code`
- `module`
- `field`
- `expected`
- `received`
- `mismatchFields`
- `details`

## Stable diagnostic codes

The implementation introduces distinct codes for missing provenance, malformed goal and parameter hashes, current-hash mismatch, original-snapshot mismatch, missing goal binding, blocked or unapproved sources, protected-field changes, missing change reasons, unconfirmed external changes, self-authorized x402 payments, tool-scope expansion, and untrusted external actions.

## Canonical SDK binding

The TypeScript SDK now exports:

- `buildMagen3ProtectedParameters()`
- `hashMagen3ProtectedParameters()`
- `createMagen3InstructionIntegrityBinding()`

The Python SDK now exports:

- `build_protected_parameters()`
- `hash_protected_parameters()`
- `create_instruction_integrity_binding()`

The helpers generate the backend-compatible hashes and include a non-secret `originalProtectedParameters` snapshot. Preserving that snapshot while retrying the same goal lets Magen3 identify exact amount, destination, asset, network, contract, entry-point, action-type, or runtime-argument changes.

## Gateway, audit, and UI changes

- Gateway normalization accepts and sanitizes `originalProtectedParameters`.
- Both memory and PostgreSQL stores pass the snapshot into policy evaluation and retain normalized audit evidence.
- The decision engine copies structured diagnostics from the primary finding.
- Audit Logs and Intent Playground show the user-ready message and optional developer diagnostics.
- Onboarding snippets, Developer Portal docs, Agent Skills, direct REST guidance, SDK docs, MCP docs, and examples were synchronized.

## Package versions

- TypeScript SDK: `@magen3/sdk@0.4.0-beta.3`
- Python SDK: `0.4.3`
- MCP server: `0.5.1`

The MCP schema and integrity identity were updated for the original protected-parameter snapshot. A narrow, exact compatibility mapping permits the trusted official `0.5.1` MCP upgrade when an existing policy contains the exact former `0.5.0` official binding. Arbitrary tool, manifest, schema, description, origin, or permission changes still fail according to policy.

## Verification

- Backend tests: 396 passed, 0 failed.
- Instruction-integrity and decision-explanation tests: 23 passed, 0 failed.
- TypeScript SDK: 35 passed, 0 failed.
- Python SDK: 28 passed, 0 failed.
- MCP core: 25 passed, 0 failed.
- Frontend security-model/TSX semantic checks: passed.
- Security patch verification: passed.
- Integration-contract verification: passed.
- npm package dry run: passed with exactly five intended files.
- Independent SDK consumer installation, import, and binding generation: passed.

The full Vite production build and dependency-backed MCP protocol test require the project dependencies. The execution environment registry could not provide those dependencies, so those two checks must run through local `pnpm verify` or GitHub Actions.

## Compatibility and deployment

- No database migration.
- No environment-variable change.
- No API-key rotation.
- No Casper contract change.
- Existing requests without Instruction Integrity remain governed by existing policy compatibility behavior.
- Existing SDK users can update the same package; no new SDK package is required.
