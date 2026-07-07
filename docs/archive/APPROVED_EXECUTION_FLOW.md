# Magen3 Approved Execution Flow

Magen3 now separates two proofs:

1. **Magen3 Decision Proof**  
   The decision that Magen3 made after checking policy: Allowed, Blocked, or Review Required.

2. **Execution Proof**  
   The real Casper transaction/deploy hash after the wallet owner signs and submits the approved action.

## Real-world flow

```text
External agent receives task
→ Agent sends structured intent to Magen3 Gateway
→ Magen3 checks wallet-scoped agent + policy
→ Magen3 returns Allowed / Blocked / Review Required
→ If Allowed, the agent asks the wallet owner to sign the actual transaction
→ The real execution deploy hash is attached back to the audit record
→ Audit Log shows both Magen3 proof and execution proof
```

## Why the agent should not hold the private key

For the MVP and for safer production design, the external agent should not secretly hold the user’s private key. The agent may prepare the transaction and request execution, but the wallet owner or controlled execution layer should sign it.

This keeps Magen3 positioned as the execution firewall:

```text
Agent intent → Magen3 approval → wallet signature → execution hash → audit trail
```

## New backend endpoint

```text
POST /api/audit-logs/:id/execution-confirm
```

Request body:

```json
{
  "deployHash": "64-character-casper-deploy-hash",
  "signedBy": "casper-public-key",
  "note": "External agent action executed after Magen3 approval."
}
```

Rules:

- The deploy hash must be a real 64-character Casper deploy hash.
- The audit decision must be `Allowed` before execution proof can be attached.
- Blocked and Review Required actions cannot receive execution proof.

## Demo flow

1. Open **External Agent**.
2. Ask YieldBot: `Stake 15 CSPR to trusted-validator-demo`.
3. Magen3 approves the intent.
4. Sign or submit the approved transaction through the wallet/execution flow.
5. Paste the returned Casper deploy hash into **Execution Deploy Hash**.
6. Open **Audit Log**.
7. Show:
   - Decision Proof: Magen3 decision recorded on Casper.
   - Execution Proof: real approved transaction/deploy hash.

For blocked actions, the External Agent will say it will not ask the wallet to sign, and the Audit Log will show execution blocked before submission.
