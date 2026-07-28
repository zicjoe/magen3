# Magen3 Security Alert Remediation Report

## Release scope

This is a security-only patch based on `magen3-agent-deletion-lifecycle.zip`.

It does not change:

- Gateway routes or request/response contracts
- Agent authentication or API-key behaviour
- Policy enforcement
- Human Approval or quorum
- Database schema or migrations
- Casper decision proofs or relayer behaviour
- Execution reconciliation
- Frontend workflows
- JavaScript or Python SDK contracts
- MCP contracts
- Railway or Vercel configuration
- Environment variables

## Dependency remediations

### PostCSS

- Previous resolution: `8.5.15`
- Patched resolution: `8.5.18`
- Advisory: `GHSA-r28c-9q8g-f849`

`package.json` now pins the patched version through a pnpm override, and `pnpm-lock.yaml` resolves Vite's PostCSS dependency to `8.5.18`.

### fast-uri

- Previous resolution: `3.1.3`
- Patched resolution: `3.1.4`
- Advisory: `GHSA-v2hh-gcrm-f6hx`

`package.json` now pins the patched 3.x version through a pnpm override, and the AJV dependency snapshot in `pnpm-lock.yaml` resolves `fast-uri` to `3.1.4`.

## CodeQL remediation

### Provider credential cache keys

The following modules no longer derive a SHA-256 fingerprint from provider API keys:

- `backend/lib/threatIntelligence.mjs`
- `backend/lib/oracleValidation.mjs`
- `backend/lib/complianceControls.mjs`

Their cache keys now contain only:

- Provider source type and source identifier
- Freshness and cache settings
- Non-secret authentication mode: `bearer` or `none`

Provider API keys remain used only for outbound `Authorization` headers.

### Local provider feed race condition

The three provider modules no longer perform a path-based `stat()` followed by a separate path-based `readFile()`.

They now use:

- `backend/lib/safeFeedFile.mjs`

The helper:

1. Opens the configured feed once.
2. Checks the opened file descriptor.
3. Rejects non-regular files.
4. Enforces the configured pre-read size limit.
5. Reads through the same file descriptor.
6. Verifies the actual UTF-8 byte length before parsing.
7. Closes the descriptor in all cases.

This removes the check-then-reopen filesystem race reported by CodeQL.

### Obsolete real-agent example

`examples/real-agent-client/index.mjs` is not present in this release.

A new verification command fails if that obsolete path is still present after the replacement is applied:

```bash
pnpm security:verify
```

If an older Git checkout still tracks that file, remove it before committing:

```bash
git rm -r examples/real-agent-client
```

## New regression coverage

Added:

- `backend/lib/safeFeedFile.test.mjs`
- `backend/lib/providerFeedSecurity.test.mjs`
- `scripts/security/verify-security-patch.mjs`

Coverage includes:

- Same-handle local feed reading
- Oversized feed rejection
- Non-regular path rejection
- Absence of credential hashing/fingerprinting in provider modules
- Use of the shared single-handle reader by every provider loader
- Patched dependency versions in `package.json` and `pnpm-lock.yaml`
- Absence of the obsolete real-agent example

## Verification completed

- Backend regression suite: **378 passed, 0 failed**
- Targeted provider/security tests: **42 passed, 0 failed**
- JavaScript SDK: **26 passed, 0 failed**
- Python SDK: **21 passed, 0 failed**
- Changed backend module syntax checks: passed
- `package.json` JSON validation: passed
- `pnpm-lock.yaml` YAML validation: passed
- Security patch verification script: passed
- Vulnerable lockfile version search: clean
- ZIP exclusion checks: passed

## Verification not completed in this environment

The package registry returned HTTP 503 through Corepack, so these dependency-based checks could not be executed here:

- `pnpm install --frozen-lockfile`
- Full Vite production build
- Full MCP build and stdio protocol test using installed `@modelcontextprotocol/sdk` and `zod`
- Dependabot rescan
- GitHub CodeQL rescan

The lockfile was structurally validated and aligned with the package overrides, but GitHub CI/Vercel should perform the definitive frozen-lockfile installation.

## Deployment and repository steps

1. Replace the current source files with this release while preserving `.git`, `.env`, and private relayer material.
2. Confirm the obsolete example is not tracked:

   ```bash
   git status --short
   git rm -r examples/real-agent-client 2>/dev/null || true
   ```

3. Run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm security:verify
   pnpm verify
   ```

4. Commit and push.
5. Wait for CodeQL and Dependabot to rescan the default branch.
6. Confirm there are no open High or Critical alerts before final submission.

## Conventional commit

```text
fix(security): remediate provider CodeQL and dependency alerts
```
