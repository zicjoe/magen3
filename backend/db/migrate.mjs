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
      tx_hash TEXT NOT NULL DEFAULT '',
      risk_score INTEGER NOT NULL
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_policies_agent_id ON policies(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_id ON audit_logs(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_reviews_agent_id ON action_reviews(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_agent_id ON agent_gateway_requests(agent_id);`);
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
