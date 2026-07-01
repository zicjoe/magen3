import { shieldModules } from "../data/seed.mjs";
import { apiKeyPreview, hashSecret, makeApiKey, makeId, makePseudoHash, secretMatches } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";
import { normalizeAgentGatewayIntent, gatewayNextAction, gatewayStatusFromDecision } from "../lib/agentGateway.mjs";

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

function initialExecutionStatus(decision) {
  if (decision === "Allowed") return "approved_pending_signature";
  if (decision === "Blocked") return "blocked_not_submitted";
  if (decision === "Review Required") return "review_required_not_submitted";
  return "not_submitted";
}

function normalizeAgentStatus(status) {
  return status === "Revoked" ? "Revoked" : "Active";
}

export function createMemoryStore() {
  let agents = [];
  let policies = [];
  let auditLogs = [];
  const actionReviews = [];
  let gatewayRequests = [];

  function publicAgent(agent, extra = {}) {
    if (!agent) return agent;
    const { apiKeyHash, ...safeAgent } = agent;
    return { ...safeAgent, status: normalizeAgentStatus(safeAgent.status), ...extra };
  }

  function scopedAgents(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? agents.filter((agent) => agent.ownerWalletAddress === wallet).map((agent) => publicAgent(agent)) : [];
  }

  function scopedAgentRecords(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? agents.filter((agent) => agent.ownerWalletAddress === wallet) : [];
  }

  function scopedPolicies(walletAddress) {
    const agentIds = new Set(scopedAgentRecords(walletAddress).map((agent) => agent.id));
    return policies.filter((policy) => agentIds.has(policy.agentId));
  }

  function scopedAuditLogs(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? auditLogs.filter((log) => log.walletAddress === wallet) : [];
  }

  function dashboardStats(walletAddress) {
    const logs = scopedAuditLogs(walletAddress);
    const walletPolicies = scopedPolicies(walletAddress);
    return {
      activeShields: walletPolicies.some((policy) => policy.status === "Active") ? 1 : 0,
      protectedActions: logs.length,
      blockedActions: logs.filter((log) => log.decision === "Blocked").length,
      reviewRequired: logs.filter((log) => log.decision === "Review Required").length,
      casperAuditRecords: logs.filter((log) => isRealDeployHash(log.txHash)).length,
    };
  }

  return {
    mode: "memory",

    async bootstrap(walletAddress) {
      return {
        agents: scopedAgents(walletAddress),
        policies: scopedPolicies(walletAddress),
        auditLogs: scopedAuditLogs(walletAddress),
        shieldModules,
        dashboardStats: dashboardStats(walletAddress),
      };
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
      const now = new Date().toISOString();

      const agent = {
        id: makeId("MAG-AGENT"),
        name: String(body.name).trim(),
        type: body.type || "Custom Agent",
        purpose: body.purpose || "",
        permissionLevel: body.permissionLevel || "Limited Execution",
        status: "Active",
        ownerWalletAddress,
        apiKeyHash: hashSecret(apiKey),
        apiKeyPreview: apiKeyPreview(apiKey),
        apiKeyIssuedAt: now,
        apiKeyRotatedAt: "",
        revokedAt: "",
        createdAt: now,
      };
      agents = [agent, ...agents];
      return publicAgent(agent, { apiKey });
    },

    async rotateAgentApiKey(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const agent = agents.find((item) => item.id === id && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }
      const apiKey = makeApiKey();
      const now = new Date().toISOString();
      agents = agents.map((item) => item.id === id ? {
        ...item,
        apiKeyHash: hashSecret(apiKey),
        apiKeyPreview: apiKeyPreview(apiKey),
        apiKeyIssuedAt: item.apiKeyIssuedAt || now,
        apiKeyRotatedAt: now,
      } : item);
      return publicAgent(agents.find((item) => item.id === id), { apiKey });
    },

    async revokeAgent(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const agent = agents.find((item) => item.id === id && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }
      const now = new Date().toISOString();
      agents = agents.map((item) => item.id === id ? { ...item, status: "Revoked", revokedAt: now } : item);
      return publicAgent(agents.find((item) => item.id === id));
    },

    async createPolicy(body) {
      if (!body.name || !body.agentId) {
        const err = new Error("Policy name and agentId are required");
        err.status = 400;
        throw err;
      }
      const walletAddress = requireWalletAddress(body.walletAddress);
      const agent = agents.find((item) => item.id === body.agentId && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Cannot create policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const policy = {
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
        createdAt: new Date().toISOString(),
        policyHash: makePseudoHash("0xpol"),
      };
      policies = [policy, ...policies];

      const auditLog = {
        id: makeId("AUD"),
        timestamp: new Date().toISOString(),
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
        executionStatus: "not_required",
        executionTxHash: "",
        executionSignedBy: "",
        executionNote: "Policy activation does not execute an external Web3 transaction.",
        executionUpdatedAt: "",
        riskScore: 4,
      };
      auditLogs = [auditLog, ...auditLogs];
      return { policy, auditLog, agents: scopedAgents(walletAddress) };
    },

    async analyzeAction(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const result = evaluatePolicy({ request: body, agents: scopedAgents(walletAddress), policies: scopedPolicies(walletAddress), auditLogs: scopedAuditLogs(walletAddress) });
      const review = {
        id: makeId("REV"),
        agentId: body.agentId,
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
        createdAt: new Date().toISOString(),
      };
      actionReviews.unshift(review);
      return { result, review };
    },

    async createAuditLog(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const auditLog = {
        id: body.id || makeId("AUD"),
        timestamp: body.timestamp || new Date().toISOString(),
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
        executionStatus: body.executionStatus || initialExecutionStatus(body.decision),
        executionTxHash: body.executionTxHash || "",
        executionSignedBy: body.executionSignedBy || "",
        executionNote: body.executionNote || "",
        executionUpdatedAt: body.executionUpdatedAt || "",
        riskScore: Number(body.riskScore || 50),
      };
      auditLogs = [auditLog, ...auditLogs];
      return auditLog;
    },

    async submitAgentGatewayIntent(body, context = {}) {
      const intent = normalizeAgentGatewayIntent(body);
      const walletAddress = requireWalletAddress(intent.walletAddress);
      const agentRecord = scopedAgentRecords(walletAddress).find((item) => item.id === intent.agentId);
      if (!agentRecord) {
        const err = new Error("Agent Gateway request rejected because this agent is not registered under the supplied wallet.");
        err.status = 403;
        throw err;
      }
      if (agentRecord.status === "Revoked") {
        const err = new Error("Agent Gateway request rejected because this connected agent has been revoked.");
        err.status = 403;
        throw err;
      }
      if (!secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway request rejected because the API key does not match this connected agent.");
        err.status = 401;
        throw err;
      }
      const request = {
        agentId: intent.agentId,
        actionType: intent.actionType,
        amount: intent.amount,
        target: intent.target,
        targetType: intent.targetType,
        walletAddress,
      };
      const result = evaluatePolicy({ request, agents: scopedAgents(walletAddress), policies: scopedPolicies(walletAddress), auditLogs: scopedAuditLogs(walletAddress) });
      const agent = publicAgent(agentRecord);
      const policy = scopedPolicies(walletAddress).find((item) => item.agentId === intent.agentId && item.status === "Active");
      const status = gatewayStatusFromDecision(result.decision);
      const auditLog = {
        id: makeId("AUD"),
        timestamp: new Date().toISOString(),
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
        executionStatus: initialExecutionStatus(result.decision),
        executionTxHash: "",
        executionSignedBy: "",
        executionNote: result.decision === "Allowed" ? "Magen3 approved this action. Waiting for the wallet owner to sign the real execution transaction." : "Execution did not proceed because Magen3 did not approve automatic execution.",
        executionUpdatedAt: "",
        riskScore: Number(result.riskScore || 50),
      };
      const gatewayRequest = {
        ...intent,
        walletAddress,
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        status,
        auditLogId: auditLog.id,
      };
      gatewayRequests = [gatewayRequest, ...gatewayRequests];
      auditLogs = [auditLog, ...auditLogs];
      const casperPayload = buildAuditDecisionPayload(auditLog);
      return {
        ok: true,
        gatewayRequest,
        result,
        auditLog,
        casperPayload,
        executionApproved: result.decision === "Allowed",
        nextAction: gatewayNextAction(result.decision),
      };
    },

    async prepareCasperPayload(id) {
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      return { auditLog, ...buildAuditDecisionPayload(auditLog) };
    },

    async confirmCasperDeploy(id, body) {
      const txHash = validateDeployHash(body?.deployHash);
      auditLogs = auditLogs.map((log) => log.id === id ? { ...log, txHash } : log);
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      return { auditLog, txHash, confirmed: true };
    },

    async confirmExecutionDeploy(id, body) {
      const executionTxHash = validateDeployHash(body?.deployHash || body?.executionTxHash);
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      if (auditLog.decision !== "Allowed") {
        const err = new Error("Execution hash can only be attached to an Allowed Magen3 decision.");
        err.status = 400;
        throw err;
      }
      auditLogs = auditLogs.map((log) => log.id === id ? {
        ...log,
        executionStatus: "executed",
        executionTxHash,
        executionSignedBy: normalizeWalletAddress(body?.signedBy || body?.walletAddress || ""),
        executionNote: String(body?.note || "Real execution transaction signed after Magen3 approval.").trim(),
        executionUpdatedAt: new Date().toISOString(),
      } : log);
      return { auditLog: auditLogs.find((log) => log.id === id), executionTxHash, confirmed: true };
    },

    async recordAuditLog() {
      const err = new Error("Automatic local recording is disabled. Prepare the Casper payload, sign the real deploy with Casper client, then confirm the real deploy hash.");
      err.status = 400;
      throw err;
    },
  };
}
