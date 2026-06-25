import { desc, eq } from "drizzle-orm";
import { DEFAULT_WALLET, seedAgents, seedAuditLogs, seedPolicies, shieldModules } from "../data/seed.mjs";
import { pool, db } from "../db/client.mjs";
import { runMigrations } from "../db/migrate.mjs";
import { actionReviewsTable, agentsTable, auditLogsTable, policiesTable } from "../db/schema.mjs";
import { makeId, makePseudoHash } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, validateDeployHash } from "../casper/auditPayload.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";

function toDate(value) {
  return value instanceof Date ? value : new Date(value || Date.now());
}

function normalizeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    purpose: row.purpose,
    permissionLevel: row.permissionLevel,
    status: row.status,
    createdAt: toDate(row.createdAt).toISOString(),
  };
}

function normalizePolicy(row) {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agentId,
    maxTransaction: Number(row.maxTransaction),
    dailyLimit: Number(row.dailyLimit),
    approvalThreshold: Number(row.approvalThreshold),
    trustedContracts: Array.isArray(row.trustedContracts) ? row.trustedContracts : [],
    blockedActions: Array.isArray(row.blockedActions) ? row.blockedActions : [],
    riskMode: row.riskMode,
    status: row.status,
    createdAt: toDate(row.createdAt).toISOString(),
    policyHash: row.policyHash,
  };
}

function normalizeAuditLog(row) {
  return {
    id: row.id,
    timestamp: toDate(row.timestamp).toISOString(),
    shield: row.shield,
    agentId: row.agentId,
    agentName: row.agentName,
    action: row.action,
    amount: Number(row.amount),
    target: row.target,
    targetType: row.targetType,
    decision: row.decision,
    risk: row.risk,
    reason: row.reason,
    policyUsed: row.policyUsed,
    walletAddress: row.walletAddress,
    txHash: row.txHash || "",
    riskScore: Number(row.riskScore),
  };
}

function normalizeReview(row) {
  return {
    id: row.id,
    agentId: row.agentId,
    actionType: row.actionType,
    amount: Number(row.amount),
    target: row.target,
    targetType: row.targetType,
    decision: row.decision,
    risk: row.risk,
    riskScore: Number(row.riskScore),
    reason: row.reason,
    checksPassed: Array.isArray(row.checksPassed) ? row.checksPassed : [],
    checksFailed: Array.isArray(row.checksFailed) ? row.checksFailed : [],
    createdAt: toDate(row.createdAt).toISOString(),
  };
}

async function listAgents() {
  return (await db.select().from(agentsTable).orderBy(desc(agentsTable.createdAt))).map(normalizeAgent);
}

async function listPolicies() {
  return (await db.select().from(policiesTable).orderBy(desc(policiesTable.createdAt))).map(normalizePolicy);
}

async function listAuditLogs() {
  return (await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.timestamp))).map(normalizeAuditLog);
}

async function seedIfEmpty() {
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM agents");
  if (Number(result.rows[0]?.count || 0) > 0) return;

  await db.insert(agentsTable).values(seedAgents.map((agent) => ({
    ...agent,
    createdAt: new Date(agent.createdAt),
  })));

  await db.insert(policiesTable).values(seedPolicies.map((policy) => ({
    ...policy,
    createdAt: new Date(policy.createdAt),
  })));

  await db.insert(auditLogsTable).values(seedAuditLogs.map((log) => ({
    ...log,
    timestamp: new Date(log.timestamp),
  })));
}

function deriveDashboardStats(policies, auditLogs) {
  return {
    activeShields: policies.some((policy) => policy.status === "Active") ? 1 : 0,
    protectedActions: auditLogs.length,
    blockedActions: auditLogs.filter((log) => log.decision === "Blocked").length,
    reviewRequired: auditLogs.filter((log) => log.decision === "Review Required").length,
    casperAuditRecords: auditLogs.filter((log) => Boolean(log.txHash)).length,
  };
}

export async function createPostgresStore() {
  await runMigrations();
  await seedIfEmpty();

  return {
    mode: "postgres",

    async bootstrap() {
      const [agents, policies, auditLogs] = await Promise.all([listAgents(), listPolicies(), listAuditLogs()]);
      return { agents, policies, auditLogs, shieldModules, dashboardStats: deriveDashboardStats(policies, auditLogs) };
    },

    async connectWallet() {
      return { walletAddress: DEFAULT_WALLET, network: "casper-testnet", connected: true };
    },

    async createAgent(body) {
      if (!body.name || !String(body.name).trim()) {
        const err = new Error("Agent name is required");
        err.status = 400;
        throw err;
      }

      const [agent] = await db.insert(agentsTable).values({
        id: makeId("MAG-AGENT"),
        name: String(body.name).trim(),
        type: body.type || "Custom Agent",
        purpose: body.purpose || "",
        permissionLevel: body.permissionLevel || "Limited Execution",
        status: "No Policy",
        createdAt: new Date(),
      }).returning();

      return normalizeAgent(agent);
    },

    async createPolicy(body) {
      if (!body.name || !body.agentId) {
        const err = new Error("Policy name and agentId are required");
        err.status = 400;
        throw err;
      }

      const existingAgentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, body.agentId));
      if (existingAgentRows.length === 0) {
        const err = new Error("Cannot create policy because the selected agent does not exist");
        err.status = 400;
        throw err;
      }

      const [policyRow] = await db.insert(policiesTable).values({
        id: makeId("POL"),
        name: String(body.name).trim(),
        agentId: body.agentId,
        maxTransaction: Number(body.maxTransaction || 50),
        dailyLimit: Number(body.dailyLimit || 200),
        approvalThreshold: Number(body.approvalThreshold || 100),
        trustedContracts: Array.isArray(body.trustedContracts) ? body.trustedContracts : [],
        blockedActions: Array.isArray(body.blockedActions) ? body.blockedActions : [],
        riskMode: body.riskMode || "Balanced",
        status: "Active",
        createdAt: new Date(),
        policyHash: makePseudoHash("0xpol"),
      }).returning();

      await db.update(agentsTable).set({ status: "Policy Active" }).where(eq(agentsTable.id, body.agentId));
      const policy = normalizePolicy(policyRow);
      const agent = normalizeAgent({ ...existingAgentRows[0], status: "Policy Active" });

      const [auditRow] = await db.insert(auditLogsTable).values({
        id: makeId("AUD"),
        timestamp: new Date(),
        shield: "Agent Shield",
        agentId: policy.agentId,
        agentName: agent.name,
        action: "Policy Activation",
        amount: 0,
        target: "Magen3 Policy Registry",
        targetType: "Trusted Contract",
        decision: "Allowed",
        risk: "Low",
        reason: `Policy "${policy.name}" activated for ${agent.name}.`,
        policyUsed: policy.name,
        walletAddress: body.walletAddress || DEFAULT_WALLET,
        txHash: "",
        riskScore: 4,
      }).returning();

      return { policy, auditLog: normalizeAuditLog(auditRow), agents: await listAgents() };
    },

    async analyzeAction(body) {
      const [agents, policies, auditLogs] = await Promise.all([listAgents(), listPolicies(), listAuditLogs()]);
      const result = evaluatePolicy({ request: body, agents, policies, auditLogs });

      const [reviewRow] = await db.insert(actionReviewsTable).values({
        id: makeId("REV"),
        agentId: body.agentId || "unknown-agent",
        actionType: body.actionType || body.action || "Contract Interaction",
        amount: Number(body.amount || 0),
        target: body.target || "No target provided",
        targetType: body.targetType || "Unknown Contract",
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        reason: result.reason,
        checksPassed: result.policyChecksPassed || [],
        checksFailed: result.policyChecksFailed || [],
        createdAt: new Date(),
      }).returning();

      return { result, review: normalizeReview(reviewRow) };
    },

    async createAuditLog(body) {
      const [auditRow] = await db.insert(auditLogsTable).values({
        id: body.id || makeId("AUD"),
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        shield: body.shield || "Agent Shield",
        agentId: body.agentId || "unknown-agent",
        agentName: body.agentName || body.agentId || "Unknown Agent",
        action: body.action || "Contract Interaction",
        amount: Number(body.amount || 0),
        target: body.target || "No target provided",
        targetType: body.targetType || "Unknown Contract",
        decision: body.decision || "Review Required",
        risk: body.risk || "Medium",
        reason: body.reason || "Magen3 recorded a decision.",
        policyUsed: body.policyUsed || "No active policy",
        walletAddress: body.walletAddress || DEFAULT_WALLET,
        txHash: body.txHash || "",
        riskScore: Number(body.riskScore || 50),
      }).returning();
      return normalizeAuditLog(auditRow);
    },

    async prepareCasperPayload(id) {
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      if (rows.length === 0) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const auditLog = normalizeAuditLog(rows[0]);
      return { auditLog, ...buildAuditDecisionPayload(auditLog) };
    },

    async confirmCasperDeploy(id, body) {
      const txHash = validateDeployHash(body?.deployHash);
      const [auditRow] = await db.update(auditLogsTable)
        .set({ txHash })
        .where(eq(auditLogsTable.id, id))
        .returning();

      if (!auditRow) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }

      return { auditLog: normalizeAuditLog(auditRow), txHash, confirmed: true };
    },

    async recordAuditLog(id) {
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      if (rows.length === 0) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const auditLog = normalizeAuditLog(rows[0]);
      const prepared = buildAuditDecisionPayload(auditLog);
      const txHash = makePseudoHash("0xcasper");
      const [auditRow] = await db.update(auditLogsTable)
        .set({ txHash })
        .where(eq(auditLogsTable.id, id))
        .returning();

      return { auditLog: normalizeAuditLog(auditRow), txHash, prepared };
    },
  };
}
