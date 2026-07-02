import { pool } from "./client.mjs";

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT '',
      permission_level TEXT NOT NULL,
      status TEXT NOT NULL,
      owner_wallet_address TEXT NOT NULL DEFAULT '',
      api_key_hash TEXT NOT NULL DEFAULT '',
      api_key_preview TEXT NOT NULL DEFAULT '',
      api_key_issued_at TIMESTAMPTZ,
      api_key_rotated_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      max_transaction DOUBLE PRECISION NOT NULL,
      daily_limit DOUBLE PRECISION NOT NULL,
      approval_threshold DOUBLE PRECISION NOT NULL,
      trusted_contracts JSONB NOT NULL DEFAULT '[]'::jsonb,
      blocked_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      risk_mode TEXT NOT NULL,
      status TEXT NOT NULL,
      owner_wallet_address TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      policy_hash TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS action_reviews (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      target TEXT NOT NULL,
      target_type TEXT NOT NULL,
      decision TEXT NOT NULL,
      risk TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      checks_passed JSONB NOT NULL DEFAULT '[]'::jsonb,
      checks_failed JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);



  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_gateway_requests (
      id TEXT PRIMARY KEY,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      agent_owner_wallet_address TEXT NOT NULL DEFAULT '',
      execution_wallet_address TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      asset TEXT NOT NULL DEFAULT 'CSPR',
      target TEXT NOT NULL,
      target_type TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      decision TEXT NOT NULL,
      risk TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      status TEXT NOT NULL,
      audit_log_id TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      shield TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      action TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      target TEXT NOT NULL,
      target_type TEXT NOT NULL,
      decision TEXT NOT NULL,
      risk TEXT NOT NULL,
      reason TEXT NOT NULL,
      policy_used TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      agent_owner_wallet_address TEXT NOT NULL DEFAULT '',
      execution_wallet_address TEXT NOT NULL DEFAULT '',
      tx_hash TEXT NOT NULL DEFAULT '',
      execution_status TEXT NOT NULL DEFAULT 'not_submitted',
      execution_tx_hash TEXT NOT NULL DEFAULT '',
      execution_signed_by TEXT NOT NULL DEFAULT '',
      execution_note TEXT NOT NULL DEFAULT '',
      execution_updated_at TIMESTAMPTZ,
      risk_score INTEGER NOT NULL
    );
  `);

  // v21 compatibility migration:
  // Earlier Magen3 versions created these tables before wallet-scoped ownership existed.
  // Railway databases that already have those old tables need ALTER TABLE before any UPDATE
  // references owner_wallet_address, otherwise the API crashes at startup and health checks fail.
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_preview TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_issued_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_rotated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;`);
  await pool.query(`UPDATE agents SET status = 'Active' WHERE status IN ('No Policy', 'Policy Active', 'Paused');`);
  await pool.query(`ALTER TABLE policies ADD COLUMN IF NOT EXISTS owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS agent_owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tx_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'not_submitted';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_tx_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_signed_by TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_note TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_updated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE agent_gateway_requests ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agent_gateway_requests ADD COLUMN IF NOT EXISTS agent_owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agent_gateway_requests ADD COLUMN IF NOT EXISTS execution_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`UPDATE audit_logs SET agent_owner_wallet_address = wallet_address WHERE agent_owner_wallet_address IS NULL OR agent_owner_wallet_address = '';`);
  await pool.query(`UPDATE audit_logs SET execution_wallet_address = wallet_address WHERE execution_wallet_address IS NULL OR execution_wallet_address = '';`);
  await pool.query(`UPDATE agent_gateway_requests SET execution_wallet_address = wallet_address WHERE execution_wallet_address IS NULL OR execution_wallet_address = '';`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_owner_wallet_address ON agents(owner_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_policies_owner_wallet_address ON policies(owner_wallet_address);`);
  await pool.query(`
    UPDATE agents
    SET owner_wallet_address = latest.wallet_address
    FROM (
      SELECT DISTINCT ON (agent_id) agent_id, wallet_address
      FROM audit_logs
      WHERE wallet_address IS NOT NULL AND wallet_address <> ''
      ORDER BY agent_id, timestamp DESC
    ) AS latest
    WHERE agents.id = latest.agent_id
      AND (agents.owner_wallet_address IS NULL OR agents.owner_wallet_address = '');
  `);
  await pool.query(`
    UPDATE policies
    SET owner_wallet_address = agents.owner_wallet_address
    FROM agents
    WHERE policies.agent_id = agents.id
      AND agents.owner_wallet_address <> ''
      AND (policies.owner_wallet_address IS NULL OR policies.owner_wallet_address = '');
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_policies_agent_id ON policies(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_id ON audit_logs(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_wallet_address ON audit_logs(wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_owner_wallet_address ON audit_logs(agent_owner_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_execution_wallet_address ON audit_logs(execution_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_execution_tx_hash ON audit_logs(execution_tx_hash);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_reviews_agent_id ON action_reviews(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_agent_id ON agent_gateway_requests(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_wallet_address ON agent_gateway_requests(wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_execution_wallet_address ON agent_gateway_requests(execution_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_received_at ON agent_gateway_requests(received_at DESC);`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      console.log("Database migrations completed.");
      await pool.end();
    })
    .catch(async (error) => {
      console.error("Database migration failed:", error);
      await pool.end();
      process.exit(1);
    });
}
