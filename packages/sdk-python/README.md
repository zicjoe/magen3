# magen3-sdk

Official Python SDK for Magen3, a modular Web3 execution firewall.

```python
from magen3 import Magen3Client

client = Magen3Client(gateway_url, agent_id, api_key)
decision = client.check_intent({
    "executionWalletAddress": "CASPER_PUBLIC_KEY",
    "action": {"type": "Transfer", "amount": 2, "asset": "CSPR", "target": "RECIPIENT", "targetType": "Wallet Address"},
})
```

The SDK never signs or broadcasts blockchain transactions.
