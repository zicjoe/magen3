# Magen3 Documentation

Current product and integration documentation for the Magen3 Platform and Agent Shield.

## Product and architecture

- `MAGEN3_PLATFORM.md` — product model, execution capabilities, protection areas and control-level status, Security Pipeline, Risk Assessment, Security Coverage, Intent Playground, audit records, proofs, compatibility, deployment, and troubleshooting.
- `AGENT_GATEWAY_API.md` — current gateway authentication and request/response contract.
- `AI_NATIVE_REVIEW_RESOLUTION.md` — autonomous remediation, balanced escalation, human-governed review, and agent-ready decision explanations.
- `GATEWAY_INTEGRATION.md` — external-agent integration before wallet signing.
- `CONNECTED_WALLET_EXECUTION.md` — owner wallet, execution wallet, and proof boundaries.
- `AGENT_INSTRUCTION_INTEGRITY.md` — deterministic goal binding, source provenance, protected-parameter fingerprints, external-content confirmation, permission-scope containment, audit evidence, and limitations.
- `EXECUTION_INTEGRITY.md` — lifecycle metadata, canonical intent fingerprints, replay prevention, idempotency, expiry, sequence, retry/replacement rules, policy controls, and compatibility.
- `RPC_CHAIN_INTEGRITY.md` — approved RPC providers, network identity, freshness, quorum agreement, failover, audit evidence, and Live criteria.
- `EXECUTION_SETTLEMENT_RECONCILIATION.md` — authenticated execution state, retry prevention, replacement links, confirmations, finality, delivery, refund, optional backend-configured polling, and Live criteria.
- `TOKEN_PERMISSION_CONTROLS.md` — deterministic approval and permit classification, spender and amount policy, expiry, fingerprint replay prevention, Human Approval binding, SDK/MCP schema, and security boundary.
- `HUMAN_APPROVAL_WORKFLOW.md` — exact-intent Review Required approvals, quorum, expiry, separation of duties, agent polling, audit evidence, and current security boundary.
- `THREAT_INTELLIGENCE.md` — feed schema, policy modes, freshness, environment configuration, and operational safeguards.
- `ORACLE_VALIDATION.md` — price-intent fields, multi-source feed schema, policy limits, freshness, operational status, and security boundary.
- `BRIDGE_CONTROLS.md` — route metadata, provider and chain policy, fees, quote freshness, destination formats, and confirmation boundaries.
- `X402_PAYMENT_CONTROLS.md` — x402 v2 intent schema, policy limits, request binding, replay prevention, settlement reconciliation, SDK flow, and security boundary.
- `COMPLIANCE_CONTROLS.md` — non-sensitive evidence schema, policy controls, optional exact-match feed, privacy boundary, and deployment guidance.

## Developer integrations

- `OFFICIAL_SDKS.md` — official TypeScript and Python SDKs.
- `MCP_SERVER.md` — official MCP server and Codex integration.
- `AGENT_SKILLS_KIT.md` — exported agent instruction and environment templates, where present.

## Casper

- `CASPER_DEPLOYMENT_PLAYBOOK.md` — audit-registry contract and relayer deployment reference.

## Archived notes

Historic build notes, recording scripts, and old walkthroughs live in `archive/`. They are retained for project history and should not override the current README, in-app Docs, or `MAGEN3_PLATFORM.md`.

- [Emergency Circuit Breaker](./EMERGENCY_CIRCUIT_BREAKER.md) — persistent scoped pauses, automatic triggers, expiry, authorized resume, approval-gated resume, and Gateway enforcement.
- [Privileged Action Controls](./PRIVILEGED_ACTION_CONTROLS.md) — deterministic administrative-call classification, policy, fingerprinting, and Human Approval binding.

- [Approval Escalation & Organizational Quorum](./APPROVAL_ESCALATION_ORGANIZATIONAL_QUORUM.md) — deterministic tiers, named role groups, timed escalation, delays, and signing windows.

- [Contract Upgrade Safety](./CONTRACT_UPGRADE_SAFETY.md)
- [Contract Argument Policies](./CONTRACT_ARGUMENT_POLICIES.md) — exact contract/entry-point runtime-argument rules, types, ranges, address policies, fingerprints, and Human Approval binding.

- [`TOOL_MCP_INTEGRITY.md`](TOOL_MCP_INTEGRITY.md) — deterministic MCP server/tool identity, hash, transport, and permission-scope enforcement.

- [Delegation & Session Key Safety](./DELEGATION_SESSION_KEY_SAFETY.md) — Casper-signed, expiring, least-privilege delegated authority and session-key enforcement.

- [Integration Configuration](./INTEGRATION_CONFIGURATION.md) — canonical environment variables, base URL semantics, SDK, Python, and MCP setup.

- [Trading Route Integrity](TRADING_ROUTE_INTEGRITY.md) — deterministic quote, router, path, pool, fee-recipient, calldata, and payload binding for Milestone 20.
