import { resolve } from "node:path";
import { readUtf8FileLimited } from "./safeFeedFile.mjs";
import { collectOracleProviderEvidence, getOracleProviderCapabilities, resetOracleProviderRuntime } from "./oracleProviders.mjs";
import { averageInteger, decimalToScaled, deviationBps as exactDeviationBps, divideDecimal, medianDecimal, normalizeDecimal, spreadBps as exactSpreadBps } from "./oracleDecimal.mjs";

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_FEED_AGE_MS = 5 * 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;
const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_FEED_BYTES = 1_000_000;
const MAX_OBSERVATIONS = 5_000;

let cached = null;

function clean(value) {
  return String(value ?? "").trim();
}

function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function safeNumber(value, fallback, { min = -Number.MAX_VALUE, max = Number.MAX_VALUE } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeAsset(value) {
  const normalized = clean(value).toUpperCase().replace(/[^A-Z0-9._-]/g, "");
  return normalized.slice(0, 32);
}

function normalizeMode(value) {
  const normalized = clean(value).toLowerCase();
  if (["enforce", "block"].includes(normalized)) return "Enforce";
  if (["review", "manual review"].includes(normalized)) return "Review";
  return "Observe";
}

function normalizeUnavailableAction(value) {
  const normalized = clean(value).toLowerCase();
  if (["block", "fail closed", "fail-closed"].includes(normalized)) return "Block";
  if (["review", "manual review"].includes(normalized)) return "Review";
  return "Warn";
}

function parseJson(raw, label) {
  if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) throw new Error(`${label} exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function readRemoteBodyLimited(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FEED_BYTES) {
    throw new Error(`Oracle feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) throw new Error(`Oracle feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
    return raw;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_FEED_BYTES) {
        await reader.cancel("Oracle feed exceeded the safety limit").catch(() => {});
        throw new Error(`Oracle feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } finally {
    reader.releaseLock();
  }
}

function pairKey(baseAsset, quoteAsset) {
  const base = normalizeAsset(baseAsset);
  const quote = normalizeAsset(quoteAsset);
  return base && quote ? `${base}/${quote}` : "";
}

function normalizeObservation(raw, index, defaultSource, generatedAt) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const baseAsset = normalizeAsset(raw.baseAsset || raw.base || raw.fromAsset || raw.from);
  const quoteAsset = normalizeAsset(raw.quoteAsset || raw.quote || raw.toAsset || raw.to);
  let normalizedPrice;
  try { normalizedPrice = normalizeDecimal(raw.normalizedPrice ?? raw.price ?? raw.value ?? raw.rate); } catch { return null; }
  const price = Number(normalizedPrice);
  if (!baseAsset || !quoteAsset || baseAsset === quoteAsset || !Number.isFinite(price) || price <= 0) return null;
  const observedAtRaw = clean(raw.observedAt || raw.observed_at || raw.timestamp || generatedAt);
  const observedAtMs = Date.parse(observedAtRaw);
  if (!Number.isFinite(observedAtMs)) return null;
  return {
    id: clean(raw.id) || `quote-${index + 1}`,
    pair: `${baseAsset}/${quoteAsset}`,
    baseAsset,
    quoteAsset,
    price,
    normalizedPrice,
    confidenceInterval: clean(raw.confidenceInterval || raw.confidence_interval),
    providerId: clean(raw.providerId || raw.provider_id),
    providerVersion: clean(raw.providerVersion || raw.provider_version),
    feedIdentifier: clean(raw.feedIdentifier || raw.feed_identifier),
    evidenceHash: clean(raw.evidenceHash || raw.evidence_hash),
    cached: raw.cached === true,
    confidence: safeInteger(raw.confidence, 50, { min: 0, max: 100 }),
    source: clean(raw.source || raw.provider) || defaultSource || "oracle-source",
    observedAt: new Date(observedAtMs).toISOString(),
  };
}

export function normalizeOracleFeed(raw, { sourceType = "unknown", sourceName = "Oracle feed", now = new Date() } = {}) {
  const root = Array.isArray(raw) ? { observations: raw } : raw && typeof raw === "object" ? raw : {};
  const supplied = Array.isArray(root.observations) ? root.observations : Array.isArray(root.quotes) ? root.quotes : [];
  if (supplied.length > MAX_OBSERVATIONS) throw new Error(`Oracle feed exceeds the ${MAX_OBSERVATIONS}-observation safety limit`);

  const generatedAtRaw = clean(root.generatedAt || root.generated_at || root.updatedAt || root.updated_at);
  const generatedAtMs = Date.parse(generatedAtRaw);
  const generatedAt = Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString() : "";
  const normalizedSourceName = clean(root.source || root.name) || sourceName;
  const observations = supplied
    .map((item, index) => normalizeObservation(item, index, normalizedSourceName, generatedAt))
    .filter(Boolean);

  return {
    status: "available",
    sourceType,
    sourceName: normalizedSourceName,
    version: clean(root.version) || "1",
    generatedAt,
    fetchedAt: now.toISOString(),
    observationCount: observations.length,
    pairCount: new Set(observations.map((item) => item.pair)).size,
    observations,
    error: "",
  };
}

function configuredSource(env = process.env) {
  const inline = clean(env.ORACLE_VALIDATION_FEED_JSON);
  if (inline) return { type: "inline", value: inline, name: "ORACLE_VALIDATION_FEED_JSON" };
  const filePath = clean(env.ORACLE_VALIDATION_FEED_PATH);
  if (filePath) {
    const resolvedPath = resolve(filePath);
    return { type: "file", value: resolvedPath, name: resolvedPath };
  }
  const remoteUrl = clean(env.ORACLE_VALIDATION_FEED_URL);
  if (remoteUrl) return { type: "remote", value: remoteUrl, name: remoteUrl };
  return null;
}

function cacheKey(source, env = process.env) {
  if (!source) return "none";
  const authenticationMode = clean(env.ORACLE_VALIDATION_API_KEY) ? "bearer" : "none";
  return [source.type, source.value, clean(env.ORACLE_VALIDATION_MAX_FEED_AGE_MS), clean(env.ORACLE_VALIDATION_CACHE_TTL_MS), authenticationMode].join("|");
}

function validateRemoteUrl(value, env = process.env) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const localDevelopment = ["localhost", "127.0.0.1", "::1"].includes(hostname) && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !localDevelopment) throw new Error("ORACLE_VALIDATION_FEED_URL must use HTTPS in production");
  if (url.username || url.password) throw new Error("Oracle feed URLs must not contain credentials");
  const privateHost = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i.test(hostname);
  if (privateHost && !localDevelopment) throw new Error("Oracle feed URL cannot target a local or private host");
  if (env.NODE_ENV === "production") {
    const allowedHosts = clean(env.ORACLE_VALIDATION_ALLOWED_FEED_HOSTS).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!allowedHosts.includes(hostname)) throw new Error("Oracle feed host is not in ORACLE_VALIDATION_ALLOWED_FEED_HOSTS");
  }
  return url;
}

async function loadConfiguredFeed(source, { env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (source.type === "inline") return normalizeOracleFeed(parseJson(source.value, source.name), { sourceType: "inline", sourceName: source.name, now });
  if (source.type === "file") {
    const raw = await readUtf8FileLimited(source.value, { maxBytes: MAX_FEED_BYTES, sourceLabel: source.name });
    return normalizeOracleFeed(parseJson(raw, source.name), { sourceType: "file", sourceName: "Configured local oracle feed", now });
  }
  if (typeof fetchImpl !== "function") throw new Error("Remote Oracle Validation requires fetch support");
  const url = validateRemoteUrl(source.value, env);
  const timeoutMs = safeInteger(env.ORACLE_VALIDATION_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, { min: 250, max: 15_000 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    const apiKey = clean(env.ORACLE_VALIDATION_API_KEY);
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`Oracle feed returned HTTP ${response.status}`);
    const raw = await readRemoteBodyLimited(response);
    return normalizeOracleFeed(parseJson(raw, "Oracle feed"), { sourceType: "remote", sourceName: url.hostname, now });
  } finally {
    clearTimeout(timeout);
  }
}

function applyFreshness(snapshot, { env = process.env, now = new Date() } = {}) {
  const maxAgeMs = safeInteger(env.ORACLE_VALIDATION_MAX_FEED_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 1_000, max: 7 * 24 * 60 * 60_000 });
  const generatedAtMs = Date.parse(snapshot.generatedAt || "");
  const ageMs = Number.isFinite(generatedAtMs) ? now.getTime() - generatedAtMs : null;
  const stale = ageMs === null || ageMs > maxAgeMs || ageMs < -MAX_FUTURE_SKEW_MS;
  return {
    ...snapshot,
    status: stale ? "stale" : snapshot.status,
    ageMs,
    maxAgeMs,
    error: stale ? (ageMs === null ? "Oracle feed has no valid generatedAt timestamp." : ageMs < 0 ? "Oracle feed timestamp is too far in the future." : "Oracle feed is stale.") : snapshot.error,
  };
}

export async function getOracleValidationSnapshot({ force = false, env = process.env, fetchImpl = globalThis.fetch, now = new Date(), request = {} } = {}) {
  const source = configuredSource(env);
  let legacySnapshot = null;
  if (source) {
    const key = cacheKey(source, env);
    const ttlMs = safeInteger(env.ORACLE_VALIDATION_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, { min: 1_000, max: 60 * 60_000 });
    if (!force && cached && cached.key === key && now.getTime() - cached.loadedAt < ttlMs) legacySnapshot = applyFreshness(cached.snapshot, { env, now });
    else {
      try {
        const loaded = await loadConfiguredFeed(source, { env, fetchImpl, now });
        cached = { key, loadedAt: now.getTime(), snapshot: loaded };
        legacySnapshot = applyFreshness(loaded, { env, now });
      } catch (cause) {
        legacySnapshot = { status: "unavailable", sourceType: source.type, sourceName: source.type === "remote" ? new URL(source.value).hostname : source.type === "file" ? "Configured local oracle feed" : source.name, generatedAt: "", fetchedAt: now.toISOString(), observationCount: 0, pairCount: 0, observations: [], ageMs: null, maxAgeMs: safeInteger(env.ORACLE_VALIDATION_MAX_FEED_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 1_000 }), error: cause instanceof Error ? cause.message : "Oracle feed could not be loaded." };
      }
    }
  }
  const provider = await collectOracleProviderEvidence({ request, env, fetchImpl, now });
  const providerObservations = provider.observations || [];
  const legacyObservations = Array.isArray(legacySnapshot?.observations) ? legacySnapshot.observations : [];
  const observations = [...legacyObservations, ...providerObservations].slice(0, MAX_OBSERVATIONS);
  const providerAvailable = providerObservations.length > 0;
  const legacyAvailable = legacySnapshot?.status === "available";
  const generatedTimes = observations.map((item) => Date.parse(item.observedAt || "")).filter(Number.isFinite);
  const generatedAt = generatedTimes.length ? new Date(Math.max(...generatedTimes)).toISOString() : legacySnapshot?.generatedAt || "";
  const sourceType = providerAvailable && legacyAvailable ? "composite" : providerAvailable ? "provider" : legacySnapshot?.sourceType || "none";
  const sourceName = providerAvailable && legacyAvailable ? "Configured feed + production oracle providers" : providerAvailable ? "Production oracle providers" : legacySnapshot?.sourceName || "No oracle provider or feed configured";
  const status = providerAvailable || legacyAvailable ? "available" : legacySnapshot?.status === "stale" ? "stale" : "unavailable";
  return {
    status, sourceType, sourceName, generatedAt, fetchedAt: now.toISOString(), observationCount: observations.length,
    pairCount: new Set(observations.map((item) => item.pair)).size, observations,
    ageMs: generatedAt ? Math.max(0, now.getTime() - Date.parse(generatedAt)) : null,
    maxAgeMs: safeInteger(env.ORACLE_VALIDATION_MAX_FEED_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 1_000 }),
    error: status === "unavailable" ? (legacySnapshot?.error || "No usable production oracle evidence is available for this request.") : legacySnapshot?.status === "stale" && !providerAvailable ? legacySnapshot.error : "",
    providerEvidence: provider.evidence || [], providerStatuses: provider.providerStatuses || [], configuredProviderIds: provider.configuredProviderIds || [],
    providerCapabilities: getOracleProviderCapabilities({ env }), requestedPair: provider.pair?.pair || "",
  };
}

export function resetOracleValidationCache() {
  cached = null;
  resetOracleProviderRuntime();
}

function safeSourceName(snapshot = {}) {
  const sourceType = snapshot.sourceType || "none";
  const sourceName = clean(snapshot.sourceName);
  if (!sourceName) return sourceType === "none" ? "No oracle feed configured" : "Configured oracle feed";
  if (sourceType === "remote") {
    try {
      const url = new URL(sourceName);
      return `Remote oracle feed (${url.hostname})`;
    } catch {
      return sourceName;
    }
  }
  if (sourceType === "file" && (sourceName.includes("/") || sourceName.includes("\\"))) return "Configured local oracle feed";
  if (sourceType === "inline" && sourceName === "ORACLE_VALIDATION_FEED_JSON") return "Configured inline oracle feed";
  return sourceName;
}

function safePublicError(snapshot = {}) {
  const error = clean(snapshot.error);
  if (!error) return "";
  if (snapshot.status === "stale" && /no valid generatedAt|too far in the future|feed is stale/i.test(error)) return error;
  if (snapshot.sourceType === "none") return "No oracle feed is configured.";
  if (snapshot.sourceType === "file") return snapshot.status === "stale"
    ? "The configured local oracle feed could not be refreshed; cached data is stale."
    : "The configured local oracle feed could not be loaded.";
  if (snapshot.sourceType === "remote") return snapshot.status === "stale"
    ? "The configured remote oracle feed could not be refreshed; cached data is stale."
    : "The configured remote oracle feed could not be loaded.";
  if (snapshot.sourceType === "inline") return "The configured inline oracle feed is unavailable or invalid.";
  return "Oracle Validation is unavailable.";
}

export function summarizeOracleValidationSnapshot(snapshot = {}) {
  return {
    status: snapshot.status || "unavailable",
    sourceType: snapshot.sourceType || "none",
    sourceName: safeSourceName(snapshot),
    generatedAt: snapshot.generatedAt || "",
    fetchedAt: snapshot.fetchedAt || "",
    observationCount: Number(snapshot.observationCount || 0),
    pairCount: Number(snapshot.pairCount || 0),
    ageMs: Number.isFinite(snapshot.ageMs) ? snapshot.ageMs : null,
    maxAgeMs: Number.isFinite(snapshot.maxAgeMs) ? snapshot.maxAgeMs : null,
    error: safePublicError(snapshot),
    configuredProviderIds: Array.isArray(snapshot.configuredProviderIds) ? snapshot.configuredProviderIds.slice(0, 20) : [],
    providerStatuses: Array.isArray(snapshot.providerStatuses) ? snapshot.providerStatuses.slice(0, 20).map((item) => ({ providerId: clean(item.providerId), status: clean(item.status), reason: clean(item.reason).slice(0, 160), cached: item.cached === true })) : [],
    providerCapabilities: Array.isArray(snapshot.providerCapabilities) ? snapshot.providerCapabilities.slice(0, 20).map(({ serverControlledOrigin, ...item }) => ({ ...item, serverControlledOrigin })) : [],
    requestedPair: clean(snapshot.requestedPair),
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Oracle Validation", status, severity, rule, message, evidence, remediation };
}

function policyConfig(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const allowedProviders = Array.isArray(rules.oracleValidationAllowedProviders) ? rules.oracleValidationAllowedProviders.map((item) => clean(item).toLowerCase()).filter(Boolean).slice(0, 20) : [];
  const stablecoinAssets = Array.isArray(rules.oracleValidationStablecoinAssets) ? rules.oracleValidationStablecoinAssets.map(normalizeAsset).filter(Boolean).slice(0, 50) : [];
  return {
    mode: normalizeMode(rules.oracleValidationMode),
    unavailableAction: normalizeUnavailableAction(rules.oracleValidationUnavailableAction),
    providerUnavailableAction: normalizeUnavailableAction(rules.oracleValidationProviderUnavailableAction ?? rules.oracleValidationUnavailableAction),
    providerDisagreementAction: normalizeUnavailableAction(rules.oracleValidationProviderDisagreementAction ?? rules.oracleValidationUnavailableAction),
    providerRequired: rules.oracleValidationProviderRequired === true,
    allowedProviders,
    fallbackAllowed: rules.oracleValidationFallbackAllowed !== false,
    requiredReferenceCurrency: normalizeAsset(rules.oracleValidationRequiredReferenceCurrency),
    stablecoinAssets,
    stablecoinPegMinBps: safeInteger(rules.oracleValidationStablecoinPegMinBps, 9700, { min: 1, max: 20_000 }),
    stablecoinPegMaxBps: safeInteger(rules.oracleValidationStablecoinPegMaxBps, 10300, { min: 1, max: 20_000 }),
    maxAgeSeconds: safeInteger(rules.oracleValidationMaxAgeSeconds, 120, { min: 5, max: 86_400 }),
    maxDeviationBps: safeInteger(rules.oracleValidationMaxDeviationBps, 300, { min: 1, max: 10_000 }),
    maxSourceSpreadBps: safeInteger(rules.oracleValidationMaxSourceSpreadBps, 500, { min: 1, max: 10_000 }),
    minConfidence: safeInteger(rules.oracleValidationMinConfidence, 70, { min: 0, max: 100 }),
    minSources: safeInteger(rules.oracleValidationMinSources, 1, { min: 1, max: 20 }),
  };
}

function isApplicable(request = {}) {
  if (["Swap", "Deposit to Vault", "Oracle Data Update"].includes(request.actionType)) return true;
  return Boolean(request.oracleBaseAsset || request.oracleQuoteAsset || request.executionPrice || request.quoteTimestamp);
}

function deriveIntentQuote(request = {}) {
  const baseAsset = normalizeAsset(request.oracleBaseAsset || request.asset);
  const quoteAsset = normalizeAsset(request.oracleQuoteAsset || request.outputAsset);
  let executionPriceDecimal = "";
  try { if (request.executionPrice !== null && request.executionPrice !== undefined && request.executionPrice !== "") executionPriceDecimal = normalizeDecimal(request.executionPrice); } catch {}
  if (!executionPriceDecimal) {
    try { executionPriceDecimal = divideDecimal(request.expectedOutput, request.amount, 18); } catch {}
  }
  const quoteTimestamp = clean(request.quoteTimestamp || request.transactionTimestamp);
  return { baseAsset, quoteAsset, pair: pairKey(baseAsset, quoteAsset), executionPriceDecimal, executionPrice: executionPriceDecimal ? Number(executionPriceDecimal) : null, quoteTimestamp };
}

function unavailableEffect(config) {
  if (config.unavailableAction === "Block") return { hardBlock: true, needsReview: false, status: "fail", severity: "high" };
  if (config.unavailableAction === "Review") return { hardBlock: false, needsReview: true, status: "warning", severity: "medium" };
  return { hardBlock: false, needsReview: false, status: "unavailable", severity: "low" };
}

function modeEffect(config, severity = "high") {
  if (config.mode === "Enforce") return { hardBlock: true, needsReview: false, status: "fail", severity };
  if (config.mode === "Review") return { hardBlock: false, needsReview: true, status: "warning", severity: severity === "critical" ? "high" : "medium" };
  return { hardBlock: false, needsReview: false, status: "warning", severity: "low" };
}

export function evaluateOracleValidation({ request, policy, snapshot = {}, now = new Date() }) {
  const config = policyConfig(policy);
  const findings = [];
  const checksPassed = [];
  const checksFailed = [];
  let scoreDelta = 0;
  let hardBlock = false;
  let needsReview = false;
  const intent = deriveIntentQuote(request);

  const context = {
    ...summarizeOracleValidationSnapshot(snapshot),
    mode: config.mode,
    unavailableAction: config.unavailableAction,
    maxAgeSeconds: config.maxAgeSeconds,
    maxDeviationBps: config.maxDeviationBps,
    maxSourceSpreadBps: config.maxSourceSpreadBps,
    minConfidence: config.minConfidence,
    minSources: config.minSources,
    providerRequired: config.providerRequired,
    allowedProviders: config.allowedProviders,
    fallbackAllowed: config.fallbackAllowed,
    requiredReferenceCurrency: config.requiredReferenceCurrency,
    requestedPair: intent.pair,
    providerEvidence: Array.isArray(snapshot.providerEvidence) ? snapshot.providerEvidence.slice(0, 10).map((item) => ({ providerId: clean(item.providerId), providerVersion: clean(item.providerVersion), feedIdentifier: clean(item.feedIdentifier), canonicalAssetId: clean(item.canonicalAssetId), normalizedPrice: clean(item.normalizedPrice), confidenceInterval: clean(item.confidenceInterval), updateTimestamp: clean(item.updateTimestamp), retrievalTimestamp: clean(item.retrievalTimestamp), evidenceAgeMs: Number.isFinite(item.evidenceAgeMs) ? item.evidenceAgeMs : null, evidenceHash: clean(item.evidenceHash), cached: item.cached === true, fallback: item.fallback === true })) : [],
    executionPrice: intent.executionPriceDecimal ? Number(intent.executionPriceDecimal) : null,
    executionPriceDecimal: intent.executionPriceDecimal || "",
    referencePrice: null,
    deviationBps: null,
    sourceSpreadBps: null,
    sourceCount: 0,
    confidence: null,
    quoteTimestamp: intent.quoteTimestamp,
  };

  if (!isApplicable(request)) {
    findings.push(finding({ status: "skipped", rule: "Oracle applicability", message: "This intent does not contain a price-sensitive action or oracle quote context.", evidence: { actionType: request.actionType }, remediation: "No oracle validation is required for this action." }));
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  if (!intent.pair || !intent.executionPriceDecimal) {
    const effect = modeEffect(config, "high");
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 28 : effect.needsReview ? 16 : 5;
    const message = "The price-sensitive intent does not include a valid base asset, quote asset, and execution price.";
    checksFailed.push(message);
    findings.push(finding({
      status: effect.status,
      severity: effect.severity,
      rule: "Oracle intent metadata",
      message,
      evidence: { baseAsset: intent.baseAsset, quoteAsset: intent.quoteAsset, executionPrice: intent.executionPriceDecimal ? Number(intent.executionPriceDecimal) : null,
    executionPriceDecimal: intent.executionPriceDecimal || "" },
      remediation: "Include action.oracle.baseAsset, quoteAsset, executionPrice, and quoteTimestamp, or provide outputAsset plus expectedOutput so Magen3 can derive the proposed price.",
    }));
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  findings.push(finding({ status: "pass", rule: "Oracle intent metadata", message: `Price-sensitive intent metadata is complete for ${intent.pair}.`, evidence: { pair: intent.pair, executionPrice: intent.executionPrice } }));
  checksPassed.push(`Oracle intent metadata complete for ${intent.pair}`);

  if (!snapshot || snapshot.status !== "available") {
    const effect = unavailableEffect(config);
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 30 : effect.needsReview ? 18 : 6;
    const message = snapshot?.status === "stale" ? "The configured oracle feed is stale." : "No usable oracle feed is available.";
    checksFailed.push(message);
    findings.push(finding({
      status: effect.status,
      severity: effect.severity,
      rule: "Oracle feed availability",
      message,
      evidence: { status: snapshot?.status || "unavailable", generatedAt: snapshot?.generatedAt || "", error: snapshot?.error || "" },
      remediation: config.unavailableAction === "Block" ? "Restore a fresh trusted oracle feed before retrying." : "Restore a fresh oracle feed or route the request to authorized review.",
    }));
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  findings.push(finding({ status: "pass", rule: "Oracle feed availability", message: `A fresh oracle feed is available from ${snapshot.sourceName || "the configured source"}.`, evidence: { generatedAt: snapshot.generatedAt, observationCount: snapshot.observationCount, pairCount: snapshot.pairCount } }));
  checksPassed.push("Fresh oracle feed available");

  if (config.requiredReferenceCurrency && intent.quoteAsset !== config.requiredReferenceCurrency) {
    const effect = modeEffect(config, "high"); hardBlock ||= effect.hardBlock; needsReview ||= effect.needsReview; scoreDelta += effect.hardBlock ? 20 : effect.needsReview ? 12 : 4;
    const message = `Oracle reference currency ${intent.quoteAsset || "missing"} does not match required ${config.requiredReferenceCurrency}.`;
    checksFailed.push(message); findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle reference currency", message, evidence: { observed: intent.quoteAsset, expected: config.requiredReferenceCurrency }, remediation: `Request oracle evidence quoted in ${config.requiredReferenceCurrency}.` }));
  }

  const providerObservations = (Array.isArray(snapshot.observations) ? snapshot.observations : []).filter((item) => clean(item.providerId));
  const availableProviderIds = [...new Set(providerObservations.map((item) => clean(item.providerId).toLowerCase()).filter(Boolean))];
  context.availableProviderIds = availableProviderIds;
  context.providerStatuses = Array.isArray(snapshot.providerStatuses) ? snapshot.providerStatuses.slice(0, 20) : [];
  if (config.providerRequired && availableProviderIds.length === 0) {
    const providerConfig = { ...config, unavailableAction: config.providerUnavailableAction };
    const effect = unavailableEffect(providerConfig); hardBlock ||= effect.hardBlock; needsReview ||= effect.needsReview; scoreDelta += effect.hardBlock ? 30 : effect.needsReview ? 18 : 6;
    const message = "Policy requires production oracle provider evidence, but no configured provider returned usable evidence.";
    checksFailed.push(message); findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle provider requirement", message, evidence: { providerStatuses: context.providerStatuses }, remediation: "Restore an allowed configured oracle provider/feed mapping or change the policy only with authorized approval." }));
  }
  if (config.allowedProviders.length && availableProviderIds.some((id) => !config.allowedProviders.includes(id))) {
    const effect = modeEffect(config, "high"); hardBlock ||= effect.hardBlock; needsReview ||= effect.needsReview; scoreDelta += effect.hardBlock ? 24 : effect.needsReview ? 14 : 5;
    const disallowed = availableProviderIds.filter((id) => !config.allowedProviders.includes(id));
    const message = `Oracle evidence includes provider(s) not allowed by policy: ${disallowed.join(", ")}.`;
    checksFailed.push(message); findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle allowed providers", message, evidence: { allowedProviders: config.allowedProviders, observedProviders: availableProviderIds }, remediation: "Use only policy-approved oracle providers." }));
  }

  const maxAgeMs = config.maxAgeSeconds * 1_000;
  const matching = (Array.isArray(snapshot.observations) ? snapshot.observations : []).filter((item) => {
    if (item.pair !== intent.pair) return false;
    const observedMs = Date.parse(item.observedAt || "");
    return Number.isFinite(observedMs) && now.getTime() - observedMs <= maxAgeMs && now.getTime() - observedMs >= -MAX_FUTURE_SKEW_MS;
  });

  if (matching.length === 0) {
    const effect = unavailableEffect(config);
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 28 : effect.needsReview ? 16 : 6;
    const message = `No sufficiently fresh oracle observation is available for ${intent.pair}.`;
    checksFailed.push(message);
    findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle pair availability", message, evidence: { pair: intent.pair, maxAgeSeconds: config.maxAgeSeconds }, remediation: "Configure a fresh observation for the requested asset pair or require manual review." }));
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  // One source must not be able to satisfy quorum or skew the reference by
  // submitting duplicate observations. Keep only its newest fresh observation,
  // comparing source identifiers case-insensitively.
  const observationsBySource = new Map();
  for (const observation of matching) {
    const sourceId = clean(observation.source).toLowerCase() || "oracle-source";
    const current = observationsBySource.get(sourceId);
    if (!current || Date.parse(observation.observedAt) > Date.parse(current.observedAt)) {
      observationsBySource.set(sourceId, observation);
    }
  }
  const independentObservations = [...observationsBySource.values()];
  const sourceNames = independentObservations.map((item) => item.source);
  const priceDecimals = independentObservations.map((item) => item.normalizedPrice || String(item.price));
  const sortedPrices = [...priceDecimals].sort((a, b) => {
    try { const da = exactDeviationBps(a, b); if (da === 0) return 0; return Number(a) < Number(b) ? -1 : 1; } catch { return 0; }
  });
  const referencePriceDecimal = medianDecimal(priceDecimals, 18);
  const referencePrice = referencePriceDecimal ? Number(referencePriceDecimal) : null;
  const confidence = averageInteger(independentObservations.map((item) => item.confidence));
  const sourceSpreadBps = referencePriceDecimal ? exactSpreadBps(sortedPrices[0], sortedPrices[sortedPrices.length - 1], referencePriceDecimal, 18) : null;
  const deviationBps = referencePriceDecimal ? exactDeviationBps(intent.executionPriceDecimal, referencePriceDecimal, 18) : null;
  Object.assign(context, { referencePrice, referencePriceDecimal, deviationBps, sourceSpreadBps, sourceCount: independentObservations.length, confidence });

  if (independentObservations.length < config.minSources) {
    const effect = modeEffect(config, "high");
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 22 : effect.needsReview ? 13 : 4;
    const message = `Oracle source coverage is below policy: ${independentObservations.length} source(s), minimum ${config.minSources}.`;
    checksFailed.push(message);
    findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle source quorum", message, evidence: { received: independentObservations.length, minimum: config.minSources, sources: sourceNames }, remediation: "Add independent oracle observations or reduce the minimum source requirement only if authorized." }));
  } else {
    checksPassed.push(`Oracle source quorum met: ${independentObservations.length}`);
    findings.push(finding({ status: "pass", rule: "Oracle source quorum", message: `Oracle source quorum met with ${independentObservations.length} independent source(s).`, evidence: { sources: sourceNames, minimum: config.minSources } }));
  }

  if (confidence < config.minConfidence) {
    const effect = modeEffect(config, "high");
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 22 : effect.needsReview ? 13 : 4;
    const message = `Oracle confidence is below policy: ${confidence}%, minimum ${config.minConfidence}%.`;
    checksFailed.push(message);
    findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle confidence", message, evidence: { received: confidence, minimum: config.minConfidence }, remediation: "Wait for a higher-confidence quote, add stronger sources, or route the request to review." }));
  } else {
    checksPassed.push(`Oracle confidence ${confidence}%`);
    findings.push(finding({ status: "pass", rule: "Oracle confidence", message: `Oracle confidence meets policy at ${confidence}%.`, evidence: { received: confidence, minimum: config.minConfidence } }));
  }

  if (sourceSpreadBps !== null && sourceSpreadBps > config.maxSourceSpreadBps) {
    const effect = modeEffect(config, "high");
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 24 : effect.needsReview ? 14 : 5;
    const message = `Oracle sources disagree by ${sourceSpreadBps} bps, above the ${config.maxSourceSpreadBps} bps policy limit.`;
    checksFailed.push(message);
    findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle source consistency", message, evidence: { sourceSpreadBps, maximum: config.maxSourceSpreadBps, minimumPrice: Number(sortedPrices[0]), maximumPrice: Number(sortedPrices[sortedPrices.length - 1]), referencePrice, referencePriceDecimal }, remediation: "Pause until sources converge or investigate the outlier before authorizing execution." }));
  } else {
    checksPassed.push(`Oracle source spread within ${config.maxSourceSpreadBps} bps`);
    findings.push(finding({ status: "pass", rule: "Oracle source consistency", message: `Oracle source spread is within policy at ${sourceSpreadBps ?? 0} bps.`, evidence: { sourceSpreadBps: sourceSpreadBps ?? 0, maximum: config.maxSourceSpreadBps } }));
  }

  if (intent.quoteTimestamp) {
    const quoteMs = Date.parse(intent.quoteTimestamp);
    const quoteAgeMs = Number.isFinite(quoteMs) ? now.getTime() - quoteMs : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(quoteMs) || quoteAgeMs > maxAgeMs || quoteAgeMs < -MAX_FUTURE_SKEW_MS) {
      const effect = modeEffect(config, "high");
      hardBlock ||= effect.hardBlock;
      needsReview ||= effect.needsReview;
      scoreDelta += effect.hardBlock ? 20 : effect.needsReview ? 12 : 4;
      const message = "The execution quote timestamp is invalid, stale, or too far in the future.";
      checksFailed.push(message);
      findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Execution quote freshness", message, evidence: { quoteTimestamp: intent.quoteTimestamp, maxAgeSeconds: config.maxAgeSeconds }, remediation: "Refresh the execution quote and retry with a current ISO-8601 quoteTimestamp." }));
    } else {
      checksPassed.push("Execution quote is fresh");
      findings.push(finding({ status: "pass", rule: "Execution quote freshness", message: "The execution quote timestamp is within the policy freshness window.", evidence: { quoteTimestamp: intent.quoteTimestamp, ageSeconds: Math.max(0, Math.round(quoteAgeMs / 1_000)), maxAgeSeconds: config.maxAgeSeconds } }));
    }
  } else {
    const effect = modeEffect(config, "medium");
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 16 : effect.needsReview ? 9 : 3;
    const message = "The execution quote has no quoteTimestamp, so its freshness cannot be verified.";
    checksFailed.push(message);
    findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Execution quote freshness", message, evidence: { maxAgeSeconds: config.maxAgeSeconds }, remediation: "Include a current ISO-8601 action.oracle.quoteTimestamp." }));
  }

  if (config.stablecoinAssets.includes(intent.baseAsset) && referencePriceDecimal && intent.quoteAsset === (config.requiredReferenceCurrency || "USD")) {
    const pegBps = Number((decimalToScaled(referencePriceDecimal, 18) * 10_000n + (10n ** 18n) / 2n) / (10n ** 18n));
    context.stablecoinPegBps = pegBps;
    if (pegBps < config.stablecoinPegMinBps || pegBps > config.stablecoinPegMaxBps) {
      const effect = modeEffect(config, "critical"); hardBlock ||= effect.hardBlock; needsReview ||= effect.needsReview; scoreDelta += effect.hardBlock ? 30 : effect.needsReview ? 18 : 6;
      const message = `Stablecoin oracle reference is outside the configured peg range (${pegBps} bps).`;
      checksFailed.push(message); findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Stablecoin peg validation", message, evidence: { asset: intent.baseAsset, referenceCurrency: intent.quoteAsset, pegBps, minimum: config.stablecoinPegMinBps, maximum: config.stablecoinPegMaxBps }, remediation: "Do not treat the asset as at-peg until trusted oracle evidence returns within the configured range." }));
    } else {
      checksPassed.push("Stablecoin peg within policy"); findings.push(finding({ status: "pass", rule: "Stablecoin peg validation", message: "Stablecoin oracle reference is within the configured peg range.", evidence: { asset: intent.baseAsset, pegBps, minimum: config.stablecoinPegMinBps, maximum: config.stablecoinPegMaxBps } }));
    }
  }

  if (deviationBps !== null && deviationBps > config.maxDeviationBps) {
    const effect = modeEffect(config, "critical");
    hardBlock ||= effect.hardBlock;
    needsReview ||= effect.needsReview;
    scoreDelta += effect.hardBlock ? 32 : effect.needsReview ? 20 : 7;
    const message = `Proposed execution price deviates by ${deviationBps} bps from the oracle reference, above the ${config.maxDeviationBps} bps policy limit.`;
    checksFailed.push(message);
    findings.push(finding({ status: effect.status, severity: effect.severity, rule: "Oracle price deviation", message, evidence: { executionPrice: intent.executionPrice, referencePrice, deviationBps, maximum: config.maxDeviationBps, pair: intent.pair }, remediation: "Refresh routing or quote data, reduce the deviation, or require authorized review. Do not execute at the current price under Enforce mode." }));
  } else {
    checksPassed.push(`Execution price within ${config.maxDeviationBps} bps of oracle reference`);
    findings.push(finding({ status: "pass", rule: "Oracle price deviation", message: `Proposed execution price is within policy at ${deviationBps ?? 0} bps from the reference.`, evidence: { executionPrice: intent.executionPrice, referencePrice, deviationBps: deviationBps ?? 0, maximum: config.maxDeviationBps, pair: intent.pair } }));
  }

  return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
}
