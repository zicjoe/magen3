import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SCHEMA = "magen3.bridge-provider-integration.v1";
const ATTESTATION_SCHEMA = "magen3.bridge-provider-attestation.v1";
const ADAPTER_ID = "across-testnet";
const ADAPTER_VERSION = "1.0.0";
const DEFAULT_BASE_URL = "https://testnet.across.to/api";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_EVIDENCE_AGE_SECONDS = 300;
const DEFAULT_TESTNET_CHAIN_IDS = [421614, 84532, 168587773, 808813, 37111, 4202, 919, 11155420, 80002, 11155111, 129399, 1301];
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_APPROVAL_TXS = 8;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const EVM_HASH = /^0x[0-9a-f]{64}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const HEX_DATA = /^0x(?:[0-9a-f]{2})*$/i;
const POSITIVE_ATOMIC = /^(?:[1-9][0-9]*)$/;
const UNSIGNED_ATOMIC = /^(?:0|[1-9][0-9]*)$/;
const BRIDGE_ACTIONS = new Set(["Bridge", "Cross-chain Transfer"]);

const clean = (value) => String(value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();
const bounded = (value, max = 256) => clean(value).slice(0, max);

function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Unsafe numeric value cannot be canonically hashed");
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  throw new Error("Unsupported value in canonical payload");
}

function stableJson(value) {
  return JSON.stringify(canonical(value));
}

const hash = (value) => createHash("sha256").update(stableJson(value)).digest("hex");

function integer(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function actionFor(value, fallback = "review") {
  const candidate = lower(value);
  return ["allow", "warn", "review", "block"].includes(candidate) ? candidate : fallback;
}

function bridgeApplicable(request = {}) {
  return BRIDGE_ACTIONS.has(clean(request.actionType)) || Boolean(
    request.bridgeProviderId ||
    request.bridgeAdapterId ||
    request.bridgeProviderEvidence ||
    request.bridgeProviderIntegrationEvidence
  );
}

function normalizeProviderId(value) {
  const candidate = lower(value);
  if (["across-testnet", "across", "across testnet"].includes(candidate)) return ADAPTER_ID;
  return candidate;
}

function requireAddress(value, field) {
  const result = lower(value);
  if (!EVM_ADDRESS.test(result)) {
    throw Object.assign(new Error(`${field} must be a 20-byte EVM address`), { code: "INVALID_BRIDGE_FIELD", field });
  }
  return result;
}

function requireChainId(value, field) {
  const raw = clean(value).replace(/^eip155:/i, "");
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw Object.assign(new Error(`${field} must be a positive EVM chain ID`), { code: "INVALID_BRIDGE_FIELD", field });
  }
  return raw;
}

function requireAtomic(value, field) {
  const raw = clean(value);
  if (!POSITIVE_ATOMIC.test(raw)) {
    throw Object.assign(new Error(`${field} must be a positive integer in base units`), { code: "INVALID_BRIDGE_FIELD", field });
  }
  return raw;
}

function optionalAddress(value, field) {
  return clean(value) ? requireAddress(value, field) : "";
}

function normalizeTradeType(value) {
  const candidate = clean(value || "exactInput").replace(/[_-]/g, "").toLowerCase();
  if (candidate !== "exactinput") {
    throw Object.assign(
      new Error("The initial Across testnet adapter supports exactInput only. Typed minimum-output or maximum-input authorization is not implemented."),
      { code: "UNSUPPORTED_BRIDGE_TRADE_TYPE", field: "bridgeTradeType" }
    );
  }
  return "exactInput";
}

function parseAllowedTestnetChainIds(env = process.env) {
  const configured = clean(env.BRIDGE_PROVIDER_ALLOWED_TESTNET_CHAIN_IDS);
  const values = configured ? configured.split(",") : DEFAULT_TESTNET_CHAIN_IDS;
  const chainIds = new Set();
  for (const value of values) {
    const raw = clean(value).replace(/^eip155:/i, "");
    if (/^[1-9][0-9]*$/.test(raw)) chainIds.add(raw);
  }
  return chainIds;
}

function assertSingleTestnetChainId(chainId, field, env = process.env) {
  const allowed = parseAllowedTestnetChainIds(env);
  if (!allowed.has(String(chainId))) {
    throw Object.assign(new Error("The chain is not in the configured bridge testnet allowlist"), {
      code: "BRIDGE_MAINNET_OR_UNSUPPORTED_CHAIN",
      field,
    });
  }
}

function assertTestnetChainIds(sourceChainId, destinationChainId, env = process.env) {
  assertSingleTestnetChainId(sourceChainId, "bridgeSourceChainId", env);
  assertSingleTestnetChainId(destinationChainId, "bridgeDestinationChainId", env);
}

export function normalizeBridgeProviderRequest(request = {}) {
  const providerId = normalizeProviderId(request.bridgeProviderId || request.bridgeAdapterId);
  const suppliedEvidence = request.bridgeProviderIntegrationEvidence || request.bridgeProviderEvidence || null;
  const evidenceProviderId = normalizeProviderId(suppliedEvidence?.providerId || suppliedEvidence?.adapterId);
  const resolvedProviderId = providerId || evidenceProviderId;
  if (!resolvedProviderId) return { applicable: bridgeApplicable(request), requested: false, providerId: "" };
  if (resolvedProviderId !== ADAPTER_ID) return { applicable: true, requested: true, providerId: resolvedProviderId, unsupported: true };

  const sourceChainId = requireChainId(
    request.bridgeSourceChainId || request.bridgeOriginChainId || request.chainId || request.bridgeSourceChain,
    "bridgeSourceChainId"
  );
  const destinationChainId = requireChainId(
    request.bridgeDestinationChainId || request.bridgeDestinationChain,
    "bridgeDestinationChainId"
  );
  if (sourceChainId === destinationChainId) {
    throw Object.assign(new Error("Bridge source and destination chain IDs must differ"), {
      code: "INVALID_BRIDGE_FIELD",
      field: "bridgeDestinationChainId",
    });
  }

  const executionWallet = optionalAddress(request.executionWalletAddress || request.walletAddress, "executionWalletAddress");
  const depositor = requireAddress(request.bridgeDepositor || executionWallet, "bridgeDepositor");
  if (executionWallet && depositor !== executionWallet) {
    throw Object.assign(new Error("bridgeDepositor must match the protected execution wallet"), {
      code: "BRIDGE_DEPOSITOR_MISMATCH",
      field: "bridgeDepositor",
    });
  }

  const destination = optionalAddress(request.bridgeDestinationAddress, "bridgeDestinationAddress");
  const recipient = requireAddress(request.bridgeRecipient || destination || depositor, "bridgeRecipient");
  if (destination && recipient !== destination) {
    throw Object.assign(new Error("bridgeRecipient must match the protected destination address"), {
      code: "BRIDGE_RECIPIENT_MISMATCH",
      field: "bridgeRecipient",
    });
  }

  const assetContract = optionalAddress(request.assetContractAddress, "assetContractAddress");
  const inputToken = requireAddress(request.bridgeInputToken || assetContract, "bridgeInputToken");
  if (assetContract && inputToken !== assetContract) {
    throw Object.assign(new Error("bridgeInputToken must match the protected asset contract"), {
      code: "BRIDGE_INPUT_TOKEN_MISMATCH",
      field: "bridgeInputToken",
    });
  }

  const outputToken = requireAddress(request.bridgeOutputToken, "bridgeOutputToken");
  const amountAtomic = requireAtomic(request.bridgeAmountAtomic, "bridgeAmountAtomic");
  const protectedTarget = optionalAddress(request.target, "target");
  const slippageRaw = request.bridgeSlippage;
  let slippage = "";
  if (slippageRaw !== undefined && slippageRaw !== null && slippageRaw !== "") {
    const parsed = Number(slippageRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw Object.assign(new Error("bridgeSlippage must be between 0 and 1"), {
        code: "INVALID_BRIDGE_FIELD",
        field: "bridgeSlippage",
      });
    }
    slippage = String(parsed);
  }

  return {
    applicable: true,
    requested: true,
    providerId: ADAPTER_ID,
    tradeType: normalizeTradeType(request.bridgeTradeType),
    sourceChainId,
    destinationChainId,
    depositor,
    recipient,
    inputToken,
    outputToken,
    amountAtomic,
    protectedTarget,
    slippage,
  };
}

function providerConfig(env = process.env) {
  const baseRaw = clean(
    env.BRIDGE_PROVIDER_ACROSS_BASE_URL ||
    env.BRIDGE_ACROSS_TESTNET_BASE_URL ||
    DEFAULT_BASE_URL
  );
  const url = new URL(baseRaw);
  if (url.username || url.password) throw new Error("Bridge provider base URL must not contain credentials");
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !local) throw new Error("Bridge provider base URL must use HTTPS in production");
  const allowed = new Set(["testnet.across.to", ...clean(env.BRIDGE_PROVIDER_ALLOWED_HOSTS).split(",").map(lower).filter(Boolean)]);
  if (!local && !allowed.has(lower(url.hostname))) throw new Error("Bridge provider host is not allowlisted");
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    timeoutMs: integer(env.BRIDGE_PROVIDER_REQUEST_TIMEOUT_MS || env.BRIDGE_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, { min: 250, max: 30_000 }),
    maxEvidenceAgeSeconds: integer(env.BRIDGE_PROVIDER_MAX_EVIDENCE_AGE_SECONDS, DEFAULT_MAX_EVIDENCE_AGE_SECONDS, { min: 10, max: 3600 }),
    allowedTestnetChainIds: parseAllowedTestnetChainIds(env),
  };
}

function evidenceSecret(env = process.env) {
  const secret = clean(env.BRIDGE_PROVIDER_EVIDENCE_SECRET);
  if (secret.length < 32) {
    throw Object.assign(new Error("Bridge provider evidence attestation is not configured"), {
      code: "BRIDGE_PROVIDER_ATTESTATION_UNAVAILABLE",
    });
  }
  return secret;
}

async function readBodyLimited(response) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error(`Bridge provider response exceeds ${MAX_RESPONSE_BYTES} bytes`), { code: "BRIDGE_PROVIDER_RESPONSE_TOO_LARGE" });
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error(`Bridge provider response exceeds ${MAX_RESPONSE_BYTES} bytes`), { code: "BRIDGE_PROVIDER_RESPONSE_TOO_LARGE" });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Bridge provider returned invalid JSON"), { code: "BRIDGE_PROVIDER_INVALID_JSON" });
  }
}

async function providerGet(path, params, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Bridge provider integration requires fetch support");
  const config = providerConfig(env);
  const url = new URL(`${config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await readBodyLimited(response);
    if (!response.ok) {
      throw Object.assign(
        new Error(bounded(body?.message || body?.error || `Bridge provider returned HTTP ${response.status}`, 240)),
        { status: response.status, code: "BRIDGE_PROVIDER_HTTP_ERROR" }
      );
    }
    return { body, baseUrl: config.baseUrl };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw Object.assign(new Error("Bridge provider request timed out"), { code: "BRIDGE_PROVIDER_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function txFrom(raw, field = "swapTx") {
  if (!raw || typeof raw !== "object") return null;
  const chainId = requireChainId(raw.chainId, `${field}.chainId`);
  const to = requireAddress(raw.to, `${field}.to`);
  const from = optionalAddress(raw.from, `${field}.from`);
  const data = clean(raw.data || "0x").toLowerCase();
  if (!HEX_DATA.test(data)) {
    throw Object.assign(new Error(`${field}.data must be valid hexadecimal calldata`), {
      code: "INVALID_PROVIDER_EVIDENCE",
      field: `${field}.data`,
    });
  }
  const value = clean(raw.value ?? "0");
  if (!UNSIGNED_ATOMIC.test(value)) {
    throw Object.assign(new Error(`${field}.value must be an unsigned integer in base units`), {
      code: "INVALID_PROVIDER_EVIDENCE",
      field: `${field}.value`,
    });
  }
  const gas = clean(raw.gas || raw.gasLimit || "");
  if (gas && !UNSIGNED_ATOMIC.test(gas)) {
    throw Object.assign(new Error(`${field}.gas must be an unsigned integer`), {
      code: "INVALID_PROVIDER_EVIDENCE",
      field: `${field}.gas`,
    });
  }
  return {
    chainId,
    from,
    to,
    data,
    dataHash: hash(data),
    value,
    gas,
  };
}

function atomicFrom(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object") return atomicFrom(value.amount ?? value.value ?? value.total);
  const raw = clean(value);
  return UNSIGNED_ATOMIC.test(raw) ? raw : "";
}

function timestampIso(value) {
  if (value === undefined || value === null || value === "") return "";
  const n = Number(value);
  const ms = Number.isFinite(n) ? (n < 10_000_000_000 ? n * 1000 : n) : Date.parse(clean(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function requestBinding(normalized) {
  return {
    schema: "magen3.bridge-provider-request-binding.v1",
    adapterId: normalized.providerId,
    tradeType: normalized.tradeType,
    sourceChainId: normalized.sourceChainId,
    destinationChainId: normalized.destinationChainId,
    depositor: normalized.depositor,
    recipient: normalized.recipient,
    inputToken: normalized.inputToken,
    outputToken: normalized.outputToken,
    amountAtomic: normalized.amountAtomic,
    protectedTarget: normalized.protectedTarget,
    slippage: normalized.slippage,
  };
}

function evidenceCore(evidence) {
  const { evidenceHash: _evidenceHash, attestation: _attestation, ...core } = evidence || {};
  return core;
}

function attestationPayload(evidence) {
  return {
    schema: ATTESTATION_SCHEMA,
    schemaVersion: evidence.schemaVersion,
    adapterId: evidence.adapterId,
    adapterVersion: evidence.adapterVersion,
    environment: evidence.environment,
    requestBindingHash: evidence.requestBindingHash,
    routeFingerprint: evidence.routeFingerprint,
    payloadHash: evidence.payloadHash,
    providerQuoteId: evidence.providerQuoteId,
    providerResponseHash: evidence.providerResponseHash,
    evidenceHash: evidence.evidenceHash,
    completedAt: evidence.completedAt,
    quoteExpiresAt: evidence.quoteExpiresAt,
  };
}

function signEvidence(evidence, env = process.env) {
  const signature = createHmac("sha256", evidenceSecret(env)).update(stableJson(attestationPayload(evidence))).digest("hex");
  return {
    schema: ATTESTATION_SCHEMA,
    algorithm: "hmac-sha256",
    keyId: bounded(env.BRIDGE_PROVIDER_EVIDENCE_KEY_ID || "bridge-provider-default", 64),
    issuedAt: evidence.completedAt,
    signature,
  };
}

export function verifyBridgeProviderEvidence(evidence, { request = null, env = process.env, now = new Date(), maxAgeSeconds = null } = {}) {
  const errors = [];
  if (!evidence || typeof evidence !== "object") return { valid: false, errors: [{ field: "bridgeProviderEvidence", code: "MISSING_EVIDENCE" }] };
  if (evidence.status !== "succeeded") return { valid: false, errors: [{ field: "bridgeProviderEvidence.status", code: "EVIDENCE_NOT_SUCCESSFUL" }] };
  if (evidence.schemaVersion !== SCHEMA) errors.push({ field: "schemaVersion", code: "SCHEMA_MISMATCH" });
  if (normalizeProviderId(evidence.adapterId || evidence.providerId) !== ADAPTER_ID) errors.push({ field: "adapterId", code: "ADAPTER_MISMATCH" });
  if (evidence.environment !== "testnet") errors.push({ field: "environment", code: "ENVIRONMENT_MISMATCH" });

  let recomputedEvidenceHash = "";
  try {
    recomputedEvidenceHash = hash(evidenceCore(evidence));
    if (!SHA256.test(evidence.evidenceHash || "") || evidence.evidenceHash !== recomputedEvidenceHash) {
      errors.push({ field: "evidenceHash", code: "EVIDENCE_HASH_MISMATCH" });
    }
  } catch {
    errors.push({ field: "evidenceHash", code: "EVIDENCE_HASH_INVALID" });
  }

  const attestation = evidence.attestation || {};
  if (attestation.schema !== ATTESTATION_SCHEMA || attestation.algorithm !== "hmac-sha256" || !SHA256.test(attestation.signature || "")) {
    errors.push({ field: "attestation", code: "ATTESTATION_MISSING_OR_INVALID" });
  } else {
    try {
      const expected = createHmac("sha256", evidenceSecret(env)).update(stableJson(attestationPayload(evidence))).digest();
      const supplied = Buffer.from(attestation.signature, "hex");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        errors.push({ field: "attestation.signature", code: "ATTESTATION_SIGNATURE_MISMATCH" });
      }
    } catch (error) {
      errors.push({ field: "attestation", code: error.code || "ATTESTATION_UNAVAILABLE" });
    }
  }

  const completedAtMs = Date.parse(evidence.completedAt || "");
  const configuredMaxAge = providerConfig(env).maxEvidenceAgeSeconds;
  const effectiveMaxAge = Number.isFinite(Number(maxAgeSeconds)) ? Math.max(10, Math.min(configuredMaxAge, Math.trunc(Number(maxAgeSeconds)))) : configuredMaxAge;
  const maxAge = effectiveMaxAge * 1000;
  if (!Number.isFinite(completedAtMs)) errors.push({ field: "completedAt", code: "EVIDENCE_TIME_INVALID" });
  else if (now.getTime() - completedAtMs > maxAge) errors.push({ field: "completedAt", code: "EVIDENCE_STALE" });
  else if (completedAtMs - now.getTime() > 60_000) errors.push({ field: "completedAt", code: "EVIDENCE_FROM_FUTURE" });

  const expiryMs = Date.parse(evidence.quoteExpiresAt || "");
  if (evidence.quoteExpiresAt && (!Number.isFinite(expiryMs) || expiryMs <= now.getTime())) {
    errors.push({ field: "quoteExpiresAt", code: "QUOTE_EXPIRED" });
  }

  try {
    assertTestnetChainIds(evidence.sourceChainId, evidence.destinationChainId, env);
  } catch (error) {
    errors.push({ field: error.field || "chainId", code: error.code || "CHAIN_NOT_ALLOWED" });
  }

  if (request) {
    try {
      const normalized = normalizeBridgeProviderRequest(request);
      const bindingHash = hash(requestBinding(normalized));
      if (bindingHash !== evidence.requestBindingHash) errors.push({ field: "requestBindingHash", code: "REQUEST_BINDING_MISMATCH" });
    } catch (error) {
      errors.push({ field: error.field || "request", code: error.code || "REQUEST_INVALID" });
    }
  }

  return { valid: errors.length === 0, errors, recomputedEvidenceHash };
}

function normalizeQuote(body, normalized, now, env) {
  const sourceTransaction = txFrom(body.swapTx || body.transaction || body.tx, "swapTx");
  if (!sourceTransaction) {
    throw Object.assign(new Error("Bridge provider did not return an unsigned source transaction"), { code: "MISSING_SOURCE_TRANSACTION" });
  }
  if (sourceTransaction.chainId !== normalized.sourceChainId) {
    throw Object.assign(new Error("Provider source transaction chain does not match the protected source chain"), {
      code: "BRIDGE_NETWORK_MISMATCH",
      field: "bridgeSourceChainId",
    });
  }
  if (sourceTransaction.from && sourceTransaction.from !== normalized.depositor) {
    throw Object.assign(new Error("Provider source transaction sender differs from the protected depositor"), {
      code: "BRIDGE_DEPOSITOR_MISMATCH",
      field: "bridgeDepositor",
    });
  }
  if (normalized.protectedTarget && sourceTransaction.to !== normalized.protectedTarget) {
    throw Object.assign(new Error("Provider router differs from the protected bridge target"), {
      code: "BRIDGE_TARGET_MISMATCH",
      field: "target",
    });
  }

  const providerInput = atomicFrom(body.inputAmount ?? body.inputToken?.amount ?? body.bridge?.inputAmount ?? body.bridgeQuote?.inputAmount);
  if (providerInput && providerInput !== normalized.amountAtomic) {
    throw Object.assign(new Error("Provider quote input amount differs from the protected bridge amount"), {
      code: "BRIDGE_AMOUNT_MISMATCH",
      field: "bridgeAmountAtomic",
    });
  }

  const approvalTxnsRaw = Array.isArray(body.approvalTxns) ? body.approvalTxns.slice(0, MAX_APPROVAL_TXS) : [];
  const approvalTransactions = approvalTxnsRaw.map((tx, index) => txFrom(tx, `approvalTxns[${index}]`)).filter(Boolean);
  const outputAmountAtomic = atomicFrom(body.outputAmount ?? body.outputToken?.amount ?? body.bridge?.outputAmount ?? body.bridgeQuote?.outputAmount);
  const totalFeeAtomic = atomicFrom(body.fees?.total?.amount ?? body.fees?.totalFee ?? body.fees?.total?.value ?? body.totalFee);
  const quoteExpiresAt = timestampIso(body.quoteExpiryTimestamp || body.quoteExpiresAt || body.expiresAt);
  const expectedFillTimeSeconds = integer(body.expectedFillTime ?? body.expectedFillTimeSeconds, null, { min: 0, max: 7 * 24 * 3600 });
  const simulationSuccess = body.simulationSuccess === true || body.swapTx?.simulationSuccess === true;
  const payloadHash = hash(sourceTransaction);
  const binding = requestBinding(normalized);
  const requestBindingHash = hash(binding);
  const routeBinding = {
    schema: "magen3.bridge-provider-route-binding.v1",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    environment: "testnet",
    ...binding,
    outputAmountAtomic,
    sourceTransaction,
    approvalTransactions,
    quoteExpiresAt,
  };
  const routeFingerprint = hash(routeBinding);
  const providerResponseHash = hash(body);
  const providerQuoteId = bounded(body.id || body.quoteId || body.routeId || routeFingerprint, 160);

  const evidence = {
    schemaVersion: SCHEMA,
    status: "succeeded",
    requestedAt: now.toISOString(),
    completedAt: now.toISOString(),
    providerId: ADAPTER_ID,
    providerName: "Across Testnet",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    environment: "testnet",
    sourceChainId: normalized.sourceChainId,
    destinationChainId: normalized.destinationChainId,
    sourceNetwork: `eip155:${normalized.sourceChainId}`,
    destinationNetwork: `eip155:${normalized.destinationChainId}`,
    depositor: normalized.depositor,
    recipient: normalized.recipient,
    inputToken: normalized.inputToken,
    outputToken: normalized.outputToken,
    inputAmountAtomic: normalized.amountAtomic,
    outputAmountAtomic,
    tradeType: normalized.tradeType,
    sourceTransaction,
    approvalTransactions,
    providerQuoteId,
    providerQuoteHash: hash({ providerQuoteId, providerResponseHash, requestBindingHash }),
    providerResponseHash,
    requestBindingHash,
    routeFingerprint,
    payloadHash,
    quoteExpiresAt,
    expectedFillTimeSeconds,
    simulationSuccess,
    fees: { totalFeeAtomic },
    evidenceCompleteness: {
      sourceTransaction: "observed",
      providerSimulation: body.simulationSuccess !== undefined || body.swapTx?.simulationSuccess !== undefined ? "observed" : "unavailable",
      outputAmount: outputAmountAtomic ? "observed" : "unavailable",
      feeAmount: totalFeeAtomic ? "observed" : "unavailable",
      destinationSettlement: "not_observed_before_submission",
    },
    error: null,
  };
  evidence.evidenceHash = hash(evidenceCore(evidence));
  evidence.attestation = signEvidence(evidence, env);
  return evidence;
}

function suppliedEvidenceFromRequest(request = {}) {
  const evidence = request.bridgeProviderIntegrationEvidence || request.bridgeProviderEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const attestationString = clean(request.bridgeProviderAttestation);
  if (!evidence.attestation && attestationString) {
    evidence.attestation = {
      schema: ATTESTATION_SCHEMA,
      algorithm: "hmac-sha256",
      keyId: bounded(request.bridgeProviderAttestationKeyId || "bridge-provider-default", 64),
      issuedAt: evidence.completedAt || "",
      signature: lower(attestationString),
    };
  }
  return evidence;
}

export async function prepareBridgeProviderIntegration({ request = {}, env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (!bridgeApplicable(request)) {
    return { schemaVersion: SCHEMA, status: "not_applicable", adapterId: "", requestedAt: now.toISOString(), error: null };
  }

  const suppliedEvidence = suppliedEvidenceFromRequest(request);
  if (suppliedEvidence) {
    const verification = verifyBridgeProviderEvidence(suppliedEvidence, { request, env, now });
    if (verification.valid) return suppliedEvidence;
    return {
      ...suppliedEvidence,
      status: "invalidated",
      completedAt: now.toISOString(),
      error: {
        code: verification.errors[0]?.code || "BRIDGE_PROVIDER_EVIDENCE_INVALID",
        field: verification.errors[0]?.field || "bridgeProviderEvidence",
        message: "The supplied bridge-provider evidence failed cryptographic, freshness, or intent-binding verification.",
      },
      verificationErrors: verification.errors.slice(0, 20),
    };
  }

  let normalized;
  try {
    normalized = normalizeBridgeProviderRequest(request);
    if (normalized.requested && !normalized.unsupported) assertTestnetChainIds(normalized.sourceChainId, normalized.destinationChainId, env);
  } catch (error) {
    return {
      schemaVersion: SCHEMA,
      status: error.code === "UNSUPPORTED_BRIDGE_TRADE_TYPE" ? "unsupported" : "failed",
      adapterId: normalizeProviderId(request.bridgeProviderId || request.bridgeAdapterId),
      requestedAt: now.toISOString(),
      completedAt: now.toISOString(),
      error: { code: error.code || "INVALID_BRIDGE_REQUEST", field: error.field || "", message: bounded(error.message, 240) },
    };
  }

  if (!normalized.requested) return { schemaVersion: SCHEMA, status: "not_requested", adapterId: "", requestedAt: now.toISOString(), error: null };
  if (normalized.unsupported) {
    return {
      schemaVersion: SCHEMA,
      status: "unsupported",
      adapterId: normalized.providerId,
      requestedAt: now.toISOString(),
      completedAt: now.toISOString(),
      error: {
        code: "UNSUPPORTED_BRIDGE_PROVIDER",
        field: "bridgeProviderId",
        message: "No live testnet adapter is registered for the requested bridge provider.",
      },
    };
  }

  try {
    evidenceSecret(env);
    const { body } = await providerGet("/swap/approval", {
      tradeType: normalized.tradeType,
      amount: normalized.amountAtomic,
      inputToken: normalized.inputToken,
      outputToken: normalized.outputToken,
      originChainId: normalized.sourceChainId,
      destinationChainId: normalized.destinationChainId,
      depositor: normalized.depositor,
      recipient: normalized.recipient,
      slippage: normalized.slippage,
    }, { env, fetchImpl });
    return normalizeQuote(body, normalized, now, env);
  } catch (error) {
    return {
      schemaVersion: SCHEMA,
      status: error.code === "BRIDGE_PROVIDER_TIMEOUT" ? "timed_out" : "unavailable",
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      providerId: ADAPTER_ID,
      providerName: "Across Testnet",
      environment: "testnet",
      requestedAt: now.toISOString(),
      completedAt: now.toISOString(),
      error: { code: error.code || "BRIDGE_PROVIDER_UNAVAILABLE", field: error.field || "", message: bounded(error.message, 240) },
    };
  }
}

function quoteBodyToRequest(body = {}) {
  const bridge = body.bridge && typeof body.bridge === "object" ? body.bridge : body;
  return {
    actionType: "Bridge",
    targetType: "Bridge Contract",
    target: bridge.target || bridge.router || bridge.sourceTransactionTarget || "",
    executionWalletAddress: bridge.executionWalletAddress || bridge.walletAddress || bridge.depositor || "",
    bridgeProviderId: bridge.providerId || bridge.bridgeProviderId || ADAPTER_ID,
    bridgeSourceChainId: bridge.sourceChainId || bridge.originChainId,
    bridgeDestinationChainId: bridge.destinationChainId,
    bridgeInputToken: bridge.inputToken || bridge.sourceToken,
    bridgeOutputToken: bridge.outputToken || bridge.destinationToken,
    bridgeAmountAtomic: bridge.amountAtomic || bridge.amount,
    bridgeDepositor: bridge.depositor || bridge.executionWalletAddress || bridge.walletAddress,
    bridgeRecipient: bridge.recipient || bridge.destinationAddress,
    bridgeDestinationAddress: bridge.destinationAddress || bridge.recipient,
    bridgeTradeType: bridge.tradeType || "exactInput",
    bridgeSlippage: bridge.slippage,
  };
}

export async function requestBridgeProviderQuote({ body = {}, env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const request = quoteBodyToRequest(body);
  const evidence = await prepareBridgeProviderIntegration({ request, env, fetchImpl, now });
  if (evidence.status !== "succeeded") {
    const error = new Error(evidence.error?.message || "Bridge provider quote could not be prepared");
    error.status = evidence.status === "unsupported" || evidence.status === "failed" ? 400 : 503;
    error.code = evidence.error?.code || "BRIDGE_PROVIDER_QUOTE_FAILED";
    error.details = { status: evidence.status, field: evidence.error?.field || "" };
    throw error;
  }
  return {
    ok: true,
    provider: { id: evidence.providerId, name: evidence.providerName, environment: evidence.environment },
    evidence,
    protectedIntent: {
      actionType: "Bridge",
      bridge: {
        providerId: evidence.providerId,
        sourceChainId: evidence.sourceChainId,
        destinationChainId: evidence.destinationChainId,
        sourceToken: evidence.inputToken,
        destinationToken: evidence.outputToken,
        amountAtomic: evidence.inputAmountAtomic,
        depositor: evidence.depositor,
        recipient: evidence.recipient,
        tradeType: evidence.tradeType,
        providerQuoteId: evidence.providerQuoteId,
        providerQuoteHash: evidence.providerQuoteHash,
        providerRouteHash: evidence.routeFingerprint,
        providerPayloadHash: evidence.payloadHash,
        providerEvidence: evidence,
        providerAttestation: evidence.attestation.signature,
        sourceTransaction: evidence.sourceTransaction,
        approvalTransactions: evidence.approvalTransactions,
      },
    },
    unsignedTransactions: {
      approvals: evidence.approvalTransactions,
      bridge: evidence.sourceTransaction,
    },
  };
}

export async function discoverBridgeProviderChains({ providerId = ADAPTER_ID, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (normalizeProviderId(providerId) !== ADAPTER_ID) return { status: "unsupported", providerId: normalizeProviderId(providerId), chains: [] };
  const { body } = await providerGet("/swap/chains", {}, { env, fetchImpl });
  const chains = Array.isArray(body) ? body : Array.isArray(body.chains) ? body.chains : [];
  return { status: "available", providerId: ADAPTER_ID, environment: "testnet", chains: chains.slice(0, 500) };
}

export async function discoverBridgeProviderTokens({ providerId = ADAPTER_ID, chainId, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (normalizeProviderId(providerId) !== ADAPTER_ID) return { status: "unsupported", providerId: normalizeProviderId(providerId), tokens: [] };
  const normalizedChainId = requireChainId(chainId, "chainId");
  assertSingleTestnetChainId(normalizedChainId, "chainId", env);
  const { body } = await providerGet("/swap/tokens", { chainId: normalizedChainId }, { env, fetchImpl });
  const tokens = Array.isArray(body) ? body : Array.isArray(body.tokens) ? body.tokens : [];
  return { status: "available", providerId: ADAPTER_ID, environment: "testnet", chainId: normalizedChainId, tokens: tokens.slice(0, 2000) };
}

export async function pollBridgeProviderTransfer({ body = null, providerId = ADAPTER_ID, depositTransactionHash = "", env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const input = body && typeof body === "object" ? body : {};
  const resolvedProviderId = input.providerId || input.bridgeProviderId || providerId;
  const resolvedTransactionHash = input.depositTxnRef || input.depositTransactionHash || input.transactionHash || depositTransactionHash;
  if (normalizeProviderId(resolvedProviderId) !== ADAPTER_ID) {
    return { status: "unsupported", providerId: normalizeProviderId(resolvedProviderId), checkedAt: now.toISOString(), observedAt: now.toISOString() };
  }
  const txHash = lower(resolvedTransactionHash);
  if (!EVM_HASH.test(txHash)) {
    throw Object.assign(new Error("depositTransactionHash must be a 32-byte EVM transaction hash"), { status: 400, code: "INVALID_DEPOSIT_TRANSACTION_HASH" });
  }
  try {
    const { body: providerBody } = await providerGet("/deposit/status", { depositTxnRef: txHash }, { env, fetchImpl });
    const rawStatus = lower(providerBody.status || providerBody.depositStatus);
    const mapped = rawStatus === "filled" ? "delivered"
      : rawStatus === "refunded" ? "refunded"
      : rawStatus === "expired" || rawStatus === "failed" ? "failed"
      : ["pending", "received", "unfilled", "deposit_received"].includes(rawStatus) ? "pending"
      : "uncertain";
    const destinationTransactionHash = lower(providerBody.fillTxnRef || providerBody.fillTx || providerBody.fillTxHash || providerBody.destinationTxHash);
    const refundTransactionHash = lower(providerBody.refundTxnRef || providerBody.refundTxHash || providerBody.refundTransactionHash);
    const providerReference = bounded(providerBody.depositId || providerBody.id || txHash, 160);
    const observedAt = now.toISOString();
    return {
      status: mapped,
      providerStatus: rawStatus || "unknown",
      providerId: ADAPTER_ID,
      provider: "Across Testnet",
      checkedAt: observedAt,
      observedAt,
      depositTransactionHash: txHash,
      transactionHash: txHash,
      destinationTransactionHash,
      refundTransactionHash,
      fillTimestamp: timestampIso(providerBody.fillTimestamp || providerBody.filledAt),
      providerReference,
      evidenceReference: providerReference,
      failureReason: mapped === "failed" ? bounded(providerBody.message || "Across testnet reported a failed or expired deposit.", 240) : "",
    };
  } catch (error) {
    const observedAt = now.toISOString();
    return {
      status: error.code === "BRIDGE_PROVIDER_TIMEOUT" ? "pending" : "uncertain",
      providerStatus: "unavailable",
      providerId: ADAPTER_ID,
      provider: "Across Testnet",
      checkedAt: observedAt,
      observedAt,
      depositTransactionHash: txHash,
      transactionHash: txHash,
      destinationTransactionHash: "",
      providerReference: txHash,
      error: bounded(error.message, 240),
      failureReason: bounded(error.message, 240),
    };
  }
}

function policyConfig(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const nested = rules.bridgeProviderIntegration && typeof rules.bridgeProviderIntegration === "object" ? rules.bridgeProviderIntegration : {};
  const list = (value) => [...new Set((Array.isArray(value) ? value : []).map(normalizeProviderId).filter(Boolean))];
  return {
    enabled: nested.enabled === true || rules.bridgeProviderIntegrationEnabled === true,
    required: nested.required === true || rules.bridgeProviderIntegrationRequired === true || rules.bridgeRequireProviderQuote === true,
    allowedAdapters: list(nested.allowedAdapters || rules.bridgeProviderAllowedAdapters),
    unsupportedAction: actionFor(nested.unsupportedAction || rules.bridgeProviderUnsupportedAction, "review"),
    unavailableAction: actionFor(nested.unavailableAction || rules.bridgeProviderUnavailableAction, "review"),
    quoteFailureAction: actionFor(nested.quoteFailureAction || rules.bridgeProviderQuoteFailureAction, "block"),
    payloadMismatchAction: actionFor(nested.payloadMismatchAction || rules.bridgeProviderPayloadMismatchAction, "block"),
    requirePayloadBinding: nested.requirePayloadBinding !== false && rules.bridgeRequirePayloadBinding !== false,
    requireProviderSimulationSuccess: nested.requireProviderSimulationSuccess === true || rules.bridgeRequireProviderSimulationSuccess === true,
    requireTestnet: nested.requireTestnet !== false && rules.bridgeRequireTestnet !== false,
    maximumEvidenceAgeSeconds: integer(nested.maximumEvidenceAgeSeconds || rules.bridgeMaxProviderEvidenceAgeSeconds, DEFAULT_MAX_EVIDENCE_AGE_SECONDS, { min: 10, max: 3600 }),
  };
}

function finding({ status = "pass", severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Bridge Provider Integration", status, severity, rule, message, evidence, remediation };
}

function apply(state, action, details) {
  if (action === "allow") return;
  if (action === "warn") {
    state.findings.push(finding({ ...details, status: "warning", severity: "low" }));
    return;
  }
  state.checksFailed.push(details.message);
  if (action === "block") {
    state.hardBlock = true;
    state.scoreDelta += 35;
    state.findings.push(finding({ ...details, status: "fail", severity: "high" }));
  } else {
    state.needsReview = true;
    state.scoreDelta += 18;
    state.findings.push(finding({ ...details, status: "warning", severity: "medium" }));
  }
}

export function evaluateBridgeProviderIntegration({ request = {}, policy = {}, env = process.env, now = new Date() } = {}) {
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const config = policyConfig(policy);
  const applicable = bridgeApplicable(request);
  const evidence = request.bridgeProviderIntegrationEvidence || request.bridgeProviderEvidence || null;

  if (!applicable || (!config.enabled && !config.required && !request.bridgeProviderId && !evidence)) {
    return { ...state, context: { status: "not_required", required: config.required } };
  }
  if (!evidence || evidence.status === "not_requested") {
    if (config.required) {
      apply(state, config.unavailableAction, {
        rule: "Required bridge provider evidence",
        message: "The policy requires a real bridge-provider quote before signing.",
        evidence: { status: evidence?.status || "missing" },
        remediation: "Select a supported testnet bridge provider and obtain a fresh protected quote.",
      });
    }
    return { ...state, context: { status: config.required ? (state.hardBlock ? "blocked" : "review_required") : "not_requested", required: config.required } };
  }

  const context = { ...evidence, required: config.required };
  if (config.allowedAdapters.length && !config.allowedAdapters.includes(normalizeProviderId(evidence.adapterId))) {
    apply(state, "block", {
      rule: "Allowed bridge adapter",
      message: "The selected bridge adapter is not allowed by policy.",
      evidence: { adapterId: evidence.adapterId, allowedAdapters: config.allowedAdapters },
    });
  }
  if (config.requireTestnet && evidence.environment && evidence.environment !== "testnet") {
    apply(state, "block", {
      rule: "Testnet-only bridge execution",
      message: "This Magen3 deployment permits real bridge execution only on testnets.",
      evidence: { environment: evidence.environment },
    });
  }

  if (evidence.status === "unsupported") {
    apply(state, config.unsupportedAction, {
      rule: "Bridge provider support",
      message: evidence.error?.message || "The requested bridge provider is unsupported.",
      evidence: { adapterId: evidence.adapterId, status: evidence.status },
      remediation: "Use a supported testnet adapter or change the policy fallback.",
    });
  } else if (["unavailable", "timed_out"].includes(evidence.status)) {
    apply(state, config.unavailableAction, {
      rule: "Bridge provider availability",
      message: evidence.error?.message || "Bridge provider evidence is unavailable.",
      evidence: { adapterId: evidence.adapterId, status: evidence.status },
      remediation: "Retry with the configured testnet provider or require human review.",
    });
  } else if (["failed", "invalidated"].includes(evidence.status)) {
    apply(state, config.quoteFailureAction, {
      rule: evidence.status === "invalidated" ? "Bridge evidence attestation" : "Bridge quote construction",
      message: evidence.error?.message || "The bridge quote failed protected validation.",
      evidence: { code: evidence.error?.code, field: evidence.error?.field, verificationErrors: evidence.verificationErrors?.slice?.(0, 10) },
      remediation: "Correct the named protected field and request a new provider quote.",
    });
  } else if (evidence.status === "succeeded") {
    const verification = verifyBridgeProviderEvidence(evidence, { request, env, now, maxAgeSeconds: config.maximumEvidenceAgeSeconds });
    if (!verification.valid) {
      apply(state, config.payloadMismatchAction, {
        rule: "Bridge evidence attestation",
        message: "The bridge-provider evidence failed cryptographic, freshness, testnet, or intent-binding verification.",
        evidence: { errors: verification.errors.slice(0, 20) },
        remediation: "Discard the evidence and request a fresh protected quote for the unchanged intent.",
      });
    }

    const mismatches = [];
    const compare = (field, expected, observed) => {
      if (expected !== undefined && expected !== null && clean(expected) !== "" && lower(expected) !== lower(observed)) {
        mismatches.push({ field, expected: clean(expected), observed: clean(observed) });
      }
    };
    compare("bridgeSourceChainId", request.bridgeSourceChainId || request.bridgeOriginChainId, evidence.sourceChainId);
    compare("bridgeDestinationChainId", request.bridgeDestinationChainId, evidence.destinationChainId);
    compare("bridgeDepositor", request.bridgeDepositor || request.executionWalletAddress, evidence.depositor);
    compare("bridgeRecipient", request.bridgeRecipient || request.bridgeDestinationAddress, evidence.recipient);
    compare("bridgeInputToken", request.bridgeInputToken || request.assetContractAddress, evidence.inputToken);
    compare("bridgeOutputToken", request.bridgeOutputToken, evidence.outputToken);
    compare("bridgeAmountAtomic", request.bridgeAmountAtomic, evidence.inputAmountAtomic);
    compare("target", request.target, evidence.sourceTransaction?.to);
    compare("bridgeProviderQuoteId", request.bridgeProviderQuoteId, evidence.providerQuoteId);
    compare("bridgeProviderQuoteHash", request.bridgeProviderQuoteHash, evidence.providerQuoteHash);
    compare("bridgeProviderRouteHash", request.bridgeProviderRouteHash, evidence.routeFingerprint);
    compare("bridgeProviderPayloadHash", request.bridgeProviderPayloadHash, evidence.payloadHash);
    compare("bridgeSourceTransactionTo", request.bridgeSourceTransactionTo, evidence.sourceTransaction?.to);
    compare("bridgeSourceTransactionData", request.bridgeSourceTransactionData, evidence.sourceTransaction?.data);
    compare("bridgeSourceTransactionDataHash", request.bridgeSourceTransactionDataHash, evidence.sourceTransaction?.dataHash);
    compare("bridgeSourceTransactionValue", request.bridgeSourceTransactionValue, evidence.sourceTransaction?.value);

    let recomputedPayloadHash = "";
    try { recomputedPayloadHash = hash(evidence.sourceTransaction); } catch {}
    if (config.requirePayloadBinding && (!evidence.payloadHash || evidence.payloadHash !== recomputedPayloadHash)) {
      mismatches.push({ field: "bridgeProviderPayloadHash", expected: evidence.payloadHash, observed: recomputedPayloadHash });
    }

    if (mismatches.length) {
      apply(state, config.payloadMismatchAction, {
        rule: "Bridge payload binding",
        message: "The provider-produced bridge payload differs from the protected bridge instruction.",
        evidence: { mismatches: mismatches.slice(0, 30) },
        remediation: "Discard the quote and request a new provider transaction from the unchanged protected intent.",
      });
    } else if (verification.valid) {
      state.checksPassed.push("Bridge provider quote and unsigned source transaction are cryptographically bound to the protected intent.");
      state.findings.push(finding({
        rule: "Bridge payload binding",
        message: "The Across testnet quote and unsigned source transaction match the protected bridge fields.",
        evidence: {
          routeFingerprint: evidence.routeFingerprint,
          payloadHash: evidence.payloadHash,
          providerQuoteId: evidence.providerQuoteId,
          evidenceHash: evidence.evidenceHash,
          attestationKeyId: evidence.attestation?.keyId,
        },
      }));
    }

    if (config.requireProviderSimulationSuccess && evidence.simulationSuccess !== true) {
      apply(state, config.unavailableAction, {
        rule: "Provider source-transaction simulation",
        message: "The policy requires a positive provider simulation result, but one was not verified.",
        evidence: { simulationSuccess: evidence.simulationSuccess, completeness: evidence.evidenceCompleteness?.providerSimulation },
      });
    }
  }

  context.status = state.hardBlock ? "blocked" : state.needsReview ? "review_required" : evidence.status === "succeeded" ? "passed" : evidence.status;
  return { ...state, context };
}

export function applyBridgeProviderEvidenceToRequest(request = {}, evidence = null) {
  if (!evidence || evidence.status !== "succeeded") {
    return { ...request, bridgeProviderIntegrationEvidence: evidence, bridgeProviderEvidence: evidence };
  }
  let feeBps = request.bridgeFeeBps;
  if (!feeBps && evidence.fees?.totalFeeAtomic && evidence.inputAmountAtomic) {
    try { feeBps = Number((BigInt(evidence.fees.totalFeeAtomic) * 10_000n) / BigInt(evidence.inputAmountAtomic)); } catch {}
  }
  return {
    ...request,
    bridgeProviderIntegrationEvidence: evidence,
    bridgeProviderEvidence: evidence,
    bridgeProviderAttestation: evidence.attestation?.signature || request.bridgeProviderAttestation,
    bridgeProvider: evidence.providerName,
    bridgeProviderId: evidence.providerId,
    bridgeRouteId: evidence.providerQuoteId,
    bridgeProviderQuoteId: evidence.providerQuoteId,
    bridgeProviderQuoteHash: evidence.providerQuoteHash,
    bridgeProviderRouteHash: evidence.routeFingerprint,
    bridgeProviderPayloadHash: evidence.payloadHash,
    bridgeSourceChain: evidence.sourceNetwork,
    bridgeDestinationChain: evidence.destinationNetwork,
    bridgeSourceChainId: evidence.sourceChainId,
    bridgeOriginChainId: evidence.sourceChainId,
    bridgeDestinationChainId: evidence.destinationChainId,
    bridgeInputToken: evidence.inputToken,
    bridgeOutputToken: evidence.outputToken,
    bridgeAmountAtomic: evidence.inputAmountAtomic,
    bridgeDepositor: evidence.depositor,
    bridgeRecipient: evidence.recipient,
    bridgeDestinationAddress: evidence.recipient,
    bridgeFeeAmount: evidence.fees?.totalFeeAtomic || request.bridgeFeeAmount,
    bridgeFeeBps: feeBps,
    bridgeExpectedOutput: evidence.outputAmountAtomic || request.bridgeExpectedOutput,
    bridgeExpectedOutputAtomic: evidence.outputAmountAtomic || request.bridgeExpectedOutputAtomic,
    bridgeQuoteTimestamp: evidence.completedAt,
    bridgeQuoteExpiresAt: evidence.quoteExpiresAt,
    bridgeSourceTransactionTo: evidence.sourceTransaction?.to || "",
    bridgeSourceTransactionData: evidence.sourceTransaction?.data || "",
    bridgeSourceTransactionDataHash: evidence.sourceTransaction?.dataHash || "",
    bridgeSourceTransactionValue: evidence.sourceTransaction?.value || "",
    bridgeSourceTransactionGas: evidence.sourceTransaction?.gas || "",
    bridgeApprovalTransactions: evidence.approvalTransactions || [],
    chainName: evidence.sourceNetwork,
    chainId: evidence.sourceChainId,
    target: evidence.sourceTransaction?.to || request.target,
  };
}

export function summarizeBridgeProviderIntegration(evidence) {
  if (!evidence) return undefined;
  return {
    status: evidence.status,
    providerId: evidence.providerId || evidence.adapterId || "",
    adapterId: evidence.adapterId || evidence.providerId || "",
    adapterVersion: evidence.adapterVersion || "",
    providerName: evidence.providerName || "",
    environment: evidence.environment || "",
    sourceNetwork: evidence.sourceNetwork || "",
    destinationNetwork: evidence.destinationNetwork || "",
    sourceChainId: evidence.sourceChainId || "",
    destinationChainId: evidence.destinationChainId || "",
    providerQuoteId: evidence.providerQuoteId || "",
    providerQuoteHash: evidence.providerQuoteHash || "",
    routeFingerprint: evidence.routeFingerprint || "",
    payloadHash: evidence.payloadHash || "",
    evidenceHash: evidence.evidenceHash || "",
    attestation: evidence.attestation ? {
      schema: evidence.attestation.schema,
      algorithm: evidence.attestation.algorithm,
      keyId: evidence.attestation.keyId,
      issuedAt: evidence.attestation.issuedAt,
      signatureHash: hash(evidence.attestation.signature || ""),
    } : null,
    quoteExpiresAt: evidence.quoteExpiresAt || "",
    simulationSuccess: evidence.simulationSuccess === true,
    sourceTransaction: evidence.sourceTransaction || undefined,
    approvalTransactions: evidence.approvalTransactions || [],
    depositor: evidence.depositor || "",
    recipient: evidence.recipient || "",
    inputToken: evidence.inputToken || "",
    outputToken: evidence.outputToken || "",
    inputAmountAtomic: evidence.inputAmountAtomic || "",
    outputAmountAtomic: evidence.outputAmountAtomic || "",
    fees: evidence.fees ? { totalFeeAtomic: evidence.fees.totalFeeAtomic || "" } : undefined,
    expectedFillTimeSeconds: evidence.expectedFillTimeSeconds ?? null,
    evidenceCompleteness: evidence.evidenceCompleteness || {},
    error: evidence.error ? { code: evidence.error.code || "", field: evidence.error.field || "", message: evidence.error.message || "" } : null,
  };
}

export function getBridgeProviderIntegrationStatus(env = process.env) {
  try {
    const config = providerConfig(env);
    let attestationConfigured = true;
    try { evidenceSecret(env); } catch { attestationConfigured = false; }
    return {
      status: attestationConfigured ? "foundation_available" : "configuration_required",
      providerId: ADAPTER_ID,
      providerName: "Across Testnet",
      environment: "testnet",
      configuredBaseHost: new URL(config.baseUrl).hostname,
      allowedTestnetChainIds: [...config.allowedTestnetChainIds].map(Number),
      tradeTypes: ["exactInput"],
      quoteAttestation: attestationConfigured,
      sourceTransactionConstruction: true,
      destinationStatusTracking: true,
      signing: false,
      submission: false,
      mainnetEnabled: false,
    };
  } catch (error) {
    return {
      status: "unavailable",
      providerId: ADAPTER_ID,
      providerName: "Across Testnet",
      environment: "testnet",
      mainnetEnabled: false,
      error: bounded(error.message, 240),
    };
  }
}
