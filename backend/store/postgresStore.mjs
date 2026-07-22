import { desc, eq } from "drizzle-orm";
import { shieldModules } from "../data/seed.mjs";
import { db } from "../db/client.mjs";
import { runMigrations } from "../db/migrate.mjs";
import { actionReviewsTable, agentGatewayRequestsTable, agentsTable, auditLogsTable, policiesTable } from "../db/schema.mjs";
import { apiKeyPreview, hashSecret, makeApiKey, makeId, makePseudoHash, secretMatches } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { initialDecisionProofState, recordDecisionProof } from "../casper/decisionRelayer.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";
import { getThreatIntelligenceSnapshot } from "../lib/threatIntelligence.mjs";
import { getOracleValidationSnapshot } from "../lib/oracleValidation.mjs";
import { normalizeAgentGatewayIntent, gatewayNextAction, gatewayStatusFromDecision } from "../lib/agentGateway.mjs";
import { legacyTypeFromCapabilities, normalizeExecutionCapabilities, recommendedPolicyTemplate } from "../lib/securityModel.mjs";

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

function normalizeAgentStatus(status) {
  return status === "Revoked" ? "Revoked" : "Active";
}

function normalizeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    purpose: row.purpose,
    permissionLevel: row.permissionLevel,
    status: normalizeAgentStatus(row.status),
    ownerWalletAddress: row.ownerWalletAddress || "",
    apiKeyPreview: row.apiKeyPreview || "",
    apiKeyIssuedAt: row.apiKeyIssuedAt ? toDate(row.apiKeyIssuedAt).toISOString() : "",
    apiKeyRotatedAt: row.apiKeyRotatedAt ? toDate(row.apiKeyRotatedAt).toISOString() : "",
    revokedAt: row.revokedAt ? toDate(row.revokedAt).toISOString() : "",
    executionCapabilities: normalizeExecutionCapabilities(row.executionCapabilities, row.type),
    capabilityConfiguration: row.capabilityConfiguration && typeof row.capabilityConfiguration === "object" ? row.capabilityConfiguration : {},
    onboardingStatus: row.onboardingStatus || "complete",
    lastIntentAt: row.lastIntentAt ? toDate(row.lastIntentAt).toISOString() : "",
    lastDecisionAt: row.lastDecisionAt ? toDate(row.lastDecisionAt).toISOString() : "",
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
    templateType: row.templateType || "Custom",
    capabilityScope: normalizeExecutionCapabilities(row.capabilityScope || []),
    structuredRules: row.structuredRules && typeof row.structuredRules === "object" ? row.structuredRules : {},
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
    agentOwnerWalletAddress: row.agentOwnerWalletAddress || row.walletAddress,
    executionWalletAddress: row.executionWalletAddress || row.walletAddress,
    txHash: row.txHash || "",
    executionStatus: row.executionStatus || "not_submitted",
    executionTxHash: row.executionTxHash || "",
    executionSignedBy: row.executionSignedBy || "",
    executionNote: row.executionNote || "",
    executionUpdatedAt: row.executionUpdatedAt ? toDate(row.executionUpdatedAt).toISOString() : "",
    decisionProofStatus: row.decisionProofStatus || "queued",
    decisionProofPayloadHash: row.decisionProofPayloadHash || "",
    decisionProofError: row.decisionProofError || "",
    decisionProofMode: row.decisionProofMode || "",
    decisionProofUpdatedAt: row.decisionProofUpdatedAt ? toDate(row.decisionProofUpdatedAt).toISOString() : "",
    originalIntent: row.originalIntent && typeof row.originalIntent === "object" ? row.originalIntent : {},
    pipelineStages: Array.isArray(row.pipelineStages) ? row.pipelineStages : [],
    moduleFindings: Array.isArray(row.moduleFindings) ? row.moduleFindings : [],
    primaryReason: row.primaryReason || row.reason || "",
    triggeredRule: row.triggeredRule || "",
    suggestedResolution: row.suggestedResolution || "",
    capabilityContext: normalizeExecutionCapabilities(row.capabilityContext || []),
    proofSubmittedAt: row.proofSubmittedAt ? toDate(row.proofSubmittedAt).toISOString() : "",
    proofConfirmedAt: row.proofConfirmedAt ? toDate(row.proofConfirmedAt).toISOString() : "",
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

function initialExecutionStatus(decision) {
  if (decision === "Allowed") return "approved_pending_signature";
  if (decision === "Blocked") return "blocked_not_submitted";
  if (decision === "Review Required") return "review_required_not_submitted";
  return "not_submitted";
}

function updatePipelineStage(stages, id, status, timestamp = new Date().toISOString(), label = "") {
  const source = Array.isArray(stages) ? stages : [];
  const found = source.some((stage) => stage.id === id);
  const next = source.map((stage) => stage.id === id ? { ...stage, status, timestamp, ...(label ? { label } : {}) } : stage);
  return found ? next : [...next, { id, label: label || id, status, timestamp }];
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
      const apiKey = makeApiKey();
      const now = new Date();
      const executionCapabilities = normalizeExecutionCapabilities(body.executionCapabilities, body.type);

      const [agent] = await db.insert(agentsTable).values({
        id: makeId("MAG-AGENT"),
        name: String(body.name).trim(),
        type: body.type || legacyTypeFromCapabilities(executionCapabilities),
        purpose: body.purpose || "",
        permissionLevel: body.permissionLevel || "Limited Execution",
        status: "Active",
        ownerWalletAddress,
        apiKeyHash: hashSecret(apiKey),
        apiKeyPreview: apiKeyPreview(apiKey),
        apiKeyIssuedAt: now,
        executionCapabilities,
        capabilityConfiguration: body.capabilityConfiguration && typeof body.capabilityConfiguration === "object" ? body.capabilityConfiguration : {},
        onboardingStatus: body.onboardingStatus || "complete",
        createdAt: now,
      }).returning();

      return { ...normalizeAgent(agent), apiKey };
    },

    async rotateAgentApiKey(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
      const agent = rows.find((item) => item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }

      const apiKey = makeApiKey();
      const now = new Date();
      const [updated] = await db.update(agentsTable)
        .set({
          apiKeyHash: hashSecret(apiKey),
          apiKeyPreview: apiKeyPreview(apiKey),
          apiKeyIssuedAt: agent.apiKeyIssuedAt || now,
          apiKeyRotatedAt: now,
        })
        .where(eq(agentsTable.id, id))
        .returning();

      return { ...normalizeAgent(updated), apiKey };
    },

    async revokeAgent(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
      const agent = rows.find((item) => item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }

      const [updated] = await db.update(agentsTable)
        .set({ status: "Revoked", revokedAt: new Date() })
        .where(eq(agentsTable.id, id))
        .returning();

      return normalizeAgent(updated);
    },

    async getAgentGatewayIdentity(agentId, context = {}) {
      const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
      const agentRecord = rows[0];
      if (!agentRecord) {
        const err = new Error("Connected agent not found for this Agent ID.");
        err.status = 404;
        throw err;
      }
      if (agentRecord.status === "Revoked") {
        const err = new Error("Agent Gateway request rejected because this connected agent has been revoked.");
        err.status = 403;
        throw err;
      }
      if (!secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
        err.status = 401;
        throw err;
      }

      const activePolicy = (await listPolicies(agentRecord.ownerWalletAddress))
        .find((item) => item.agentId === agentRecord.id && item.status === "Active") || null;

      return {
        ok: true,
        agent: normalizeAgent(agentRecord),
        activePolicy,
        gatewayReady: Boolean(activePolicy),
        endpoint: "/api/agent-gateway/intents",
        ...(!activePolicy ? { reason: "No active policy assigned to this agent." } : {}),
      };
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
        templateType: body.templateType || recommendedPolicyTemplate(normalizeAgent(ownedAgent).executionCapabilities),
        capabilityScope: normalizeExecutionCapabilities(body.capabilityScope || normalizeAgent(ownedAgent).executionCapabilities, ownedAgent.type),
        structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : {},
        createdAt: new Date(),
        policyHash: makePseudoHash("0xpol"),
      }).returning();

      const policy = normalizePolicy(policyRow);
      const agent = normalizeAgent(ownedAgent);

      const policyAuditTimestamp = new Date();
      const auditValues = {
        id: makeId("AUD"),
        timestamp: policyAuditTimestamp,
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
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress: walletAddress,
        txHash: "",
        executionStatus: "not_required",
        executionTxHash: "",
        executionSignedBy: "",
        executionNote: "Policy activation does not execute an external Web3 transaction.",
        executionUpdatedAt: null,
        originalIntent: { action: "Policy Activation", policyId: policy.id },
        pipelineStages: [
          { id: "policy-loaded", label: "Policy created and activated", status: "completed", timestamp: policyAuditTimestamp.toISOString() },
          { id: "audit-stored", label: "Audit stored", status: "completed", timestamp: policyAuditTimestamp.toISOString() },
          { id: "casper-proof", label: "Casper decision proof", status: "pending", timestamp: "" },
        ],
        moduleFindings: [{ module: "Policy Enforcement", status: "pass", severity: "info", rule: "Active policy", message: `Policy ${policy.name} activated.`, evidence: { policyId: policy.id }, remediation: "" }],
        primaryReason: `Policy ${policy.name} activated.`,
        triggeredRule: "Active policy",
        suggestedResolution: "No action required.",
        capabilityContext: agent.executionCapabilities,
        proofSubmittedAt: policyAuditTimestamp,
        proofConfirmedAt: null,
        riskScore: 4,
      };
      const initialProof = initialDecisionProofState({
        ...auditValues,
        timestamp: auditValues.timestamp.toISOString(),
      });
      const [auditRow] = await db.insert(auditLogsTable).values({
        ...auditValues,
        decisionProofStatus: initialProof.decisionProofStatus,
        decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
        decisionProofError: initialProof.decisionProofError,
        decisionProofMode: initialProof.decisionProofMode,
        decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
      }).returning();
      const proof = await recordDecisionProof(normalizeAuditLog(auditRow));
      const [recordedAuditRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
          pipelineStages: updatePipelineStage(auditRow.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, auditRow.id))
        .returning();

      return { policy, auditLog: normalizeAuditLog(recordedAuditRow || auditRow), agents: await listAgents(walletAddress) };
    },

    async updatePolicy(id, body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const rows = await db.select().from(policiesTable).where(eq(policiesTable.id, id));
      const current = rows.find((policy) => policy.ownerWalletAddress === walletAddress);
      if (!current) {
        const err = new Error("Policy not found for the connected wallet.");
        err.status = 404;
        throw err;
      }

      const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, current.agentId));
      const ownedAgent = agentRows.find((agent) => agent.ownerWalletAddress === walletAddress);
      if (!ownedAgent) {
        const err = new Error("Cannot update policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const [policyRow] = await db.update(policiesTable)
        .set({
          name: body.name ? String(body.name).trim() : current.name,
          maxTransaction: Number(body.maxTransaction ?? current.maxTransaction),
          dailyLimit: Number(body.dailyLimit ?? current.dailyLimit),
          approvalThreshold: Number(body.approvalThreshold ?? current.approvalThreshold),
          trustedContracts: Array.isArray(body.trustedContracts) ? body.trustedContracts : current.trustedContracts,
          blockedActions: Array.isArray(body.blockedActions) ? body.blockedActions : current.blockedActions,
          riskMode: body.riskMode || current.riskMode,
          status: body.status || current.status,
          templateType: body.templateType || current.templateType || "Custom",
          capabilityScope: Array.isArray(body.capabilityScope) ? normalizeExecutionCapabilities(body.capabilityScope, ownedAgent.type) : current.capabilityScope,
          structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : current.structuredRules,
        })
        .where(eq(policiesTable.id, id))
        .returning();

      return { policy: normalizePolicy(policyRow), agents: await listAgents(walletAddress) };
    },

    async analyzeAction(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const [agents, policies, auditLogs] = await Promise.all([listAgents(walletAddress), listPolicies(walletAddress), listAuditLogs(walletAddress)]);
      const [threatIntelligence, oracleValidation] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
      ]);
      const result = evaluatePolicy({
        request: {
          ...body,
          walletAddress: body.executionWalletAddress || body.execution_wallet_address || body.walletAddress,
          executionWalletAddress: body.executionWalletAddress || body.execution_wallet_address || body.walletAddress,
          agentOwnerWalletAddress: walletAddress,
        },
        agents,
        policies,
        auditLogs,
        threatIntelligence,
        oracleValidation,
      });

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
      const agentOwnerWalletAddress = normalizeWalletAddress(body.agentOwnerWalletAddress || walletAddress);
      const executionWalletAddress = normalizeWalletAddress(body.executionWalletAddress || body.execution_wallet_address || body.walletAddress || walletAddress);
      const auditValues = {
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
        agentOwnerWalletAddress,
        executionWalletAddress,
        txHash: body.txHash || "",
        executionStatus: body.executionStatus || initialExecutionStatus(body.decision),
        executionTxHash: body.executionTxHash || "",
        executionSignedBy: body.executionSignedBy || "",
        executionNote: body.executionNote || "",
        executionUpdatedAt: body.executionUpdatedAt ? new Date(body.executionUpdatedAt) : null,
        originalIntent: body.originalIntent && typeof body.originalIntent === "object" ? body.originalIntent : {},
        pipelineStages: Array.isArray(body.pipelineStages) ? body.pipelineStages : [],
        moduleFindings: Array.isArray(body.moduleFindings) ? body.moduleFindings : [],
        primaryReason: body.primaryReason || body.reason || "Magen3 recorded a decision.",
        triggeredRule: body.triggeredRule || "",
        suggestedResolution: body.suggestedResolution || "",
        capabilityContext: normalizeExecutionCapabilities(body.capabilityContext || []),
        proofSubmittedAt: body.proofSubmittedAt ? new Date(body.proofSubmittedAt) : new Date(),
        proofConfirmedAt: body.proofConfirmedAt ? new Date(body.proofConfirmedAt) : null,
        riskScore: Number(body.riskScore || 50),
      };
      const initialProof = initialDecisionProofState({
        ...auditValues,
        timestamp: auditValues.timestamp.toISOString(),
        createdAt: undefined,
      });
      const [auditRow] = await db.insert(auditLogsTable).values({
        ...auditValues,
        decisionProofStatus: initialProof.decisionProofStatus,
        decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
        decisionProofError: initialProof.decisionProofError,
        decisionProofMode: initialProof.decisionProofMode,
        decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
      }).returning();
      const proof = await recordDecisionProof(normalizeAuditLog(auditRow));
      const [updatedRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
          pipelineStages: updatePipelineStage(auditRow.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, auditRow.id))
        .returning();
      return normalizeAuditLog(updatedRow || auditRow);
    },

    async submitAgentGatewayIntent(body, context = {}) {
      const intent = normalizeAgentGatewayIntent(body);
      const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, intent.agentId));
      const agentRecord = agentRows[0];
      if (!agentRecord) {
        const err = new Error("Connected agent not found for this Agent ID.");
        err.status = 404;
        throw err;
      }
      if (agentRecord.status === "Revoked") {
        const err = new Error("Agent Gateway request rejected because this connected agent has been revoked.");
        err.status = 403;
        throw err;
      }
      if (!secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
        err.status = 401;
        throw err;
      }
      const walletAddress = requireWalletAddress(agentRecord.ownerWalletAddress);
      const executionWalletAddress = normalizeWalletAddress(intent.executionWalletAddress);
      const [agents, policies, auditLogs] = await Promise.all([
        listAgents(walletAddress),
        listPolicies(walletAddress),
        listAuditLogs(walletAddress),
      ]);
      const request = {
        agentId: intent.agentId,
        actionType: intent.actionType,
        amount: intent.amount,
        asset: intent.asset,
        target: intent.target,
        targetType: intent.targetType,
        contractIdentifierType: intent.contractIdentifierType,
        entryPoint: intent.entryPoint,
        contractVersion: intent.contractVersion,
        chainName: intent.chainName,
        paymentAmountMotes: intent.paymentAmountMotes,
        gasPriceTolerance: intent.gasPriceTolerance,
        ttl: intent.ttl,
        transactionTimestamp: intent.transactionTimestamp,
        slippageBps: intent.slippageBps,
        expectedOutput: intent.expectedOutput,
        minimumReceived: intent.minimumReceived,
        runtimeArgs: intent.runtimeArgs,
        transactionHash: intent.transactionHash,
        bridgeSourceChain: intent.bridgeSourceChain,
        bridgeDestinationChain: intent.bridgeDestinationChain,
        bridgeProvider: intent.bridgeProvider,
        bridgeRouteId: intent.bridgeRouteId,
        bridgeDestinationAddress: intent.bridgeDestinationAddress,
        bridgeAsset: intent.bridgeAsset,
        bridgeFeeAmount: intent.bridgeFeeAmount,
        bridgeFeeBps: intent.bridgeFeeBps,
        bridgeExpectedOutput: intent.bridgeExpectedOutput,
        bridgeMinimumReceived: intent.bridgeMinimumReceived,
        bridgeQuoteTimestamp: intent.bridgeQuoteTimestamp,
        bridgeQuoteExpiresAt: intent.bridgeQuoteExpiresAt,
        bridgeSourceConfirmations: intent.bridgeSourceConfirmations,
        bridgeDestinationConfirmations: intent.bridgeDestinationConfirmations,
        walletAddress: executionWalletAddress,
        executionWalletAddress,
        agentOwnerWalletAddress: walletAddress,
      };
      const [threatIntelligence, oracleValidation] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
      ]);
      const result = evaluatePolicy({ request, agents, policies, auditLogs, threatIntelligence, oracleValidation });
      const agent = agents.find((item) => item.id === intent.agentId);
      const policy = policies.find((item) => item.agentId === intent.agentId && item.status === "Active");
      const status = gatewayStatusFromDecision(result.decision);

      const auditTimestamp = new Date();
      const auditValues = {
        id: makeId("AUD"),
        timestamp: auditTimestamp,
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
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress,
        txHash: "",
        executionStatus: initialExecutionStatus(result.decision),
        executionTxHash: "",
        executionSignedBy: "",
        executionNote: result.decision === "Allowed" ? "Magen3 approved this action. Waiting for the wallet owner to sign the real execution transaction." : "Execution did not proceed because Magen3 did not approve automatic execution.",
        executionUpdatedAt: null,
        originalIntent: {
          source: intent.source,
          agentId: intent.agentId,
          executionWalletAddress,
          goal: intent.goal,
          reason: intent.reason,
          action: {
            type: intent.actionType,
            amount: intent.amount,
            asset: intent.asset,
            outputAsset: intent.outputAsset,
            oracle: {
              baseAsset: intent.oracleBaseAsset,
              quoteAsset: intent.oracleQuoteAsset,
              executionPrice: intent.executionPrice,
              quoteTimestamp: intent.quoteTimestamp,
            },
            target: intent.target,
            targetType: intent.targetType,
            contractIdentifierType: intent.contractIdentifierType,
            entryPoint: intent.entryPoint,
            contractVersion: intent.contractVersion,
            chainName: intent.chainName,
            preflight: {
              paymentAmountMotes: intent.paymentAmountMotes,
              gasPriceTolerance: intent.gasPriceTolerance,
              ttl: intent.ttl,
              timestamp: intent.transactionTimestamp,
              slippageBps: intent.slippageBps,
              expectedOutput: intent.expectedOutput,
              minimumReceived: intent.minimumReceived,
              runtimeArgs: intent.runtimeArgs,
              transactionHash: intent.transactionHash,
            },
            bridge: {
              sourceChain: intent.bridgeSourceChain,
              destinationChain: intent.bridgeDestinationChain,
              provider: intent.bridgeProvider,
              routeId: intent.bridgeRouteId,
              destinationAddress: intent.bridgeDestinationAddress,
              asset: intent.bridgeAsset,
              feeAmount: intent.bridgeFeeAmount,
              feeBps: intent.bridgeFeeBps,
              expectedOutput: intent.bridgeExpectedOutput,
              minimumReceived: intent.bridgeMinimumReceived,
              quoteTimestamp: intent.bridgeQuoteTimestamp,
              quoteExpiresAt: intent.bridgeQuoteExpiresAt,
              sourceConfirmations: intent.bridgeSourceConfirmations,
              destinationConfirmations: intent.bridgeDestinationConfirmations,
            },
          },
        },
        pipelineStages: updatePipelineStage(result.pipelineStages, "audit-stored", "completed", auditTimestamp.toISOString(), "Audit stored"),
        moduleFindings: result.moduleFindings || [],
        primaryReason: result.primaryReason || result.reason,
        triggeredRule: result.triggeredRule || "",
        suggestedResolution: result.suggestedResolution || result.recommendedAction,
        capabilityContext: result.capabilityContext || agent?.executionCapabilities || ["Custom"],
        proofSubmittedAt: auditTimestamp,
        proofConfirmedAt: null,
        riskScore: Number(result.riskScore || 50),
      };
      const initialProof = initialDecisionProofState({
        ...auditValues,
        timestamp: auditValues.timestamp.toISOString(),
      });
      const [auditRow] = await db.insert(auditLogsTable).values({
        ...auditValues,
        decisionProofStatus: initialProof.decisionProofStatus,
        decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
        decisionProofError: initialProof.decisionProofError,
        decisionProofMode: initialProof.decisionProofMode,
        decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
      }).returning();

      const auditLog = normalizeAuditLog(auditRow);
      const [gatewayRow] = await db.insert(agentGatewayRequestsTable).values({
        id: intent.id,
        receivedAt: new Date(intent.receivedAt),
        source: intent.source,
        agentId: intent.agentId,
        walletAddress,
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress,
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
      await db.update(agentsTable)
        .set({ lastIntentAt: new Date(intent.receivedAt), lastDecisionAt: auditValues.timestamp })
        .where(eq(agentsTable.id, intent.agentId));
      const proof = await recordDecisionProof(auditLog);
      const [recordedAuditRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
          pipelineStages: updatePipelineStage(auditRow.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, auditLog.id))
        .returning();
      const recordedAuditLog = normalizeAuditLog(recordedAuditRow || auditRow);

      const gatewayRequest = {
        id: gatewayRow.id,
        receivedAt: toDate(gatewayRow.receivedAt).toISOString(),
        source: gatewayRow.source,
        agentId: gatewayRow.agentId,
        walletAddress: gatewayRow.walletAddress,
        agentOwnerWalletAddress: gatewayRow.agentOwnerWalletAddress || gatewayRow.walletAddress,
        executionWalletAddress: gatewayRow.executionWalletAddress || gatewayRow.walletAddress,
        actionType: gatewayRow.actionType,
        amount: Number(gatewayRow.amount),
        asset: gatewayRow.asset,
        outputAsset: intent.outputAsset,
        oracleBaseAsset: intent.oracleBaseAsset,
        oracleQuoteAsset: intent.oracleQuoteAsset,
        executionPrice: intent.executionPrice,
        quoteTimestamp: intent.quoteTimestamp,
        target: gatewayRow.target,
        targetType: gatewayRow.targetType,
        contractIdentifierType: intent.contractIdentifierType,
        entryPoint: intent.entryPoint,
        contractVersion: intent.contractVersion,
        chainName: intent.chainName,
        paymentAmountMotes: intent.paymentAmountMotes,
        gasPriceTolerance: intent.gasPriceTolerance,
        ttl: intent.ttl,
        transactionTimestamp: intent.transactionTimestamp,
        slippageBps: intent.slippageBps,
        expectedOutput: intent.expectedOutput,
        minimumReceived: intent.minimumReceived,
        runtimeArgs: intent.runtimeArgs,
        transactionHash: intent.transactionHash,
        bridgeSourceChain: intent.bridgeSourceChain,
        bridgeDestinationChain: intent.bridgeDestinationChain,
        bridgeProvider: intent.bridgeProvider,
        bridgeRouteId: intent.bridgeRouteId,
        bridgeDestinationAddress: intent.bridgeDestinationAddress,
        bridgeAsset: intent.bridgeAsset,
        bridgeFeeAmount: intent.bridgeFeeAmount,
        bridgeFeeBps: intent.bridgeFeeBps,
        bridgeExpectedOutput: intent.bridgeExpectedOutput,
        bridgeMinimumReceived: intent.bridgeMinimumReceived,
        bridgeQuoteTimestamp: intent.bridgeQuoteTimestamp,
        bridgeQuoteExpiresAt: intent.bridgeQuoteExpiresAt,
        bridgeSourceConfirmations: intent.bridgeSourceConfirmations,
        bridgeDestinationConfirmations: intent.bridgeDestinationConfirmations,
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
        auditLog: recordedAuditLog,
        casperPayload: buildAuditDecisionPayload(recordedAuditLog),
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
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const now = new Date();
      const [auditRow] = await db.update(auditLogsTable)
        .set({
          txHash,
          decisionProofStatus: "recorded",
          decisionProofError: "",
          decisionProofUpdatedAt: now,
          proofConfirmedAt: now,
          pipelineStages: updatePipelineStage(current.pipelineStages, "casper-proof", "completed", now.toISOString(), "Casper decision proof confirmed"),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();

      return { auditLog: normalizeAuditLog(auditRow), txHash, confirmed: true };
    },

    async confirmExecutionDeploy(id, body) {
      const executionTxHash = validateDeployHash(body?.deployHash || body?.executionTxHash);
      const executionSignedBy = normalizeWalletAddress(body?.signedBy || body?.walletAddress || "");
      const executionNote = String(body?.note || "Real execution transaction signed after Magen3 approval.").trim();

      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      if (current.decision !== "Allowed") {
        const err = new Error("Execution hash can only be attached to an Allowed Magen3 decision.");
        err.status = 400;
        throw err;
      }

      const [auditRow] = await db.update(auditLogsTable)
        .set({
          executionStatus: "executed",
          executionTxHash,
          executionSignedBy,
          executionNote,
          executionUpdatedAt: new Date(),
          pipelineStages: updatePipelineStage(current.pipelineStages, "execution-recorded", "completed", new Date().toISOString(), "Execution recorded"),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();

      return { auditLog: normalizeAuditLog(auditRow), executionTxHash, confirmed: true };
    },


    async recordAuditLog(id) {
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const proof = await recordDecisionProof(normalizeAuditLog(current));
      const [auditRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofSubmittedAt: current.proofSubmittedAt || new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : current.proofConfirmedAt,
          pipelineStages: updatePipelineStage(current.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();
      const auditLog = normalizeAuditLog(auditRow);
      return { auditLog, txHash: auditLog.txHash, decisionProofStatus: auditLog.decisionProofStatus };
    },
  };
}
