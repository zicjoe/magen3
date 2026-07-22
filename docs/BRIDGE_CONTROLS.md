# Bridge Controls

Bridge Controls evaluates provider-supplied cross-chain route metadata before wallet signing. The module is **Foundation Available**. It does not certify a bridge provider or verify cross-chain delivery.

## Intent schema

Use the existing Gateway endpoint and authentication headers. Add an `action.bridge` object to a `Bridge` action:

```json
{
  "action": {
    "type": "Bridge",
    "amount": 10,
    "asset": "CSPR",
    "target": "contract-package-hash-...",
    "targetType": "Bridge Contract",
    "contractIdentifierType": "Package Hash",
    "chainName": "casper-test",
    "bridge": {
      "sourceChain": "casper-test",
      "destinationChain": "ethereum-sepolia",
      "provider": "Reviewed Bridge Adapter",
      "routeId": "route-001",
      "destinationAddress": "0x0000000000000000000000000000000000000001",
      "asset": "CSPR",
      "feeAmount": 0.05,
      "feeBps": 50,
      "expectedOutput": 9.95,
      "minimumReceived": 9.8,
      "quoteTimestamp": "2026-07-22T15:00:00.000Z",
      "quoteExpiresAt": "2026-07-22T15:05:00.000Z",
      "sourceConfirmations": 2,
      "destinationConfirmations": 12
    }
  }
}
```

## Policy controls

Bridge policy values live in `structuredRules`:

```json
{
  "bridgeControlMode": "Review",
  "bridgeControlUnavailableAction": "Review",
  "bridgeAllowedProviders": ["Reviewed Bridge Adapter"],
  "bridgeAllowedSourceChains": ["casper-test"],
  "bridgeAllowedDestinationChains": ["ethereum-sepolia"],
  "bridgeBlockedDestinationChains": [],
  "bridgeAllowedAssets": ["CSPR"],
  "bridgeMaxAmount": 100,
  "bridgeMaxFeeBps": 100,
  "bridgeMaxQuoteAgeSeconds": 300,
  "bridgeRequireQuoteExpiry": true,
  "bridgeMinSourceConfirmations": 2,
  "bridgeMinDestinationConfirmations": 12
}
```

`bridgeControlMode` accepts `Observe`, `Review`, or `Enforce`. `bridgeControlUnavailableAction` accepts `Warn`, `Review`, or `Block`.

An explicitly blocked destination chain is always blocked. Other route violations are warnings in Observe mode, require review in Review mode, and block in Enforce mode.

## Deterministic checks

- Complete route identity and metadata
- Provider name and route ID structure
- Approved provider
- Distinct source and destination chains
- Approved source chain
- Approved or blocked destination chain
- Allowed asset
- Maximum bridge amount
- Maximum route fee
- Quote timestamp freshness and expiry
- Expected-output and minimum-received consistency
- Casper and EVM destination-address structure for recognized chain families
- Source and destination confirmation requirements

Unknown destination-chain families produce `unavailable`, not `pass`.

## Security boundary

A passing result means the submitted metadata satisfied the active policy. It does not prove:

- Provider liquidity or solvency
- Bridge smart-contract safety
- Destination-chain liveness or finality
- Correct route execution
- Cross-chain message delivery
- Recipient control of the destination address

Contract Validation still evaluates the exact Casper bridge contract or package separately. Wallet signing remains outside Magen3 and requires explicit user approval.

## Audit and response

Bridge findings are stored in the audit record and returned as structured `moduleFindings`. `bridgeControlsContext` contains sanitized route details such as provider, chains, route ID, asset, amount, fee, destination address family, quote expiry, and confirmation requirements.

No bridge API credential or private key belongs in an intent.
