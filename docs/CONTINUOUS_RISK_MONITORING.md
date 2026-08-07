# Continuous Risk Monitoring

Milestone 28 extends Magen3 from per-intent protection into bounded, deterministic continuous monitoring. It consumes existing Magen3 state rather than creating a second authorization engine.

## Architecture

A monitor is scoped to an owner wallet and registered Magen3 agent. Each definition has a bounded cadence, explicit categories, configuration, optional automated-action preferences, a persistent checkpoint, and due-time state. Evaluations consume bounded existing agent, active-policy, audit/reconciliation, Threat Intelligence, Oracle, and Compliance summaries. They never receive private keys, signing material, provider credentials, or raw unbounded provider payloads.

The scheduler is opt-in with `MONITORING_SCHEDULER_ENABLED=true`. It uses a process-local overlap guard, a minimum 60-second interval, per-monitor due times, and store-level tenant scoping. Manual evaluations use the same engine through `POST /api/monitoring/run`.

## Monitored conditions

The engine supports categories for agent/API-key health, policy/configuration drift, provider/RPC health, wallet/exposure findings, execution state, bridge delivery, x402 settlement/resource delivery, metered authorization, asset/contract risk, Threat Intelligence, Oracle, Compliance, simulation, and market risk. The current release directly evaluates agent status, active-policy presence, API-key age, policy fingerprint drift, provider state transitions/degradation, delayed or uncertain execution, delayed bridge delivery, delayed x402 settlement, missing x402 resource delivery, and high-severity existing exposure findings. Other categories are typed extension points that must consume the relevant existing subsystem rather than duplicate it.

## Alerts and recovery

Alerts contain a stable deduplication key, evidence hash, first/last observed timestamps, occurrence count, severity, category, status, acknowledgement, recovery state, suggested resolution, bounded evidence, optional automated-action metadata, and bounded append-only history. Repeated observations update the existing alert instead of creating an alert storm. When a previously active condition clears, the alert transitions to `Recovered`.

Supported statuses are `Open`, `Acknowledged`, `Investigating`, `Resolved`, `Suppressed`, and `Recovered`.

## Automated safe actions

Automated actions require two independent opt-ins: the monitor definition must request the action and the active policy must list the action in `structuredRules.monitoringAutomatedActions`. The current implementation reuses the existing Emergency Circuit Breaker rather than creating a second enforcement mechanism. Supported deterministic actions are:

- `agent-pause` -> Agent scope, Blocked
- `bridge-retry-prevention` -> Bridge scope, Blocked
- `x402-pause` -> x402 scope, Blocked
- `increased-review` -> Agent scope, Review Required

Each executed pause is handled and audited by the existing emergency-control workflow. Credential revocation, provider disablement, direct payment-authorization revocation, and direct human-escalation creation are not automatically executed by this release; they remain explicit operator workflows rather than being simulated or falsely reported as supported.

## API

- `GET /api/continuous-risk-monitoring/status` — public bounded capability/scheduler status.
- `GET /api/monitoring?walletAddress=...` — owner-scoped monitor and alert state using the application's existing wallet-scoped admin model.
- `POST /api/monitoring/monitors` — create a monitor for an owned agent.
- `POST /api/monitoring/monitors/:id` — update a monitor without changing ownership/agent binding.
- `POST /api/monitoring/run` — manually run due or forced monitoring for an owner scope.
- `POST /api/monitoring/alerts/:id` — acknowledge/investigate/resolve/suppress an alert in owner scope.
- `GET /api/agent-gateway/monitoring?agentId=...` — API-key-authenticated, agent-scoped monitor/alert polling for SDK/MCP clients.

## Persistence

Additive PostgreSQL tables `monitoring_monitors` and `monitoring_alerts` preserve definitions, checkpoints, alerts, bounded history, recovery, and acknowledgement state. Existing agent, policy, audit, proof, reconciliation, bridge, x402, Threat Intelligence, Oracle, and Compliance records are untouched.

## Security and privacy

Monitoring evidence is bounded and sanitized. Cross-tenant reads are prevented by owner scoping; agent polling additionally requires the existing agent API key. Monitoring does not accept provider URLs, RPC URLs, secrets, signed transactions, or private identity data. Provider state is consumed from existing server-controlled integrations. Operational monitoring evidence is not added to Casper decision proofs. Automated actions reuse audited emergency controls and require policy authorization.

## Deployment

The application starts safely with monitoring scheduling disabled. Set `MONITORING_SCHEDULER_ENABLED=true` only when the deployment process is intended to own scheduled evaluations. `MONITORING_SCHEDULER_INTERVAL_MS` defaults to 60000 and is bounded between 60000 and 3600000 milliseconds.

A single-process interval is appropriate for the current Railway deployment model. Multi-replica deployments should run only one scheduler-owning replica or move ownership to a durable job coordinator before enabling the scheduler on every replica.

## Roadmap boundary

This is Milestone 28, the final milestone in the supplied roadmap. It consumes Milestones 11–27. It does not redesign the protected-intent decision engine, create a competing settlement state machine, enable mainnet, add new compliance/oracle/threat providers, or place raw monitoring evidence on Casper.
