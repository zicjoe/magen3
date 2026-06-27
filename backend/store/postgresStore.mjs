import { desc, eq } from "drizzle-orm";
import { shieldModules } from "../data/seed.mjs";
import { db } from "../db/client.mjs";
import { runMigrations } from "../db/migrate.mjs";
import { actionReviewsTable, agentGatewayRequestsTable, agentsTable, auditLogsTable, policiesTable } from "../db/schema.mjs";
import { makeId, makePseudoHash } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";
import { normalizeAgentGatewayIntent, gatewayNextAction, gatewayStatusFromDecision } from "../lib/agentGateway.mjs";

function toDate(value) {
  return value instanceof Date ? value : new Date(value || Date.now());
}

function normalizeWalletAddress(value) {
  return String(value || "").trim();
}

function requireWalletAddress(value) {
  const walletAddress = normalizeWalletAddress(value);
  if (!walletAddress) {
    const err = new Error("A real wallet address is required. Connect Casper Wallet first.");
    err.status = 400;
    throw err;
  }
  return walletAddress;
}

function normalizeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    purpose: row.purpose,
    permissionLevel: row.permissionLevel,
    status: row.status,
    ownerWalletAddress: row.ownerWalletAddress || "",
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
    ownerWalletAddress: row.ownerWalletAddress || "",
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

async function listAgents(walletAddress) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return [];
  return (await db.select().from(agentsTable)
    .where(eq(agentsTable.ownerWalletAddress, normalizedWallet))
    .orderBy(desc(agentsTable.createdAt)))
    .map(normalizeAgent);
}

async function listPolicies(walletAddress) {
  const agents = await listAgents(walletAddress);
  const agentIds = new Set(agents.map((agent) => agent.id));
  if (agentIds.size === 0) return [];
  return (await db.select().from(policiesTable).orderBy(desc(policiesTable.createdAt)))
    .filter((policy) => agentIds.has(policy.agentId))
    .map(normalizePolicy);
}

async function listAuditLogs(walletAddress) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return [];
  return (await db.select().from(auditLogsTable)
    .where(eq(auditLogsTable.walletAddress, normalizedWallet))
    .orderBy(desc(auditLogsTable.timestamp)))
    .map(normalizeAuditLog);
}

function deriveDashboardStats(policies, auditLogs) {
  return {
    activeShields: policies.some((policy) => policy.status === "Active") ? 1 : 0,
    protectedActions: auditLogs.length,
    blockedActions: auditLogs.filter((log) => log.decision === "Blocked").length,
    reviewRequired: auditLogs.filter((log) => log.decision === "Review Required").length,
    casperAuditRecords: auditLogs.filter((log) => isRealDeployHash(log.txHash)).length,
  };
}

export async function createPostgresStore() {
  await runMigrations();

  return {
    mode: "postgres",

    async bootstrap(walletAddress) {
      const normalizedWallet = normalizeWalletAddress(walletAddress);
      const [agents, policies, auditLogs] = await Promise.all([
        listAgents(normalizedWallet),
        listPolicies(normalizedWallet),
        listAuditLogs(normalizedWallet),
      ]);
      return { agents, policies, auditLogs, shieldModules, dashboardStats: deriveDashboardStats(policies, auditLogs) };
    },

    async connectWallet() {
      return { network: "casper-testnet", connected: true };
    },

    async createAgent(body) {
      if (!body.name || !String(body.name).trim()) {
        const err = new Error("Agent name is required");
        err.status = 400;
        throw err;
      }
      const ownerWalletAddress = requireWalletAddress(body.ownerWalletAddress || body.walletAddress);

      const [agent] = await db.insert(agentsTable).values({
        id: makeId("MAG-AGENT"),
        name: String(body.name).trim(),
        type: body.type || "Custom Agent",
        purpose: body.purpose || "",
        permissionLevel: body.permissionLevel || "Limited Execution",
        status: "No Policy",
        ownerWalletAddress,
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
      const walletAddress = requireWalletAddress(body.walletAddress);

      const existingAgentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, body.agentId));
      const ownedAgent = existingAgentRows.find((agent) => agent.ownerWalletAddress === walletAddress);
      if (!ownedAgent) {
        const err = new Error("Cannot create policy because this agent is not registered under the connected wallet.");
        err.status = 403;
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
        ownerWalletAddress: walletAddress,
        createdAt: new Date(),
        policyHash: makePseudoHash("0xpol"),
      }).returning();

      await db.update(agentsTable).set({ status: "Policy Active" }).where(eq(agentsTable.id, body.agentId));
      const policy = normalizePolicy(policyRow);
      const agent = normalizeAgent({ ...ownedAgent, status: "Policy Active" });

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
        walletAddress,
        txHash: "",
        riskScore: 4,
      }).returning();

      return { policy, auditLog: normalizeAuditLog(auditRow), agents: await listAgents(walletAddress) };
    },

    async analyzeAction(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const [agents, policies, auditLogs] = await Promise.all([listAgents(walletAddress), listPolicies(walletAddress), listAuditLogs(walletAddress)]);
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
      const walletAddress = requireWalletAddress(body.walletAddress);
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
        walletAddress,
        txHash: body.txHash || "",
        riskScore: Number(body.riskScore || 50),
      }).returning();
      return normalizeAuditLog(auditRow);
    },

    async submitAgentGatewayIntent(body) {
      const intent = normalizeAgentGatewayIntent(body);
      const walletAddress = requireWalletAddress(intent.walletAddress);
      const [agents, policies, auditLogs] = await Promise.all([listAgents(walletAddress), listPolicies(walletAddress), listAuditLogs(walletAddress)]);
      const request = {
        agentId: intent.agentId,
        actionType: intent.actionType,
        amount: intent.amount,
        target: intent.target,
        targetType: intent.targetType,
        walletAddress,
      };
      const result = evaluatePolicy({ request, agents, policies, auditLogs });
      const agent = agents.find((item) => item.id === intent.agentId);
      const policy = policies.find((item) => item.agentId === intent.agentId && item.status === "Active");
      const status = gatewayStatusFromDecision(result.decision);

      const [auditRow] = await db.insert(auditLogsTable).values({
        id: makeId("AUD"),
        timestamp: new Date(),
        shield: "Agent Shield",
        agentId: intent.agentId,
        agentName: agent?.name || intent.agentId,
        action: intent.actionType,
        amount: intent.amount,
        target: intent.target,
        targetType: intent.targetType,
        decision: result.decision,
        risk: result.risk,
        reason: `Agent Gateway request ${intent.id} from ${intent.source}. ${intent.goal ? `Goal: ${intent.goal}. ` : ""}${intent.reason ? `Reason: ${intent.reason}. ` : ""}${result.reason}`,
        policyUsed: policy?.name || "No active policy",
        walletAddress,
        txHash: "",
        riskScore: Number(result.riskScore || 50),
      }).returning();

      const auditLog = normalizeAuditLog(auditRow);
      const [gatewayRow] = await db.insert(agentGatewayRequestsTable).values({
        id: intent.id,
        receivedAt: new Date(intent.receivedAt),
        source: intent.source,
        agentId: intent.agentId,
        walletAddress,
        actionType: intent.actionType,
        amount: intent.amount,
        asset: intent.asset,
        target: intent.target,
        targetType: intent.targetType,
        goal: intent.goal,
        reason: intent.reason,
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        status,
        auditLogId: auditLog.id,
      }).returning();

      const gatewayRequest = {
        id: gatewayRow.id,
        receivedAt: toDate(gatewayRow.receivedAt).toISOString(),
        source: gatewayRow.source,
        agentId: gatewayRow.agentId,
        walletAddress: gatewayRow.walletAddress,
        actionType: gatewayRow.actionType,
        amount: Number(gatewayRow.amount),
        asset: gatewayRow.asset,
        target: gatewayRow.target,
        targetType: gatewayRow.targetType,
        goal: gatewayRow.goal,
        reason: gatewayRow.reason,
        decision: gatewayRow.decision,
        risk: gatewayRow.risk,
        riskScore: Number(gatewayRow.riskScore),
        status: gatewayRow.status,
        auditLogId: gatewayRow.auditLogId,
      };

      return {
        ok: true,
        gatewayRequest,
        result,
        auditLog,
        casperPayload: buildAuditDecisionPayload(auditLog),
        executionApproved: result.decision === "Allowed",
        nextAction: gatewayNextAction(result.decision),
      };
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

    async recordAuditLog() {
      const err = new Error("Automatic local recording is disabled. Prepare the Casper payload, sign the real deploy with Casper client, then confirm the real deploy hash.");
      err.status = 400;
      throw err;
    },
  };
}
