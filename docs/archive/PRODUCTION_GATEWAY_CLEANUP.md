# v24 Production Gateway Cleanup

This version removes the in-app agent demo experience from the visible Magen3 product flow.

## Why

Magen3 should not look like it is the agent. In real life, agents already exist and connect to Magen3 through API.

## Changes

- Removed Agent Runner from the sidebar.
- Removed External Agent demo from the sidebar.
- Added Gateway Integration page.
- Added API connection details, Agent ID, Gateway URL, and copyable code snippet.
- Removed the standalone test-client package scripts from Magen3.
- Removed `casper-js-sdk` from Magen3 frontend dependencies to keep the admin dashboard lighter and avoid Railway package-resolution issues.
- Added `/api/public-config` for public gateway and Casper metadata.
- Moved manual proof inputs under Advanced fallback sections.

## Demo architecture

```text
Magen3 = policy/security/audit gateway
YieldBot AI = independent external agent app
```
