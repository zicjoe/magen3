# Metered or upto x402 Payments

Milestone 24 extends Magen3's Milestone 23 exact one-time x402 testnet path with bounded `upto` and `metered` authorizations. The original protected intent still goes through `POST /api/agent-gateway/intents`; a controlled authorization can only be created from an **Allowed** x402 audit.

## Payment modes

- `exact`: unchanged Milestone 23 one-time authorization and Base Sepolia facilitator settlement.
- `upto`: authorizes no more than `maximumAuthorizedAtomic` for one bound resource/provider/session.
- `metered`: authorizes no more than `maximumAuthorizedAtomic`; usage is charged as integer `usageQuantity × unitPriceAtomic`.

No mode grants unlimited authority.

## Authorization accounting

Authorization records preserve base-unit integer values for maximum authorized, reserved, captured, settled, released, refunded, and remaining authorization. The implementation deterministically enforces:

`settled <= captured <= reserved <= maximumAuthorized`

`refunded <= settled`

`released <= reserved`

`remainingAuthorization >= 0`

Events are idempotent by both `eventId` and `idempotencyKey`. Usage cannot be replayed across resource, provider, or session bindings. Expired or revoked authorizations reject further financial events.

Milestone 14 exposure semantics are reused through a base-unit exposure snapshot containing maximum, reserved, actual/captured, settled, released, refunded, remaining, and net-settled exposure. This does not introduce a second generic exposure-policy engine.

## API

1. Protect the intended x402 payment through `POST /api/agent-gateway/intents` with `action.x402.mode`/`scheme` set to `upto` or `metered`.
2. After an Allowed decision, create the bounded authorization through `POST /api/agent-gateway/x402/authorizations`.
3. Apply accounting events through `POST /api/agent-gateway/x402/authorization-events`.
4. Continue using the Milestone 23 settlement/reconciliation path for actual testnet payment settlement.

Supported authorization events are `reserve`, `capture`, `settle`, `release`, `refund`, `usage`, `revoke`, and `dispute`.

## Usage evidence

Metered events bind an event ID, authorization ID, resource ID, provider ID, session ID, usage quantity, unit price, cumulative usage, timestamps, evidence hash, idempotency key, optional resource-delivery reference, and bounded provider attestation. Provider evidence is accounting evidence only; it does not bypass the Magen3 Risk Assessment Engine.

## Security

The implementation uses positive base-unit integer strings and `BigInt` for authorization arithmetic. It rejects over-reservation, over-capture, settlement without capture, over-refund, over-release, cross-binding reuse, duplicate usage, activity after revocation/expiry, and unbounded event histories. Private keys, wallet secrets, provider credentials, and resource content are not stored in authorization records.

## Testnet and provider boundary

Milestone 24 does not add a new facilitator or mainnet path. Real payment submission remains the Milestone 23 Base Sepolia testnet-only lifecycle. `upto` and `metered` accounting is provider-neutral and designed to bind future x402-compatible usage evidence without inventing unsupported protocol methods.

## Roadmap boundary

Milestone 24 does **not** implement production threat intelligence, production oracle integration, production compliance providers, or continuous risk monitoring. Those remain Milestones 25–28.
