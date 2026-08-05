# Asset Contract Risk Implementation Report

## Executive summary
Milestone 17 adds chain-aware, deterministic asset-contract structural risk analysis to the real protected-intent pipeline. It consumes Milestone 16 canonical asset identity and inspects EVM asset contracts through a trusted server-side RPC adapter.

## Implemented
- Provider-backed EVM bytecode inspection at a pinned block
- Chain-ID validation
- EIP-1967 implementation-slot observation where supported
- Bytecode hash and bounded structural indicators
- Deterministic policy actions and Agent Shield findings
- Risk Assessment, audit, SDK, MCP-compatible shared response integration
- Explicit unsupported/unavailable evidence for non-EVM or unconfigured providers

## Not implemented
No honeypot, transfer-tax, ownership, mint-authority, blacklist, source-verification, exploit-history, threat-intelligence, liquidity, oracle, compliance, or market-risk provider was added. Milestones 18–28 remain future work.

## Status
Foundation Available. The EVM adapter is real and provider-backed, but no public testnet call was performed in this environment and deeper source/behavior analysis is unsupported.

## Environment variables
`ASSET_CONTRACT_RISK_EVM_RPC_URL`, `ASSET_CONTRACT_RISK_EVM_PROVIDER_ID`, `ASSET_CONTRACT_RISK_EVM_CHAIN_ID`, `ASSET_CONTRACT_RISK_TIMEOUT_MS`.

## Verification results
- Focused Milestones 14–17 tests: 22 passed, 0 failed, 0 skipped.
- Full backend discovery: 401 tests; 400 passed, 1 failed, 0 skipped.
- The sole failure is `backend/lib/frontendSecurityModel.test.mjs` because the extracted project has no installed `typescript` package. It is an environment dependency failure, not a failed assertion.
- Node syntax checks passed for the new module, policy engine, and both Gateway stores.
- Integration verification passed.
- TypeScript type-check, Vite build, SDK build, and MCP build were not run because dependencies are not installed in this environment.
- No public testnet RPC, Railway, Vercel, wallet, or external agent was live-tested.

## Roadmap compatibility
Milestone 18 can consume stable agent, wallet, asset, contract, block, evidence-hash, and timestamp fields from audits without changing Milestone 17 ownership. Milestones 19–28 were not implemented.

## Recommended Milestone 18 starting point
Add deterministic rolling-window wallet and agent behavior controls over existing audit and reconciliation records. Do not put temporal behavioral scoring inside this contract-risk adapter.
