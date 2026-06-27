import { DEFAULT_WALLET, seedAgents, seedAuditLogs, seedPolicies, shieldModules } from "../data/seed.mjs";
import { makeId, makePseudoHash } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createMemoryStore() {
  let agents = clone(seedAgents);
  let policies = clone(seedPolicies);
  let auditLogs = clone(seedAuditLogs);
  const actionReviews = [];

  function dashboardStats() {
    return {
      activeShields: policies.some((policy) => policy.status === "Active") ? 1 : 0,
      protectedActions: auditLogs.length,
      blockedActions: auditLogs.filter((log) => log.decision === "Blocked").length,
      reviewRequired: auditLogs.filter((log) => log.decision === "Review Required").length,
      casperAuditRecords: auditLogs.filter((log) => isRealDeployHash(log.txHash)).length,
    };
  }

  return {
    mode: "memory",

    async bootstrap() {
      return { agents, policies, auditLogs, shieldModules, dashboardStats: dashboardStats() };
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

      const agent = {
        id: makeId("MAG-AGENT"),
        name: String(body.name).trim(),
        type: body.type || "Custom Agent",
        purpose: body.purpose || "",
        permissionLevel: body.permissionLevel || "Limited Execution",
        status: "No Policy",
        createdAt: new Date().toISOString(),
      };
      agents = [agent, ...agents];
      return agent;
    },

    async createPolicy(body) {
      if (!body.name || !body.agentId) {
        const err = new Error("Policy name and agentId are required");
        err.status = 400;
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
        createdAt: new Date().toISOString(),
        policyHash: makePseudoHash("0xpol"),
      };
      policies = [policy, ...policies];
      agents = agents.map((agent) => agent.id === policy.agentId ? { ...agent, status: "Policy Active" } : agent);

      const agent = agents.find((item) => item.id === policy.agentId);
      const auditLog = {
        id: makeId("AUD"),
        timestamp: new Date().toISOString(),
        shield: "Agent Shield",
        agentId: policy.agentId,
        agentName: agent?.name || policy.agentId,
        action: "Policy Activation",
        amount: 0,
        target: "Magen3 Policy Registry",
        targetType: "Trusted Contract",
        decision: "Allowed",
        risk: "Low",
        reason: `Policy "${policy.name}" activated for ${agent?.name || policy.agentId}.`,
        policyUsed: policy.name,
        walletAddress: body.walletAddress || DEFAULT_WALLET,
        txHash: "",
        riskScore: 4,
      };
      auditLogs = [auditLog, ...auditLogs];
      return { policy, auditLog, agents };
    },

    async analyzeAction(body) {
      const result = evaluatePolicy({ request: body, agents, policies, auditLogs });
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
        walletAddress: body.walletAddress || DEFAULT_WALLET,
        txHash: body.txHash || "",
        riskScore: Number(body.riskScore || 50),
      };
      auditLogs = [auditLog, ...auditLogs];
      return auditLog;
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

    async recordAuditLog(id) {
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const prepared = buildAuditDecisionPayload(auditLog);
      const txHash = makePseudoHash("0xcasper");
      auditLogs = auditLogs.map((log) => log.id === id ? { ...log, txHash } : log);
      return { auditLog: { ...auditLog, txHash }, txHash, prepared };
    },
  };
}
