# Casper Wallet Connect

Magen3 v13 replaces the previous mock wallet connection with the real Casper Wallet browser extension flow.

## What changed

- The app now detects `window.CasperWalletProvider` injected by Casper Wallet.
- Clicking **Connect Wallet** calls `requestConnection()`.
- After approval, the app reads the active Casper public key with `getActivePublicKey()`.
- The active public key becomes the wallet address used by Agent Shield policies, action reviews, and audit logs.
- The top bar can restore an already-approved wallet session and disconnect from the site.

## How to test

1. Install Casper Wallet in the browser you use for Magen3.
2. Open the wallet extension and unlock it.
3. Switch/select your Casper Testnet account.
4. Run Magen3:

```bash
pnpm dev
```

5. Open the app in that same browser.
6. Click **Connect Wallet**.
7. Approve the connection in Casper Wallet.
8. Confirm the top bar shows your real public key, not a mock wallet address.

## Notes

The backend still has `/api/wallet/connect` only as a health/demo endpoint. The real wallet address now comes from the Casper Wallet extension in the browser.

If Casper Wallet is not installed, Magen3 shows a warning instead of silently using the old demo wallet.
