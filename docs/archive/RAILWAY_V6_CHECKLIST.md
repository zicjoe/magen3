# Railway v6 Checklist

After pushing v6 to GitHub, check the Railway backend service.

## Backend settings

Build Command:

```bash
node -e "console.log('Magen3 backend build step skipped')"
```

Start Command:

```bash
pnpm start
```

Health Check Path:

```text
/api/health
```

## Required variables

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
NODE_ENV=production
CORS_ORIGIN=*
CASPER_NETWORK=casper-testnet
CASPER_RPC_URL=https://node.testnet.casper.network/rpc
CASPER_CHAIN_NAME=casper-test
CASPER_RECORDING_MODE=mock
MAGEN3_CONTRACT_HASH=
```

After the contract is deployed, update:

```env
CASPER_RECORDING_MODE=manual
MAGEN3_CONTRACT_HASH=hash-your-real-contract-hash
```

## Health check

Open:

```text
https://your-backend.up.railway.app/api/health
```

Expected:

```json
{
  "ok": true,
  "storage": "postgres",
  "casper": {
    "contractConfigured": false
  }
}
```

After contract hash is added, `contractConfigured` should become `true`.
