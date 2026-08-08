# Dependency + CodeQL Security Follow-up Report

## Scope

This follow-up fixes the two alerts shown after the previous dependency-security remediation:

1. GitHub Dependabot still reported a High-severity `fast-uri` advisory whose patched 3.x version is `3.1.5`.
2. GitHub CodeQL reported `js/incomplete-url-substring-sanitization` in `scripts/integration/verify-integration-contract.mjs` because the verifier checked an Across URL with string-substring matching.

## Changes

### fast-uri

- Raised the root pnpm override from `fast-uri@3.1.4` to `fast-uri@3.1.5`.
- Synchronized `pnpm-lock.yaml` dependency resolution references to `3.1.5`.
- Updated the security verifiers and dependency regression test so `3.1.5` is the enforced minimum resolution for this repository.
- Added `3.1.4` to the superseded resolution checks so the newly reported advisory cannot regress silently.

### CodeQL URL validation

- Removed the `bridgeProviderIntegrationSource.includes("https://app.across.to/api")` URL substring check.
- The integration verifier now extracts and parses the configured `DEFAULT_BASE_URL` with the WHATWG `URL` parser and validates protocol, hostname, port, pathname, query, and fragment separately.
- Mainnet Across URL literals are also parsed before host/path comparison instead of being treated as raw strings.
- This keeps the milestone guardrail while avoiding the incomplete URL-substring sanitization pattern reported by CodeQL.

## Architecture and data safety

No Magen3 runtime execution path, wallet ownership model, PostgreSQL schema, policies, agents, audit history, Casper proof flow, Gateway contract, Vercel API proxy, SDK API, or MCP transport was changed by this follow-up.

## Verification

See the command/test results accompanying the replacement archive.

## Verification results

- `node scripts/security/verify-security-patch.mjs` — PASSED.
- `node scripts/security/verify-dependency-security.mjs` — PASSED.
- Focused dependency + URL regression tests — 5/5 PASSED.
- Integration contract verifier — PASSED using temporary source mirrors for generated `dist` files because generated build artifacts are intentionally absent from the replacement source archive.
- Full backend suite — 534 discovered, 533 passed, 1 failed. The sole failure remains `backend/lib/frontendSecurityModel.test.mjs`, which cannot start because the extracted validation environment does not have the npm `typescript` package installed.
- `pnpm-lock.yaml` parses successfully as YAML and resolves the root `fast-uri` override/package key to `3.1.5`.

## Environment limitation

A fresh `pnpm install --lockfile-only` / `pnpm audit` could not be run in the validation container because its configured internal npm gateway does not expose the requested package metadata. The lockfile was synchronized structurally to the exact patched version shown by the GitHub alert. GitHub Dependabot/CodeQL should be treated as the independent final scanners after push.
