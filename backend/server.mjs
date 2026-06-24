import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 8787);
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "*";
const DEFAULT_WALLET = "casper-test-wallet-01ab...7890";

/** @type {Array<any>} */
let agents = [
  {
    id: "MAG-AGENT-001",
    name: "YieldBot",
    type: "DeFi Agent",
    purpose: "Manage staking and yield actions",
    permissionLevel: "Limited Execution",
    status: "Policy Active",
    createdAt: "2025-06-10T09:00:00Z",
  },
  {
    id: "MAG-AGENT-002",
    name: "TreasuryGuard",
    type: "Treasury Agent",
    purpose: "Oversee DAO treasury disbursements",
    permissionLevel: "Full Execution with Review",
    status: "Policy Active",
    createdAt: "2025-06-15T11:30:00Z",
  },
];

/** @type {Array<any>} */
let policies = [
  {
    id: "POL-001",
    name: "Safe DeFi Policy",
    agentId: "MAG-AGENT-001",
    maxTransaction: 50,
    dailyLimit: 200,
    approvalThreshold: 100,
    trustedContracts: ["0xStakingContract123", "0xYieldVault456"],
    blockedActions: ["Oracle Data Update", "RWA Proof Update"],
    riskMode: "Balanced",
    status: "Active",
    createdAt: "2025-06-11T10:00:00Z",
    policyHash: "0xpol...a3f1",
  },
  {
    id: "POL-002",
    name: "Treasury Conservative",
    agentId: "MAG-AGENT-002",
    maxTransaction: 500,
    dailyLimit: 1000,
    approvalThreshold: 250,
    trustedContracts: ["0xDAOTreasury789"],
    blockedActions: ["Swap", "Contract Interaction"],
    riskMode: "Conservative",
    status: "Active",
    createdAt: "2025-06-16T08:00:00Z",
    policyHash: "0xpol...b7c2",
  },
];

/** @type {Array<any>} */
let auditLogs = [
  {
    id: "AUD-001",
    timestamp: "2025-06-24T14:32:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Stake",
    amount: 25,
    target: "0xStakingContract123",
    targetType: "Trusted Contract",
    decision: "Allowed",
    risk: "Low",
    reason: "Amount is within policy limit and target contract is trusted.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "0xcasper...tx001",
    riskScore: 8,
  },
  {
    id: "AUD-002",
    timestamp: "2025-06-24T13:15:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Transfer",
    amount: 500,
    target: "0xUnknownContract999",
    targetType: "Unknown Contract",
    decision: "Blocked",
    risk: "High",
    reason: "Amount exceeds max transaction limit and target is not trusted.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "",
    riskScore: 87,
  },
  {
    id: "AUD-003",
    timestamp: "2025-06-24T12:00:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Deposit to Vault",
    amount: 120,
    target: "0xYieldVault456",
    targetType: "Trusted Contract",
    decision: "Review Required",
    risk: "Medium",
    reason: "Target is trusted, but amount is above approval threshold.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "",
    riskScore: 52,
  },
];

const shieldModules = [
  { id: "shield-agent", name: "Agent Shield", status: "Available" },
  { id: "shield-contract", name: "Contract Shield", status: "Preview" },
  { id: "shield-dao", name: "DAO Shield", status: "Preview" },
  { id: "shield-rwa", name: "RWA Shield", status: "Preview" },
  { id: "shield-oracle", name: "Oracle Shield", status: "Preview" },
];

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function makePseudoHash(prefix) {
  return `${prefix}${randomBytes(12).toString("hex")}`;
}

function send(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: "Route not found" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

function getActivePolicy(agentId) {
  return policies.find((policy) => policy.agentId === agentId && policy.status === "Active");
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDailyUsed(agentId) {
  const now = new Date();
  return auditLogs
    .filter((log) => log.agentId === agentId && log.decision === "Allowed" && isSameDay(new Date(log.timestamp), now))
    .reduce((sum, log) => sum + Number(log.amount || 0), 0);
}

function targetIsTrusted(request, policy) {
  const normalizedTarget = String(request.target || "").trim().toLowerCase();
  const trustedList = policy.trustedContracts.map((contract) => String(contract).trim().toLowerCase());
  return request.targetType === "Trusted Contract" || Boolean(normalizedTarget && trustedList.includes(normalizedTarget));
}

function evaluateAction(request) {
  const agent = agents.find((item) => item.id === request.agentId);
  const policy = getActivePolicy(request.agentId);
  const checksPassed = [];
  const checksFailed = [];

  if (!agent) {
    return {
      decision: "Blocked",
      risk: "High",
      riskScore: 82,
      policyChecksPassed: [],
      policyChecksFailed: ["Selected agent is not registered in Magen3"],
      reason: "Magen3 cannot allow execution from an unknown agent.",
      recommendedAction: "Register the agent before allowing any Web3 action.",
    };
  }

  if (!policy) {
    return {
      decision: "Blocked",
      risk: "High",
      riskScore: 78,
      policyChecksPassed: [`Agent ${agent.name} is registered`],
      policyChecksFailed: ["No active security policy found for this agent"],
      reason: "This agent has no active policy, so Magen3 blocks execution by default.",
      recommendedAction: "Create and activate a policy for this agent first.",
    };
  }

  const amount = Number(request.amount || 0);
  const dailyUsed = getDailyUsed(request.agentId);
  const dailyAfterAction = dailyUsed + amount;
  const isTrusted = targetIsTrusted(request, policy);
  const isBlockedAction = policy.blockedActions.includes(request.actionType);
  const strictMode = policy.riskMode === "Conservative";
  const relaxedMode = policy.riskMode === "Aggressive";
  let score = 5;

  checksPassed.push(`Active policy found: ${policy.name}`);

  if (isBlockedAction) {
    checksFailed.push(`Action type is blocked by policy: ${request.actionType}`);
    score += 35;
  } else {
    checksPassed.push(`Action type is not blocked: ${request.actionType}`);
  }

  if (amount > policy.maxTransaction) {
    checksFailed.push(`Amount exceeds max transaction limit (${amount} > ${policy.maxTransaction} CSPR)`);
    score += 30;
  } else {
    checksPassed.push(`Amount within max transaction limit (${amount} ≤ ${policy.maxTransaction} CSPR)`);
  }

  if (dailyAfterAction > policy.dailyLimit) {
    checksFailed.push(`Daily limit would be exceeded (${dailyAfterAction} > ${policy.dailyLimit} CSPR)`);
    score += 25;
  } else {
    checksPassed.push(`Daily limit remains valid (${dailyAfterAction} ≤ ${policy.dailyLimit} CSPR)`);
  }

  if (isTrusted) {
    checksPassed.push("Target is trusted or policy-approved");
  } else {
    checksFailed.push("Target is not in the trusted contract list");
    score += strictMode ? 35 : 25;
  }

  if (amount > policy.approvalThreshold) {
    checksFailed.push(`Amount exceeds approval threshold (${amount} > ${policy.approvalThreshold} CSPR)`);
    score += relaxedMode ? 10 : 18;
  } else {
    checksPassed.push(`Amount below approval threshold (${amount} ≤ ${policy.approvalThreshold} CSPR)`);
  }

  const hardBlock =
    isBlockedAction ||
    amount > policy.maxTransaction ||
    dailyAfterAction > policy.dailyLimit ||
    (!isTrusted && (strictMode || request.targetType === "Unknown Contract"));
  const needsReview = !hardBlock && (amount > policy.approvalThreshold || !isTrusted || request.targetType !== "Trusted Contract");

  const decision = hardBlock ? "Blocked" : needsReview ? "Review Required" : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk = riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";

  return {
    decision,
    risk,
    riskScore,
    policyChecksPassed: checksPassed,
    policyChecksFailed: checksFailed,
    reason:
      decision === "Allowed"
        ? "This action matches the active policy and can be safely executed."
        : decision === "Blocked"
          ? "This action violates one or more hard policy rules and should not execute."
          : "This action is not fully unsafe, but it needs human approval before execution.",
    recommendedAction:
      decision === "Allowed"
        ? "Proceed with execution and record the decision on Casper."
        : decision === "Blocked"
          ? "Do not execute. Update the request or create a stricter review workflow."
          : "Ask the wallet owner or protocol admin to approve once or reject.",
  };
}

function deriveDashboardStats() {
  return {
    activeShields: policies.some((policy) => policy.status === "Active") ? 1 : 0,
    protectedActions: auditLogs.length,
    blockedActions: auditLogs.filter((log) => log.decision === "Blocked").length,
    reviewRequired: auditLogs.filter((log) => log.decision === "Review Required").length,
    casperAuditRecords: auditLogs.filter((log) => Boolean(log.txHash)).length,
  };
}

function createAgent(body) {
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
}

function createPolicy(body) {
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
}

function createAuditLog(body) {
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
}

function recordAuditLog(id) {
  const txHash = makePseudoHash("0xcasper");
  auditLogs = auditLogs.map((log) => log.id === id ? { ...log, txHash } : log);
  const auditLog = auditLogs.find((log) => log.id === id);
  if (!auditLog) {
    const err = new Error("Audit log not found");
    err.status = 404;
    throw err;
  }
  return { auditLog, txHash };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return send(res, 204, {});
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /api/health") {
      return send(res, 200, {
        ok: true,
        service: "magen3-api",
        network: "casper-testnet",
        version: "0.2.0",
        timestamp: new Date().toISOString(),
      });
    }

    if (route === "GET /api/bootstrap") {
      return send(res, 200, { agents, policies, auditLogs, shieldModules, dashboardStats: deriveDashboardStats() });
    }

    if (route === "POST /api/wallet/mock-connect") {
      return send(res, 200, { walletAddress: DEFAULT_WALLET, network: "casper-testnet", connected: true });
    }

    if (route === "POST /api/agents") {
      const body = await readJson(req);
      return send(res, 201, { agent: createAgent(body) });
    }

    if (route === "POST /api/policies") {
      const body = await readJson(req);
      return send(res, 201, createPolicy(body));
    }

    if (route === "POST /api/actions/analyze") {
      const body = await readJson(req);
      return send(res, 200, { result: evaluateAction(body) });
    }

    if (route === "POST /api/audit-logs") {
      const body = await readJson(req);
      return send(res, 201, { auditLog: createAuditLog(body) });
    }

    const recordMatch = url.pathname.match(/^\/api\/audit-logs\/([^/]+)\/record$/);
    if (req.method === "POST" && recordMatch) {
      return send(res, 200, recordAuditLog(recordMatch[1]));
    }

    return notFound(res);
  } catch (error) {
    return send(res, error.status || 500, {
      error: error.message || "Internal server error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Magen3 API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
