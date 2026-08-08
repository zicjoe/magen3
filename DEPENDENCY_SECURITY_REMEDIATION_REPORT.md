> Superseded by `DEPENDENCY_AND_CODEQL_SECURITY_FOLLOWUP_REPORT.md` for the later fast-uri advisory and CodeQL finding.

# Magen3 Dependency Security Remediation Report

Date: 2026-08-08
Source of truth: `magen3-production-same-origin-api-proxy-fix.zip`
Release scope: dependency/advisory remediation only, plus one MCP schema-description/test synchronization fix discovered during regression verification.

## Executive summary

This release removes the vulnerable/superseded dependency resolutions visible in the supplied GitHub Dependabot screen without rolling back Magen3 milestones or the production same-origin Vercel API proxy fix.

The affected dependency families were primarily transitive through the MCP SDK/tooling tree rather than Magen3's Railway execution backend. The remediation uses exact pnpm overrides for security-sensitive transitive packages and upgrades the MCP SDK to a version whose declared dependency ranges support the hardened Hono Node adapter.

No database schema, agent ownership, API-key format, Agent Gateway route, policy semantics, audit-history format, Casper proof architecture, Vercel proxy behavior, or Railway PostgreSQL connection code was changed.

## Dependency changes

| Package | Previous resolution | Hardened resolution | Reason |
|---|---:|---:|---|
| `fast-uri` | 3.1.3 | 3.1.5 | Fix host-confusion/backslash authority parsing advisory while staying on the compatible v3 line; follow-up advisory requires 3.1.5. |
| `postcss` | 8.5.18 | 8.5.23 | Includes follow-up security behavior that does not load a source map when `opts.from` is absent. |
| `nanoid` | 3.3.15 | 3.3.16 | Compatible transitive resolution used by the hardened PostCSS tree. |
| `@hono/node-server` | 1.19.14 | 2.0.12 | Moves above the Windows encoded-backslash/static path traversal fix and later 2.x security fixes. |
| `hono` | 4.12.30 | 4.12.32 | Moves to the current hardened 4.12.x release used by the MCP dependency tree. |
| `ip-address` | 10.2.0 | 10.3.1 | Moves to the current patched parser line for the new SSRF/trust-boundary parsing advisories. |
| `@modelcontextprotocol/sdk` | 1.29.0 | 1.30.0 | Declares compatibility with the hardened `@hono/node-server` 2.x line and current Hono line. |

`packages/mcp-server` now declares Node `>=20`, matching `@hono/node-server` 2.x. Magen3's Railway Docker image is already `node:20-bookworm-slim`, so the deployment runtime is compatible.

## Security implementation

The root `pnpm.overrides` now pins:

```json
{
  "postcss": "8.5.23",
  "fast-uri": "3.1.5",
  "@hono/node-server": "2.0.12",
  "hono": "4.12.32",
  "ip-address": "10.3.1"
}
```

A new `scripts/security/verify-dependency-security.mjs` verifier rejects the old vulnerable/superseded resolutions, checks the MCP dependency binding, checks the PostCSS/nanoid resolution, and verifies that Magen3's MCP runtime remains stdio-only rather than exposing Hono/HTTP transports.

The existing `scripts/security/verify-security-patch.mjs` has also been extended so the hardened dependency pins are part of the permanent security contract.

A new `backend/lib/dependencySecurity.regression.test.mjs` adds regression coverage for the overrides, lockfile resolutions, MCP Node floor, and stdio-only MCP architecture.

During MCP regression verification, an existing test expected the Threat Intelligence schema description to state that evidence is freshness-checked while the source description had lost that phrase. The description was synchronized with the already-existing test/behavior. This is documentation/schema-description text only; it does not change authorization behavior.

## Files changed

- `package.json`
- `pnpm-lock.yaml`
- `packages/mcp-server/package.json`
- `packages/mcp-server/src/core.ts`
- `scripts/security/verify-security-patch.mjs`
- `scripts/security/verify-dependency-security.mjs` (new)
- `backend/lib/dependencySecurity.regression.test.mjs` (new)
- `DEPENDENCY_SECURITY_REMEDIATION_REPORT.md` (new)

## Verification performed

- pnpm lockfile YAML parse: PASSED.
- Critical lockfile importer/resolution synchronization checks: PASSED.
- New dependency security verifier: PASSED.
- Existing Magen3 security patch verifier: PASSED.
- Integration contract verifier: PASSED after temporary generation of SDK/MCP runtime artifacts from source.
- Dependency security regression tests: 4/4 PASSED.
- Full backend suite: 533 discovered; 532 PASSED; 1 FAILED before assertions because the extracted workspace has no installed `typescript` npm package (`frontendSecurityModel.test.mjs`).
- JavaScript SDK: 45/45 PASSED.
- Python SDK: 39/39 PASSED.
- MCP core: 33/33 PASSED after temporary SDK workspace linking/runtime emission.
- MCP protocol test was not runnable in this extracted workspace because `@modelcontextprotocol/sdk` is not installed in `node_modules`.

## Environment limitations / claims not made

This environment does not have pnpm installed. `corepack pnpm --version` attempted to obtain pnpm 10.14.0 from the configured package gateway and received HTTP 404. Therefore this report does **not** claim that a fresh `pnpm install --frozen-lockfile`, `pnpm audit`, full Vite production build, or MCP protocol test passed here.

The lockfile was synchronized to the exact selected package versions/integrities and parsed successfully, but the final independent confirmation is the normal GitHub/Vercel/Railway fresh install after push.

This report also does **not** claim that GitHub Dependabot already shows zero alerts. Dependabot must rescan the pushed commit. The targeted vulnerable versions from the supplied alert families are absent from the replacement lockfile.

## Deployment

Use the normal repository flow:

```bash
git add .
git commit -m "fix(security): remediate dependency advisories"
git push
```

The existing production deployment architecture is preserved. Railway continues to use Node 20 and PostgreSQL, and Vercel continues to proxy production browser `/api/*` traffic to Railway through the same-origin rewrite.

After GitHub processes the pushed lockfile, review Dependabot again. Any alert that remains should be inspected by exact advisory/package path rather than dismissed automatically.
