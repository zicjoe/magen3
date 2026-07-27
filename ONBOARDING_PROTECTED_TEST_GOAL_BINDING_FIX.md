# Onboarding Protected Test Goal-Binding Fix

## Issue

The Guided Setup "Run protected test" action supplied a stable `goalId` but omitted the required `originalUserGoalHash` for Transfer actions. Policies with Instruction Integrity goal binding correctly returned:

- A stable goal ID and original user-goal hash are required for Transfer.
- Bind the request to the originating user goal before retrying.

## Fix

- Added a browser-side SHA-256 helper using `crypto.subtle`.
- The protected test now hashes the exact synthetic onboarding goal.
- The resulting 64-character SHA-256 value is sent as `instructionIntegrity.originalUserGoalHash` alongside the existing stable `goalId`.
- No private prompt content, wallet secret, signed transaction, or execution material is persisted.

## Product behaviour

The protected onboarding test remains a synthetic demo request sent to the real authenticated Magen3 Gateway. It creates a genuine deterministic decision and Audit Log entry, and can use the existing Casper decision-proof flow. It does not require a separately connected external agent and does not request wallet signing or submit a blockchain transaction.

## Verification

- Backend regression suite: 369 passed, 0 failed.
- Updated App.tsx TSX transpilation: 0 diagnostics.
- Goal hash generation produced a valid 64-character lowercase SHA-256 value.
- Source assertions confirmed both `goalId` and `originalUserGoalHash` are included.
