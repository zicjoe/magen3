# Magen3 SDK Public Beta Publishing Guide

This release prepares the existing JavaScript/TypeScript SDK for its first public npm beta. It does not create a second SDK.

## What was prepared

- Package: `@magen3/sdk`
- Release version: `0.4.0-beta.1`
- Default npm distribution tag: `beta`
- Public scoped-package access enabled
- A publish-time gate now runs type checking, builds `dist`, and then runs SDK tests
- A dry-run publishing check is available from the repository root

## Where each step happens

### In the npm website

1. Sign in or create an npm account.
2. Enable the authentication required by npm for publishing.
3. Create or join the npm organization that controls the `@magen3` scope.

The source code cannot create the npm organization or grant your npm account permission to it.

### In PowerShell, from the Magen3 repository root

```powershell
pnpm install --frozen-lockfile
pnpm sdk:publish:check
```

### In PowerShell, from `packages\sdk-js`

```powershell
npm login --auth-type=web
npm whoami
npm publish
```

`publishConfig` already makes the package public and assigns the `beta` tag, so the first beta can be published with `npm publish`. The explicit equivalent is:

```powershell
npm publish --access public --tag beta
```

### Verify from any folder

```powershell
npm view @magen3/sdk version
npm view @magen3/sdk dist-tags
```

A separate developer can then install it in their backend with:

```powershell
pnpm add @magen3/sdk@beta
```

## What remains outside the ZIP

Publishing requires control of the `@magen3` npm scope and an authenticated npm account. No ZIP can perform those account-level actions automatically.
