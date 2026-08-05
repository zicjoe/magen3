# Frontend Build Fix Report

## Summary

Fixed the two TypeScript compilation failures reported by the Railway build after the Milestones 14–16 commit.

## Changes

- Added the missing `Scale` icon import from `lucide-react` in `src/app/App.tsx`.
- Added the five required Milestone 14 policy-limit fields to the post-create policy form reset object:
  - `limitBasis`
  - `referenceCurrency`
  - `hourlyLimit`
  - `perDestinationLimit`
  - `walletPercentageLimit`
- The default limit unit and reference currency continue to use the existing browser preference keys and safe fallbacks.

## Verification

Static source assertions passed for both corrections.

A full local `pnpm run build` could not be executed in the packaging environment because Corepack's configured package mirror returned HTTP 404 for the repository-pinned `pnpm@10.14.0`. The reported TypeScript errors have been directly corrected. Railway has the package manager and dependencies cached and should perform the authoritative build after deployment.
