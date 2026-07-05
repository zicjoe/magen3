import { execFile } from "node:child_process";
import { existsSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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

function expandPath(value) {
  const text = String(value || "").trim();
  return text.startsWith("~/") ? join(homedir(), text.slice(2)) : text;
}

function looksLikePrivateKeyPem(value) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----/m.test(String(value || ""));
}

function normalizePem(value) {
  return String(value || "").trim().replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
}

function decodeRelayerSecretKeyB64(value) {
  const raw = String(value || "").trim();
  if (!raw) return { contents: "", error: "" };
  if (looksLikePrivateKeyPem(raw)) return { contents: normalizePem(raw), error: "" };

  const compact = raw.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) {
    return {
      contents: "",
      error: "CASPER_RELAYER_SECRET_KEY_B64 is not valid base64. Generate it with: base64 -w 0 ~/magen3-relayer/secret_key.pem",
    };
  }

  const decoded = Buffer.from(compact, "base64").toString("utf8");
  if (!looksLikePrivateKeyPem(decoded)) {
    return {
      contents: "",
      error: "CASPER_RELAYER_SECRET_KEY_B64 decoded, but it is not a Casper private key PEM. It must be base64 of secret_key.pem, not public_key_hex and not the file path.",
    };
  }

  return { contents: normalizePem(decoded), error: "" };
}

function readRelayerSecretKey() {
  const configuredPath = String(process.env.CASPER_RELAYER_SECRET_KEY_PATH || process.env.CASPER_SECRET_KEY_PATH || "").trim();
  const encoded = String(process.env.CASPER_RELAYER_SECRET_KEY_B64 || "").trim();
  const pem = String(process.env.CASPER_RELAYER_SECRET_KEY_PEM || "").trim();
  const configuredSources = [
    configuredPath ? "CASPER_RELAYER_SECRET_KEY_PATH" : "",
    encoded ? "CASPER_RELAYER_SECRET_KEY_B64" : "",
    pem ? "CASPER_RELAYER_SECRET_KEY_PEM" : "",
  ].filter(Boolean);

  if (configuredSources.length === 0) {
    return { path: "", error: "" };
  }

  if (configuredSources.length > 1) {
    return {
      path: "",
      error: `Set exactly one relayer secret key source. Found: ${configuredSources.join(", ")}.`,
    };
  }

  if (configuredPath) {
    const keyPath = expandPath(configuredPath);
    if (!existsSync(keyPath)) {
      return { path: "", error: `Relayer secret key file does not exist at ${keyPath}. On Railway, use CASPER_RELAYER_SECRET_KEY_B64 instead of a local file path.` };
    }
    const contents = readFileSync(keyPath, "utf8");
    if (!looksLikePrivateKeyPem(contents)) {
      return { path: "", error: `Relayer secret key file at ${keyPath} is not a valid private key PEM.` };
    }
    return { path: keyPath, error: "" };
  }

  const key = encoded ? decodeRelayerSecretKeyB64(encoded) : { contents: normalizePem(pem), error: "" };
  if (key.error) return { path: "", error: key.error };
  if (!looksLikePrivateKeyPem(key.contents)) {
    return {
      path: "",
      error: "CASPER_RELAYER_SECRET_KEY_PEM is not a valid private key PEM. It must include BEGIN PRIVATE KEY and END PRIVATE KEY lines.",
    };
  }

  const keyPath = join(tmpdir(), "magen3-relayer-secret-key.pem");
  writeFileSync(keyPath, `${key.contents}\n`, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  return { path: keyPath, error: "" };
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

function shortOutput(value, max = 900) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function casperClientErrorMessage(error) {
  const stderr = shortOutput(error?.stderr);
  const stdout = shortOutput(error?.stdout);
  const code = error?.code || error?.signal || "";
  const parts = ["casper-client put-deploy failed"];
  if (code) parts.push(`exit=${code}`);
  if (stderr) parts.push(`stderr=${stderr}`);
  if (stdout) parts.push(`stdout=${stdout}`);
  if (!stderr && !stdout && error instanceof Error) parts.push(error.message);
  return parts.join("; ");
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

  const contractHash = normalizeDeployHash(MAGEN3_CONTRACT_HASH || prepared?.casper?.contractHash || "");
  const secretKey = readRelayerSecretKey();
  if (secretKey.error) {
    return {
      ...base,
      decisionProofStatus: "failed",
      decisionProofError: secretKey.error,
    };
  }

  if (!contractHash || !secretKey.path) {
    return {
      ...base,
      decisionProofStatus: "queued",
      decisionProofError: "Relayer is not fully configured. Set MAGEN3_CONTRACT_HASH and CASPER_RELAYER_SECRET_KEY_PATH or CASPER_RELAYER_SECRET_KEY_B64 on the backend.",
    };
  }

  if (!/^[a-f0-9]{64}$/i.test(contractHash)) {
    return {
      ...base,
      decisionProofStatus: "failed",
      decisionProofError: "MAGEN3_CONTRACT_HASH must be a 64-character Casper contract hash, with or without the hash- prefix.",
    };
  }

  const runtimeArgs = prepared.runtimeArgs;
  const args = [
    "put-deploy",
    "--node-address", process.env.CASPER_RPC_URL || CASPER_RPC_URL,
    "--chain-name", process.env.CASPER_CHAIN_NAME || CASPER_CHAIN_NAME,
    "--secret-key", secretKey.path,
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
      decisionProofError: casperClientErrorMessage(error),
    };
  }
}
