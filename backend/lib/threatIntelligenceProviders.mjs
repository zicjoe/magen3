import { createHash } from "node:crypto";

const GOPLUS_BASE_URL = "https://api.gopluslabs.io";
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const DEFAULT_CIRCUIT_FAILURES = 3;
const DEFAULT_CIRCUIT_OPEN_MS = 60_000;
const cache = new Map();
const providerState = new Map();

function clean(value) { return String(value ?? "").trim(); }
function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
function envBool(value, fallback = false) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hashEvidence(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function redactMessage(error) {
  const message = clean(error instanceof Error ? error.message : error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/[?&](api[_-]?key|key|token|secret)=[^&\s]+/gi, "$1=[REDACTED]")
    .slice(0, 240) || "Threat-intelligence provider request failed";
}
function providerRuntime(id) {
  if (!providerState.has(id)) providerState.set(id, { failures: 0, circuitOpenUntil: 0, calls: [] });
  return providerState.get(id);
}
function rateLimit(providerId, env, nowMs) {
  const state = providerRuntime(providerId);
  const limit = safeInteger(env.THREAT_INTELLIGENCE_PROVIDER_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE, { min: 1, max: 10_000 });
  state.calls = state.calls.filter((timestamp) => nowMs - timestamp < 60_000);
  if (state.calls.length >= limit) throw Object.assign(new Error("Threat-intelligence provider rate limit reached"), { code: "RATE_LIMITED" });
  state.calls.push(nowMs);
}
function noteSuccess(providerId) {
  const state = providerRuntime(providerId);
  state.failures = 0;
  state.circuitOpenUntil = 0;
}
function noteFailure(providerId, env, nowMs) {
  const state = providerRuntime(providerId);
  state.failures += 1;
  const threshold = safeInteger(env.THREAT_INTELLIGENCE_CIRCUIT_FAILURE_THRESHOLD, DEFAULT_CIRCUIT_FAILURES, { min: 1, max: 20 });
  if (state.failures >= threshold) {
    const openMs = safeInteger(env.THREAT_INTELLIGENCE_CIRCUIT_OPEN_MS, DEFAULT_CIRCUIT_OPEN_MS, { min: 1_000, max: 60 * 60_000 });
    state.circuitOpenUntil = nowMs + openMs;
  }
}
function ensureCircuitClosed(providerId, nowMs) {
  const state = providerRuntime(providerId);
  if (state.circuitOpenUntil > nowMs) {
    throw Object.assign(new Error("Threat-intelligence provider circuit is open after repeated failures"), { code: "CIRCUIT_OPEN" });
  }
}
async function readBodyLimited(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(`Provider response exceeds ${maxBytes} bytes`);
  if (!response.body || typeof response.body.getReader !== "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new Error(`Provider response exceeds ${maxBytes} bytes`);
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
      if (bytes > maxBytes) {
        await reader.cancel("response too large").catch(() => {});
        throw new Error(`Provider response exceeds ${maxBytes} bytes`);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } finally {
    reader.releaseLock();
  }
}
function parseProviderJson(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Threat-intelligence provider returned malformed JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Threat-intelligence provider returned an invalid response object");
  return value;
}
function isTrue(value) { return value === true || value === 1 || clean(value) === "1" || clean(value).toLowerCase() === "true"; }
const GOPLUS_FLAG_CATEGORIES = {
  phishing_activities: "phishing",
  stealing_attack: "drainer_association",
  blackmail_activities: "blackmail",
  fake_kyc: "fraud",
  malicious_mining_activities: "malicious_mining",
  darkweb_transactions: "dark_market",
  cybercrime: "cybercrime",
  money_laundering: "money_laundering",
  financial_crime: "financial_crime",
  blacklist_doubt: "suspicious_address",
  mixer: "mixer",
  sanctioned: "sanctions_related",
  honeypot_related_address: "scam",
  malicious_address: "malicious_address",
  fake_token: "counterfeit_asset",
  gas_abuse: "gas_abuse",
  reinit: "reinitializable_contract",
  fake_standard_interface: "fake_standard_interface",
};
function normalizeGoPlusResult(payload, subject, { now = new Date(), cached = false } = {}) {
  if (payload.code !== undefined && Number(payload.code) !== 1) throw new Error(`GoPlus returned provider code ${clean(payload.code) || "unknown"}`);
  const result = payload.result && typeof payload.result === "object" ? payload.result : {};
  const categories = new Set();
  for (const [key, category] of Object.entries(GOPLUS_FLAG_CATEGORIES)) if (isTrue(result[key])) categories.add(category);
  const maliciousBehavior = Array.isArray(result.malicious_behavior) ? result.malicious_behavior : [];
  for (const value of maliciousBehavior) categories.add(GOPLUS_FLAG_CATEGORIES[clean(value)] || clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const nested = result.address_info && typeof result.address_info === "object" ? result.address_info : null;
  if (nested) {
    if (isTrue(nested.doubt_list)) categories.add("suspicious_address");
    for (const value of Array.isArray(nested.malicious_behavior) ? nested.malicious_behavior : []) categories.add(GOPLUS_FLAG_CATEGORIES[clean(value)] || clean(value).toLowerCase());
  }
  const filteredCategories = [...categories].filter(Boolean).slice(0, 20);
  const malicious = filteredCategories.length > 0;
  const verdict = malicious ? "malicious" : "no_known_indicator";
  const confidence = malicious ? 90 : 70;
  const severity = malicious ? (filteredCategories.some((item) => ["phishing", "drainer_association", "sanctions_related", "malicious_address", "cybercrime"].includes(item)) ? "high" : "medium") : "info";
  const providerReference = clean(result.address || result.address_info?.address || subject.normalized).slice(0, 160);
  const normalizedCore = {
    provider: "GoPlus Security",
    providerId: "goplus",
    providerVersion: "address-security-v1",
    subject: subject.canonical,
    subjectType: subject.subjectType,
    chainFamily: subject.chainFamily,
    chainId: subject.chainId,
    indicatorCategory: filteredCategories,
    severity,
    confidence,
    providerVerdict: verdict,
    evidenceSource: "GoPlus Malicious Address API",
    evidenceTimestamp: now.toISOString(),
    expiresAt: "",
    retrievalTimestamp: now.toISOString(),
    providerReference,
    providerDisagreement: false,
    cached,
    normalizationStatus: "normalized",
  };
  const evidenceHash = hashEvidence(normalizedCore);
  return {
    ...normalizedCore,
    evidenceHash,
    indicator: malicious ? {
      id: `goplus-${evidenceHash.slice(0, 16)}`,
      value: subject.normalized,
      canonical: subject.canonical,
      kind: subject.kind,
      label: `GoPlus ${filteredCategories.join(", ") || "risk"} indicator`,
      description: "GoPlus Security reported one or more risk indicators for this exact EVM address.",
      severity,
      confidence,
      categories: filteredCategories,
      source: "GoPlus Security",
      providerId: "goplus",
      providerVersion: "address-security-v1",
      firstSeenAt: "",
      lastSeenAt: now.toISOString(),
      expiresAt: "",
      references: [],
      evidenceHash,
      cached,
      providerVerdict: verdict,
      retrievalTimestamp: now.toISOString(),
    } : null,
  };
}

export const threatIntelligenceProviderRegistry = Object.freeze({
  goplus: Object.freeze({
    id: "goplus",
    name: "GoPlus Security",
    version: "address-security-v1",
    authentication: "optional-bearer",
    subjectTypes: ["wallet", "contract", "asset_contract", "payment_recipient", "bridge_recipient", "router"],
    chainFamilies: ["evm"],
    serverControlledOrigin: GOPLUS_BASE_URL,
  }),
});

function configuredProviderIds(env = process.env) {
  const explicit = clean(env.THREAT_INTELLIGENCE_PROVIDERS);
  if (explicit) return [...new Set(explicit.split(",").map((item) => clean(item).toLowerCase()).filter(Boolean))];
  return envBool(env.THREAT_INTELLIGENCE_GOPLUS_ENABLED, false) ? ["goplus"] : [];
}
export function getThreatIntelligenceProviderCapabilities({ env = process.env } = {}) {
  const enabled = new Set(configuredProviderIds(env));
  return Object.values(threatIntelligenceProviderRegistry).map((provider) => {
    const state = providerRuntime(provider.id);
    return {
      ...provider,
      enabled: enabled.has(provider.id),
      configured: provider.id === "goplus" ? enabled.has(provider.id) : false,
      health: state.circuitOpenUntil > Date.now() ? "degraded" : "ready",
      circuitOpenUntil: state.circuitOpenUntil ? new Date(state.circuitOpenUntil).toISOString() : "",
    };
  });
}
async function fetchGoPlus(subject, { env, fetchImpl, now }) {
  if (subject.chainFamily !== "evm" || !/^0x[a-f0-9]{40}$/i.test(subject.normalized)) return { status: "unsupported", providerId: "goplus", subject, reason: "GoPlus address screening supports EVM addresses for this adapter." };
  const nowMs = now.getTime();
  ensureCircuitClosed("goplus", nowMs);
  rateLimit("goplus", env, nowMs);
  const timeoutMs = safeInteger(env.THREAT_INTELLIGENCE_PROVIDER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, { min: 250, max: 15_000 });
  const maxBytes = safeInteger(env.THREAT_INTELLIGENCE_PROVIDER_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES, { min: 1_024, max: 2_000_000 });
  const url = new URL(`/api/v1/address_security/${encodeURIComponent(subject.normalized)}`, GOPLUS_BASE_URL);
  if (subject.chainId) url.searchParams.set("chain_id", String(subject.chainId));
  const headers = { Accept: "application/json" };
  const apiKey = clean(env.GOPLUS_API_KEY || env.THREAT_INTELLIGENCE_GOPLUS_API_KEY);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const retries = safeInteger(env.THREAT_INTELLIGENCE_PROVIDER_MAX_RETRIES, 1, { min: 0, max: 2 });
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "GET", headers, signal: controller.signal, redirect: "error" });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < retries) {
          lastError = new Error(`GoPlus returned HTTP ${response.status}`);
          await new Promise((resolve) => setTimeout(resolve, Math.min(100 * (2 ** attempt), 500)));
          continue;
        }
        throw new Error(`GoPlus returned HTTP ${response.status}`);
      }
      const raw = await readBodyLimited(response, maxBytes);
      const payload = parseProviderJson(raw);
      noteSuccess("goplus");
      return { status: "available", providerId: "goplus", subject, evidence: normalizeGoPlusResult(payload, subject, { now }) };
    } catch (error) {
      lastError = error;
      if (error?.name === "AbortError") lastError = Object.assign(new Error("GoPlus request timed out"), { code: "TIMEOUT" });
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(100 * (2 ** attempt), 500)));
    } finally { clearTimeout(timer); }
  }
  noteFailure("goplus", env, nowMs);
  throw lastError || new Error("GoPlus request failed");
}
async function screenOne(providerId, subject, options) {
  if (providerId === "goplus") return fetchGoPlus(subject, options);
  return { status: "unsupported", providerId, subject, reason: "Unknown threat-intelligence provider adapter" };
}
function cacheKey(providerId, subject) { return `${providerId}|${subject.chainFamily}|${subject.chainId}|${subject.canonical}`; }
export async function screenThreatSubjectsWithProviders(subjects = [], { env = process.env, fetchImpl = globalThis.fetch, now = new Date(), force = false } = {}) {
  const providerIds = configuredProviderIds(env).filter((id) => Object.hasOwn(threatIntelligenceProviderRegistry, id));
  if (providerIds.length === 0) return { status: "unconfigured", providerIds: [], evidence: [], indicators: [], providerStatuses: [], errors: [] };
  if (typeof fetchImpl !== "function") return { status: "unavailable", providerIds, evidence: [], indicators: [], providerStatuses: providerIds.map((id) => ({ providerId: id, status: "unavailable" })), errors: ["Fetch support is unavailable"] };
  const cacheTtlMs = safeInteger(env.THREAT_INTELLIGENCE_PROVIDER_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, { min: 1_000, max: 24 * 60 * 60_000 });
  const allowCache = !envBool(env.THREAT_INTELLIGENCE_PROVIDER_DISABLE_CACHE, false);
  const uniqueSubjects = [...new Map((Array.isArray(subjects) ? subjects : []).map((subject) => [subject.canonical, subject])).values()].slice(0, 20);
  const results = [];
  for (const providerId of providerIds) {
    for (const subject of uniqueSubjects) {
      const capabilities = threatIntelligenceProviderRegistry[providerId];
      if (!capabilities.chainFamilies.includes(subject.chainFamily) || !capabilities.subjectTypes.includes(subject.subjectType)) {
        results.push({ status: "unsupported", providerId, subject, reason: "Provider does not support this subject type or chain family." });
        continue;
      }
      const key = cacheKey(providerId, subject);
      const prior = cache.get(key);
      if (!force && allowCache && prior && prior.expiresAt > now.getTime()) {
        const evidence = { ...prior.evidence, cached: true, retrievalTimestamp: prior.evidence.retrievalTimestamp };
        results.push({ status: "available", providerId, subject, evidence, cached: true });
        continue;
      }
      try {
        const result = await screenOne(providerId, subject, { env, fetchImpl, now });
        if (result.status === "available") cache.set(key, { expiresAt: now.getTime() + cacheTtlMs, evidence: result.evidence });
        results.push(result);
      } catch (error) {
        results.push({ status: error?.code === "CIRCUIT_OPEN" ? "degraded" : error?.code === "RATE_LIMITED" ? "rate_limited" : "unavailable", providerId, subject, reason: redactMessage(error) });
      }
    }
  }
  const evidence = results.filter((item) => item.status === "available" && item.evidence).map((item) => item.evidence);
  const indicators = evidence.flatMap((item) => item.indicator ? [item.indicator] : []);
  const providerStatuses = providerIds.map((providerId) => {
    const providerResults = results.filter((item) => item.providerId === providerId);
    const available = providerResults.filter((item) => item.status === "available").length;
    const unsupported = providerResults.filter((item) => item.status === "unsupported").length;
    const failures = providerResults.length - available - unsupported;
    return { providerId, providerName: threatIntelligenceProviderRegistry[providerId].name, status: available > 0 ? (failures > 0 ? "degraded" : "available") : failures > 0 ? "unavailable" : "unsupported", availableSubjects: available, unsupportedSubjects: unsupported, failedSubjects: failures };
  });
  const errors = results.filter((item) => !["available", "unsupported"].includes(item.status)).map((item) => `${item.providerId}: ${item.reason}`).slice(0, 10);
  return { status: evidence.length > 0 ? (errors.length ? "degraded" : "available") : errors.length ? "unavailable" : "unsupported", providerIds, evidence, indicators, providerStatuses, errors };
}
export function resetThreatIntelligenceProviderState() { cache.clear(); providerState.clear(); }
