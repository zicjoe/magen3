# Connected Wallet Execution

Magen3 separates three identities:

| Identity | Role |
| --- | --- |
| Owner wallet | Registers and manages the Connected Agent in Magen3. |
| Connected Agent | External app or autonomous system that calls the gateway. |
| Execution wallet | Wallet that signs the real transaction after Magen3 returns `Allowed`. |

The owner wallet and execution wallet can be different. This is important because Magen3 is the security gateway, not the external agent and not the signing wallet.

## Flow

```text
External agent prepares action
-> external agent calls Magen3 Gateway
-> Magen3 checks active policy
-> Magen3 returns Allowed / Blocked / Review Required
-> execution wallet signs only if Allowed
-> execution hash is attached to the Magen3 audit record when available
```

## Proofs

Magen3 uses two proof concepts:

- **Decision Proof:** Casper Testnet proof that Magen3 reviewed the action and recorded the decision.
- **Execution Proof:** real transaction/deploy hash created after the execution wallet signs and submits the approved action.

Blocked and review-required actions should not have execution hashes because they should not proceed to wallet signing.
