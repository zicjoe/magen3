import { resolve } from "node:path";
import { classifyCasperWalletIdentifier } from "./walletValidation.mjs";
import { classifyCasperContractIdentifier } from "./contractValidation.mjs";
import { readUtf8FileLimited } from "./safeFeedFile.mjs";
import { screenThreatSubjectsWithProviders, getThreatIntelligenceProviderCapabilities, resetThreatIntelligenceProviderState } from "./threatIntelligenceProviders.mjs";

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_FEED_AGE_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const MAX_FEED_BYTES = 1_000_000;
const MAX_INDICATORS = 10_000;

let cached = null;

function clean(value) {
  return String(value ?? "").trim();
}

function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeSeverity(value) {
  const normalized = clean(value).toLowerCase();
  return Object.hasOwn(SEVERITY_RANK, normalized) ? normalized : "medium";
}

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeMode(value) {
  const normalized = clean(value).toLowerCase();
  if (["enforce", "block"].includes(normalized)) return "Enforce";
  if (["review", "review matches"].includes(normalized)) return "Review";
  return "Observe";
}

function normalizeUnavailableAction(value) {
  const normalized = clean(value).toLowerCase();
  if (["block", "fail closed", "fail-closed"].includes(normalized)) return "Block";
  if (["review", "manual review"].includes(normalized)) return "Review";
  return "Warn";
}

function asStringArray(value, limit = 20) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item))
    .filter(Boolean)
    .slice(0, limit);
}

function parseJson(raw, sourceLabel) {
  if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) {
    throw new Error(`${sourceLabel} exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${sourceLabel} is not valid JSON`);
  }
}

async function readRemoteBodyLimited(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FEED_BYTES) {
    throw new Error(`Threat intelligence feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) {
      throw new Error(`Threat intelligence feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
    }
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
        await reader.cancel("Threat intelligence feed exceeded the safety limit").catch(() => {});
        throw new Error(`Threat intelligence feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } finally {
    reader.releaseLock();
  }
}

export function canonicalThreatIdentity(value, typeHint = "", options = {}) {
  const raw = clean(value);
  if (!raw) return null;
  const hint = clean(typeHint).toLowerCase();
  const chainId = clean(options.chainId || options.chain_id);

  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) {
    const normalized = raw.toLowerCase();
    const subjectType = hint.includes("token") || hint.includes("asset") ? "asset_contract" : hint.includes("router") ? "router" : hint.includes("recipient") ? "payment_recipient" : hint.includes("contract") ? "contract" : "wallet";
    return { canonical: `evm:${chainId || "unknown"}:${normalized}`, value: raw, normalized, kind: "evm-address", label: "EVM address", subjectType, chainFamily: "evm", chainId };
  }

  if (hint.includes("url") || hint.includes("origin") || /^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!["https:", "http:"].includes(url.protocol)) return null;
      const origin = url.origin.toLowerCase();
      return { canonical: `url-origin:${origin}`, value: raw, normalized: origin, kind: "url-origin", label: "URL origin", subjectType: "url_origin", chainFamily: "web", chainId: "" };
    } catch { return null; }
  }
  if (hint.includes("domain") || hint.includes("hostname")) {
    const normalized = raw.toLowerCase().replace(/\.$/, "");
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized)) return null;
    return { canonical: `domain:${normalized}`, value: raw, normalized, kind: "domain", label: "Domain", subjectType: "domain", chainFamily: "web", chainId: "" };
  }
  if (hint.includes("protocol") || hint.includes("provider")) {
    const normalized = raw.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-|-$/g, "");
    if (!normalized || normalized.length > 160) return null;
    const subjectType = hint.includes("bridge") ? "bridge_provider" : hint.includes("resource") ? "resource_provider" : "protocol";
    return { canonical: `${subjectType}:${normalized}`, value: raw, normalized, kind: subjectType, label: subjectType.replace(/_/g, " "), subjectType, chainFamily: "agnostic", chainId: "" };
  }

  const wallet = classifyCasperWalletIdentifier(raw, { allowAccountHash: true });
  if (wallet.valid) {
    return {
      canonical: wallet.kind === "account-hash" ? `account:${wallet.normalized}` : `wallet:${wallet.normalized}`,
      value: raw,
      normalized: wallet.normalized,
      kind: wallet.kind,
      label: wallet.label,
      subjectType: "wallet",
      chainFamily: "casper",
      chainId: chainId || clean(options.chainName),
    };
  }

  const contract = classifyCasperContractIdentifier(raw, typeHint);
  if (contract.valid) {
    return {
      canonical: contract.canonical,
      value: raw,
      normalized: contract.normalized,
      kind: contract.kind,
      label: contract.label,
      subjectType: hint.includes("asset") || hint.includes("token") ? "asset_contract" : "contract",
      chainFamily: "casper",
      chainId: chainId || clean(options.chainName),
    };
  }

  return null;
}

function inferChainContext(request = {}) {
  const x402Network = clean(request.x402?.network || request.payment?.network);
  const executionNetwork = clean(request.executionNetwork || request.network || request.targetChain);
  const rawChainId = clean(request.chainId || request.executionChainId || request.rpcIntegrity?.chainId || request.rpcIntegrity?.expectedChainId || request.bridge?.sourceChainId || (x402Network.startsWith("eip155:") ? x402Network.split(":")[1] : ""));
  const evmHint = x402Network.startsWith("eip155:") || /^eip155:/i.test(executionNetwork) || /^\d+$/.test(rawChainId) || /evm|ethereum|base|arbitrum|optimism|polygon|bsc/i.test(executionNetwork);
  return { chainFamily: evmHint ? "evm" : /casper/i.test(executionNetwork) || clean(request.chainName) ? "casper" : "agnostic", chainId: rawChainId, chainName: clean(request.chainName || executionNetwork) };
}

export function collectThreatSubjects(request = {}) {
  const chain = inferChainContext(request);
  const candidates = [];
  const push = (role, value, typeHint = "", options = {}) => {
    const identity = canonicalThreatIdentity(value, typeHint, { chainId: options.chainId ?? chain.chainId, chainName: options.chainName ?? chain.chainName });
    if (identity) candidates.push({ ...identity, role, subjectType: options.subjectType || identity.subjectType || "unknown", chainFamily: options.chainFamily || identity.chainFamily || chain.chainFamily, chainId: clean(options.chainId ?? identity.chainId ?? chain.chainId) });
  };
  push("execution-wallet", request.executionWalletAddress || request.walletAddress, "wallet");
  push("target", request.target, request.contractIdentifierType || request.targetType || "");
  push("asset-contract", request.assetContractAddress || request.assetIdentity?.contractAddress || request.assetIdentity?.assetContractAddress, "asset contract", { subjectType: "asset_contract" });
  push("router", request.tradingRoute?.router || request.router, "router", { subjectType: "router" });
  push("bridge-recipient", request.bridge?.recipient || request.bridge?.destinationAddress, "recipient", { subjectType: "bridge_recipient", chainId: request.bridge?.destinationChainId || chain.chainId, chainFamily: "evm" });
  push("bridge-provider", request.bridge?.providerId || request.bridge?.provider, "bridge provider", { subjectType: "bridge_provider", chainFamily: "agnostic", chainId: "" });
  push("x402-payer", request.x402?.payer, "wallet", { subjectType: "wallet" });
  push("x402-recipient", request.x402?.payTo || request.x402?.recipient, "payment recipient", { subjectType: "payment_recipient", chainId: x402ChainId(request.x402?.network) || chain.chainId, chainFamily: request.x402?.network?.startsWith?.("eip155:") ? "evm" : chain.chainFamily });
  push("resource-origin", request.x402?.resource || request.x402?.resourceUrl || request.resourceUrl, "url origin", { subjectType: "url_origin", chainFamily: "web", chainId: "" });
  push("resource-provider", request.x402?.merchant || request.resourceProvider, "domain", { subjectType: "domain", chainFamily: "web", chainId: "" });
  push("rpc-endpoint", request.rpcIntegrity?.selectedEndpoint || request.rpcIntegrity?.endpoint, "url origin", { subjectType: "rpc_endpoint", chainFamily: "web", chainId: chain.chainId });
  push("token-spender", request.tokenPermission?.spender, "contract", { subjectType: "contract" });
  const seen = new Set();
  return candidates.filter((subject) => {
    const key = `${subject.role}|${subject.canonical}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function x402ChainId(network) {
  const value = clean(network);
  return value.startsWith("eip155:") ? value.slice("eip155:".length) : "";
}

function normalizeIndicator(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = clean(raw.value || raw.identifier || raw.address || raw.hash);
  const identity = canonicalThreatIdentity(value, raw.identifierType || raw.identifier_type || raw.subjectType || raw.subject_type || raw.type || "", { chainId: raw.chainId || raw.chain_id || "", chainName: raw.chainName || raw.chain_name || "" });
  if (!identity) return null;

  const expiresAt = clean(raw.expiresAt || raw.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : null;
  return {
    id: clean(raw.id) || `indicator-${index + 1}`,
    value,
    canonical: identity.canonical,
    kind: identity.kind,
    subjectType: identity.subjectType || clean(raw.subjectType || raw.subject_type) || "unknown",
    chainFamily: identity.chainFamily || clean(raw.chainFamily || raw.chain_family) || "agnostic",
    chainId: identity.chainId || clean(raw.chainId || raw.chain_id),
    providerId: clean(raw.providerId || raw.provider_id) || "operator-feed",
    providerVersion: clean(raw.providerVersion || raw.provider_version || raw.version),
    evidenceHash: clean(raw.evidenceHash || raw.evidence_hash),
    cached: Boolean(raw.cached),
    providerVerdict: clean(raw.providerVerdict || raw.provider_verdict),
    retrievalTimestamp: clean(raw.retrievalTimestamp || raw.retrieval_timestamp),
    label: clean(raw.label || raw.name) || "Threat indicator match",
    description: clean(raw.description || raw.message),
    severity: normalizeSeverity(raw.severity),
    confidence: normalizeConfidence(raw.confidence),
    categories: asStringArray(raw.categories || raw.tags, 12),
    source: clean(raw.source),
    firstSeenAt: clean(raw.firstSeenAt || raw.first_seen_at),
    lastSeenAt: clean(raw.lastSeenAt || raw.last_seen_at),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : "",
    references: asStringArray(raw.references || raw.urls, 5),
  };
}

export function normalizeThreatFeed(raw, { sourceType = "unknown", sourceName = "Threat intelligence feed", now = new Date() } = {}) {
  const root = Array.isArray(raw) ? { indicators: raw } : raw && typeof raw === "object" ? raw : {};
  const supplied = Array.isArray(root.indicators) ? root.indicators : [];
  if (supplied.length > MAX_INDICATORS) {
    throw new Error(`Threat intelligence feed exceeds the ${MAX_INDICATORS}-indicator safety limit`);
  }

  const deduplicated = new Map();
  supplied.forEach((item, index) => {
    const indicator = normalizeIndicator(item, index);
    if (!indicator) return;
    const current = deduplicated.get(indicator.canonical);
    const currentSeverity = current ? SEVERITY_RANK[current.severity] : -1;
    const incomingSeverity = SEVERITY_RANK[indicator.severity];
    if (!current || incomingSeverity > currentSeverity || (incomingSeverity === currentSeverity && indicator.confidence > current.confidence)) {
      deduplicated.set(indicator.canonical, indicator);
    }
  });

  const generatedAtRaw = clean(root.generatedAt || root.generated_at || root.updatedAt || root.updated_at);
  const generatedAtMs = generatedAtRaw ? Date.parse(generatedAtRaw) : Number.NaN;
  // A missing or invalid source timestamp cannot honestly be treated as fresh.
  // applyFreshness() will mark this snapshot stale until the feed publishes one.
  const generatedAt = Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString() : "";

  return {
    status: "available",
    sourceType,
    sourceName: clean(root.source || root.name) || sourceName,
    version: clean(root.version) || "1",
    generatedAt,
    fetchedAt: now.toISOString(),
    indicatorCount: deduplicated.size,
    indicators: [...deduplicated.values()],
    error: "",
  };
}

function configuredSource(env = process.env) {
  const inline = clean(env.THREAT_INTELLIGENCE_FEED_JSON);
  if (inline) return { type: "inline", value: inline, name: "THREAT_INTELLIGENCE_FEED_JSON" };

  const filePath = clean(env.THREAT_INTELLIGENCE_FEED_PATH);
  if (filePath) {
    const resolvedPath = resolve(filePath);
    return { type: "file", value: resolvedPath, name: resolvedPath };
  }

  const remoteUrl = clean(env.THREAT_INTELLIGENCE_FEED_URL);
  if (remoteUrl) return { type: "remote", value: remoteUrl, name: remoteUrl };

  return null;
}

function sourceCacheKey(source, env = process.env) {
  if (!source) return "none";
  const authenticationMode = clean(env.THREAT_INTELLIGENCE_API_KEY) ? "bearer" : "none";
  return [
    source.type,
    source.value,
    clean(env.THREAT_INTELLIGENCE_MAX_AGE_MS),
    clean(env.THREAT_INTELLIGENCE_CACHE_TTL_MS),
    authenticationMode,
  ].join("|");
}

function validateRemoteUrl(value, env = process.env) {
  const url = new URL(value);
  const localDevelopment = ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("THREAT_INTELLIGENCE_FEED_URL must use HTTPS in production");
  }
  return url;
}

async function loadConfiguredFeed(source, { env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (source.type === "inline") {
    return normalizeThreatFeed(parseJson(source.value, source.name), { sourceType: "inline", sourceName: source.name, now });
  }

  if (source.type === "file") {
    const raw = await readUtf8FileLimited(source.value, { maxBytes: MAX_FEED_BYTES, sourceLabel: source.name });
    return normalizeThreatFeed(parseJson(raw, source.name), { sourceType: "file", sourceName: source.name, now });
  }

  if (typeof fetchImpl !== "function") throw new Error("Remote threat intelligence requires fetch support");
  const url = validateRemoteUrl(source.value, env);
  const timeoutMs = safeInteger(env.THREAT_INTELLIGENCE_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, { min: 250, max: 15_000 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    const apiKey = clean(env.THREAT_INTELLIGENCE_API_KEY);
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`Threat intelligence feed returned HTTP ${response.status}`);
    const raw = await readRemoteBodyLimited(response);
    return normalizeThreatFeed(parseJson(raw, source.name), { sourceType: "remote", sourceName: source.name, now });
  } finally {
    clearTimeout(timeout);
  }
}

function applyFreshness(snapshot, { env = process.env, now = new Date() } = {}) {
  if (!snapshot || snapshot.status !== "available") return snapshot;
  const maxAgeMs = safeInteger(env.THREAT_INTELLIGENCE_MAX_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 60_000, max: 30 * 24 * 60 * 60 * 1_000 });
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  const futureSkewMs = Number.isFinite(generatedAtMs) ? generatedAtMs - now.getTime() : Number.POSITIVE_INFINITY;
  const ageMs = Number.isFinite(generatedAtMs) ? Math.max(0, now.getTime() - generatedAtMs) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(generatedAtMs) && futureSkewMs > MAX_FUTURE_SKEW_MS) {
    return {
      ...snapshot,
      status: "stale",
      ageMs: 0,
      maxAgeMs,
      error: "Threat intelligence feed timestamp is too far in the future",
    };
  }
  if (ageMs <= maxAgeMs) return { ...snapshot, ageMs, maxAgeMs };
  return {
    ...snapshot,
    status: "stale",
    ageMs,
    maxAgeMs,
    error: `Threat intelligence feed is older than ${Math.round(maxAgeMs / 3_600_000)} hours`,
  };
}

async function getConfiguredThreatFeedSnapshot({ force = false, env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const source = configuredSource(env);
  const cacheKey = sourceCacheKey(source, env);
  const cacheTtlMs = safeInteger(env.THREAT_INTELLIGENCE_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, { min: 1_000, max: 24 * 60 * 60 * 1_000 });

  if (!force && cached && cached.key === cacheKey && cached.expiresAt > now.getTime()) {
    return applyFreshness(cached.snapshot, { env, now });
  }

  if (!source) {
    const snapshot = {
      status: "unavailable",
      sourceType: "none",
      sourceName: "No threat intelligence feed configured",
      version: "",
      generatedAt: "",
      fetchedAt: now.toISOString(),
      indicatorCount: 0,
      indicators: [],
      error: "Configure THREAT_INTELLIGENCE_FEED_PATH, THREAT_INTELLIGENCE_FEED_JSON, or THREAT_INTELLIGENCE_FEED_URL.",
    };
    cached = { key: cacheKey, expiresAt: now.getTime() + cacheTtlMs, snapshot };
    return snapshot;
  }

  try {
    const loaded = await loadConfiguredFeed(source, { env, fetchImpl, now });
    cached = { key: cacheKey, expiresAt: now.getTime() + cacheTtlMs, snapshot: loaded };
    return applyFreshness(loaded, { env, now });
  } catch (cause) {
    const previous = cached?.key === cacheKey && cached?.snapshot?.indicators?.length ? cached.snapshot : null;
    if (previous) {
      return {
        ...applyFreshness(previous, { env, now }),
        status: "stale",
        fetchedAt: now.toISOString(),
        error: cause instanceof Error ? cause.message : "Threat intelligence feed could not be refreshed",
      };
    }
    const snapshot = {
      status: "unavailable",
      sourceType: source.type,
      sourceName: source.name,
      version: "",
      generatedAt: "",
      fetchedAt: now.toISOString(),
      indicatorCount: 0,
      indicators: [],
      error: cause instanceof Error ? cause.message : "Threat intelligence feed could not be loaded",
    };
    cached = { key: cacheKey, expiresAt: now.getTime() + Math.min(cacheTtlMs, 30_000), snapshot };
    return snapshot;
  }
}

function mergeThreatSnapshots(base, providerResult, subjects, now = new Date()) {
  const providerEvidence = Array.isArray(providerResult?.evidence) ? providerResult.evidence : [];
  const providerIndicators = Array.isArray(providerResult?.indicators) ? providerResult.indicators : [];
  const indicators = [...(Array.isArray(base?.indicators) ? base.indicators : []), ...providerIndicators];
  const providerIds = [...new Set([...(base?.status === "available" || base?.status === "stale" ? ["operator-feed"] : []), ...(providerResult?.providerIds || [])])];
  const availableProviderIds = [...new Set([...(base?.status === "available" ? ["operator-feed"] : []), ...providerEvidence.map((item) => item.providerId).filter(Boolean)])];
  const verdicts = new Map();
  for (const evidence of providerEvidence) {
    const list = verdicts.get(evidence.subject) || [];
    list.push({ providerId: evidence.providerId, verdict: evidence.providerVerdict });
    verdicts.set(evidence.subject, list);
  }
  const disagreements = [...verdicts.entries()].flatMap(([subject, entries]) => {
    const values = new Set(entries.map((entry) => entry.verdict).filter(Boolean));
    return values.size > 1 ? [{ subject, entries }] : [];
  });
  const providerConfigured = (providerResult?.providerIds || []).length > 0;
  const providerAvailable = providerEvidence.length > 0;
  let status = base?.status || "unavailable";
  if (providerAvailable && status !== "available") status = "available";
  if (!providerAvailable && providerConfigured && status === "unavailable" && providerResult?.status === "unsupported") status = "unavailable";
  return {
    ...base,
    status,
    sourceType: providerAvailable && base?.status === "available" ? "combined" : providerAvailable ? "provider" : base?.sourceType,
    sourceName: providerAvailable && base?.status === "available" ? "Operator feed + production provider evidence" : providerAvailable ? "Production threat-intelligence providers" : base?.sourceName,
    generatedAt: providerAvailable ? now.toISOString() : base?.generatedAt,
    fetchedAt: now.toISOString(),
    indicatorCount: indicators.length,
    indicators,
    providerEvidence,
    providerStatuses: providerResult?.providerStatuses || [],
    configuredProviderIds: providerIds,
    availableProviderIds,
    providerErrors: providerResult?.errors || [],
    providerDisagreement: disagreements.length > 0,
    providerDisagreements: disagreements,
    checkedSubjects: subjects.map((item) => ({ role: item.role, subjectType: item.subjectType, canonical: item.canonical, chainFamily: item.chainFamily, chainId: item.chainId })),
  };
}

export async function getThreatIntelligenceSnapshot({ force = false, env = process.env, fetchImpl = globalThis.fetch, now = new Date(), request = null } = {}) {
  const base = await getConfiguredThreatFeedSnapshot({ force, env, fetchImpl, now });
  if (!request || typeof request !== "object") return { ...base, providerCapabilities: getThreatIntelligenceProviderCapabilities({ env }) };
  const subjects = collectThreatSubjects(request);
  const providerResult = await screenThreatSubjectsWithProviders(subjects, { env, fetchImpl, now, force });
  return { ...mergeThreatSnapshots(base, providerResult, subjects, now), providerCapabilities: getThreatIntelligenceProviderCapabilities({ env }) };
}

export function resetThreatIntelligenceCache() {
  cached = null;
  resetThreatIntelligenceProviderState();
}

function safeSourceName(snapshot = {}) {
  const sourceType = snapshot.sourceType || "none";
  const sourceName = clean(snapshot.sourceName);
  if (!sourceName) return sourceType === "none" ? "No threat intelligence feed configured" : "Configured threat intelligence feed";
  if (sourceType === "remote") {
    try {
      const url = new URL(sourceName);
      return `Remote feed (${url.hostname})`;
    } catch {
      return sourceName;
    }
  }
  if (sourceType === "file" && (sourceName.includes("/") || sourceName.includes("\\"))) return "Configured local feed";
  if (sourceType === "inline" && sourceName === "THREAT_INTELLIGENCE_FEED_JSON") return "Configured inline feed";
  return sourceName;
}

function safePublicError(snapshot = {}) {
  if (snapshot.status === "available") return "";
  const error = clean(snapshot.error);
  if (!error) return "";
  if (snapshot.status === "stale" && /older than|timestamp is too far in the future/i.test(error)) return error;
  if (snapshot.sourceType === "none") return "No threat intelligence feed is configured.";
  if (snapshot.sourceType === "file") return snapshot.status === "stale"
    ? "The configured local threat intelligence feed could not be refreshed; cached data is stale."
    : "The configured local threat intelligence feed could not be loaded.";
  if (snapshot.sourceType === "remote") return snapshot.status === "stale"
    ? "The configured remote threat intelligence feed could not be refreshed; cached data is stale."
    : "The configured remote threat intelligence feed could not be loaded.";
  if (snapshot.sourceType === "inline") return "The configured inline threat intelligence feed is unavailable or invalid.";
  return "Threat intelligence is unavailable.";
}

export function summarizeThreatIntelligenceSnapshot(snapshot = {}, now = new Date()) {
  const activeIndicatorCount = activeIndicators(snapshot, now).length;
  return {
    status: snapshot.status || "unavailable",
    sourceType: snapshot.sourceType || "none",
    sourceName: safeSourceName(snapshot),
    generatedAt: snapshot.generatedAt || "",
    fetchedAt: snapshot.fetchedAt || "",
    indicatorCount: Number(snapshot.indicatorCount || 0),
    activeIndicatorCount,
    ageMs: Number.isFinite(snapshot.ageMs) ? snapshot.ageMs : null,
    maxAgeMs: Number.isFinite(snapshot.maxAgeMs) ? snapshot.maxAgeMs : null,
    error: safePublicError(snapshot),
    configuredProviderIds: Array.isArray(snapshot.configuredProviderIds) ? snapshot.configuredProviderIds.slice(0, 10) : [],
    availableProviderIds: Array.isArray(snapshot.availableProviderIds) ? snapshot.availableProviderIds.slice(0, 10) : [],
    providerStatuses: Array.isArray(snapshot.providerStatuses) ? snapshot.providerStatuses.slice(0, 10) : [],
    providerDisagreement: Boolean(snapshot.providerDisagreement),
    providerCapabilities: Array.isArray(snapshot.providerCapabilities) ? snapshot.providerCapabilities.map((item) => ({ id: item.id, name: item.name, version: item.version, enabled: item.enabled, configured: item.configured, health: item.health, subjectTypes: item.subjectTypes, chainFamilies: item.chainFamilies })) : [],
  };
}

function normalizePolicyList(value, limit = 50) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item).toLowerCase())
    .filter(Boolean)
    .slice(0, limit);
}

function policySettings(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const unavailableAction = normalizeUnavailableAction(rules.threatIntelligenceUnavailableAction);
  return {
    mode: normalizeMode(rules.threatIntelligenceMode),
    required: Boolean(rules.threatIntelligenceRequired),
    unavailableAction,
    providerUnavailableAction: normalizeUnavailableAction(rules.threatIntelligenceProviderUnavailableAction || rules.threatIntelligenceUnavailableAction),
    disagreementAction: normalizeUnavailableAction(rules.threatIntelligenceProviderDisagreementAction || "Review"),
    unknownSubjectAction: normalizeUnavailableAction(rules.threatIntelligenceUnknownSubjectAction || "Warn"),
    minConfidence: safeInteger(rules.threatIntelligenceMinConfidence, 70, { min: 0, max: 100 }),
    maxEvidenceAgeSeconds: safeInteger(rules.threatIntelligenceMaxEvidenceAgeSeconds, 86_400, { min: 60, max: 30 * 86_400 }),
    minProviderQuorum: safeInteger(rules.threatIntelligenceMinimumProviderQuorum, 1, { min: 1, max: 10 }),
    allowedProviders: normalizePolicyList(rules.threatIntelligenceAllowedProviders, 20),
    blockedCategories: normalizePolicyList(rules.threatIntelligenceBlockedCategories, 30),
    reviewCategories: normalizePolicyList(rules.threatIntelligenceReviewCategories, 30),
    cacheAllowed: rules.threatIntelligenceCacheAllowed !== false,
    falsePositiveOverrides: new Set(normalizePolicyList(rules.threatIntelligenceFalsePositiveOverrides, 100)),
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Threat Intelligence", status, severity, rule, message, evidence, remediation };
}

function requestEntities(request = {}) {
  return collectThreatSubjects(request);
}

function activeIndicators(snapshot = {}, now = new Date()) {
  return (Array.isArray(snapshot.indicators) ? snapshot.indicators : []).filter((indicator) => {
    if (!indicator.expiresAt) return true;
    const expiresAtMs = Date.parse(indicator.expiresAt);
    return !Number.isFinite(expiresAtMs) || expiresAtMs > now.getTime();
  });
}

export function evaluateThreatIntelligence({ request = {}, policy = {}, snapshot = {}, now = new Date() } = {}) {
  const findings = [];
  const checksPassed = [];
  const checksFailed = [];
  let scoreDelta = 0;
  let hardBlock = false;
  let needsReview = false;
  const settings = policySettings(policy);
  const entities = requestEntities(request);
  const context = {
    ...summarizeThreatIntelligenceSnapshot(snapshot, now),
    mode: settings.mode,
    required: settings.required,
    unavailableAction: settings.unavailableAction,
    providerUnavailableAction: settings.providerUnavailableAction,
    providerDisagreementAction: settings.disagreementAction,
    unknownSubjectAction: settings.unknownSubjectAction,
    minConfidence: settings.minConfidence,
    maxEvidenceAgeSeconds: settings.maxEvidenceAgeSeconds,
    minimumProviderQuorum: settings.minProviderQuorum,
    allowedProviders: settings.allowedProviders,
    blockedCategories: settings.blockedCategories,
    reviewCategories: settings.reviewCategories,
    cacheAllowed: settings.cacheAllowed,
    checkedEntities: entities.map((entity) => ({ role: entity.role, kind: entity.kind, subjectType: entity.subjectType, canonical: entity.canonical, chainFamily: entity.chainFamily, chainId: entity.chainId })),
    matchedIndicators: [],
    overriddenIndicators: [],
    evidenceFreshnessRejected: [],
  };

  const applyConfiguredAction = (action, { rule, message, evidence, remediation, severity = "medium", scoreBlock = 35, scoreReview = 14, scoreWarn = 2 }) => {
    if (action === "Block") {
      findings.push(finding({ status: "fail", severity: severity === "low" ? "high" : severity, rule, message, evidence, remediation }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += scoreBlock;
    } else if (action === "Review") {
      findings.push(finding({ status: "unavailable", severity, rule, message, evidence, remediation }));
      checksFailed.push(message);
      needsReview = true;
      scoreDelta += scoreReview;
    } else {
      findings.push(finding({ status: "unavailable", severity: "low", rule, message, evidence, remediation }));
      scoreDelta += scoreWarn;
    }
  };

  if (entities.length === 0) {
    const message = "Threat intelligence could not normalize a supported subject from this request.";
    if (settings.required || settings.unknownSubjectAction !== "Warn") {
      applyConfiguredAction(settings.unknownSubjectAction, {
        rule: "Threat subject normalization",
        message,
        evidence: { actionType: request.actionType || "", targetType: request.targetType || "", policyAction: settings.unknownSubjectAction },
        remediation: "Provide a supported chain-aware wallet, contract, asset contract, URL origin, domain, RPC endpoint, router, bridge provider, or payment recipient identifier.",
      });
    } else {
      findings.push(finding({
        status: "skipped",
        rule: "Threat intelligence applicability",
        message,
        evidence: { actionType: request.actionType || "", targetType: request.targetType || "" },
        remediation: "Provide a supported subject when threat screening is required for this action.",
      }));
    }
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  findings.push(finding({
    status: "pass",
    rule: "Threat intelligence applicability",
    message: `${entities.length} chain-aware threat subject${entities.length === 1 ? " is" : "s are"} available for deterministic screening.`,
    evidence: { entities: context.checkedEntities },
  }));

  if (snapshot.status !== "available") {
    const unavailableStatus = snapshot.status === "stale" ? "stale" : "unavailable";
    const message = unavailableStatus === "stale"
      ? "Configured threat intelligence evidence is stale, so current reputation could not be confirmed."
      : "No usable threat intelligence evidence is available for this request.";
    applyConfiguredAction(settings.unavailableAction, {
      rule: "Threat feed availability",
      message,
      evidence: { ...summarizeThreatIntelligenceSnapshot(snapshot, now), policyAction: settings.unavailableAction },
      remediation: "Restore a fresh trusted provider or operator feed, or change the policy only after authorized risk review.",
      severity: "medium",
    });
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  const summary = summarizeThreatIntelligenceSnapshot(snapshot, now);
  findings.push(finding({
    status: "pass",
    rule: "Threat intelligence availability",
    message: `Threat intelligence evidence is available from ${summary.availableProviderIds?.length || 0} active provider source${summary.availableProviderIds?.length === 1 ? "" : "s"}.`,
    evidence: summary,
  }));
  checksPassed.push("Threat intelligence evidence is available");

  const allowedProviders = settings.allowedProviders.length ? new Set(settings.allowedProviders) : null;
  const availableProviders = (Array.isArray(snapshot.availableProviderIds) ? snapshot.availableProviderIds : [])
    .map((value) => clean(value).toLowerCase())
    .filter((value) => !allowedProviders || allowedProviders.has(value));
  const uniqueAvailableProviders = [...new Set(availableProviders)];
  const configuredRequiredProviders = allowedProviders ? [...allowedProviders] : [];
  const missingRequiredProviders = configuredRequiredProviders.filter((id) => !uniqueAvailableProviders.includes(id));
  const providerQuorumMissing = uniqueAvailableProviders.length < settings.minProviderQuorum;
  if ((missingRequiredProviders.length > 0 || providerQuorumMissing) && (settings.required || settings.allowedProviders.length > 0 || settings.minProviderQuorum > 1)) {
    const message = missingRequiredProviders.length
      ? `Required threat-intelligence provider evidence is unavailable: ${missingRequiredProviders.join(", ")}.`
      : `Threat-intelligence provider quorum requires ${settings.minProviderQuorum} source(s), but only ${uniqueAvailableProviders.length} are available.`;
    applyConfiguredAction(settings.providerUnavailableAction, {
      rule: "Threat provider availability",
      message,
      evidence: { requiredProviders: configuredRequiredProviders, availableProviders: uniqueAvailableProviders, minimumProviderQuorum: settings.minProviderQuorum, policyAction: settings.providerUnavailableAction, providerStatuses: summary.providerStatuses },
      remediation: "Restore the required provider configuration or explicitly revise the policy after authorized review.",
    });
  }

  if (snapshot.providerDisagreement) {
    const message = "Configured threat-intelligence providers disagree for at least one exact screened subject.";
    applyConfiguredAction(settings.disagreementAction, {
      rule: "Threat provider disagreement",
      message,
      evidence: { policyAction: settings.disagreementAction, disagreementCount: Array.isArray(snapshot.providerDisagreements) ? snapshot.providerDisagreements.length : 1 },
      remediation: "Investigate provider disagreement before changing provider quorum or enforcement policy.",
      scoreBlock: 40,
      scoreReview: 18,
      scoreWarn: 6,
    });
  }

  const maxEvidenceAgeMs = settings.maxEvidenceAgeSeconds * 1000;
  const active = activeIndicators(snapshot, now).filter((indicator) => {
    const providerId = clean(indicator.providerId || (indicator.source === snapshot.sourceName ? "operator-feed" : "operator-feed")).toLowerCase();
    if (allowedProviders && !allowedProviders.has(providerId)) return false;
    const timestamp = clean(indicator.retrievalTimestamp || indicator.lastSeenAt || snapshot.generatedAt);
    const timestampMs = Date.parse(timestamp);
    if (Number.isFinite(timestampMs) && now.getTime() - timestampMs > maxEvidenceAgeMs) {
      context.evidenceFreshnessRejected.push({ indicatorId: indicator.id, providerId, ageSeconds: Math.max(0, Math.floor((now.getTime() - timestampMs) / 1000)) });
      return false;
    }
    return true;
  });
  if (context.evidenceFreshnessRejected.length > 0) {
    const message = `${context.evidenceFreshnessRejected.length} threat indicator${context.evidenceFreshnessRejected.length === 1 ? " was" : "s were"} rejected because provider evidence exceeded the policy freshness limit.`;
    findings.push(finding({
      status: "warning",
      severity: "medium",
      rule: "Threat evidence freshness",
      message,
      evidence: { maximumEvidenceAgeSeconds: settings.maxEvidenceAgeSeconds, rejected: context.evidenceFreshnessRejected.slice(0, 20) },
      remediation: "Refresh provider evidence before relying on stale indicators.",
    }));
    scoreDelta += 4;
  }

  const matches = entities.flatMap((entity) => active.flatMap((indicator) => indicator.canonical === entity.canonical ? [{ entity, indicator }] : []));
  context.matchedIndicators = matches.map(({ entity, indicator }) => ({
    entityRole: entity.role,
    subjectType: entity.subjectType,
    chainFamily: entity.chainFamily,
    chainId: entity.chainId,
    kind: entity.kind,
    indicatorId: indicator.id,
    severity: indicator.severity,
    confidence: indicator.confidence,
    categories: indicator.categories,
    source: indicator.source || snapshot.sourceName,
    providerId: indicator.providerId || "operator-feed",
    providerVersion: indicator.providerVersion || "",
    evidenceHash: indicator.evidenceHash || "",
    cached: Boolean(indicator.cached),
    providerVerdict: indicator.providerVerdict || "",
  }));

  const enforceableMatches = matches.filter(({ indicator }) => {
    const id = clean(indicator.id).toLowerCase();
    const hash = clean(indicator.evidenceHash).toLowerCase();
    if (settings.falsePositiveOverrides.has(id) || (hash && settings.falsePositiveOverrides.has(hash))) {
      context.overriddenIndicators.push({ indicatorId: indicator.id, evidenceHash: indicator.evidenceHash || "", providerId: indicator.providerId || "operator-feed" });
      return false;
    }
    return true;
  });
  if (context.overriddenIndicators.length > 0) {
    findings.push(finding({
      status: "warning",
      severity: "medium",
      rule: "Threat false-positive override",
      message: `${context.overriddenIndicators.length} matched indicator${context.overriddenIndicators.length === 1 ? " is" : "s are"} suppressed by an explicit policy override.`,
      evidence: { overrides: context.overriddenIndicators.slice(0, 20) },
      remediation: "Keep overrides time-bounded operationally and remove them when the investigation is resolved.",
    }));
    scoreDelta += 4;
  }

  if (matches.length === 0) {
    const message = "No active exact-match threat indicator was found for the screened subjects in the available evidence.";
    findings.push(finding({
      status: "pass",
      rule: "Known threat indicator match",
      message,
      evidence: { checkedEntities: context.checkedEntities, availableProviders: uniqueAvailableProviders, generatedAt: snapshot.generatedAt },
    }));
    checksPassed.push(message);
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }
  if (enforceableMatches.length === 0) return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };

  const rankedMatches = [...enforceableMatches].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.indicator.severity] - SEVERITY_RANK[a.indicator.severity];
    return severityDelta || b.indicator.confidence - a.indicator.confidence;
  });
  const strongest = rankedMatches.find(({ indicator }) => indicator.confidence >= settings.minConfidence) || rankedMatches[0];
  const { entity, indicator } = strongest;
  const categories = (Array.isArray(indicator.categories) ? indicator.categories : []).map((value) => clean(value).toLowerCase());
  const belowConfidence = indicator.confidence < settings.minConfidence;
  const highSeverity = ["critical", "high"].includes(indicator.severity);
  const mediumSeverity = indicator.severity === "medium";
  const blockedByCategory = categories.some((category) => settings.blockedCategories.includes(category));
  const reviewByCategory = categories.some((category) => settings.reviewCategories.includes(category));
  const evidence = {
    entityRole: entity.role,
    subjectType: entity.subjectType,
    chainFamily: entity.chainFamily,
    chainId: entity.chainId,
    identifierKind: entity.kind,
    indicatorId: indicator.id,
    label: indicator.label,
    description: indicator.description,
    severity: indicator.severity,
    confidence: indicator.confidence,
    minimumConfidence: settings.minConfidence,
    categories: indicator.categories,
    source: indicator.source || snapshot.sourceName,
    providerId: indicator.providerId || "operator-feed",
    providerVersion: indicator.providerVersion || "",
    evidenceHash: indicator.evidenceHash || "",
    cached: Boolean(indicator.cached),
    firstSeenAt: indicator.firstSeenAt,
    lastSeenAt: indicator.lastSeenAt,
    references: indicator.references,
    mode: settings.mode,
  };

  if (belowConfidence) {
    const message = `A ${indicator.severity} threat indicator matched, but its ${indicator.confidence}% confidence is below the policy threshold of ${settings.minConfidence}%.`;
    findings.push(finding({ status: "warning", severity: "medium", rule: "Known threat indicator match", message, evidence, remediation: "Review the evidence; lower the confidence threshold only through an authorized policy change." }));
    checksFailed.push(message);
    scoreDelta += 8;
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  if (blockedByCategory || (settings.mode === "Enforce" && highSeverity)) {
    const categoryText = blockedByCategory ? ` a blocked policy category (${categories.filter((item) => settings.blockedCategories.includes(item)).join(", ")})` : ` ${indicator.severity}-severity`;
    const message = `Execution subject matched${categoryText} threat indicator: ${indicator.label}.`;
    findings.push(finding({ status: "fail", severity: highSeverity ? indicator.severity : "high", rule: blockedByCategory ? "Blocked threat category" : "Known threat indicator match", message, evidence, remediation: "Do not execute. Use a verified alternative subject or apply a documented false-positive override only after authorized investigation." }));
    checksFailed.push(message);
    hardBlock = true;
    scoreDelta += indicator.severity === "critical" ? 55 : 45;
  } else if (reviewByCategory || (settings.mode === "Enforce" && mediumSeverity) || (settings.mode === "Review" && ["critical", "high", "medium"].includes(indicator.severity))) {
    const message = `Execution subject matched a threat indicator and requires review: ${indicator.label}.`;
    findings.push(finding({ status: "warning", severity: indicator.severity, rule: reviewByCategory ? "Review threat category" : "Known threat indicator match", message, evidence, remediation: "Pause execution and investigate provider evidence before approving or changing policy." }));
    checksFailed.push(message);
    needsReview = true;
    scoreDelta += highSeverity ? 28 : 18;
  } else {
    const message = `Threat intelligence observed a ${indicator.severity}-severity exact match: ${indicator.label}.`;
    findings.push(finding({ status: "warning", severity: indicator.severity, rule: "Known threat indicator match", message, evidence, remediation: settings.mode === "Observe" ? "Review the match and change policy mode if this category should affect authorization." : "Review the indicator evidence before execution." }));
    checksFailed.push(message);
    scoreDelta += highSeverity ? 16 : 8;
  }

  return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
}

