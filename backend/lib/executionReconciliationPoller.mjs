const HASH64 = /^[a-f0-9]{64}$/i;
const EVM_HASH = /^0x[a-f0-9]{64}$/i;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeRpcUrl(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) return "";
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function timeoutMs(value, fallback = 10_000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 60_000 ? parsed : fallback;
}

function rpcError(message, status = 502, details = undefined) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) error.details = details;
  return error;
}

function normalizeCasperHash(value = "") {
  return clean(value).replace(/^(?:transaction-hash-|deploy-hash-)/i, "").replace(/^0x/i, "");
}

function hasKeyDeep(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((item) => hasKeyDeep(item, key));
}

function findValueDeep(value, keys) {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  for (const item of Object.values(value)) {
    const found = findValueDeep(item, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function shortFailure(value) {
  if (typeof value === "string") return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "Casper execution failed";
  }
}

async function jsonRpc({ rpcUrl, method, params, fetchImpl, requestTimeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw rpcError(`Reconciliation RPC returned HTTP ${response.status}`, 502, { method, status: response.status });
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw rpcError(`Reconciliation RPC timed out after ${requestTimeoutMs}ms`, 504, { method });
    if (error?.status) throw error;
    throw rpcError(`Could not reach reconciliation RPC: ${error?.message || "network request failed"}`, 502, { method });
  } finally {
    clearTimeout(timer);
  }
}

function casperObservation(payload, transactionHash, provider, chainName) {
  if (payload?.error) return null;
  const result = payload?.result ?? payload;
  const failure = findValueDeep(result, ["Failure", "failure"]);
  const success = findValueDeep(result, ["Success", "success"]);
  const blockHash = clean(findValueDeep(result, ["block_hash", "blockHash"]));
  const finalizedApprovals = findValueDeep(result, ["finalized_approvals", "finalizedApprovals"]);
  const finalitySignatures = findValueDeep(result, ["finality_signatures", "finalitySignatures"]);
  const explicitlyFinalized = (Array.isArray(finalizedApprovals) && finalizedApprovals.length > 0)
    || (Array.isArray(finalitySignatures) && finalitySignatures.length > 0)
    || findValueDeep(result, ["finalized", "is_finalized"]) === true;
  const transactionPresent = Boolean(findValueDeep(result, ["transaction", "deploy", "transaction_hash", "deploy_hash"])) || Boolean(blockHash);
  if (failure !== undefined) {
    return {
      status: "failed",
      transactionHash,
      confirmations: blockHash ? 1 : 0,
      finalized: explicitlyFinalized,
      provider,
      providerReference: blockHash,
      failureReason: shortFailure(failure),
      chainName,
      observedAt: new Date().toISOString(),
    };
  }
  if (success !== undefined || blockHash) {
    return {
      status: "confirmed",
      transactionHash,
      confirmations: 1,
      finalized: explicitlyFinalized,
      provider,
      providerReference: blockHash,
      chainName,
      observedAt: new Date().toISOString(),
    };
  }
  if (transactionPresent) {
    return {
      status: "pending",
      transactionHash,
      confirmations: 0,
      finalized: false,
      provider,
      chainName,
      observedAt: new Date().toISOString(),
    };
  }
  return null;
}

async function pollCasper({ transactionHash, rpcUrl, fetchImpl, requestTimeoutMs, provider, chainName }) {
  const hash = normalizeCasperHash(transactionHash);
  if (!HASH64.test(hash)) throw rpcError("Casper reconciliation requires a 64-character transaction or deploy hash", 400);
  const attempts = [
    { method: "info_get_transaction", params: { transaction_hash: hash, with_finalized_approvals: true } },
    { method: "info_get_deploy", params: { deploy_hash: hash, finalized_approvals: true } },
  ];
  let lastError;
  for (const attempt of attempts) {
    const payload = await jsonRpc({ rpcUrl, ...attempt, fetchImpl, requestTimeoutMs });
    const observation = casperObservation(payload, hash, provider, chainName);
    if (observation) return { ...observation, rpcMethod: attempt.method };
    lastError = payload?.error;
  }
  return {
    status: "pending",
    transactionHash: hash,
    confirmations: 0,
    finalized: false,
    provider,
    providerReference: clean(lastError?.message).slice(0, 256),
    chainName,
    observedAt: new Date().toISOString(),
    rpcMethod: "info_get_transaction/info_get_deploy",
  };
}

function hexToInteger(value) {
  const raw = clean(value);
  if (!/^0x[0-9a-f]+$/i.test(raw)) return null;
  const parsed = Number.parseInt(raw.slice(2), 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function pollEvm({ transactionHash, rpcUrl, fetchImpl, requestTimeoutMs, provider, chainName }) {
  if (!EVM_HASH.test(transactionHash)) throw rpcError("EVM reconciliation requires a 0x-prefixed 32-byte transaction hash", 400);
  const receiptPayload = await jsonRpc({ rpcUrl, method: "eth_getTransactionReceipt", params: [transactionHash], fetchImpl, requestTimeoutMs });
  if (receiptPayload?.error) throw rpcError(`EVM receipt lookup failed: ${clean(receiptPayload.error.message) || "RPC error"}`, 502, receiptPayload.error);
  const receipt = receiptPayload?.result;
  if (!receipt) {
    return { status: "pending", transactionHash, confirmations: 0, finalized: false, provider, chainName, observedAt: new Date().toISOString(), rpcMethod: "eth_getTransactionReceipt" };
  }
  const blockNumber = hexToInteger(receipt.blockNumber);
  let confirmations = blockNumber === null ? 1 : 1;
  if (blockNumber !== null) {
    const headPayload = await jsonRpc({ rpcUrl, method: "eth_blockNumber", params: [], fetchImpl, requestTimeoutMs });
    const head = hexToInteger(headPayload?.result);
    if (head !== null && head >= blockNumber) confirmations = head - blockNumber + 1;
  }
  const failed = clean(receipt.status).toLowerCase() === "0x0";
  return {
    status: failed ? "failed" : "confirmed",
    transactionHash,
    confirmations,
    finalized: false,
    blockHeight: blockNumber,
    provider,
    providerReference: clean(receipt.blockHash),
    failureReason: failed ? "EVM transaction receipt reported status 0x0" : "",
    chainName,
    observedAt: new Date().toISOString(),
    rpcMethod: "eth_getTransactionReceipt",
  };
}

export function getExecutionReconciliationPollingStatus(env = process.env) {
  const casperRpcUrl = normalizeRpcUrl(env.RECONCILIATION_CASPER_RPC_URL || env.CASPER_RPC_URL || "");
  const evmRpcUrl = normalizeRpcUrl(env.RECONCILIATION_EVM_RPC_URL || "");
  const enabled = String(env.RECONCILIATION_POLLING_ENABLED || "").toLowerCase() === "true";
  return {
    enabled,
    configured: enabled && Boolean(casperRpcUrl || evmRpcUrl),
    casperConfigured: enabled && Boolean(casperRpcUrl),
    evmConfigured: enabled && Boolean(evmRpcUrl),
    requestTimeoutMs: timeoutMs(env.RECONCILIATION_POLL_TIMEOUT_MS, 10_000),
    securityBoundary: "RPC endpoints are backend-configured only. Request bodies cannot supply arbitrary provider URLs, preventing reconciliation from becoming an SSRF proxy.",
  };
}

export async function pollExecutionTransaction({
  transactionHash,
  chainFamily = "",
  chainName = "",
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const polling = getExecutionReconciliationPollingStatus(env);
  if (!polling.enabled) throw rpcError("Execution reconciliation polling is disabled. Set RECONCILIATION_POLLING_ENABLED=true on the backend.", 503);
  if (typeof fetchImpl !== "function") throw rpcError("A Fetch API implementation is required for reconciliation polling", 500);
  const family = clean(chainFamily).toLowerCase() || (clean(chainName).toLowerCase().startsWith("eip155:") ? "evm" : "casper");
  const provider = family === "evm" ? "configured-evm-rpc" : "configured-casper-rpc";
  if (family === "evm") {
    const rpcUrl = normalizeRpcUrl(env.RECONCILIATION_EVM_RPC_URL || "");
    if (!rpcUrl) throw rpcError("RECONCILIATION_EVM_RPC_URL is not configured", 503);
    return pollEvm({ transactionHash: clean(transactionHash), rpcUrl, fetchImpl, requestTimeoutMs: polling.requestTimeoutMs, provider, chainName: clean(chainName) });
  }
  const rpcUrl = normalizeRpcUrl(env.RECONCILIATION_CASPER_RPC_URL || env.CASPER_RPC_URL || "");
  if (!rpcUrl) throw rpcError("CASPER_RPC_URL or RECONCILIATION_CASPER_RPC_URL is not configured", 503);
  return pollCasper({ transactionHash: clean(transactionHash), rpcUrl, fetchImpl, requestTimeoutMs: polling.requestTimeoutMs, provider, chainName: clean(chainName || env.CASPER_CHAIN_NAME || "casper-test") });
}
