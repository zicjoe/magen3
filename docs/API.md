# YieldBot API v1

Base path: `/api/v1`

All error responses use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": null,
    "requestId": "uuid"
  }
}
```

## System

### `GET /system/health?probe=1`

Returns server health, persistence mode, redacted environment diagnostics, and live integration probes.

### `GET /system/tool-catalog`

Returns the deterministic list of Live and Adapter Required capabilities.

## Conversations

### `GET /conversations?limit=20`

Returns recent persisted conversations, newest first.

### `POST /conversations`

```json
{ "title": "Optional title" }
```

### `GET /conversations/:id`

Returns a persisted conversation.

## Agent

### `POST /agent/messages`

```json
{
  "conversationId": "optional-uuid",
  "message": "Prepare a 10 CSPR to USDT swap",
  "context": {
    "activeChain": "casper",
    "casperPublicKey": "01...",
    "riskPreference": "moderate"
  }
}
```

Returns the updated conversation and an optional structured plan.

## Plans and execution

### `GET /plans?limit=20`

Returns recent persisted plans, newest first.

### `GET /plans/:planId`

Returns a plan and its current step states.

### `POST /plans/:planId/steps/:stepId/prepare`

```json
{
  "walletAddress": "connected public address",
  "clientContext": {
    "nativeBalance": "optional display balance"
  }
}
```

For reads, returns live data. For writes, returns the quote, analysis, exact transaction, provenance, and Magen3 decision.

### `POST /plans/:planId/steps/:stepId/submit-casper`

```json
{
  "preparationId": "uuid",
  "signedTransaction": {}
}
```

The server verifies the preparation and Magen3 decision before calling CSPR.trade `submit_transaction`.

### `POST /plans/:planId/steps/:stepId/receipt`

```json
{
  "preparationId": "uuid",
  "status": "submitted",
  "transactionHash": "0x..."
}
```

Records EVM submission, confirmation, or failure and attempts Magen3 reconciliation.

## Activity

### `GET /activity?limit=50`

Returns recent plan, preparation, authorization, submission, confirmation, and failure events.
