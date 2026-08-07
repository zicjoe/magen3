# Live x402 Testnet Authorization & Settlement

Magen3 now protects the complete x402 v2 exact-payment lifecycle on Base Sepolia (`eip155:84532`). The existing `POST /api/agent-gateway/intents` route remains the deterministic authorization gate. Only an **Allowed** audit may proceed to `POST /api/agent-gateway/x402/execute` after the payer wallet has created a signed x402 payment payload.

## Lifecycle

1. Receive and normalize `PAYMENT-REQUIRED` requirements.
2. Bind the resource URL, method, query, body commitment, payer, recipient, asset, amount, network, expiry, request ID, and requirements hash in the protected intent.
3. Receive an Allowed decision and audit reference.
4. Sign outside Magen3. Private keys and seed phrases never enter Magen3.
5. Submit the signed `paymentPayload`, exact `paymentRequirements`, audit ID, and request fingerprint to the live execution endpoint.
6. Magen3 verifies the authorization through the server-configured testnet facilitator.
7. Magen3 asks the facilitator to settle the payment.
8. Magen3 retries the exact HTTPS protected resource with `PAYMENT-SIGNATURE`.
9. Magen3 verifies HTTP delivery, hashes the bounded response, and reconciles settlement and delivery into the existing audit lifecycle.

The implementation distinguishes authorization signed, authorization verified/rejected, payment settled/failed/uncertain, resource retried, resource delivered, and resource delivery failed.

## Configuration

- `X402_TESTNET_FACILITATOR_URL` — server-controlled HTTPS facilitator base URL. Default: `https://x402.org/facilitator`.
- `X402_FACILITATOR_TIMEOUT_MS` — bounded verify/settle timeout. Default: `12000`; range: 1000–30000.

Client-supplied facilitator URLs are never accepted. Mainnet networks are rejected. The only live network in this milestone is Base Sepolia.

## Security boundary

Magen3 validates the authorized audit, request fingerprint, requirement hash, testnet network, and exact resource before any provider call. Private/local resource hosts, non-HTTPS resources, redirects, oversized facilitator payloads, malformed JSON, oversized resource responses, and secret-bearing forwarded headers are rejected. A failed or ambiguous settlement is reconciled before another authorization may be attempted.

## SDK and MCP

JavaScript: `client.executeX402Payment(...)`

Python: `client.execute_x402_payment(...)`

MCP: `magen3_execute_x402_payment`

The legacy settlement-reporting methods remain for backward compatibility.

## Roadmap boundary

This milestone implements exact one-time x402 authorization and settlement only. It does not implement `upto`, metered usage, reservations, captures, incremental settlement, cumulative usage, production threat intelligence, production oracle integration, production compliance providers, or continuous monitoring.
