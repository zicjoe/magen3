# magen3-sdk

Official Python SDK for Magen3, a modular Web3 execution firewall.

## Wallet transfer

```python
from magen3 import Magen3Client

client = Magen3Client(gateway_url, agent_id, api_key)
decision = client.check_intent({
    "executionWalletAddress": "CASPER_PUBLIC_KEY",
    "action": {
        "type": "Transfer",
        "amount": 2,
        "asset": "CSPR",
        "target": "RECIPIENT_PUBLIC_KEY",
        "targetType": "Wallet Address",
    },
})
```

## Contract call

```python
decision = client.check_intent({
    "executionWalletAddress": "CASPER_PUBLIC_KEY",
    "targetChain": "casper-testnet",
    "action": {
        "type": "Contract Call",
        "target": "contract-package-hash-<64-hex-characters>",
        "targetType": "Trusted Contract",
        "contractIdentifierType": "Package Hash",
        "entryPoint": "deposit",
        "contractVersion": 1,
        "chainName": "casper-test",
    },
})
```

A trusted-looking target label never bypasses policy enforcement. Contract identifiers, entry points, network context, blocked-contract controls, and approved-contract controls are evaluated by the live Contract Validation module.

The SDK never signs or broadcasts blockchain transactions.
