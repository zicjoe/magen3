import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readUtf8FileLimited } from "./safeFeedFile.mjs";

const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_FEED_AGE_MS = 5 * 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;
const MAX_FUTURE_SKEW_MS = 60_000;
const MAX_FEED_BYTES = 1_000_000;
const MAX_OBSERVATIONS = 5_000;
const SIGNAL_FIELDS = [
  "volatilityBps",
  "spreadBps",
  "priceDeviationBps",
  "oracleDivergenceBps",
  "stablecoinDepegBps",
  "liquidityCoverageBps",
  "poolImbalanceBps",
  "liquidityLossBps",
  "volumeDropBps",
  "manipulationScore",
];

let cached = null;

const clean = (value) => String(value ?? "").trim();
const boundedText = (value, max = 160) => clean(value).slice(0, max);
const norm = (value) => clean(value).toLowerCase();
const normalizeAsset = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9._:-]/g, "").slice(0, 160);
const normalizeIdentifier = (value) => norm(value).replace(/[^a-z0-9._:-]/g, "").slice(0, 200);
const normalizeAmountReference = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const raw = clean(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) return "";
  const [whole, fraction = ""] = raw.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
};
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function optionalInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function actionFor(value, fallback = "review") {
  const normalized = norm(value);
  return ["allow", "warn", "review", "block"].includes(normalized) ? normalized : fallback;
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
    throw new Error(`Market-risk feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) throw new Error(`Market-risk feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
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
        await reader.cancel("Market-risk feed exceeded the safety limit").catch(() => {});
        throw new Error(`Market-risk feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
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

function canonicalPairKey(baseCanonicalId, quoteCanonicalId) {
  const base = normalizeIdentifier(baseCanonicalId);
  const quote = normalizeIdentifier(quoteCanonicalId);
  return base && quote ? `${base}/${quote}` : "";
}

function normalizeObservation(raw, index, defaultSource, generatedAt) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const baseAsset = normalizeAsset(raw.baseAsset || raw.base || raw.fromAsset || raw.from);
  const quoteAsset = normalizeAsset(raw.quoteAsset || raw.quote || raw.toAsset || raw.to);
  const baseCanonicalId = normalizeIdentifier(raw.baseCanonicalId || raw.base_canonical_id || raw.inputCanonicalId);
  const quoteCanonicalId = normalizeIdentifier(raw.quoteCanonicalId || raw.quote_canonical_id || raw.outputCanonicalId);
  const pair = pairKey(baseAsset, quoteAsset);
  const canonicalPair = canonicalPairKey(baseCanonicalId, quoteCanonicalId);
  if (!pair && !canonicalPair) return null;
  const observedAtRaw = clean(raw.observedAt || raw.observed_at || raw.timestamp || generatedAt);
  const observedAtMs = Date.parse(observedAtRaw);
  if (!Number.isFinite(observedAtMs)) return null;
  const metrics = {};
  for (const field of SIGNAL_FIELDS) {
    const value = optionalInteger(raw[field] ?? raw[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)], { min: 0, max: field === "manipulationScore" ? 100 : 1_000_000 });
    if (value !== null) metrics[field] = value;
  }
  if (Object.keys(metrics).length === 0) return null;
  return {
    id: boundedText(raw.id, 160) || `market-signal-${index + 1}`,
    pair,
    canonicalPair,
    baseAsset,
    quoteAsset,
    baseCanonicalId,
    quoteCanonicalId,
    chainFamily: clean(raw.chainFamily || raw.chain_family).toUpperCase(),
    network: normalizeIdentifier(raw.network || raw.chainName || raw.chain_name),
    venue: normalizeIdentifier(raw.venue || raw.protocol || raw.aggregator),
    poolId: normalizeIdentifier(raw.poolId || raw.pool_id || raw.pool),
    inputAmount: normalizeAmountReference(raw.inputAmount ?? raw.input_amount ?? raw.protectedAmount ?? raw.protected_amount),
    quoteId: normalizeIdentifier(raw.quoteId || raw.quote_id || raw.routeId || raw.route_id),
    routeFingerprint: normalizeIdentifier(raw.routeFingerprint || raw.route_fingerprint || raw.authorizedRouteHash || raw.authorized_route_hash),
    source: boundedText(raw.source || raw.provider || defaultSource || "market-risk-source", 160),
    confidence: safeInteger(raw.confidence, 50, { min: 0, max: 100 }),
    observedAt: new Date(observedAtMs).toISOString(),
    metrics,
    evidenceReference: boundedText(raw.evidenceReference || raw.evidence_reference || raw.reference, 256),
  };
}

export function normalizeMarketRiskFeed(raw, { sourceType = "unknown", sourceName = "Market-risk feed", now = new Date() } = {}) {
  const root = Array.isArray(raw) ? { observations: raw } : raw && typeof raw === "object" ? raw : {};
  const supplied = Array.isArray(root.observations) ? root.observations : Array.isArray(root.signals) ? root.signals : [];
  if (supplied.length > MAX_OBSERVATIONS) throw new Error(`Market-risk feed exceeds the ${MAX_OBSERVATIONS}-observation safety limit`);
  const generatedAtRaw = clean(root.generatedAt || root.generated_at || root.updatedAt || root.updated_at);
  const generatedAtMs = Date.parse(generatedAtRaw);
  const generatedAt = Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString() : "";
  const normalizedSourceName = boundedText(root.source || root.name || sourceName, 160);
  const observations = supplied.map((item, index) => normalizeObservation(item, index, normalizedSourceName, generatedAt)).filter(Boolean);
  return {
    status: "available",
    sourceType,
    sourceName: normalizedSourceName,
    version: clean(root.version) || "1",
    generatedAt,
    fetchedAt: now.toISOString(),
    observationCount: observations.length,
    pairCount: new Set(observations.map((item) => item.canonicalPair || item.pair)).size,
    observations,
    error: "",
  };
}

function configuredSource(env = process.env) {
  const inline = clean(env.MARKET_RISK_SIGNALS_FEED_JSON);
  if (inline) return { type: "inline", value: inline, name: "MARKET_RISK_SIGNALS_FEED_JSON" };
  const filePath = clean(env.MARKET_RISK_SIGNALS_FEED_PATH);
  if (filePath) {
    const resolvedPath = resolve(filePath);
    return { type: "file", value: resolvedPath, name: resolvedPath };
  }
  const remoteUrl = clean(env.MARKET_RISK_SIGNALS_FEED_URL);
  if (remoteUrl) return { type: "remote", value: remoteUrl, name: remoteUrl };
  return null;
}

function validateRemoteUrl(value, env = process.env) {
  const url = new URL(value);
  const localDevelopment = ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !localDevelopment) throw new Error("MARKET_RISK_SIGNALS_FEED_URL must use HTTPS in production");
  if (url.username || url.password) throw new Error("MARKET_RISK_SIGNALS_FEED_URL must not contain credentials");
  return url;
}

function cacheKey(source, env = process.env) {
  if (!source) return "none";
  return [source.type, source.value, clean(env.MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS), clean(env.MARKET_RISK_SIGNALS_CACHE_TTL_MS), clean(env.MARKET_RISK_SIGNALS_API_KEY) ? "bearer" : "none"].join("|");
}

async function loadConfiguredFeed(source, { env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (source.type === "inline") return normalizeMarketRiskFeed(parseJson(source.value, source.name), { sourceType: "inline", sourceName: source.name, now });
  if (source.type === "file") {
    const raw = await readUtf8FileLimited(source.value, { maxBytes: MAX_FEED_BYTES, sourceLabel: source.name });
    return normalizeMarketRiskFeed(parseJson(raw, source.name), { sourceType: "file", sourceName: "Configured local market-risk feed", now });
  }
  if (typeof fetchImpl !== "function") throw new Error("Remote Market Risk Signals requires fetch support");
  const url = validateRemoteUrl(source.value, env);
  const timeoutMs = safeInteger(env.MARKET_RISK_SIGNALS_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, { min: 250, max: 15_000 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    const apiKey = clean(env.MARKET_RISK_SIGNALS_API_KEY);
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`Market-risk feed returned HTTP ${response.status}`);
    const raw = await readRemoteBodyLimited(response);
    return normalizeMarketRiskFeed(parseJson(raw, "Market-risk feed"), { sourceType: "remote", sourceName: url.hostname, now });
  } finally {
    clearTimeout(timeout);
  }
}

function applyFreshness(snapshot, { env = process.env, now = new Date() } = {}) {
  const maxAgeMs = safeInteger(env.MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 1_000, max: 7 * 24 * 60 * 60_000 });
  const generatedAtMs = Date.parse(snapshot.generatedAt || "");
  const ageMs = Number.isFinite(generatedAtMs) ? now.getTime() - generatedAtMs : null;
  const stale = ageMs === null || ageMs > maxAgeMs || ageMs < -MAX_FUTURE_SKEW_MS;
  return {
    ...snapshot,
    status: stale ? "stale" : snapshot.status,
    ageMs,
    maxAgeMs,
    error: stale ? (ageMs === null ? "Market-risk feed has no valid generatedAt timestamp." : ageMs < 0 ? "Market-risk feed timestamp is too far in the future." : "Market-risk feed is stale.") : snapshot.error,
  };
}

export async function getMarketRiskSignalsSnapshot({ force = false, env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const source = configuredSource(env);
  if (!source) {
    return {
      status: "unavailable",
      sourceType: "none",
      sourceName: "No market-risk feed configured",
      generatedAt: "",
      fetchedAt: now.toISOString(),
      observationCount: 0,
      pairCount: 0,
      observations: [],
      ageMs: null,
      maxAgeMs: safeInteger(env.MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 1_000 }),
      error: "Configure MARKET_RISK_SIGNALS_FEED_JSON, MARKET_RISK_SIGNALS_FEED_PATH, or MARKET_RISK_SIGNALS_FEED_URL.",
    };
  }
  const key = cacheKey(source, env);
  const ttlMs = safeInteger(env.MARKET_RISK_SIGNALS_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, { min: 1_000, max: 60 * 60_000 });
  if (!force && cached && cached.key === key && now.getTime() - cached.loadedAt < ttlMs) return applyFreshness(cached.snapshot, { env, now });
  try {
    const snapshot = await loadConfiguredFeed(source, { env, fetchImpl, now });
    cached = { key, loadedAt: now.getTime(), snapshot };
    return applyFreshness(snapshot, { env, now });
  } catch (cause) {
    return {
      status: "unavailable",
      sourceType: source.type,
      sourceName: source.type === "remote" ? new URL(source.value).hostname : source.type === "file" ? "Configured local market-risk feed" : source.name,
      generatedAt: "",
      fetchedAt: now.toISOString(),
      observationCount: 0,
      pairCount: 0,
      observations: [],
      ageMs: null,
      maxAgeMs: safeInteger(env.MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 1_000 }),
      error: cause instanceof Error ? cause.message : "Market-risk feed could not be loaded.",
    };
  }
}

export function resetMarketRiskSignalsCache() {
  cached = null;
}

function safeSourceName(snapshot = {}) {
  if (snapshot.sourceType === "file") return "Configured local market-risk feed";
  if (snapshot.sourceType === "inline") return "Configured inline market-risk feed";
  if (snapshot.sourceType === "remote") return clean(snapshot.sourceName) || "Configured remote market-risk feed";
  return clean(snapshot.sourceName) || "No market-risk feed configured";
}

function safePublicError(snapshot = {}) {
  if (!snapshot.error) return "";
  if (snapshot.sourceType === "none") return "No market-risk feed is configured.";
  if (snapshot.status === "stale") return "The configured market-risk feed is stale or has an invalid timestamp.";
  if (snapshot.sourceType === "file") return "The configured local market-risk feed could not be loaded.";
  if (snapshot.sourceType === "remote") return "The configured remote market-risk feed could not be loaded.";
  if (snapshot.sourceType === "inline") return "The configured inline market-risk feed could not be parsed.";
  return "Market-risk evidence is unavailable.";
}

export function summarizeMarketRiskSignalsSnapshot(snapshot = {}) {
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
  };
}

function policyConfig(policy = {}) {
  const raw = policy?.structuredRules?.marketRiskSignals || policy?.structuredRules?.marketRisk || {};
  const requiredSignals = Array.isArray(raw.requiredSignals) ? raw.requiredSignals.filter((item) => SIGNAL_FIELDS.includes(clean(item))) : [];
  return {
    enabled: raw.enabled === true || raw.required === true,
    required: raw.required === true,
    maxEvidenceAgeSeconds: safeInteger(raw.maxEvidenceAgeSeconds, 120, { min: 5, max: 86_400 }),
    minSources: safeInteger(raw.minSources, 1, { min: 1, max: 20 }),
    minConfidence: safeInteger(raw.minConfidence, 70, { min: 0, max: 100 }),
    maxProviderDisagreementBps: safeInteger(raw.maxProviderDisagreementBps, 500, { min: 0, max: 100_000 }),
    maxVolatilityBps: safeInteger(raw.maxVolatilityBps, 1_500, { min: 0, max: 100_000 }),
    maxSpreadBps: safeInteger(raw.maxSpreadBps, 300, { min: 0, max: 100_000 }),
    maxPriceDeviationBps: safeInteger(raw.maxPriceDeviationBps, 500, { min: 0, max: 100_000 }),
    maxOracleDivergenceBps: safeInteger(raw.maxOracleDivergenceBps, 500, { min: 0, max: 100_000 }),
    maxStablecoinDepegBps: safeInteger(raw.maxStablecoinDepegBps, 300, { min: 0, max: 100_000 }),
    minLiquidityCoverageBps: safeInteger(raw.minLiquidityCoverageBps, 10_000, { min: 0, max: 1_000_000 }),
    maxPoolImbalanceBps: safeInteger(raw.maxPoolImbalanceBps, 3_000, { min: 0, max: 100_000 }),
    maxLiquidityLossBps: safeInteger(raw.maxLiquidityLossBps, 3_000, { min: 0, max: 100_000 }),
    maxVolumeDropBps: safeInteger(raw.maxVolumeDropBps, 5_000, { min: 0, max: 100_000 }),
    maxManipulationScore: safeInteger(raw.maxManipulationScore, 70, { min: 0, max: 100 }),
    requiredSignals,
    unavailableAction: actionFor(raw.unavailableAction, raw.required === true ? "block" : "review"),
    missingEvidenceAction: actionFor(raw.missingEvidenceAction, "review"),
    providerDisagreementAction: actionFor(raw.providerDisagreementAction, "review"),
    volatilityAction: actionFor(raw.volatilityAction, "review"),
    spreadAction: actionFor(raw.spreadAction, "review"),
    deviationAction: actionFor(raw.deviationAction, "review"),
    depegAction: actionFor(raw.depegAction, "block"),
    liquidityAction: actionFor(raw.liquidityAction, "review"),
    imbalanceAction: actionFor(raw.imbalanceAction, "review"),
    manipulationAction: actionFor(raw.manipulationAction, "block"),
  };
}

function finding({ status = "pass", severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Market Risk Signals", status, severity, rule, message, evidence, remediation };
}

function apply(state, action, data) {
  if (action === "allow") return;
  if (action === "warn") state.findings.push(finding({ ...data, status: "warning", severity: "low" }));
  if (action === "review") {
    state.needsReview = true;
    state.scoreDelta += 18;
    state.findings.push(finding({ ...data, status: "warning", severity: "medium" }));
  }
  if (action === "block") {
    state.hardBlock = true;
    state.scoreDelta += 35;
    state.findings.push(finding({ ...data, status: "fail", severity: "high" }));
  }
  state.checksFailed.push(data.message);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function deriveRequestContext(request = {}, assetIdentityContext = {}, tradingRouteIntegrityContext = {}) {
  const route = tradingRouteIntegrityContext?.route || {};
  const baseAsset = normalizeAsset(request.marketRiskBaseAsset || request.tradingRouteInputAsset || route.inputAsset || request.asset);
  const quoteAsset = normalizeAsset(request.marketRiskQuoteAsset || request.tradingRouteOutputAsset || route.outputAsset || request.outputAsset);
  const baseCanonicalId = normalizeIdentifier(request.marketRiskBaseCanonicalId || assetIdentityContext?.canonicalId || request.assetCanonicalId);
  const quoteCanonicalId = normalizeIdentifier(request.marketRiskQuoteCanonicalId || request.outputAssetCanonicalId);
  return {
    baseAsset,
    quoteAsset,
    pair: pairKey(baseAsset, quoteAsset),
    baseCanonicalId,
    quoteCanonicalId,
    canonicalPair: canonicalPairKey(baseCanonicalId, quoteCanonicalId),
    chainFamily: clean(request.marketRiskChainFamily || assetIdentityContext?.chainFamily).toUpperCase(),
    network: normalizeIdentifier(request.marketRiskNetwork || assetIdentityContext?.network || request.chainName),
    venue: normalizeIdentifier(request.marketRiskVenue || request.tradingRouteProtocol || request.tradingRouteAggregator || route.protocol || route.aggregator),
    poolId: normalizeIdentifier(request.marketRiskPoolId || request.tradingRoutePoolSequence?.[0] || route.poolSequence?.[0]),
    inputAmount: normalizeAmountReference(request.tradingRouteInputAmount ?? route.inputAmount ?? request.amount),
    quoteId: normalizeIdentifier(request.tradingRouteQuoteId || request.executionQuoteId || route.quoteId),
    routeFingerprint: normalizeIdentifier(tradingRouteIntegrityContext?.routeFingerprint || request.tradingRouteAuthorizedRouteHash),
  };
}

function observationMatches(observation, requested) {
  const pairMatches = requested.canonicalPair && observation.canonicalPair
    ? observation.canonicalPair === requested.canonicalPair
    : Boolean(requested.pair && observation.pair === requested.pair);
  if (!pairMatches) return false;
  if (requested.network && observation.network && requested.network !== observation.network) return false;
  if (requested.chainFamily && observation.chainFamily && requested.chainFamily !== observation.chainFamily) return false;
  if (requested.poolId && observation.poolId && requested.poolId !== observation.poolId) return false;
  if (requested.venue && observation.venue && requested.venue !== observation.venue) return false;
  if (requested.inputAmount && observation.inputAmount && requested.inputAmount !== observation.inputAmount) return false;
  if (requested.quoteId && observation.quoteId && requested.quoteId !== observation.quoteId) return false;
  if (requested.routeFingerprint && observation.routeFingerprint && requested.routeFingerprint !== observation.routeFingerprint) return false;
  return true;
}

function metricSummary(observations, field) {
  const values = observations.map((item) => item.metrics?.[field]).filter((value) => Number.isSafeInteger(value));
  if (values.length === 0) return { value: null, sourceCount: 0, disagreementBps: null, minimum: null, maximum: null };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return { value: median(values), sourceCount: values.length, disagreementBps: maximum - minimum, minimum, maximum };
}

export function evaluateMarketRiskSignals({ request = {}, policy = {}, snapshot = {}, assetIdentityContext = {}, tradingRouteIntegrityContext = {}, now = new Date() } = {}) {
  const config = policyConfig(policy);
  const state = { checksPassed: [], checksFailed: [], findings: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const actionType = norm(request.actionType);
  const applicable = /swap|trade|exchange|bridge/.test(actionType);
  const requested = deriveRequestContext(request, assetIdentityContext, tradingRouteIntegrityContext);
  const context = {
    schemaVersion: "magen3.market-risk-signals.v1",
    evaluatedAt: now.toISOString(),
    applicable,
    actionType,
    requested,
    snapshot: summarizeMarketRiskSignalsSnapshot(snapshot),
    sourceCount: 0,
    confidence: null,
    newestObservationAt: null,
    metrics: Object.fromEntries(SIGNAL_FIELDS.map((field) => [field, { value: null, sourceCount: 0, disagreementBps: null, completeness: "unavailable" }])),
    evidenceFingerprint: "",
    config,
    status: "not_required",
  };

  if (!config.enabled || !applicable) {
    state.findings.push(finding({ status: "skipped", rule: "Market-risk activation", message: !config.enabled ? "Market Risk Signals are not enabled for this policy." : "This action does not require market-risk evaluation.", evidence: { enabled: config.enabled, actionType } }));
    return { ...state, context };
  }

  if ((!requested.pair && !requested.canonicalPair) || (!requested.baseAsset && !requested.baseCanonicalId) || (!requested.quoteAsset && !requested.quoteCanonicalId)) {
    apply(state, config.missingEvidenceAction, { rule: "Market pair identity", message: "The protected action does not contain a resolvable input and output asset pair for market-risk evaluation.", evidence: { requested }, remediation: "Include exact input/output asset identities, preferably canonical Milestone 16 identifiers." });
    context.status = state.hardBlock ? "blocked" : state.needsReview ? "review_required" : "inconclusive";
    return { ...state, context };
  }

  if (!snapshot || snapshot.status !== "available") {
    apply(state, config.unavailableAction, { rule: "Market-risk feed availability", message: snapshot?.status === "stale" ? "The configured market-risk feed is stale." : "No usable market-risk feed is available.", evidence: { status: snapshot?.status || "unavailable", generatedAt: snapshot?.generatedAt || "", error: safePublicError(snapshot) }, remediation: "Restore a fresh trusted market-risk feed or follow the configured fail-closed review policy." });
    context.status = "unavailable";
    return { ...state, context };
  }

  const maxAgeMs = config.maxEvidenceAgeSeconds * 1_000;
  const matching = (Array.isArray(snapshot.observations) ? snapshot.observations : []).filter((observation) => {
    if (!observationMatches(observation, requested)) return false;
    const observedAtMs = Date.parse(observation.observedAt || "");
    if (!Number.isFinite(observedAtMs)) return false;
    const age = now.getTime() - observedAtMs;
    return age <= maxAgeMs && age >= -MAX_FUTURE_SKEW_MS;
  });

  const bySource = new Map();
  for (const observation of matching) {
    const sourceKey = norm(observation.source) || "market-risk-source";
    const current = bySource.get(sourceKey);
    if (!current || Date.parse(observation.observedAt) > Date.parse(current.observedAt)) bySource.set(sourceKey, observation);
  }
  const independent = [...bySource.values()];
  context.sourceCount = independent.length;
  context.confidence = independent.length ? Math.round(independent.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / independent.length) : null;
  context.newestObservationAt = independent.length ? independent.map((item) => item.observedAt).sort().at(-1) : null;

  if (independent.length === 0) {
    apply(state, config.unavailableAction, { rule: "Market-risk pair coverage", message: `No fresh market-risk observation matches ${requested.canonicalPair || requested.pair}.`, evidence: { requested, maxEvidenceAgeSeconds: config.maxEvidenceAgeSeconds }, remediation: "Configure fresh provider evidence for the exact asset pair, network, and route context." });
    context.status = "unavailable";
    return { ...state, context };
  }

  if (independent.length < config.minSources) {
    apply(state, config.missingEvidenceAction, { rule: "Market-risk source quorum", message: `Market-risk source coverage is below policy: ${independent.length} source(s), minimum ${config.minSources}.`, evidence: { sourceCount: independent.length, minimum: config.minSources, sources: independent.map((item) => item.source) }, remediation: "Add independent provider evidence or route the action to authorized review." });
  } else {
    state.checksPassed.push(`Market-risk source quorum met: ${independent.length}`);
    state.findings.push(finding({ rule: "Market-risk source quorum", message: `Market-risk source quorum is satisfied with ${independent.length} independent source(s).`, evidence: { sources: independent.map((item) => item.source), minimum: config.minSources } }));
  }

  if (context.confidence !== null && context.confidence < config.minConfidence) {
    apply(state, config.missingEvidenceAction, { rule: "Market-risk confidence", message: `Market-risk confidence is below policy: ${context.confidence}%, minimum ${config.minConfidence}%.`, evidence: { confidence: context.confidence, minimum: config.minConfidence }, remediation: "Obtain stronger or more complete provider evidence before execution." });
  }

  for (const field of SIGNAL_FIELDS) {
    const metricObservations = field === "liquidityCoverageBps"
      ? independent.filter((item) => requested.inputAmount && item.inputAmount === requested.inputAmount)
      : independent;
    const summary = metricSummary(metricObservations, field);
    context.metrics[field] = { ...summary, completeness: summary.value === null ? "unavailable" : "observed" };
    if (config.requiredSignals.includes(field) && summary.value === null) {
      apply(state, config.missingEvidenceAction, { rule: "Required market-risk evidence", message: `Required market-risk signal ${field} is unavailable.`, evidence: { field, requested }, remediation: `Configure a provider that supplies ${field} for this pair and route.` });
    }
    if (summary.disagreementBps !== null && summary.disagreementBps > config.maxProviderDisagreementBps) {
      apply(state, config.providerDisagreementAction, { rule: "Market-risk provider agreement", message: `Providers disagree on ${field} by ${summary.disagreementBps} bps, above the ${config.maxProviderDisagreementBps} bps policy limit.`, evidence: { field, ...summary, maximumDisagreementBps: config.maxProviderDisagreementBps }, remediation: "Pause until providers converge or investigate the outlier before signing." });
    }
  }

  const rules = [
    ["volatilityBps", "Market volatility", (value) => value > config.maxVolatilityBps, config.volatilityAction, config.maxVolatilityBps, "Volatility exceeds policy."],
    ["spreadBps", "Bid-ask or route spread", (value) => value > config.maxSpreadBps, config.spreadAction, config.maxSpreadBps, "Market spread exceeds policy."],
    ["priceDeviationBps", "Market price deviation", (value) => value > config.maxPriceDeviationBps, config.deviationAction, config.maxPriceDeviationBps, "Observed market price deviation exceeds policy."],
    ["oracleDivergenceBps", "Oracle-to-market divergence", (value) => value > config.maxOracleDivergenceBps, config.deviationAction, config.maxOracleDivergenceBps, "Oracle and market evidence diverge beyond policy."],
    ["stablecoinDepegBps", "Stablecoin peg deviation", (value) => value > config.maxStablecoinDepegBps, config.depegAction, config.maxStablecoinDepegBps, "Stablecoin depeg evidence exceeds policy."],
    ["liquidityCoverageBps", "Liquidity coverage", (value) => value < config.minLiquidityCoverageBps, config.liquidityAction, config.minLiquidityCoverageBps, "Available liquidity coverage is below policy."],
    ["poolImbalanceBps", "Pool imbalance", (value) => value > config.maxPoolImbalanceBps, config.imbalanceAction, config.maxPoolImbalanceBps, "Pool imbalance exceeds policy."],
    ["liquidityLossBps", "Sudden liquidity loss", (value) => value > config.maxLiquidityLossBps, config.liquidityAction, config.maxLiquidityLossBps, "Recent liquidity loss exceeds policy."],
    ["volumeDropBps", "Trading-volume deterioration", (value) => value > config.maxVolumeDropBps, config.liquidityAction, config.maxVolumeDropBps, "Recent volume deterioration exceeds policy."],
    ["manipulationScore", "Market manipulation indicator", (value) => value > config.maxManipulationScore, config.manipulationAction, config.maxManipulationScore, "Provider manipulation indicators exceed policy."],
  ];

  for (const [field, rule, violated, action, threshold, message] of rules) {
    const value = context.metrics[field].value;
    if (value === null) continue;
    if (violated(value)) {
      apply(state, action, { rule, message, evidence: { field, observed: value, threshold, pair: requested.canonicalPair || requested.pair, sources: context.metrics[field].sourceCount }, remediation: "Refresh the route or wait for safer market conditions, then obtain fresh evidence and resubmit." });
    } else {
      state.checksPassed.push(`${rule} is within policy`);
      state.findings.push(finding({ rule, message: `${rule} is within the configured limit.`, evidence: { field, observed: value, threshold } }));
    }
  }

  context.evidenceFingerprint = hash({ requested, sources: independent.map((item) => ({ source: item.source, observedAt: item.observedAt, inputAmount: item.inputAmount, quoteId: item.quoteId, routeFingerprint: item.routeFingerprint, metrics: item.metrics, evidenceReference: item.evidenceReference })), config });
  context.status = state.hardBlock ? "blocked" : state.needsReview ? "review_required" : "passed";
  if (!state.hardBlock && !state.needsReview) {
    state.checksPassed.push("Market-risk evidence passed the configured deterministic thresholds.");
    state.findings.push(finding({ rule: "Market-risk decision", message: "Available market-risk signals are within the configured deterministic thresholds.", evidence: { pair: requested.canonicalPair || requested.pair, sourceCount: independent.length, evidenceFingerprint: context.evidenceFingerprint } }));
  }
  return { ...state, context };
}
