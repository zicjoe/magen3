# Connected Agents Integration Health Layout Fix

## Scope

This release refines the Connected Agents **Overview** tab only. It preserves the existing Magen3 visual identity and all existing backend, policy, audit, credential, Gateway, Casper, SDK, MCP, Railway, and Vercel behaviour.

## Problem corrected

Security Coverage and Integration Health previously shared one two-column grid row. Integration Health rendered every available health check with its full explanation, making that card much taller and leaving a large blank area below Security Coverage.

## Implementation

### Compact Integration Health

The Connected Agents overview now shows:

- Overall health state
- Accurate counts for Healthy, Attention, Observed, and Not observed checks
- Up to four action-requiring checks when attention is needed
- Core service checks when no action is required
- A count of additional attention items when more than four exist
- A collapsed **View all health checks** section
- Individually expandable health rows containing the complete existing explanation

The full Integration Health component remains unchanged for other product surfaces that intentionally need the complete list.

### Independent overview columns

The Overview now uses two independently flowing columns:

**Left**
- Security Coverage
- Decision Insights
- Agent Details

**Right**
- Compact Integration Health
- Recent Activity

Unresolved execution warnings remain full width above both columns.

This prevents the height of Integration Health from forcing whitespace beneath Security Coverage.

## Compatibility

No changes were made to:

- Integration Health derivation or status semantics
- Security Coverage calculation
- Agent registration
- API credentials
- Policies
- Emergency controls
- Audit records
- Execution reconciliation
- Gateway request or response contracts
- Database schema or migrations
- SDKs or MCP
- Casper proof handling
- Railway or Vercel configuration
- Environment variables

## Verification

- Backend regression suite: 369 passed, 0 failed
- Updated TSX transpilation: 0 diagnostics
- Connected Agents layout structure assertions: passed
- No node_modules, build output, cache, .env, private key, or .git data included

## Conventional commit

`fix(ui): compact Connected Agents integration health`
