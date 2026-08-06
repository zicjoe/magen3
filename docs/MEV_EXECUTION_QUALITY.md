# MEV & Execution Quality

Milestone 19 adds deterministic pre-signing execution-quality controls for swap-like actions. It evaluates provider/agent-supplied quote evidence and stateful-simulation output without using an LLM for authorization.

## Evaluated evidence

- quote timestamp and expiry
- transaction deadline
- expected output and minimum received
- explicit or implied slippage
- provider-reported price impact
- simulated output versus quoted output
- execution channel and private-execution availability
- stateful-simulation block reference when available

## Policy

Configure `structuredRules.mevExecutionQuality`. The module supports `allow`, `warn`, `review`, and `block` actions for stale or expired quotes, excessive slippage, excessive price impact, simulation deviation, missing evidence, expired deadlines, and public-mempool exposure.

## Limitations

A successful simulation reflects one observed state and does not guarantee inclusion-block output or eliminate front-running, sandwiching, back-running, reordering, or state changes. This milestone does not implement live market feeds, route/calldata verification, private-relay submission, or market-risk scoring. Those remain Milestones 20 and 21 or later integrations.
