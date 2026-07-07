# Magen3 Gateway Integration

Magen3 is now focused as a security gateway for external AI agents.

## Product model

External agents should not be built inside Magen3. They should connect to Magen3 as an external policy and approval layer.

```text
External Agent → Magen3 Gateway API → Allowed / Blocked / Review Required
```

Magen3 is chain-agnostic at this gateway layer. The current MVP records decision proofs on Casper Testnet, while the external agent can describe the target execution chain in the request.

## Integration steps

1. Connect Casper Wallet in Magen3.
2. Register the external agent in Agent Registry.
3. Create and activate a policy for that agent.
4. Open Gateway Integration.
5. Copy the Gateway URL and Agent ID into the external agent.
6. The external agent calls `POST /api/agent-gateway/intents` before execution, including the intended `targetChain` when relevant.
7. The external agent only asks for wallet signing if Magen3 returns `Allowed`.

## Request shape

```json
{
  "source": "yieldbot-ai",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "CASPER_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to trusted-validator-demo",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "trusted-validator-demo",
    "targetType": "Trusted Contract"
  }
}
```

## Response behavior

- `Allowed`: external agent may ask the connected wallet to sign.
- `Blocked`: external agent must stop.
- `Review Required`: external agent must pause until human approval.

For cross-chain use, `targetChain` should describe where execution is intended to happen. Casper can still be used as the neutral decision-proof layer even when the final execution target is another chain.

## Audit model

Magen3 tracks two proofs:

- Decision Proof: Magen3 policy decision recorded on Casper.
- Execution Proof: real deploy/transaction hash after approved wallet signing.

Manual hash inputs are hidden as advanced fallback only. Normal flow should capture hashes automatically from the external agent/wallet flow.
