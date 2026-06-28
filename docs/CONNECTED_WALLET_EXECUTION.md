# Connected Wallet Execution Flow

Magen3 v23 adds the next production-shaped execution step: after an external agent receives an **Allowed** decision from Magen3, the same connected Casper Wallet can sign an on-chain execution proof.

## What this proves

The demo now shows the full gate:

```text
External agent receives a task
→ Agent asks Magen3 Gateway for permission
→ Magen3 checks the active wallet-scoped policy
→ Blocked / Review Required actions stop before signing
→ Allowed actions can request Casper Wallet signature
→ Signed deploy is submitted to Casper Testnet
→ Returned deploy hash is attached to the audit log
```

## What is signed

For the safe buildathon demo, the connected wallet signs an on-chain **execution proof** against the deployed Magen3 audit registry contract.

This is intentionally safer than moving funds during the demo. It proves the user wallet approved the Magen3-allowed action and produces a real Casper deploy hash without needing to perform a real staking or transfer operation.

## UI flow

1. Connect Casper Wallet.
2. Register an agent.
3. Create and activate a policy.
4. Open **External Agent**.
5. Ask for a safe action, for example `Stake 15 CSPR to trusted-validator-demo`.
6. Magen3 should return `Allowed`.
7. Click **Sign with Connected Casper Wallet**.
8. Approve the Casper Wallet prompt.
9. Magen3 submits the signed deploy through `/api/casper/send-deploy`.
10. The returned deploy hash is saved through `/api/audit-logs/:id/execution-confirm`.
11. Open Audit Log and verify **Execution Proof**.

## Backend endpoint

```http
POST /api/casper/send-deploy
```

Body:

```json
{
  "signedDeploy": { "deploy": {} }
}
```

The backend forwards the signed deploy to the configured Casper RPC using `account_put_deploy` and returns the deploy hash.

## Important note

This is not an invisible agent key. The agent does not hold the user's private key. The wallet owner still approves the signature from Casper Wallet.
