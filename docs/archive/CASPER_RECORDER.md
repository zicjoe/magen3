# Magen3 Casper Recorder

The Casper Recorder is the bridge between the Magen3 policy engine and Casper Testnet recording.

## What it does now

1. Reads an audit log from the backend.
2. Builds a deterministic audit payload.
3. Hashes the full payload.
4. Shows the `record_decision` runtime args in the frontend.
5. Lets the user copy the prepared JSON.
6. Supports demo-mode mock recording.
7. Supports manual confirmation of a real Casper deploy hash.

## Why this matters

The app no longer treats `Record on Casper` as a blind mock button. The user can now inspect exactly what will be recorded before signing or confirming a deploy.

## Current backend endpoints

```text
POST /api/audit-logs/:id/casper-payload
POST /api/audit-logs/:id/casper-confirm
POST /api/audit-logs/:id/record
```

## Current frontend flow

```text
Audit Log
→ Open record details
→ Prepare Payload
→ Inspect runtime args
→ Copy JSON
→ Mock Record or Confirm Real Deploy Hash
```

## Runtime args prepared

```text
decision_id
wallet_address
agent_id
shield
action_type
decision
risk
risk_score
amount
target
policy_used
reason_hash
payload_hash
```

## Next step

The next step is real wallet signing, where the frontend uses a Casper wallet/provider to submit a `record_decision` call to the deployed Magen3 audit registry contract.
