# Magen3 Gateway Integration

Magen3 is the security gateway. External agents remain independent apps and call Magen3 before requesting wallet signatures.

## Integration Flow

```text
Register Connected Agent in Magen3
-> copy Agent ID and one-time API key
-> attach an active policy
-> external agent verifies its gateway access
-> external agent submits action intent
-> Magen3 returns Allowed / Blocked / Review Required
-> external agent requests wallet signing only if Allowed
```

## Required Values

| Value | Where it comes from |
| --- | --- |
| Agent ID | Connected Agents page |
| Agent API Key | Shown once after registration or rotation |
| Gateway URL | Connected Agents page or Settings |
| Verify URL | Connected Agents page or Settings |
| Policy | Policies page |

Copy buttons in Magen3 are wired through the shared clipboard helper for Agent ID, Gateway URL, Verify URL, API keys, code snippets, settings endpoints, policy hash, and docs code blocks.

## Cross-chain Intent Payload

Magen3 is chain-agnostic at the gateway and policy layer. Include `targetChain` so Magen3 can review the intended environment even when the current proof layer is Casper Testnet.

```json
{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "The agent prepared this action and needs Magen3 approval.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}
```

## API Key Rotation

Raw API keys are shown once. If the external agent loses the key, rotate it in Connected Agents and update the external app.

Rotation affects that connected agent only. It does not rotate keys for every app and it does not create a policy-specific key.

## Recommended External Agent Behavior

- Verify the connected agent before execution.
- Submit every high-risk Web3 intent to Magen3 before wallet signing.
- Stop immediately when Magen3 returns `Blocked`.
- Pause for human review when Magen3 returns `Review Required`.
- Request wallet signing only when Magen3 returns `Allowed`.
- Attach the real execution hash back to Magen3 after execution when available.

## Proof Model

Magen3 records Decision Proofs on Casper Testnet. Execution Proofs come from the external wallet or target execution layer after an allowed action is signed and submitted.
