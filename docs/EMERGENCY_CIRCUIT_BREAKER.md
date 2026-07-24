# Emergency Circuit Breaker

Status: **Live**  
Protection area: **Policy & Approval Controls**  
Gateway enforcement: **Deterministic, before authorization and before execution confirmation**

## Purpose

The Emergency Circuit Breaker gives a Magen3 owner a fast, auditable way to stop an agent, capability, action family, policy, or outgoing execution flow when the system behaves unexpectedly.

A pause is a separate security record. It does not revoke the agent, rotate its API key, rewrite its policy, delete audit history, or change the Casper decision-proof contract. Existing agents and credentials continue to exist while matching execution is stopped.

## Supported scopes

| Scope | Meaning |
| --- | --- |
| Platform | Stops every matching request owned by the connected Magen3 wallet. |
| All Execution | Stops all outgoing execution for the owner. |
| Agent | Stops one registered agent. |
| Capability | Stops one capability configured on one agent. |
| Action | Stops one exact normalized action type for one agent. |
| Policy | Stops requests governed by one policy. |
| Trading | Stops trading-family actions for one agent. |
| Contract | Stops contract-oriented execution for one agent. |
| Bridge | Stops Bridge actions for one agent. |
| x402 | Stops machine-payment actions for one agent. |

Each active pause returns either `Blocked` or `Review Required`. When several pauses match, `Blocked` takes precedence.

## Gateway order

The active pause check runs after Agent Authentication and active-policy loading, but before the remaining authorization controls. A matching blocked pause ends evaluation immediately. A matching review pause creates the normal exact-bound Human Approval request when the active policy enables the workflow.

The execution-confirmation route evaluates pause state again. This prevents an intent authorized before an incident from being recorded as executed after a relevant pause becomes active.

## Manual pause flow

1. Connect the existing Magen3 owner wallet.
2. Open Agent Details or Settings.
3. Select a scope and agent where required.
4. Choose `Blocked` or `Review Required`.
5. Set an expiry duration or use the API's indefinite option.
6. Record a clear incident reason.
7. Optionally require Human Approval quorum before resume.
8. Activate the pause.

Magen3 stores the pause, emits an audit record, submits the normal Casper decision proof when the relayer is available, and immediately applies the pause to matching Gateway traffic.

## Automatic triggers

Automatic pausing is deliberately **disabled by default** for backward compatibility. It must be enabled in the active policy with `structuredRules.automaticPauseEnabled`.

Supported deterministic triggers include:

- Replay or duplicate-execution findings
- Threat-intelligence hard matches
- Oracle disagreement findings
- Privileged-action failures
- Repeated blocked attempts
- Request-frequency threshold breaches
- Spending spikes calculated from Magen3 audit history
- Unresolved execution threshold breaches
- Unresolved x402 settlement threshold breaches
- Bridge failure threshold breaches
- Casper proof or configured provider failure thresholds

Automatic triggers create the same persistent pause record as manual activation. They do not create a hidden in-memory flag.

## Policy fields

```json
{
  "emergencyControlsEnabled": true,
  "automaticPauseEnabled": false,
  "emergencyAutomaticPauseAction": "Blocked",
  "emergencyRepeatedBlockThreshold": 5,
  "emergencyReplayAttemptThreshold": 1,
  "emergencyRequestFrequencyThreshold": 120,
  "emergencyLookbackSeconds": 3600,
  "emergencySpendingSpikeMultiplier": 5,
  "emergencyProviderFailureThreshold": 3,
  "emergencyUnresolvedExecutionThreshold": 5,
  "emergencyUnresolvedX402Threshold": 3,
  "emergencyBridgeFailureThreshold": 3,
  "emergencyPauseDurationSeconds": 3600,
  "emergencyResumeRequiresApproval": false,
  "emergencyResumeQuorum": 1,
  "emergencyPauseOnThreatMatch": true,
  "emergencyPauseOnOracleDisagreement": true,
  "emergencyPauseOnPrivilegedActionFailure": true
}
```

Manual pausing remains available from the administrative UI even when automatic triggers are disabled. The policy fields define automatic behavior, default duration, resume requirements, Security Coverage, and Integration Health expectations.

## Resume behavior

A direct resume requires:

- The same wallet-scoped owner boundary used by the existing Magen3 administrative application
- An active, owned pause
- A non-empty incident-resolution reason
- A wallet included in the pause's resume-authority list

When approval-gated resume is enabled:

- The pause remains active.
- Magen3 creates an exact-bound Human Approval request.
- The request binds the pause ID, scope, decision, trigger, expiry, and resume reason.
- Only distinct configured reviewer wallets count.
- Rejection or expiry does not resume the pause.
- Reaching quorum marks the pause Resumed and writes a second audit event.

The existing Human Approval limitation still applies: reviewer responses are wallet-scoped in the current application session and are not yet separately cryptographically signed. Cryptographic Reviewer Signatures remain the next roadmap milestone.

## Expiry

A pause may have an ISO expiry or a bounded duration. Expired pauses are normalized to `Expired` and no longer match new requests. Expiry does not erase the record. The original activation remains visible in Audit Logs.

An indefinite pause is supported through the API by using a zero duration and no `expiresAt`. The current UI uses a positive duration for safer operator defaults.

## Audit evidence

Activation, resume requests, and completed resumes preserve:

- Pause ID
- Owner wallet
- Agent and policy when applicable
- Scope type and scope value
- Enforcement action
- Manual or automatic trigger type
- Trigger rule and evidence
- Incident reason
- Created and expiry timestamps
- Resume authorities
- Approval requirement and quorum
- Approval request and binding hash
- Resume actor, reason, and timestamp
- Structured findings and Security Pipeline stages
- Casper proof state

No API key, private key, mnemonic, wallet secret, provider credential, or raw signature is stored in the pause record.

## REST endpoints

### Status

```text
GET /api/emergency-controls/status?walletAddress=PUBLIC_OWNER_WALLET
```

### List pauses

```text
GET /api/emergency-pauses?walletAddress=PUBLIC_OWNER_WALLET
```

### Activate a pause

```http
POST /api/emergency-pauses
Content-Type: application/json
```

```json
{
  "walletAddress": "PUBLIC_OWNER_WALLET",
  "agentId": "MAG-AGENT-...",
  "scopeType": "Agent",
  "scopeValue": "MAG-AGENT-...",
  "enforcementAction": "Blocked",
  "reason": "Repeated replay findings require investigation.",
  "durationSeconds": 3600,
  "resumeRequiresApproval": true,
  "resumeQuorum": 2
}
```

### Resume or request resume approval

```http
POST /api/emergency-pauses/PAUSE_ID/resume
Content-Type: application/json
```

```json
{
  "walletAddress": "PUBLIC_AUTHORIZED_WALLET",
  "reason": "Replay source isolated and lifecycle keys rotated."
}
```

## Structured findings

The control emits a finding with module `Emergency Circuit Breaker` and rule `Active emergency pause` for every evaluated Gateway request:

- `pass`: no active matching pause
- `warning`: a matching pause requires review
- `fail`: a matching pause blocks execution

An automatically created pause adds a trigger finding with its threshold evidence. An unavailable pause store is not represented as pass; store failures surface as request failures rather than silently authorizing execution.

## Security Coverage and Integration Health

Security Coverage checks deterministic configuration and observed Gateway evidence. It does not award points merely because a UI card exists.

Integration Health reports attention when:

- An active pause exists
- The latest request was blocked or escalated by Emergency Controls
- A resume approval remains pending

A clear latest Gateway finding reports that pause state was evaluated and no matching pause applied.

## Database migration

The release adds the `emergency_pauses` table and indexes through the existing idempotent Railway startup migration. The migration is additive. It does not modify existing agents, credentials, policies, approvals, audits, Gateway requests, or Casper proof records.

Memory-store mode implements the same pause lifecycle, automatic triggers, approval-gated resume, audit records, and execution-confirmation check.

## Security boundary

Emergency Circuit Breaker proves that Magen3 enforced persistent configured pause state before authorization. It does not prove that every incident will be detected automatically, that every external provider is available, or that the current wallet-scoped administrative session is a cryptographic operator signature.

Do not bypass an active pause by changing tools, retry identifiers, routes, agents, or providers. A pause must be resolved through its authorized resume workflow.
