# Real Bridge Provider Integration

Milestone 22 connects Magen3's existing bridge controls and execution-reconciliation foundations to a genuine provider-backed testnet flow. The first adapter is `across-testnet` and uses the Across Swap API through a server-controlled endpoint.

## Product boundary

Magen3 remains a chain-agnostic execution firewall. This module does not sign, broadcast, custody assets, or turn Casper into the execution chain. It obtains provider evidence, binds the exact unsigned source transaction to the protected intent, submits deterministic findings to the existing Risk Assessment Engine, and later records destination delivery through Execution & Settlement Reconciliation.

A quote is not submission. A provider-reported fill is not the same thing as a Casper decision proof. Casper continues to receive only the existing privacy-preserving decision/audit commitment.

## Initial adapter

| Capability | Across testnet adapter |
| --- | --- |
| Environment | Testnet only |
| Provider ID | `across-testnet` |
| Quote endpoint | `GET /swap/approval` |
| Chain discovery | `GET /swap/chains` |
| Token discovery | `GET /swap/tokens?chainId=...` |
| Delivery tracking | `GET /deposit/status?depositTxnRef=...` |
| Trade model | `exactInput` only |
| Approval transactions | Returned when supplied by the provider |
| Unsigned source transaction | Returned and cryptographically bound |
| Signing | Unsupported |
| Submission | Unsupported |
| Mainnet | Disabled |

The default server allowlist follows the twelve EVM testnet chains listed in the current Across testnet deployment table at the time of implementation. Solana Devnet is intentionally excluded from this first EVM-only adapter. Operators can narrow the list through `BRIDGE_PROVIDER_ALLOWED_TESTNET_CHAIN_IDS`. Magen3 also exposes provider-backed chain and token discovery endpoints; applications should use discovery instead of hardcoding route support.

## Protected Gateway flow

1. The external agent submits an authenticated Bridge intent to `POST /api/agent-gateway/intents`.
2. The request names the registered adapter and exact source/destination chain IDs, token addresses, input amount in base units, depositor, recipient, and `exactInput` trade type.
3. Magen3 validates the agent, wallet, policy, source network, target, and request bounds.
4. The server calls Across testnet. The agent cannot supply a provider URL or credential.
5. Magen3 normalizes the provider response, bounds response size, validates chain, sender, router, amount, and transaction fields, and computes deterministic hashes.
6. The normalized evidence is HMAC-attested using a server secret and submitted to the existing Risk Assessment Engine.
7. Only an Allowed response may include `bridgeProviderExecution`, containing the exact approval transactions and source transaction to hand to the external wallet layer.
8. After the wallet layer submits the source transaction, the existing reconciliation route records submission and can poll Across for destination status.

## Request fields

The live adapter uses additive fields under `action.bridge`:

```json
{
  "action": {
    "type": "Bridge",
    "targetType": "Bridge Contract",
    "target": "0xProviderRouter",
    "bridge": {
      "providerId": "across-testnet",
      "sourceChain": "eip155:11155420",
      "destinationChain": "eip155:84532",
      "sourceChainId": 11155420,
      "destinationChainId": 84532,
      "sourceToken": "0xSourceToken",
      "destinationToken": "0xDestinationToken",
      "amountAtomic": "1000000",
      "depositor": "0xExecutionWallet",
      "recipient": "0xDestinationRecipient",
      "destinationAddress": "0xDestinationRecipient",
      "tradeType": "exactInput",
      "slippage": 0.005
    }
  }
}
```

`amountAtomic` is an integer string in token base units. JavaScript floating-point arithmetic is not used to enforce provider amounts or fee ratios.

The initial live adapter intentionally rejects `minOutput` and `exactOutput`. Legacy `minimumReceived` metadata remains available to the older Bridge Controls module, but it is not silently converted into a live provider trade model.

## Evidence binding

Magen3 computes and retains:

- request-binding hash
- provider-response hash
- provider quote hash
- route fingerprint
- exact unsigned source-payload hash
- normalized evidence hash
- server evidence attestation
- provider quote ID and expiry
- source and destination chain IDs
- depositor and recipient
- input and output token addresses
- exact input and quoted output in base units
- approval transactions and source transaction
- provider simulation result when supplied
- evidence-completeness labels

A changed wallet, recipient, token, amount, chain, target, calldata, value, quote ID, route hash, or payload hash invalidates the earlier evidence.

## Policy

Configure the module under `structuredRules.bridgeProviderIntegration`:

```json
{
  "enabled": true,
  "required": true,
  "allowedAdapters": ["across-testnet"],
  "unavailableAction": "review",
  "unsupportedAction": "review",
  "quoteFailureAction": "block",
  "payloadMismatchAction": "block",
  "requirePayloadBinding": true,
  "requireProviderSimulationSuccess": false,
  "requireTestnet": true,
  "maximumEvidenceAgeSeconds": 300
}
```

Supported actions are `allow`, `warn`, `review`, and `block`. A policy that requires provider evidence fails according to its configured fallback; provider unavailability never becomes an implicit pass.

## Reconciliation

After the source transaction is submitted, report or poll through the existing execution lifecycle:

```text
POST /api/agent-gateway/executions/reconcile
POST /api/bridge-provider-integration/transfers/status
POST /api/agent-gateway/bridge/poll
```

The Across status is normalized as:

- provider `pending` -> reconciliation `pending`
- provider `filled` -> reconciliation `delivered`
- provider `refunded` -> reconciliation `refunded`
- provider `expired` or `failed` -> reconciliation `failed`
- unknown or undecodable -> reconciliation `uncertain`

Magen3 preserves monotonic lifecycle rules, retry controls, source transaction binding, replacement links, finality evidence, refund state, and delivery evidence from Milestone 13.

## SDK and MCP

The JavaScript SDK includes status, chain discovery, token discovery, quote, intent-response, execution, and polling types. The Python SDK includes status, discovery, quote, and polling methods. The MCP server exposes `magen3_get_bridge_provider_status`, `magen3_request_bridge_provider_quote`, and `magen3_poll_bridge_provider`, alongside the provider fields in its intent schema.

Provider URLs, API keys, wallet secrets, signed transactions, and raw authorization headers are rejected or excluded from agent-facing methods.

## Security controls

- fixed server-controlled provider base URL
- HTTPS requirement outside local tests
- explicit provider-host allowlist
- explicit testnet chain allowlist
- no request-controlled provider URL
- bounded JSON response size
- timeouts and abort signals
- strict address, chain, calldata, and base-unit validation
- deterministic canonical hashing
- HMAC evidence attestation
- quote age and expiry validation
- exact depositor, recipient, token, amount, target, and payload binding
- sanitized provider errors
- no signing material or provider credentials in evidence or audit data

## Environment

```env
BRIDGE_PROVIDER_ACROSS_BASE_URL=https://testnet.across.to/api
BRIDGE_PROVIDER_ALLOWED_HOSTS=testnet.across.to
BRIDGE_PROVIDER_ALLOWED_TESTNET_CHAIN_IDS=421614,84532,168587773,808813,37111,4202,919,11155420,80002,11155111,129399,1301
BRIDGE_PROVIDER_REQUEST_TIMEOUT_MS=8000
BRIDGE_PROVIDER_MAX_EVIDENCE_AGE_SECONDS=300
BRIDGE_PROVIDER_EVIDENCE_SECRET=
BRIDGE_PROVIDER_EVIDENCE_KEY_ID=bridge-provider-default
```

`BRIDGE_PROVIDER_EVIDENCE_SECRET` must be at least 32 random characters and must never be exposed to the frontend or an external agent.

## Honest capability status

**Foundation Available**

Implemented and locally tested:

- real Across testnet Swap API adapter
- server-side quote retrieval
- exact-input transaction construction
- approval transaction normalization
- deterministic request, route, payload, and evidence binding
- policy findings and Risk Assessment integration
- audit and SDK response integration
- destination-status polling integrated with reconciliation

Not live-tested in the implementation environment:

- a real Across testnet quote, because external DNS resolution was unavailable
- wallet signing
- source-chain submission
- destination fill
- refund behavior
- Railway or Vercel deployment

## Roadmap boundary and known limitations

This milestone does not implement:

- Across mainnet
- any second bridge provider
- gasless bridge submission
- automatic wallet signing or transaction broadcast
- universal bridge token mapping
- automatic source/destination token selection
- embedded destination-chain actions
- `minOutput`, `exactOutput`, or maximum-input authorization
- bridge solvency scoring
- production threat-intelligence enrichment
- production oracle evidence
- continuous monitoring or background jobs
- x402 authorization or settlement

Milestone 23 remains **Live x402 Testnet Authorization & Settlement**. Milestones 23–28 were not implemented in this release.
