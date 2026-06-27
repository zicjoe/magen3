# Magen3 v14 - Casper Proof Section

This version makes the on-chain proof visible inside the Audit Log drawer.

## What changed

- Audit records now show a dedicated **Casper Proof** card.
- Real 64-character Casper deploy hashes are detected and marked as **Recorded on Casper**.
- Local/mock hashes are clearly marked as **Local Mock** so they are not confused with a real on-chain proof.
- The real deploy hash confirm field is always visible when an audit record is opened.
- Confirming a deploy hash now validates and stores a real Casper deploy hash only.
- The Audit Log table links real deploy hashes to CSPR.live Testnet.
- Dashboard Casper record count now counts only real deploy hashes, not mock records.

## Demo flow

1. Connect Casper Wallet.
2. Register an agent.
3. Create and activate a policy.
4. Analyze an action.
5. Create an audit record.
6. Prepare the Casper payload.
7. Sign the `record_decision` deploy from WSL using `casper-client`.
8. Paste the returned deploy hash into the **Casper Proof** card.
9. Open the CSPR.live link from the Audit Log.

## Important

Use the deploy hash returned by `casper-client put-deploy`, not the contract hash.

- Contract hash = installed Magen3 contract reference.
- Deploy hash = proof that a specific decision was recorded.
