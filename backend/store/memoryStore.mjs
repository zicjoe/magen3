import { shieldModules } from "../data/seed.mjs";
import { apiKeyPreview, hashSecret, makeApiKey, makeId, makePseudoHash, secretMatches } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { initialDecisionProofState, recordDecisionProof } from "../casper/decisionRelayer.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";
import { getThreatIntelligenceSnapshot } from "../lib/threatIntelligence.mjs";
import { getOracleValidationSnapshot } from "../lib/oracleValidation.mjs";
import { normalizeAgentGatewayIntent, gatewayNextAction, gatewayStatusFromDecision } from "../lib/agentGateway.mjs";
import { legacyTypeFromCapabilities, normalizeExecutionCapabilities, recommendedPolicyTemplate } from "../lib/securityModel.mjs";

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

function updatePipelineStage(stages, id, status, timestamp = new Date().toISOString(), label = "") {
  const source = Array.isArray(stages) ? stages : [];
  const found = source.some((stage) => stage.id === id);
  const next = source.map((stage) => stage.id === id ? { ...stage, status, timestamp, ...(label ? { label } : {}) } : stage);
  return found ? next : [...next, { id, label: label || id, status, timestamp }];
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

  function findAgentRecord(agentId) {
    return agents.find((agent) => agent.id === agentId);
  }

  function scopedPolicies(walletAddress) {
    const agentIds = new Set(scopedAgentRecords(walletAddress).map((agent) => agent.id));
    return policies.filter((policy) => agentIds.has(policy.agentId));
  }

  function scopedAuditLogs(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? auditLogs.filter((log) => log.walletAddress === wallet || log.agentOwnerWalletAddress === wallet) : [];
  }

  function requireGatewayAgent(agentId, apiKey) {
    const agentRecord = findAgentRecord(agentId);
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
    if (!secretMatches(apiKey, agentRecord.apiKeyHash)) {
      const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
      err.status = 401;
      throw err;
    }
    return agentRecord;
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
      const executionCapabilities = normalizeExecutionCapabilities(body.executionCapabilities, body.type);

      const agent = {
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
        apiKeyRotatedAt: "",
        revokedAt: "",
        executionCapabilities,
        capabilityConfiguration: body.capabilityConfiguration && typeof body.capabilityConfiguration === "object" ? body.capabilityConfiguration : {},
        onboardingStatus: body.onboardingStatus || "complete",
        lastIntentAt: "",
        lastDecisionAt: "",
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

    async getAgentGatewayIdentity(agentId, context = {}) {
      const agentRecord = requireGatewayAgent(agentId, context.apiKey);
      const ownerWalletAddress = agentRecord.ownerWalletAddress;
      const activePolicy = scopedPolicies(ownerWalletAddress).find((item) => item.agentId === agentRecord.id && item.status === "Active") || null;
      return {
        ok: true,
        agent: publicAgent(agentRecord),
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
        templateType: body.templateType || recommendedPolicyTemplate(agent.executionCapabilities),
        capabilityScope: normalizeExecutionCapabilities(body.capabilityScope || agent.executionCapabilities, agent.type),
        structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : {},
        createdAt: new Date().toISOString(),
        policyHash: makePseudoHash("0xpol"),
      };
      policies = [policy, ...policies];

      const policyAuditTimestamp = new Date().toISOString();
      const auditLog = {
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
        executionUpdatedAt: "",
        decisionProofStatus: "queued",
        decisionProofPayloadHash: "",
        decisionProofError: "",
        decisionProofMode: "",
        decisionProofUpdatedAt: "",
        originalIntent: { action: "Policy Activation", policyId: policy.id },
        pipelineStages: [
          { id: "policy-loaded", label: "Policy created and activated", status: "completed", timestamp: policyAuditTimestamp },
          { id: "audit-stored", label: "Audit stored", status: "completed", timestamp: policyAuditTimestamp },
          { id: "casper-proof", label: "Casper decision proof", status: "pending", timestamp: "" },
        ],
        moduleFindings: [{ module: "Policy Enforcement", status: "pass", severity: "info", rule: "Active policy", message: `Policy ${policy.name} activated.`, evidence: { policyId: policy.id }, remediation: "" }],
        primaryReason: `Policy ${policy.name} activated.`,
        triggeredRule: "Active policy",
        suggestedResolution: "No action required.",
        capabilityContext: agent.executionCapabilities,
        proofSubmittedAt: policyAuditTimestamp,
        proofConfirmedAt: "",
        riskScore: 4,
      };
      Object.assign(auditLog, initialDecisionProofState(auditLog));
      auditLogs = [auditLog, ...auditLogs];
      const proof = await recordDecisionProof(auditLog);
      auditLogs = auditLogs.map((log) => log.id === auditLog.id ? {
        ...log,
        ...proof,
        proofConfirmedAt: proof.decisionProofStatus === "recorded" ? (proof.decisionProofUpdatedAt || new Date().toISOString()) : log.proofConfirmedAt,
        pipelineStages: updatePipelineStage(log.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
      } : log);
      return { policy, auditLog: auditLogs.find((log) => log.id === auditLog.id) || auditLog, agents: scopedAgents(walletAddress) };
    },

    async updatePolicy(id, body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const current = policies.find((policy) => policy.id === id && policy.ownerWalletAddress === walletAddress);
      if (!current) {
        const err = new Error("Policy not found for the connected wallet.");
        err.status = 404;
        throw err;
      }
      const agent = agents.find((item) => item.id === current.agentId && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Cannot update policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const updatedPolicy = {
        ...current,
        name: body.name ? String(body.name).trim() : current.name,
        maxTransaction: Number(body.maxTransaction ?? current.maxTransaction),
        dailyLimit: Number(body.dailyLimit ?? current.dailyLimit),
        approvalThreshold: Number(body.approvalThreshold ?? current.approvalThreshold),
        trustedContracts: Array.isArray(body.trustedContracts) ? body.trustedContracts : current.trustedContracts,
        blockedActions: Array.isArray(body.blockedActions) ? body.blockedActions : current.blockedActions,
        riskMode: body.riskMode || current.riskMode,
        status: body.status || current.status,
        templateType: body.templateType || current.templateType || "Custom",
        capabilityScope: Array.isArray(body.capabilityScope) ? normalizeExecutionCapabilities(body.capabilityScope) : current.capabilityScope,
        structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : current.structuredRules,
      };

      policies = policies.map((policy) => policy.id === id ? updatedPolicy : policy);
      return { policy: updatedPolicy, agents: scopedAgents(walletAddress) };
    },

    async analyzeAction(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
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
        agents: scopedAgents(walletAddress),
        policies: scopedPolicies(walletAddress),
        auditLogs: scopedAuditLogs(walletAddress),
        threatIntelligence,
        oracleValidation,
      });
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
      const agentOwnerWalletAddress = normalizeWalletAddress(body.agentOwnerWalletAddress || walletAddress);
      const executionWalletAddress = normalizeWalletAddress(body.executionWalletAddress || body.execution_wallet_address || body.walletAddress || walletAddress);
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
        agentOwnerWalletAddress,
        executionWalletAddress,
        txHash: body.txHash || "",
        executionStatus: body.executionStatus || initialExecutionStatus(body.decision),
        executionTxHash: body.executionTxHash || "",
        executionSignedBy: body.executionSignedBy || "",
        executionNote: body.executionNote || "",
        executionUpdatedAt: body.executionUpdatedAt || "",
        decisionProofStatus: body.decisionProofStatus || "queued",
        decisionProofPayloadHash: body.decisionProofPayloadHash || "",
        decisionProofError: body.decisionProofError || "",
        decisionProofMode: body.decisionProofMode || "",
        decisionProofUpdatedAt: body.decisionProofUpdatedAt || "",
        originalIntent: body.originalIntent && typeof body.originalIntent === "object" ? body.originalIntent : {},
        pipelineStages: Array.isArray(body.pipelineStages) ? body.pipelineStages : [],
        moduleFindings: Array.isArray(body.moduleFindings) ? body.moduleFindings : [],
        primaryReason: body.primaryReason || body.reason || "Magen3 recorded a decision.",
        triggeredRule: body.triggeredRule || "",
        suggestedResolution: body.suggestedResolution || "",
        capabilityContext: Array.isArray(body.capabilityContext) ? body.capabilityContext : [],
        proofSubmittedAt: body.proofSubmittedAt || "",
        proofConfirmedAt: body.proofConfirmedAt || "",
        riskScore: Number(body.riskScore || 50),
      };
      Object.assign(auditLog, initialDecisionProofState(auditLog));
      const proof = await recordDecisionProof(auditLog);
      Object.assign(auditLog, proof);
      auditLogs = [auditLog, ...auditLogs];
      return auditLog;
    },

    async submitAgentGatewayIntent(body, context = {}) {
      const intent = normalizeAgentGatewayIntent(body);
      const agentRecord = requireGatewayAgent(intent.agentId, context.apiKey);
      const walletAddress = requireWalletAddress(agentRecord.ownerWalletAddress);
      const executionWalletAddress = normalizeWalletAddress(intent.executionWalletAddress);
      const request = {
        agentId: intent.agentId,
        actionType: intent.actionType,
        amount: intent.amount,
        asset: intent.asset,
        outputAsset: intent.outputAsset,
        oracleBaseAsset: intent.oracleBaseAsset,
        oracleQuoteAsset: intent.oracleQuoteAsset,
        executionPrice: intent.executionPrice,
        quoteTimestamp: intent.quoteTimestamp,
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
        walletAddress: executionWalletAddress,
        executionWalletAddress,
        agentOwnerWalletAddress: walletAddress,
      };
      const [threatIntelligence, oracleValidation] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
      ]);
      const result = evaluatePolicy({ request, agents: scopedAgents(walletAddress), policies: scopedPolicies(walletAddress), auditLogs: scopedAuditLogs(walletAddress), threatIntelligence, oracleValidation });
      const agent = publicAgent(agentRecord);
      const policy = scopedPolicies(walletAddress).find((item) => item.agentId === intent.agentId && item.status === "Active");
      const status = gatewayStatusFromDecision(result.decision);
      const auditTimestamp = new Date().toISOString();
      const auditLog = {
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
        executionUpdatedAt: "",
        decisionProofStatus: "queued",
        decisionProofPayloadHash: "",
        decisionProofError: "",
        decisionProofMode: "",
        decisionProofUpdatedAt: "",
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
          },
        },
        pipelineStages: updatePipelineStage(result.pipelineStages, "audit-stored", "completed", auditTimestamp, "Audit stored"),
        moduleFindings: result.moduleFindings || [],
        primaryReason: result.primaryReason || result.reason,
        triggeredRule: result.triggeredRule || "",
        suggestedResolution: result.suggestedResolution || result.recommendedAction,
        capabilityContext: result.capabilityContext || agent.executionCapabilities || ["Custom"],
        proofSubmittedAt: auditTimestamp,
        proofConfirmedAt: "",
        riskScore: Number(result.riskScore || 50),
      };
      Object.assign(auditLog, initialDecisionProofState(auditLog));
      const gatewayRequest = {
        ...intent,
        walletAddress,
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress,
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        status,
        auditLogId: auditLog.id,
      };
      gatewayRequests = [gatewayRequest, ...gatewayRequests];
      agents = agents.map((item) => item.id === agentRecord.id ? { ...item, lastIntentAt: intent.receivedAt, lastDecisionAt: auditLog.timestamp } : item);
      auditLogs = [auditLog, ...auditLogs];
      const proof = await recordDecisionProof(auditLog);
      auditLogs = auditLogs.map((log) => log.id === auditLog.id ? {
        ...log,
        ...proof,
        proofConfirmedAt: proof.decisionProofStatus === "recorded" ? (proof.decisionProofUpdatedAt || new Date().toISOString()) : log.proofConfirmedAt,
        pipelineStages: (log.pipelineStages || []).map((stage) => stage.id === "casper-proof" ? { ...stage, status: proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", timestamp: proof.decisionProofUpdatedAt || stage.timestamp } : stage),
      } : log);
      const recordedAuditLog = auditLogs.find((log) => log.id === auditLog.id) || auditLog;
      const casperPayload = buildAuditDecisionPayload(auditLog);
      return {
        ok: true,
        gatewayRequest,
        result,
        auditLog: recordedAuditLog,
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
      auditLogs = auditLogs.map((log) => log.id === id ? {
        ...log,
        txHash,
        decisionProofStatus: "recorded",
        decisionProofError: "",
        decisionProofUpdatedAt: new Date().toISOString(),
        proofConfirmedAt: new Date().toISOString(),
        pipelineStages: (log.pipelineStages || []).map((stage) => stage.id === "casper-proof" ? { ...stage, status: "completed", timestamp: new Date().toISOString() } : stage),
      } : log);
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
        pipelineStages: [...(log.pipelineStages || []).filter((stage) => stage.id !== "execution-recorded"), { id: "execution-recorded", label: "Execution recorded", status: "completed", timestamp: new Date().toISOString() }],
      } : log);
      return { auditLog: auditLogs.find((log) => log.id === id), executionTxHash, confirmed: true };
    },

    async recordAuditLog(id) {
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const proof = await recordDecisionProof(auditLog);
      auditLogs = auditLogs.map((log) => log.id === id ? { ...log, ...proof } : log);
      const updated = auditLogs.find((log) => log.id === id);
      return { auditLog: updated, txHash: updated.txHash || proof.txHash || "", decisionProofStatus: updated.decisionProofStatus };
    },
  };
}
