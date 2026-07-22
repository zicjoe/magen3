# Security Policy

Magen3 is a modular Web3 execution firewall. Security reports are taken seriously because the project evaluates execution intent, stores policy decisions, and can submit Casper Testnet decision proofs.

## Supported Version

The latest version on the default branch is the supported development version.

## Reporting a Vulnerability

Do not open a public GitHub issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** feature under the repository's Security tab when private vulnerability reporting is enabled. If that feature is unavailable, contact the repository owner privately through the contact method listed on the repository profile.

Include:

- affected component and version or commit;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- potential impact;
- suggested remediation, when available.

Do not include real wallet secret keys, API keys, database credentials, or relayer credentials.

## Response Process

Maintainers will acknowledge a complete report, reproduce it, assess severity, prepare a fix, and coordinate disclosure. High and critical findings take priority.

## Scope

Relevant areas include:

- Agent Gateway authentication and authorization;
- policy evaluation and fail-closed behavior;
- Connected Agent API-key lifecycle;
- wallet ownership and session handling;
- Casper decision-proof payload construction and relayer execution;
- database access and tenant isolation;
- deployment, secrets, CORS, dependencies, and CI configuration.

## Security Expectations

- Never commit `.env` files or private keys.
- Use least-privilege credentials.
- Restrict production CORS to trusted origins.
- Keep CodeQL, Dependabot, and CI checks enabled.
- Resolve all High or Critical alerts before release.

## Dependency Risk Register

### `wee_alloc` through `casper-contract`

- **Status:** Accepted upstream risk
- **Severity reported by Dependabot:** Critical
- **Origin:** The official Casper `casper-contract` SDK dependency graph, not Magen3 application code
- **Current remediation availability:** No patched `wee_alloc` release is available
- **Decision:** Retain the official SDK configuration used by the deployed Casper Testnet contract. Replacing the allocator would produce a different WASM artifact and would no longer reproduce the currently deployed contract build.
- **Operational boundary:** This acceptance does not modify, redeploy, or replace the existing contract package, contract hash, or on-chain decision-proof history.
- **Review trigger:** Re-evaluate when the Casper SDK adopts a maintained allocator or publishes an officially supported migration path.

The corresponding Dependabot alert is dismissed as **risk tolerable to this project** with this rationale recorded in the repository.

## Static Analysis Decisions

### Agent API-key hash classification

Magen3 API keys are generated server-side from 24 random bytes and are not user-selected passwords. Their stored SHA-256 digest is used only for exact API-key lookup and constant-time verification; raw keys are not stored. A password-hashing CodeQL finding against this flow is therefore classified as an inaccurate password-credential model, not as evidence of a low-entropy password store.

This classification applies only to generated Connected Agent API keys. User passwords must never be introduced into this hashing flow.

## Bridge Controls security boundary

Bridge Controls validates provider-supplied route metadata and policy boundaries before signing. It does not hold bridge credentials, certify bridge providers, verify provider liquidity or solvency, or prove cross-chain message delivery. Exact bridge contracts remain subject to Contract Validation. Unknown destination-chain address families are reported as unavailable rather than treated as safe.

## Compliance Controls privacy and legal boundary

Compliance Controls accepts only non-sensitive status evidence, provider labels, opaque references, timestamps, two-letter jurisdiction codes, optional hashes, risk ratings, and opaque VASP identifiers. The Agent Gateway rejects names, dates of birth, identity-document and tax identifiers, residential addresses, contact information, documents, selfies, and biometric data.

Magen3 does not bundle or certify a KYC/KYB provider, sanctions-data provider, legal rules engine, or jurisdiction-specific compliance determination. Operators are responsible for provider due diligence, data licensing, privacy, retention, and legal review. A clear screening result or exact-feed no-match is not a guarantee of compliance.
