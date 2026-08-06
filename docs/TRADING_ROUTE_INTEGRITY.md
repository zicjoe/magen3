# Trading Route Integrity

**Milestone:** 20  
**Status:** Foundation Available

Trading Route Integrity verifies that a swap or trade payload still represents the exact route authorized by the protected intent and trusted quote adapter. It is evaluated before signing and submits deterministic findings to the existing Magen3 Risk Assessment Engine.

## What it evaluates

For `Swap`, `Trade`, and `Exchange` actions, the module can bind and evaluate:

- quote provider and quote/route identifier;
- exact router and optional aggregator/protocol;
- ordered pool sequence;
- ordered token path, including intermediary assets;
- input and output assets;
- input amount, expected output, and minimum output;
- exact-input or exact-output semantics;
- route fees and explicit fee recipients;
- intermediary contracts;
- final calldata and its SHA-256 hash;
- the route-authorized unsigned payload hash against Stateful Simulation;
- a deterministic fingerprint of the complete authorized route snapshot.

Array order is preserved because pool and token order are security-sensitive. Object keys are canonicalized before hashing.

## Gateway request

The existing endpoint remains unchanged:

```text
POST /api/agent-gateway/intents
```

Example additive action metadata:

```json
{
  "agentId": "agent-id",
  "executionWalletAddress": "public-execution-wallet",
  "action": {
    "type": "Swap",
    "amount": 10,
    "asset": "USDC",
    "outputAsset": "DAI",
    "target": "0xRouter",
    "expectedOutput": 9.9,
    "minimumReceived": 9.8,
    "tradingRoute": {
      "quoteProvider": "approved-aggregator",
      "quoteId": "quote-123",
      "router": "0xRouter",
      "aggregator": "approved-aggregator",
      "poolSequence": ["pool-a"],
      "tokenPath": ["USDC", "WETH", "DAI"],
      "inputAsset": "USDC",
      "outputAsset": "DAI",
      "inputAmount": 10,
      "expectedOutput": 9.9,
      "minimumOutput": 9.8,
      "executionMode": "exact_input",
      "routeFeeBps": 20,
      "feeRecipients": ["0xFeeRecipient"],
      "calldataHash": "sha256-hex",
      "payloadHash": "stateful-simulation-payload-hash",
      "authorizedRouteHash": "trusted-adapter-route-fingerprint",
      "expiresAt": "2026-08-06T10:01:00.000Z"
    },
    "simulation": {
      "requested": true,
      "chainFamily": "EVM",
      "chainId": "84532",
      "payload": {}
    }
  }
}
```

Provider URLs, credentials, signatures, and signing material are not accepted in route evidence.

## Policy configuration

```json
{
  "structuredRules": {
    "tradingRouteIntegrity": {
      "enabled": true,
      "required": true,
      "requireQuoteId": true,
      "requireCalldataHash": true,
      "requirePayloadBinding": true,
      "requireAuthorizedRouteHash": true,
      "maxPools": 4,
      "maxIntermediaryAssets": 2,
      "maxRouteFeeBps": 100,
      "allowedRouters": ["0xrouter"],
      "allowedAggregators": ["approved-aggregator"],
      "allowedPools": ["pool-a"],
      "allowedIntermediaryContracts": ["0xintermediary"],
      "allowedIntermediateAssets": ["weth"],
      "allowedFeeRecipients": ["0xfeerecipient"],
      "missingEvidenceAction": "review",
      "routeMutationAction": "block",
      "payloadMismatchAction": "block",
      "routerMismatchAction": "block",
      "assetMismatchAction": "block",
      "amountMismatchAction": "block",
      "unapprovedRouterAction": "block",
      "unapprovedAggregatorAction": "review",
      "unexpectedIntermediaryAction": "review",
      "unexpectedPoolAction": "review",
      "unexpectedFeeRecipientAction": "review",
      "excessiveRouteFeeAction": "review"
    }
  }
}
```

Actions support `allow`, `warn`, `review`, and `block`. Legacy policies remain compatible because the module is not enforced unless enabled.

## Deterministic findings

Findings include field-specific evidence and remediation for:

- incomplete route evidence;
- router-to-payload mismatch;
- unapproved router or aggregator;
- input/output asset mismatch;
- token-path endpoint mismatch;
- amount or output-bound mismatch;
- unexpected intermediary assets;
- unapproved pools or intermediary contracts;
- unexpected fee recipients;
- excessive route fees;
- calldata hash mismatch;
- quote-to-payload mismatch;
- authorized route fingerprint mutation.

A successful route check cannot override a Blocked result from another protection module.

## Audit and SDK

The normalized `tradingRouteIntegrityContext` is included in the decision and audit JSON when applicable. The JavaScript SDK exposes:

- `Magen3TradingRoute`;
- `Magen3TradingRouteIntegrityContext`;
- `action.tradingRoute`;
- `result.tradingRouteIntegrityContext`;
- top-level `tradingRouteIntegrity` response evidence.

Raw provider responses and oversized traces are not stored.

## Security properties

- Route arrays are bounded at the Gateway boundary.
- Route object hashing uses deterministic key ordering.
- Ordered paths and pools retain their original order.
- Final calldata can be checked against its declared SHA-256 hash.
- Route payload hashes can be checked against Stateful Simulation evidence.
- Agent requests cannot choose an RPC provider.
- Private keys, signatures, signed transactions, and provider credentials remain prohibited.

## Limitations

Foundation Available does not mean that Magen3 independently authenticates every quote provider or decodes every router's calldata. The first implementation evaluates trusted adapter-supplied route evidence and exact bindings. It does not provide:

- live quote-provider authentication;
- provider API integration;
- universal ABI/router decoding;
- live pool-state verification;
- liquidity, volatility, spread, or depeg signals;
- final inclusion-block guarantees;
- private-relay submission;
- bridge route execution;
- malicious-contract or threat-intelligence enrichment beyond existing modules.

## Relationship to earlier milestones

- Milestone 15 supplies the exact simulated unsigned payload hash.
- Milestone 16 supplies chain-aware asset identity extension points.
- Milestone 17 evaluates structural asset-contract evidence separately.
- Milestone 19 evaluates quote freshness, slippage, deviation, and execution channel.
- Milestone 20 verifies that the route and payload are the authorized route.

## Roadmap boundary

Milestone 21 — Market Risk Signals remains future work. Trading Route Integrity does not invent liquidity, volatility, spread, price-manipulation, or depeg evidence. Milestones 22–28 were not implemented in this release.
