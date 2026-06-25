import crypto from "node:crypto";

export const CASPER_NETWORK = process.env.CASPER_NETWORK || "casper-testnet";
export const CASPER_RPC_URL = process.env.CASPER_RPC_URL || "https://node.testnet.casper.network/rpc";
export const MAGEN3_CONTRACT_HASH = process.env.MAGEN3_CONTRACT_HASH || "";
export const CASPER_RECORDING_MODE = process.env.CASPER_RECORDING_MODE || "mock";

export function hashJson(value) {
  return `0x${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function shortHash(value, prefix = "0xcasper") {
  return `${prefix}${hashJson(value).slice(2, 18)}`;
}

export function getCasperStatus() {
  return {
    network: CASPER_NETWORK,
    rpcUrl: CASPER_RPC_URL,
    contractHash: MAGEN3_CONTRACT_HASH,
    recordingMode: CASPER_RECORDING_MODE,
    contractConfigured: Boolean(MAGEN3_CONTRACT_HASH),
  };
}

export function buildAuditDecisionPayload(auditLog) {
  const payload = {
    decisionId: auditLog.id,
    shield: auditLog.shield,
    walletAddress: auditLog.walletAddress,
    agentId: auditLog.agentId,
    agentName: auditLog.agentName,
    action: auditLog.action,
    amount: Number(auditLog.amount || 0),
    target: auditLog.target,
    targetType: auditLog.targetType,
    decision: auditLog.decision,
    risk: auditLog.risk,
    riskScore: Number(auditLog.riskScore || 0),
    policyUsed: auditLog.policyUsed,
    reasonHash: hashJson({ reason: auditLog.reason }),
    timestamp: auditLog.timestamp,
  };

  return {
    payload,
    payloadHash: hashJson(payload),
    casper: getCasperStatus(),
    contractEntrypoint: "record_decision",
    runtimeArgs: {
      decision_id: payload.decisionId,
      wallet_address: payload.walletAddress,
      agent_id: payload.agentId,
      shield: payload.shield,
      action_type: payload.action,
      decision: payload.decision,
      risk: payload.risk,
      risk_score: payload.riskScore,
      amount: String(payload.amount),
      target: payload.target,
      policy_used: payload.policyUsed,
      reason_hash: payload.reasonHash,
      payload_hash: hashJson(payload),
    },
  };
}

export function validateDeployHash(value) {
  const deployHash = String(value || "").trim();
  if (!deployHash) {
    const err = new Error("Casper deploy hash is required");
    err.status = 400;
    throw err;
  }
  if (deployHash.length < 20) {
    const err = new Error("Casper deploy hash looks too short");
    err.status = 400;
    throw err;
  }
  return deployHash;
}
