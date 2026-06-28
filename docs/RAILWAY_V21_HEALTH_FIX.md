# Railway v21 Health Fix

The v20 real-data release introduced wallet-scoped records. Existing Railway PostgreSQL databases from earlier versions may already have `agents`, `policies`, or `audit_logs` tables without the new wallet ownership columns.

If the API starts and migrations reference `policies.owner_wallet_address` before the column exists, Railway health checks fail because the backend exits during startup.

v21 adds compatibility `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations before wallet backfill updates run.

Required Railway variables for real mode:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
ALLOW_MEMORY_STORE=false
CASPER_RECORDING_MODE=manual-real-deploy
MAGEN3_CONTRACT_HASH=hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

Do not use `ALLOW_MEMORY_STORE=true` for the final real demo.
