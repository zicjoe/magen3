# Asset Contract Risk

Milestone 17 adds deterministic structural inspection for the contract behind a canonically resolved asset. It builds on Milestone 16 and does not replace asset identity.

## Current support

The initial real adapter supports EVM-compatible testnets through a server-configured trusted JSON-RPC provider. It observes deployed bytecode with `eth_getCode`, pins inspection to a block number, and checks the standard EIP-1967 implementation slot where available. It records bytecode hash, code size, proxy indicators, and bounded opcode indicators.

Unsupported evidence is explicit. Magen3 does not claim to detect transfer taxes, honeypots, blacklist authority, mint authority, verified source, ownership, malicious history, liquidity, or market risk from bytecode presence alone.

## Policy

Configure `structuredRules.assetContractRisk` with optional fields:

- `required`
- `unavailableAction` / `unsupportedAction`
- `noCodeAction`
- `proxyAction`
- `delegateCallAction`
- `selfDestructAction`
- `allowedCodeHashes` / `blockedCodeHashes`
- `allowedImplementationAddresses`

Actions are `allow`, `warn`, `review`, or `block`. Legacy policies remain compatible.

## Security

RPC endpoints are server-controlled. Agent requests cannot provide provider URLs. Responses, bytecode, and time are bounded. Credentials and raw provider URLs are not persisted in audit evidence.

## Roadmap boundary

Production threat-intelligence feeds remain Milestone 25. Oracle, market, compliance, and continuous-monitoring responsibilities remain Milestones 26, 21, 27, and 28. Milestone 17 only evaluates structural contract evidence and configured deterministic policy.
