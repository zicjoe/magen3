# Final Demo Checklist

## Before recording

- Railway backend is deployed.
- Railway `/api/health` returns `ok: true`.
- PostgreSQL storage shows `postgres` when using Railway database.
- `MAGEN3_CONTRACT_HASH` is set on Railway.
- Casper Wallet extension is installed and unlocked.
- Browser is on the same profile where Casper Wallet is installed.
- Magen3 frontend points to the correct backend URL.

## App flow to verify

```text
Landing page
→ Launch App
→ Connect Casper Wallet
→ Dashboard
→ Agent Shield
→ Register Agent
→ Policies
→ Create/Activate Policy
→ Action Review
→ Analyze Action
→ Record Decision
→ Audit Log
→ Open record
→ Casper Proof
```

## Casper proof values

Contract hash:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

Known successful record_decision deploy hash:

```text
c95359f46a5709cc10d4e014dadc29b6b9734629b475b5d58f8ba2fa0394f668
```

## What to say in the demo

> Magen3 is a Web3 execution firewall for autonomous agents. It checks an agent's requested Web3 action against policy, returns a security decision, stores the audit trail, and anchors proof on Casper Testnet.

## Do not show

- `secret_key.pem`
- private keys
- Railway database password
- raw `.env` values containing secrets


## Agent Runner checks

- [ ] Agent Runner page opens from the sidebar.
- [ ] A natural-language goal generates a structured action request.
- [ ] Safe goal returns an Allowed/Low-risk style decision when policy permits it.
- [ ] Risky goal such as `Transfer 9000 CSPR to unknown-wallet` returns Blocked/High-risk.
- [ ] Record Decision adds the generated agent action to Audit Log.
- [ ] Audit Log Casper Proof can be used for the recorded agent decision.
