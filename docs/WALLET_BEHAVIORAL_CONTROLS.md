# Wallet Behavioral Controls

Milestone 18 adds deterministic controls based on prior Magen3 audit history for the same agent and execution wallet. It evaluates one incoming action against bounded historical patterns; it does not run background monitoring.

## Supported controls

- Rolling transaction velocity
- Repeated blocked attempts
- Repeated failed or uncertain executions
- New-recipient detection
- First recorded contract interaction
- Unusual amount relative to historical Allowed actions
- Stable history fingerprint and bounded window evidence

## Policy

Configure `structuredRules.walletBehavioralControls` with `enabled`, `required`, `windowMinutes`, `maxTransactionsInWindow`, `maxBlockedAttemptsInWindow`, `maxFailedAttemptsInWindow`, `newRecipientAction`, `firstContractAction`, `velocityAction`, `repeatedBlockedAction`, `repeatedFailedAction`, `unusualAmountMultiplier`, `unusualAmountAction`, and `minimumHistory`.

Actions are `allow`, `warn`, `review`, or `block`. Legacy policies remain compatible and the module is skipped unless enabled.

## Boundaries

This milestone does not implement MEV protection, trading-route validation, market feeds, production threat intelligence, continuous monitoring, personal profiling, or an unrelated behavioral database. It uses existing Magen3 audits and minimizes wallet data.
