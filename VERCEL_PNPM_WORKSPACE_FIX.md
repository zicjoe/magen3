# Vercel pnpm frozen-lockfile workspace fix

## Problem

Vercel discovered an older `packages/mcp-client/package.json` because the workspace used the broad `packages/*` pattern. That stale package declared `@yieldbot/shared@workspace:*`, but it is not part of the authoritative Magen3 release or its lockfile. With CI frozen-lockfile enforcement, pnpm rejected the mismatch.

## Fix

`pnpm-workspace.yaml` now lists only the maintained JavaScript workspace packages included in this release:

- `packages/sdk-js`
- `packages/mcp-server`

This keeps old or unrelated folders left in an existing Git checkout from being treated as active workspace projects. The existing `pnpm-lock.yaml` already contains matching importers for the root and these two packages, so no dependency version or application code was changed.

## Deployment impact

After replacing the project files and committing this fix, Vercel should report three workspace projects instead of six and `pnpm install --frozen-lockfile` should no longer inspect the stale MCP client package.

No environment-variable, database, Railway, SDK contract, Gateway contract, or runtime behavior change is required.
