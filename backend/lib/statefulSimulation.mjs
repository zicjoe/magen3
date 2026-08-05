import { createHash } from "node:crypto";

const HEX = /^0x[0-9a-f]*$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const MAX_RESPONSE_BYTES = 512_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const SCHEMA_VERSION = "magen3.stateful-simulation.v1";

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function nowIso() { return new Date().toISOString(); }

export function canonicalizeSimulationValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Simulation canonicalization rejects unsafe or fractional numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeSimulationValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeSimulationValue(value[key])]));
  }
  throw new Error(`Unsupported simulation value type: ${typeof value}`);
}

export function hashSimulationValue(value) {
  return createHash("sha256").update(JSON.stringify(canonicalizeSimulationValue(value))).digest("hex");
}

function normalizeHex(value, field, { address = false, optional = true } = {}) {
  const raw = clean(value);
  if (!raw && optional) return "";
  if ((address && !ADDRESS.test(raw)) || (!address && !HEX.test(raw))) {
    const error = new Error(`${field} must be canonical 0x-prefixed hexadecimal data`);
    error.code = "MALFORMED_PAYLOAD";
    throw error;
  }
  return raw.toLowerCase();
}

function normalizeQuantity(value, field) {
  const raw = clean(value);
  if (!raw) return "";
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(raw)) {
    const error = new Error(`${field} must be a canonical non-negative EVM quantity`);
    error.code = "MALFORMED_PAYLOAD";
    throw error;
  }
  return raw.toLowerCase();
}

export function normalizeEvmSimulationPayload(raw = {}) {
  const value = object(raw);
  const payload = {
    from: normalizeHex(value.from, "simulation.payload.from", { address: true }),
    to: normalizeHex(value.to, "simulation.payload.to", { address: true }),
    data: normalizeHex(value.data || "0x", "simulation.payload.data", { optional: false }),
    value: normalizeQuantity(value.value || "0x0", "simulation.payload.value"),
    gas: normalizeQuantity(value.gas, "simulation.payload.gas"),
    gasPrice: normalizeQuantity(value.gasPrice, "simulation.payload.gasPrice"),
    maxFeePerGas: normalizeQuantity(value.maxFeePerGas, "simulation.payload.maxFeePerGas"),
    maxPriorityFeePerGas: normalizeQuantity(value.maxPriorityFeePerGas, "simulation.payload.maxPriorityFeePerGas"),
    nonce: normalizeQuantity(value.nonce, "simulation.payload.nonce"),
  };
  if (!payload.from || !payload.to) {
    const error = new Error("EVM stateful simulation requires exact from and to addresses");
    error.code = "MISSING_FIELD";
    throw error;
  }
  return Object.fromEntries(Object.entries(payload).filter(([, item]) => item !== ""));
}

function trustedEvmConfig(env = process.env) {
  const rpcUrl = clean(env.STATEFUL_SIMULATION_EVM_RPC_URL);
  if (!rpcUrl) return { configured: false };
  let parsed;
  try { parsed = new URL(rpcUrl); } catch { return { configured: false, invalid: true }; }
  if (parsed.protocol !== "https:" && !(env.NODE_ENV === "test" && parsed.protocol === "http:")) return { configured: false, invalid: true };
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname) && env.NODE_ENV !== "test") return { configured: false, invalid: true };
  return {
    configured: true,
    rpcUrl,
    providerId: clean(env.STATEFUL_SIMULATION_EVM_PROVIDER_ID || "configured-evm-rpc"),
    expectedChainId: lower(env.STATEFUL_SIMULATION_EVM_CHAIN_ID),
    timeoutMs: Math.min(20_000, Math.max(500, Number(env.STATEFUL_SIMULATION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)),
    maximumAgeSeconds: Math.min(600, Math.max(1, Number(env.STATEFUL_SIMULATION_MAX_AGE_SECONDS) || 60)),
  };
}

async function jsonRpc({ rpcUrl, method, params, fetchImpl, signal }) {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal,
  });
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    const error = new Error("Simulation provider response exceeded the configured size limit");
    error.code = "OVERSIZED_RESPONSE";
    throw error;
  }
  let payload;
  try { payload = JSON.parse(text); } catch {
    const error = new Error("Simulation provider returned malformed JSON");
    error.code = "MALFORMED_PROVIDER_RESPONSE";
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Simulation provider HTTP ${response.status}`);
    error.code = "PROVIDER_ERROR";
    throw error;
  }
  if (payload?.error) {
    const error = new Error(clean(payload.error.message || "Simulation provider error").slice(0, 500));
    error.code = "EVM_REVERT";
    error.providerCode = payload.error.code;
    error.providerData = typeof payload.error.data === "string" ? payload.error.data.slice(0, 2048) : "";
    throw error;
  }
  return payload?.result;
}

function baseEvidence({ requestedAt, input, config }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    simulationId: `SIM-${hashSimulationValue({ requestedAt, input }).slice(0, 20)}`,
    adapterId: "evm-json-rpc-stateful",
    adapterVersion: "1.0.0",
    providerClassification: "configured-trusted-rpc",
    providerId: config.providerId || "",
    chainFamily: "EVM",
    network: clean(input.network || input.chainName),
    chainId: clean(input.chainId),
    requestedAt,
    startedAt: requestedAt,
    completedAt: "",
    durationMs: 0,
    payloadHash: "",
    networkContextHash: "",
    resultHash: "",
    status: "pending",
    providerRequestCompleted: false,
    expectedSuccess: null,
    revertReason: "",
    errorClassification: "",
    runtimeReturn: "",
    blockNumber: "",
    blockHash: "",
    providerStateTimestamp: "",
    freshnessStatus: "fresh",
    expiresAt: "",
    cached: false,
    invalidated: false,
    evidenceCompleteness: {
      executionResult: "observed",
      feeEstimate: "observed",
      nativeBalanceDeltas: "unsupported",
      tokenBalanceDeltas: "unsupported",
      allowanceDeltas: "unsupported",
      events: "unsupported",
      internalCalls: "unsupported",
      storageChanges: "unsupported",
    },
    capabilities: {
      basicExecutionSimulation: true,
      revertDetection: true,
      feeEstimation: true,
      blockPinnedSimulation: true,
      balanceDeltaDetection: false,
      tokenTransferDetection: false,
      allowanceDeltaDetection: false,
      eventPreview: false,
      returnValueDecoding: false,
      callTracing: false,
      contractStorageDiffs: false,
      stateOverrides: false,
      historicalBlockSimulation: false,
    },
  };
}

export async function runStatefulSimulation({ simulation = {}, chainName = "", fetchImpl = fetch, env = process.env, now = new Date() } = {}) {
  const input = object(simulation);
  const requested = input.required === true || input.requested === true || Object.keys(object(input.payload || input.unsignedPayload)).length > 0;
  if (!requested) return { schemaVersion: SCHEMA_VERSION, status: "not_requested", requested: false, evidenceCompleteness: {} };

  const requestedAt = now.toISOString();
  const family = clean(input.chainFamily || input.family).toUpperCase();
  if (family && family !== "EVM") {
    return {
      schemaVersion: SCHEMA_VERSION, status: "unsupported", requested: true, chainFamily: family,
      errorClassification: "UNSUPPORTED_CHAIN_FAMILY",
      message: `No production stateful simulation adapter is configured for ${family}.`,
      evidenceCompleteness: { executionResult: "unsupported", feeEstimate: "unsupported" },
    };
  }
  const config = trustedEvmConfig(env);
  if (!config.configured) {
    return {
      schemaVersion: SCHEMA_VERSION, status: "unavailable", requested: true, chainFamily: "EVM",
      errorClassification: config.invalid ? "INVALID_PROVIDER_CONFIGURATION" : "PROVIDER_NOT_CONFIGURED",
      message: "The trusted EVM stateful simulation provider is not configured.",
      evidenceCompleteness: { executionResult: "unavailable", feeEstimate: "unavailable" },
    };
  }

  let payload;
  try { payload = normalizeEvmSimulationPayload(input.payload || input.unsignedPayload); }
  catch (error) {
    return { schemaVersion: SCHEMA_VERSION, status: "failed", requested: true, chainFamily: "EVM", errorClassification: error.code || "MALFORMED_PAYLOAD", message: error.message, evidenceCompleteness: { executionResult: "unavailable", feeEstimate: "unavailable" } };
  }

  const evidence = baseEvidence({ requestedAt, input: { ...input, chainName }, config });
  evidence.payloadHash = hashSimulationValue(payload);
  evidence.networkContextHash = hashSimulationValue({ chainFamily: "EVM", network: input.network || chainName, requestedChainId: input.chainId || "" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const started = Date.now();
  try {
    const chainId = await jsonRpc({ rpcUrl: config.rpcUrl, method: "eth_chainId", params: [], fetchImpl, signal: controller.signal });
    evidence.chainId = lower(chainId);
    if (config.expectedChainId && lower(chainId) !== config.expectedChainId) {
      evidence.status = "failed";
      evidence.errorClassification = "NETWORK_MISMATCH";
      evidence.message = "Simulation provider chain ID does not match the configured trusted network.";
      return evidence;
    }
    if (input.chainId && lower(input.chainId) !== lower(chainId)) {
      evidence.status = "invalidated";
      evidence.invalidated = true;
      evidence.errorClassification = "NETWORK_MUTATION";
      evidence.message = "The requested chain ID differs from the provider chain ID.";
      return evidence;
    }
    const blockNumber = await jsonRpc({ rpcUrl: config.rpcUrl, method: "eth_blockNumber", params: [], fetchImpl, signal: controller.signal });
    evidence.blockNumber = lower(blockNumber);
    const block = await jsonRpc({ rpcUrl: config.rpcUrl, method: "eth_getBlockByNumber", params: [blockNumber, false], fetchImpl, signal: controller.signal });
    evidence.blockHash = lower(block?.hash);
    evidence.providerStateTimestamp = block?.timestamp ? new Date(Number(BigInt(block.timestamp)) * 1000).toISOString() : "";
    evidence.networkContextHash = hashSimulationValue({ chainFamily: "EVM", chainId: evidence.chainId, blockNumber: evidence.blockNumber, blockHash: evidence.blockHash });
    evidence.runtimeReturn = clean(await jsonRpc({ rpcUrl: config.rpcUrl, method: "eth_call", params: [payload, blockNumber], fetchImpl, signal: controller.signal })).slice(0, 16_384);
    const gasEstimate = await jsonRpc({ rpcUrl: config.rpcUrl, method: "eth_estimateGas", params: [payload, blockNumber], fetchImpl, signal: controller.signal });
    evidence.gasEstimate = lower(gasEstimate);
    evidence.status = "succeeded";
    evidence.providerRequestCompleted = true;
    evidence.expectedSuccess = true;
    evidence.message = "The exact unsigned EVM payload completed eth_call and eth_estimateGas at a pinned block.";
  } catch (error) {
    evidence.providerRequestCompleted = !["AbortError"].includes(error?.name);
    evidence.expectedSuccess = false;
    if (error?.name === "AbortError") {
      evidence.status = "timed_out";
      evidence.errorClassification = "PROVIDER_TIMEOUT";
      evidence.message = "The stateful simulation provider timed out.";
    } else if (error?.code === "EVM_REVERT") {
      evidence.status = "reverted";
      evidence.errorClassification = "EXECUTION_REVERTED";
      evidence.revertReason = clean(error.message).slice(0, 500);
      evidence.revertData = clean(error.providerData).slice(0, 2048);
      evidence.message = "The provider predicts that the exact unsigned payload will revert.";
    } else {
      evidence.status = "failed";
      evidence.errorClassification = clean(error?.code || "PROVIDER_ERROR");
      evidence.message = clean(error?.message || "Stateful simulation failed").slice(0, 500);
    }
  } finally {
    clearTimeout(timer);
    evidence.completedAt = nowIso();
    evidence.durationMs = Math.max(0, Date.now() - started);
    evidence.expiresAt = new Date(Date.parse(evidence.completedAt) + config.maximumAgeSeconds * 1000).toISOString();
    evidence.resultHash = hashSimulationValue({ ...evidence, resultHash: "" });
  }
  return evidence;
}

function policySettings(policy = {}) {
  const rules = object(policy.structuredRules);
  const fallback = lower(rules.statefulSimulationUnavailableAction || "review");
  return {
    required: rules.statefulSimulationRequired === true,
    unavailableAction: fallback === "block" ? "Block" : fallback === "allow" || fallback === "warn" ? "Warn" : "Review",
    maximumAgeSeconds: Math.min(600, Math.max(1, Number(rules.statefulSimulationMaximumAgeSeconds) || 60)),
  };
}

function simFinding(status, severity, rule, message, evidence = {}, remediation = "") {
  return { module: "Stateful Simulation", status, severity, rule, message, evidence, remediation };
}

export function evaluateStatefulSimulationEvidence({ request = {}, policy = {}, now = new Date() } = {}) {
  const config = policySettings(policy);
  const evidence = object(request.statefulSimulationEvidence);
  const state = { findings: [], checksPassed: [], checksFailed: [], hardBlock: false, needsReview: false, scoreDelta: 0, context: evidence };
  const add = (status, severity, rule, message, data = {}, remediation = "") => {
    state.findings.push(simFinding(status, severity, rule, message, data, remediation));
    if (status === "pass") state.checksPassed.push(message); else state.checksFailed.push(message);
  };
  const failUnavailable = (rule, message, data = {}) => {
    if (config.unavailableAction === "Block") { state.hardBlock = true; state.scoreDelta += 28; add("fail", "high", rule, message, data, "Configure a trusted adapter or change the authorized policy fallback."); }
    else if (config.unavailableAction === "Review") { state.needsReview = true; state.scoreDelta += 16; add("unavailable", "medium", rule, message, data, "Configure a trusted adapter or obtain review under the active policy."); }
    else add("warning", "low", rule, message, data);
  };

  if (!config.required && (!evidence.status || evidence.status === "not_requested")) {
    add("skipped", "info", "Stateful simulation requirement", "Stateful simulation is optional for this policy and was not requested.");
    return state;
  }
  if (!evidence.status || evidence.status === "not_requested") {
    failUnavailable("Stateful simulation required", "The active policy requires stateful simulation, but no simulation evidence was produced.");
    return state;
  }
  if (["unsupported", "unavailable", "failed", "timed_out", "inconclusive"].includes(evidence.status)) {
    failUnavailable("Stateful simulation availability", evidence.message || `Stateful simulation is ${evidence.status}.`, { status: evidence.status, errorClassification: evidence.errorClassification || "" });
    return state;
  }
  if (["invalidated", "stale"].includes(evidence.status) || evidence.invalidated === true) {
    state.hardBlock = true; state.scoreDelta += 30;
    add("fail", "high", "Simulation evidence binding", "The stateful simulation evidence is stale or invalidated and cannot authorize signing.", { status: evidence.status, payloadHash: evidence.payloadHash || "" }, "Rebuild and re-simulate the exact final payload on the authorized network.");
    return state;
  }
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) <= now.getTime()) {
    state.hardBlock = true; state.scoreDelta += 28;
    add("fail", "high", "Simulation evidence freshness", "The stateful simulation evidence expired before authorization.", { expiresAt: evidence.expiresAt, evaluatedAt: now.toISOString() }, "Re-simulate the exact payload against fresh state.");
    return state;
  }
  if (evidence.status === "reverted" || evidence.expectedSuccess === false) {
    state.hardBlock = true; state.scoreDelta += 34;
    add("fail", "high", "Simulated execution result", evidence.revertReason ? `The simulated execution reverted: ${evidence.revertReason}` : "The simulated execution is expected to fail.", { errorClassification: evidence.errorClassification || "", payloadHash: evidence.payloadHash || "" }, "Correct the affected payload field and run a new simulation.");
    return state;
  }
  if (evidence.status === "succeeded" && evidence.expectedSuccess === true) {
    add("pass", "info", "Simulated execution result", "The exact unsigned payload succeeded under provider-backed stateful simulation.", { adapterId: evidence.adapterId, chainId: evidence.chainId, blockNumber: evidence.blockNumber, payloadHash: evidence.payloadHash, gasEstimate: evidence.gasEstimate || "" });
    return state;
  }
  failUnavailable("Stateful simulation result", "The simulation result was materially inconclusive.", { status: evidence.status || "unknown" });
  return state;
}
