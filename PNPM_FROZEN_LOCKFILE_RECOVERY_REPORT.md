# Magen3 pnpm Frozen-Lockfile Recovery Report

## Incident

Vercel failed during `pnpm install --frozen-lockfile` under pnpm 10.14.0 with:

`Cannot use 'in' operator to search for 'directory' in undefined`

The failure occurred before the Vite build and before application code executed.

## Root cause

The previous security follow-up upgraded `fast-uri` to 3.1.5, but the `packages:` section of `pnpm-lock.yaml` contained this malformed registry package entry:

```yaml
fast-uri@3.1.5: {}
```

pnpm's frozen/headless dependency graph expects registry package snapshots to include a `resolution` object. The empty package entry left `pkgSnapshot.resolution` undefined and caused pnpm to crash while building the dependency graph.

The separate `snapshots:` entry for `fast-uri@3.1.5` is allowed to be empty and remains unchanged.

## Fix

The `packages:` entry is now:

```yaml
fast-uri@3.1.5:
  resolution: {integrity: sha512-gHwA1O9LDIcKunMKhObS/HimwtehO1nPUECKAu5TpKgaO19fcWEl4bliWe1jWxVFvIXztJjjQ4L8XQ1EU9f7Jw==}
```

No install command was weakened. Both Vercel and Railway/Docker continue to use:

```text
pnpm install --frozen-lockfile
```

## Regression hardening

Updated:

- `backend/lib/dependencySecurity.regression.test.mjs`
- `scripts/security/verify-dependency-security.mjs`
- `scripts/security/verify-security-patch.mjs`

The security checks now require the 3.1.5 registry integrity in the `packages:` section and reject an empty `fast-uri@3.1.5: {}` package entry.

## Verification performed

- YAML parse of `pnpm-lock.yaml`: PASS
- Registry package structural scan: 372 packages, 0 missing `resolution` entries
- `fast-uri@3.1.5` integrity check: PASS
- Dependency security regression: 4/4 PASS
- Dependency security verifier: PASS
- Security patch verifier: PASS
- Full backend suite: 533/534 PASS
  - sole failure: `frontendSecurityModel.test.mjs` cannot import the locally absent `typescript` package in this extracted environment

The integration/SDK/MCP compiled-artifact tests could not be rerun from this extracted ZIP because generated `dist/` outputs and installed npm dependencies are not present. This is separate from the lockfile repair and is not reported as a passing test.

## Deployment

Use the replacement ZIP as the source tree, commit it, and push normally. Vercel should again execute its existing frozen install instead of bypassing lockfile validation.
