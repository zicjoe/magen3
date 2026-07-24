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
      execution_capabilities JSONB NOT NULL DEFAULT '["Custom"]'::jsonb,
      capability_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
      onboarding_status TEXT NOT NULL DEFAULT 'complete',
      last_intent_at TIMESTAMPTZ,
      last_decision_at TIMESTAMPTZ,
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
      template_type TEXT NOT NULL DEFAULT 'Custom',
      capability_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
      structured_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
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
      audit_log_id TEXT NOT NULL DEFAULT '',
      wallet_address TEXT NOT NULL DEFAULT '',
      requester_wallet_address TEXT NOT NULL DEFAULT '',
      policy_id TEXT NOT NULL DEFAULT '',
      policy_name TEXT NOT NULL DEFAULT '',
      review_status TEXT NOT NULL DEFAULT 'Pending',
      binding_hash TEXT NOT NULL DEFAULT '',
      required_approvals INTEGER NOT NULL DEFAULT 1,
      approver_wallets JSONB NOT NULL DEFAULT '[]'::jsonb,
      responses JSONB NOT NULL DEFAULT '[]'::jsonb,
      expires_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      rejection_reason TEXT NOT NULL DEFAULT '',
      review_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);




  await pool.query(`
    CREATE TABLE IF NOT EXISTS emergency_pauses (
      id TEXT PRIMARY KEY,
      owner_wallet_address TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT '',
      policy_id TEXT NOT NULL DEFAULT '',
      scope_type TEXT NOT NULL,
      scope_value TEXT NOT NULL DEFAULT '',
      enforcement_action TEXT NOT NULL DEFAULT 'Blocked',
      trigger_type TEXT NOT NULL DEFAULT 'Manual',
      trigger_rule TEXT NOT NULL DEFAULT 'Manual emergency pause',
      reason TEXT NOT NULL,
      trigger_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'Active',
      created_by_wallet TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      resume_authority_wallets JSONB NOT NULL DEFAULT '[]'::jsonb,
      resume_requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
      resume_quorum INTEGER NOT NULL DEFAULT 1,
      resume_approval_request_id TEXT NOT NULL DEFAULT '',
      resumed_by_wallet TEXT NOT NULL DEFAULT '',
      resume_reason TEXT NOT NULL DEFAULT '',
      resumed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      decision_proof_status TEXT NOT NULL DEFAULT 'queued',
      decision_proof_payload_hash TEXT NOT NULL DEFAULT '',
      decision_proof_error TEXT NOT NULL DEFAULT '',
      decision_proof_mode TEXT NOT NULL DEFAULT '',
      decision_proof_updated_at TIMESTAMPTZ,
      original_intent JSONB NOT NULL DEFAULT '{}'::jsonb,
      pipeline_stages JSONB NOT NULL DEFAULT '[]'::jsonb,
      module_findings JSONB NOT NULL DEFAULT '[]'::jsonb,
      primary_reason TEXT NOT NULL DEFAULT '',
      triggered_rule TEXT NOT NULL DEFAULT '',
      suggested_resolution TEXT NOT NULL DEFAULT '',
      capability_context JSONB NOT NULL DEFAULT '[]'::jsonb,
      proof_submitted_at TIMESTAMPTZ,
      proof_confirmed_at TIMESTAMPTZ,
      approval_request_id TEXT NOT NULL DEFAULT '',
      approval_status TEXT NOT NULL DEFAULT 'not_required',
      approval_binding_hash TEXT NOT NULL DEFAULT '',
      approval_required_count INTEGER NOT NULL DEFAULT 0,
      approval_received_count INTEGER NOT NULL DEFAULT 0,
      approval_expires_at TIMESTAMPTZ,
      approval_resolved_at TIMESTAMPTZ,
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
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS execution_capabilities JSONB NOT NULL DEFAULT '["Custom"]'::jsonb;`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS capability_configuration JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'complete';`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_intent_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_decision_at TIMESTAMPTZ;`);
  await pool.query(`
    UPDATE agents
    SET execution_capabilities = CASE type
      WHEN 'DeFi Agent' THEN '["Trading", "dApp Interactions"]'::jsonb
      WHEN 'Trading Agent' THEN '["Trading"]'::jsonb
      WHEN 'Treasury Agent' THEN '["Treasury Operations", "Wallet Management"]'::jsonb
      WHEN 'RWA Agent' THEN '["Enterprise Automation", "dApp Interactions"]'::jsonb
      WHEN 'Oracle Agent' THEN '["dApp Interactions"]'::jsonb
      ELSE '["Custom"]'::jsonb
    END
    WHERE execution_capabilities IS NULL
       OR jsonb_typeof(execution_capabilities) <> 'array'
       OR CASE
            WHEN jsonb_typeof(execution_capabilities) = 'array' THEN jsonb_array_length(execution_capabilities) = 0
            ELSE TRUE
          END
       OR execution_capabilities = '["Custom"]'::jsonb;
  `);
  await pool.query(`UPDATE agents SET status = 'Active' WHERE status IN ('No Policy', 'Policy Active', 'Paused');`);
  await pool.query(`ALTER TABLE policies ADD COLUMN IF NOT EXISTS owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE policies ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'Custom';`);
  await pool.query(`ALTER TABLE policies ADD COLUMN IF NOT EXISTS capability_scope JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE policies ADD COLUMN IF NOT EXISTS structured_rules JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await pool.query(`
    UPDATE policies
    SET capability_scope = agents.execution_capabilities
    FROM agents
    WHERE policies.agent_id = agents.id
      AND (
        policies.capability_scope IS NULL
        OR jsonb_typeof(policies.capability_scope) <> 'array'
        OR CASE
             WHEN jsonb_typeof(policies.capability_scope) = 'array' THEN jsonb_array_length(policies.capability_scope) = 0
             ELSE TRUE
           END
      );
  `);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS agent_owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tx_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'not_submitted';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_tx_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_signed_by TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_note TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS execution_updated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS decision_proof_status TEXT NOT NULL DEFAULT 'queued';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS decision_proof_payload_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS decision_proof_error TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS decision_proof_mode TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS decision_proof_updated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS original_intent JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS pipeline_stages JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS module_findings JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS primary_reason TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS triggered_rule TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS suggested_resolution TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS capability_context JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS proof_submitted_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS proof_confirmed_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_request_id TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_required';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_binding_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_required_count INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_received_count INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS approval_resolved_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS audit_log_id TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS requester_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS policy_id TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS policy_name TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'Pending';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS binding_hash TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS required_approvals INTEGER NOT NULL DEFAULT 1;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS approver_wallets JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS responses JSONB NOT NULL DEFAULT '[]'::jsonb;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS review_context JSONB NOT NULL DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE action_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE agent_gateway_requests ADD COLUMN IF NOT EXISTS wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agent_gateway_requests ADD COLUMN IF NOT EXISTS agent_owner_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agent_gateway_requests ADD COLUMN IF NOT EXISTS execution_wallet_address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`UPDATE audit_logs SET agent_owner_wallet_address = wallet_address WHERE agent_owner_wallet_address IS NULL OR agent_owner_wallet_address = '';`);
  await pool.query(`UPDATE audit_logs SET execution_wallet_address = wallet_address WHERE execution_wallet_address IS NULL OR execution_wallet_address = '';`);
  await pool.query(`UPDATE agent_gateway_requests SET execution_wallet_address = wallet_address WHERE execution_wallet_address IS NULL OR execution_wallet_address = '';`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_owner_wallet_address ON agents(owner_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_last_intent_at ON agents(last_intent_at DESC);`);
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_decision_proof_status ON audit_logs(decision_proof_status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_reviews_agent_id ON action_reviews(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_reviews_wallet_address ON action_reviews(wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_reviews_audit_log_id ON action_reviews(audit_log_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_reviews_status ON action_reviews(review_status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_agent_id ON agent_gateway_requests(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_wallet_address ON agent_gateway_requests(wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_execution_wallet_address ON agent_gateway_requests(execution_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_gateway_requests_received_at ON agent_gateway_requests(received_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_pauses_owner_wallet ON emergency_pauses(owner_wallet_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_pauses_agent_id ON emergency_pauses(agent_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_pauses_policy_id ON emergency_pauses(policy_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_pauses_status ON emergency_pauses(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_emergency_pauses_expires_at ON emergency_pauses(expires_at);`);
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
