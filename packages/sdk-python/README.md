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
        "preflight": {
            "paymentAmountMotes": "5000000000",
            "gasPriceTolerance": 1,
            "ttl": "30m",
            "timestamp": "2026-07-22T10:00:00.000Z",
        },
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
        "preflight": {
            "paymentAmountMotes": "5000000000",
            "gasPriceTolerance": 1,
            "ttl": "30m",
            "timestamp": "2026-07-22T10:00:00.000Z",
            "runtimeArgs": {"amount": "1000000000"},
        },
    },
})
```

A trusted-looking target label never bypasses policy enforcement. Contract identifiers, entry points, network context, blocked-contract controls, and approved-contract controls are evaluated by the live Contract Validation module.

Execution Simulation is Foundation Available. It validates supplied construction metadata without claiming full stateful execution. Never include private keys, wallet approvals, transaction-level signatures, or raw signed transactions. Public contract arguments belong only inside `runtimeArgs`.

Threat Intelligence findings and the sanitized `threatIntelligenceContext` are returned in the normal decision dictionary when the backend is configured with a feed. A no-match result is not a guarantee of safety.

The SDK never signs or broadcasts blockchain transactions.

## Oracle Validation

Trading and DeFi intents can submit exact quote metadata without any wallet secret:

```python
decision = client.evaluate_intent({
    "action": {
        "type": "Swap",
        "amount": 10,
        "token": "CSPR",
        "outputAsset": "USD",
        "target": "contract-package-<64-hex>",
        "oracle": {
            "baseAsset": "CSPR",
            "quoteAsset": "USD",
            "executionPrice": 0.025,
            "quoteTimestamp": "2026-07-22T12:00:00.000Z",
        },
    }
})
```

The normal decision dictionary may include `oracleValidationContext` and structured Oracle Validation findings. The backend operator controls the feed and policy thresholds. Oracle Validation is Foundation Available; a passing comparison is not a guarantee that a market price is correct or that execution will succeed.
