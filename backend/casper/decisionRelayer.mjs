import { execFile } from "node:child_process";
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import {
  buildAuditDecisionPayload,
  CASPER_CHAIN_NAME,
  CASPER_RPC_URL,
  MAGEN3_CONTRACT_HASH,
  normalizeDeployHash,
  isRealDeployHash,
} from "./auditPayload.mjs";

const execFileAsync = promisify(execFile);

const RECORDABLE_DECISIONS = new Set(["Allowed", "Blocked", "Review Required"]);

function relayerMode() {
  return process.env.CASPER_RECORDING_MODE || "relayer";
}

function relayerEnabled() {
  return relayerMode() === "relayer" || process.env.CASPER_AUTO_RECORD_DECISIONS === "true";
}

function relayerSecretKeyPath() {
  const configuredPath = process.env.CASPER_RELAYER_SECRET_KEY_PATH || process.env.CASPER_SECRET_KEY_PATH || "";
  if (configuredPath) return configuredPath;

  const encoded = process.env.CASPER_RELAYER_SECRET_KEY_B64 || "";
  const pem = process.env.CASPER_RELAYER_SECRET_KEY_PEM || "";
  if (!encoded && !pem) return "";

  const keyPath = join(tmpdir(), "magen3-relayer-secret-key.pem");
  if (!existsSync(keyPath)) {
    const contents = encoded ? Buffer.from(encoded, "base64").toString("utf8") : pem.replace(/\\n/g, "\n");
    writeFileSync(keyPath, contents, { mode: 0o600 });
    chmodSync(keyPath, 0o600);
  }
  return keyPath;
}

function argValue(name, type, value) {
  return `${name}:${type}='${String(value ?? "").replace(/'/g, "\\'")}'`;
}

function parseDeployHash(output) {
  const text = String(output || "");
  const labeled = text.match(/(?:deploy_hash|transaction_hash|deploy hash)\W+([a-f0-9]{64})/i);
  const fallback = text.match(/\b([a-f0-9]{64})\b/i);
  return normalizeDeployHash(labeled?.[1] || fallback?.[1] || "");
}

export function isRecordableDecision(auditLog) {
  return auditLog?.shield === "Agent Shield" && RECORDABLE_DECISIONS.has(auditLog?.decision);
}

export function initialDecisionProofState(auditLog) {
  const prepared = buildAuditDecisionPayload(auditLog);
  if (!isRecordableDecision(auditLog)) {
    return {
      decisionProofStatus: "not_recordable",
      decisionProofPayloadHash: prepared.payloadHash,
      decisionProofError: "",
      decisionProofMode: relayerMode(),
      decisionProofUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    decisionProofStatus: relayerEnabled() ? "queued" : "queued",
    decisionProofPayloadHash: prepared.payloadHash,
    decisionProofError: relayerEnabled() ? "" : "Relayer is not enabled. Set CASPER_RECORDING_MODE=relayer to auto-record every recordable decision.",
    decisionProofMode: relayerMode(),
    decisionProofUpdatedAt: new Date().toISOString(),
  };
}

export async function recordDecisionProof(auditLog) {
  const prepared = buildAuditDecisionPayload(auditLog);
  const now = new Date().toISOString();
  const base = {
    decisionProofPayloadHash: prepared.payloadHash,
    decisionProofMode: relayerMode(),
    decisionProofUpdatedAt: now,
  };

  if (!isRecordableDecision(auditLog)) {
    return { ...base, decisionProofStatus: "not_recordable", decisionProofError: "" };
  }

  if (isRealDeployHash(auditLog.txHash || "")) {
    return { ...base, decisionProofStatus: "recorded", decisionProofError: "", txHash: normalizeDeployHash(auditLog.txHash) };
  }

  if (!relayerEnabled()) {
    return {
      ...base,
      decisionProofStatus: "queued",
      decisionProofError: "Relayer is not enabled. Set CASPER_RECORDING_MODE=relayer to auto-record every recordable decision.",
    };
  }

  const contractHash = MAGEN3_CONTRACT_HASH || prepared?.casper?.contractHash || "";
  const secretKey = relayerSecretKeyPath();
  if (!contractHash || !secretKey) {
    return {
      ...base,
      decisionProofStatus: "queued",
      decisionProofError: "Relayer is not fully configured. Set MAGEN3_CONTRACT_HASH and CASPER_RELAYER_SECRET_KEY_PATH on the backend.",
    };
  }

  const runtimeArgs = prepared.runtimeArgs;
  const args = [
    "put-deploy",
    "--node-address", process.env.CASPER_RPC_URL || CASPER_RPC_URL,
    "--chain-name", process.env.CASPER_CHAIN_NAME || CASPER_CHAIN_NAME,
    "--secret-key", secretKey,
    "--payment-amount", process.env.CASPER_CALL_PAYMENT_MOTES || "5000000000",
    "--session-hash", contractHash,
    "--session-entry-point", "record_decision",
    "--session-arg", argValue("decision_id", "string", runtimeArgs.decision_id),
    "--session-arg", argValue("wallet_address", "string", runtimeArgs.wallet_address),
    "--session-arg", argValue("agent_id", "string", runtimeArgs.agent_id),
    "--session-arg", argValue("shield", "string", runtimeArgs.shield),
    "--session-arg", argValue("action_type", "string", runtimeArgs.action_type),
    "--session-arg", argValue("decision", "string", runtimeArgs.decision),
    "--session-arg", argValue("risk", "string", runtimeArgs.risk),
    "--session-arg", argValue("risk_score", "u32", runtimeArgs.risk_score),
    "--session-arg", argValue("amount", "string", runtimeArgs.amount),
    "--session-arg", argValue("target", "string", runtimeArgs.target),
    "--session-arg", argValue("policy_used", "string", runtimeArgs.policy_used),
    "--session-arg", argValue("reason_hash", "string", runtimeArgs.reason_hash),
    "--session-arg", argValue("payload_hash", "string", runtimeArgs.payload_hash),
  ];

  try {
    const { stdout, stderr } = await execFileAsync(process.env.CASPER_CLIENT_BIN || "casper-client", args, {
      timeout: Number(process.env.CASPER_RELAYER_TIMEOUT_MS || 30000),
      maxBuffer: 1024 * 1024,
    });
    const txHash = parseDeployHash(`${stdout}\n${stderr}`);
    if (!isRealDeployHash(txHash)) {
      return {
        ...base,
        decisionProofStatus: "failed",
        decisionProofError: "Casper relayer submitted the command but no valid 64-character deploy hash was returned.",
      };
    }
    return { ...base, decisionProofStatus: "recorded", decisionProofError: "", txHash };
  } catch (error) {
    return {
      ...base,
      decisionProofStatus: "failed",
      decisionProofError: error instanceof Error ? error.message : "Casper relayer failed to record decision proof.",
    };
  }
}
