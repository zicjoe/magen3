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
