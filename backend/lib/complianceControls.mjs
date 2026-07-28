import { resolve } from "node:path";
import { canonicalThreatIdentity } from "./threatIntelligence.mjs";
import { readUtf8FileLimited } from "./safeFeedFile.mjs";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_FEED_AGE_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_500;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const MAX_FEED_BYTES = 1_000_000;
const MAX_RECORDS = 10_000;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,95}$/;
const DATA_HASH = /^(?:0x)?[0-9a-f]{64}$/i;
const JURISDICTION = /^[A-Z]{2}$/;
const RISK_RANK = { Unknown: 0, Low: 1, Medium: 2, High: 3, Critical: 4 };

let cached = null;

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function list(value, transform = clean, limit = 100) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => transform(item))
    .filter(Boolean))].slice(0, limit);
}

function normalizeMode(value) {
  const normalized = lower(value);
  if (["enforce", "block"].includes(normalized)) return "Enforce";
  if (["review", "manual review"].includes(normalized)) return "Review";
  return "Observe";
}

function normalizeUnavailableAction(value) {
  const normalized = lower(value);
  if (["block", "fail closed", "fail-closed"].includes(normalized)) return "Block";
  if (["review", "manual review"].includes(normalized)) return "Review";
  return "Warn";
}

function normalizeAttestationStatus(value) {
  const normalized = lower(value);
  if (["verified", "approved", "clear", "valid"].includes(normalized)) return "Verified";
  if (["pending", "in review", "review"].includes(normalized)) return "Pending";
  if (["rejected", "failed", "denied"].includes(normalized)) return "Rejected";
  if (["expired", "stale"].includes(normalized)) return "Expired";
  return "Not Provided";
}

function normalizeTravelRuleStatus(value) {
  const normalized = lower(value);
  if (["complete", "completed", "verified", "ready"].includes(normalized)) return "Complete";
  if (["incomplete", "missing", "failed"].includes(normalized)) return "Incomplete";
  if (["not required", "not_required", "exempt"].includes(normalized)) return "Not Required";
  return "Not Provided";
}

function normalizeScreeningStatus(value) {
  const normalized = lower(value);
  if (["clear", "passed", "no match", "no_match"].includes(normalized)) return "Clear";
  if (["match", "blocked", "sanctioned", "positive"].includes(normalized)) return "Match";
  if (["review", "possible match", "possible_match", "pending"].includes(normalized)) return "Review";
  if (["unavailable", "error", "stale", "failed"].includes(normalized)) return "Unavailable";
  return "Not Provided";
}

function normalizeRiskRating(value) {
  const normalized = lower(value);
  if (normalized === "low") return "Low";
  if (normalized === "medium") return "Medium";
  if (normalized === "high") return "High";
  if (normalized === "critical") return "Critical";
  return "Unknown";
}

function normalizeCounterpartyType(value) {
  const normalized = lower(value);
  if (["vasp", "casp", "regulated provider", "regulated_provider"].includes(normalized)) return "VASP";
  if (["self-hosted wallet", "self hosted wallet", "self-hosted", "self_custody", "self-custody"].includes(normalized)) return "Self-hosted Wallet";
  if (["organization", "organisation", "company", "dao"].includes(normalized)) return "Organization";
  if (["individual", "person"].includes(normalized)) return "Individual";
  return "Unknown";
}

function normalizeJurisdiction(value) {
  return clean(value).toUpperCase();
}

function normalizeFeedAction(value) {
  const normalized = lower(value);
  return ["block", "blocked", "deny", "prohibited"].includes(normalized) ? "Block" : "Review";
}

function parseIso(value) {
  const raw = clean(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Compliance Controls", status, severity, rule, message, evidence, remediation };
}

function parseJson(raw, sourceLabel) {
  if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) throw new Error(`${sourceLabel} exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${sourceLabel} is not valid JSON`);
  }
}

async function readRemoteBodyLimited(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FEED_BYTES) throw new Error(`Compliance feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
  if (!response.body || typeof response.body.getReader !== "function") {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_FEED_BYTES) throw new Error(`Compliance feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
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
        await reader.cancel("Compliance feed exceeded the safety limit").catch(() => {});
        throw new Error(`Compliance feed exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return raw;
  } finally {
    reader.releaseLock();
  }
}

function normalizeIndicator(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = clean(raw.value || raw.identifier || raw.address || raw.hash || raw.vaspId || raw.vasp_id);
  if (!value) return null;
  const typeHint = clean(raw.identifierType || raw.identifier_type || raw.type);
  const identity = canonicalThreatIdentity(value, typeHint);
  const vasp = !identity && /vasp/i.test(typeHint) && REFERENCE.test(value) ? { canonical: `vasp:${lower(value)}`, kind: "vasp-id", normalized: lower(value) } : null;
  const resolved = identity || vasp;
  if (!resolved) return null;
  const expiresAt = clean(raw.expiresAt || raw.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : null;
  return {
    id: clean(raw.id) || `compliance-indicator-${index + 1}`,
    canonical: resolved.canonical,
    kind: resolved.kind,
    action: normalizeFeedAction(raw.action || raw.disposition || raw.status),
    label: clean(raw.label || raw.name) || "Compliance screening match",
    reason: clean(raw.reason || raw.description || raw.message),
    program: clean(raw.program || raw.regime),
    list: clean(raw.list || raw.listName || raw.list_name),
    source: clean(raw.source),
    reference: clean(raw.reference || raw.referenceId || raw.reference_id),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : "",
  };
}

function normalizeJurisdictionRestriction(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const code = normalizeJurisdiction(raw.code || raw.jurisdiction || raw.countryCode || raw.country_code);
  if (!JURISDICTION.test(code)) return null;
  const expiresAt = clean(raw.expiresAt || raw.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : null;
  return {
    id: clean(raw.id) || `jurisdiction-${index + 1}`,
    code,
    action: normalizeFeedAction(raw.action || raw.disposition || raw.status),
    label: clean(raw.label || raw.name) || `${code} jurisdiction restriction`,
    reason: clean(raw.reason || raw.description || raw.message),
    program: clean(raw.program || raw.regime),
    source: clean(raw.source),
    reference: clean(raw.reference || raw.referenceId || raw.reference_id),
    expiresAt: Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : "",
  };
}

export function normalizeComplianceFeed(raw, { sourceType = "unknown", sourceName = "Compliance controls feed", now = new Date() } = {}) {
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const suppliedIndicators = Array.isArray(root.indicators) ? root.indicators : [];
  const suppliedJurisdictions = Array.isArray(root.restrictedJurisdictions) ? root.restrictedJurisdictions : Array.isArray(root.jurisdictions) ? root.jurisdictions : [];
  if (suppliedIndicators.length + suppliedJurisdictions.length > MAX_RECORDS) throw new Error(`Compliance feed exceeds the ${MAX_RECORDS}-record safety limit`);

  const indicatorMap = new Map();
  suppliedIndicators.forEach((item, index) => {
    const indicator = normalizeIndicator(item, index);
    if (!indicator) return;
    const current = indicatorMap.get(indicator.canonical);
    if (!current || current.action === "Review" && indicator.action === "Block") indicatorMap.set(indicator.canonical, indicator);
  });

  const jurisdictionMap = new Map();
  suppliedJurisdictions.forEach((item, index) => {
    const restriction = normalizeJurisdictionRestriction(item, index);
    if (!restriction) return;
    const current = jurisdictionMap.get(restriction.code);
    if (!current || current.action === "Review" && restriction.action === "Block") jurisdictionMap.set(restriction.code, restriction);
  });

  const generatedAtRaw = clean(root.generatedAt || root.generated_at || root.updatedAt || root.updated_at);
  const generatedAtMs = generatedAtRaw ? Date.parse(generatedAtRaw) : Number.NaN;
  return {
    status: "available",
    sourceType,
    sourceName: clean(root.source || root.name) || sourceName,
    version: clean(root.version) || "1",
    generatedAt: Number.isFinite(generatedAtMs) ? new Date(generatedAtMs).toISOString() : "",
    fetchedAt: now.toISOString(),
    indicatorCount: indicatorMap.size,
    jurisdictionCount: jurisdictionMap.size,
    indicators: [...indicatorMap.values()],
    restrictedJurisdictions: [...jurisdictionMap.values()],
    error: "",
  };
}

function configuredSource(env = process.env) {
  const inline = clean(env.COMPLIANCE_CONTROLS_FEED_JSON);
  if (inline) return { type: "inline", value: inline, name: "COMPLIANCE_CONTROLS_FEED_JSON" };
  const filePath = clean(env.COMPLIANCE_CONTROLS_FEED_PATH);
  if (filePath) {
    const resolvedPath = resolve(filePath);
    return { type: "file", value: resolvedPath, name: resolvedPath };
  }
  const remoteUrl = clean(env.COMPLIANCE_CONTROLS_FEED_URL);
  if (remoteUrl) return { type: "remote", value: remoteUrl, name: remoteUrl };
  return null;
}

function sourceCacheKey(source, env = process.env) {
  if (!source) return "none";
  const authenticationMode = clean(env.COMPLIANCE_CONTROLS_API_KEY) ? "bearer" : "none";
  return [source.type, source.value, clean(env.COMPLIANCE_CONTROLS_MAX_AGE_MS), clean(env.COMPLIANCE_CONTROLS_CACHE_TTL_MS), authenticationMode].join("|");
}

function validateRemoteUrl(value, env = process.env) {
  const url = new URL(value);
  const localDevelopment = ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && env.NODE_ENV !== "production";
  if (url.protocol !== "https:" && !localDevelopment) throw new Error("COMPLIANCE_CONTROLS_FEED_URL must use HTTPS in production");
  return url;
}

async function loadConfiguredFeed(source, { env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  if (source.type === "inline") return normalizeComplianceFeed(parseJson(source.value, source.name), { sourceType: "inline", sourceName: source.name, now });
  if (source.type === "file") {
    const raw = await readUtf8FileLimited(source.value, { maxBytes: MAX_FEED_BYTES, sourceLabel: source.name });
    return normalizeComplianceFeed(parseJson(raw, source.name), { sourceType: "file", sourceName: source.name, now });
  }
  if (typeof fetchImpl !== "function") throw new Error("Remote compliance controls require fetch support");
  const url = validateRemoteUrl(source.value, env);
  const timeoutMs = safeInteger(env.COMPLIANCE_CONTROLS_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, { min: 250, max: 15_000 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: "application/json" };
    const apiKey = clean(env.COMPLIANCE_CONTROLS_API_KEY);
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new Error(`Compliance feed returned HTTP ${response.status}`);
    return normalizeComplianceFeed(parseJson(await readRemoteBodyLimited(response), source.name), { sourceType: "remote", sourceName: source.name, now });
  } finally {
    clearTimeout(timeout);
  }
}

function applyFreshness(snapshot, { env = process.env, now = new Date() } = {}) {
  if (!snapshot || snapshot.status !== "available") return snapshot;
  const maxAgeMs = safeInteger(env.COMPLIANCE_CONTROLS_MAX_AGE_MS, DEFAULT_MAX_FEED_AGE_MS, { min: 60_000, max: 30 * 24 * 60 * 60 * 1_000 });
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  const futureSkewMs = Number.isFinite(generatedAtMs) ? generatedAtMs - now.getTime() : Number.POSITIVE_INFINITY;
  const ageMs = Number.isFinite(generatedAtMs) ? Math.max(0, now.getTime() - generatedAtMs) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(generatedAtMs) && futureSkewMs > MAX_FUTURE_SKEW_MS) return { ...snapshot, status: "stale", ageMs: 0, maxAgeMs, error: "Compliance feed timestamp is too far in the future" };
  if (ageMs <= maxAgeMs) return { ...snapshot, ageMs, maxAgeMs };
  return { ...snapshot, status: "stale", ageMs, maxAgeMs, error: `Compliance feed is older than ${Math.round(maxAgeMs / 3_600_000)} hours` };
}

export async function getComplianceControlsSnapshot({ force = false, env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
  const source = configuredSource(env);
  const cacheKey = sourceCacheKey(source, env);
  const cacheTtlMs = safeInteger(env.COMPLIANCE_CONTROLS_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS, { min: 1_000, max: 24 * 60 * 60 * 1_000 });
  if (!force && cached && cached.key === cacheKey && cached.expiresAt > now.getTime()) return applyFreshness(cached.snapshot, { env, now });
  if (!source) {
    const snapshot = {
      status: "unavailable",
      sourceType: "none",
      sourceName: "No compliance feed configured",
      version: "",
      generatedAt: "",
      fetchedAt: now.toISOString(),
      indicatorCount: 0,
      jurisdictionCount: 0,
      indicators: [],
      restrictedJurisdictions: [],
      error: "Configure COMPLIANCE_CONTROLS_FEED_PATH, COMPLIANCE_CONTROLS_FEED_JSON, or COMPLIANCE_CONTROLS_FEED_URL.",
    };
    cached = { key: cacheKey, expiresAt: now.getTime() + cacheTtlMs, snapshot };
    return snapshot;
  }
  try {
    const loaded = await loadConfiguredFeed(source, { env, fetchImpl, now });
    cached = { key: cacheKey, expiresAt: now.getTime() + cacheTtlMs, snapshot: loaded };
    return applyFreshness(loaded, { env, now });
  } catch (cause) {
    const previous = cached?.key === cacheKey && cached?.snapshot ? cached.snapshot : null;
    if (previous?.indicators?.length || previous?.restrictedJurisdictions?.length) {
      return { ...applyFreshness(previous, { env, now }), status: "stale", fetchedAt: now.toISOString(), error: cause instanceof Error ? cause.message : "Compliance feed could not be refreshed" };
    }
    const snapshot = {
      status: "unavailable",
      sourceType: source.type,
      sourceName: source.name,
      version: "",
      generatedAt: "",
      fetchedAt: now.toISOString(),
      indicatorCount: 0,
      jurisdictionCount: 0,
      indicators: [],
      restrictedJurisdictions: [],
      error: cause instanceof Error ? cause.message : "Compliance feed could not be loaded",
    };
    cached = { key: cacheKey, expiresAt: now.getTime() + Math.min(cacheTtlMs, 30_000), snapshot };
    return snapshot;
  }
}

export function resetComplianceControlsCache() {
  cached = null;
}

function safeSourceName(snapshot = {}) {
  const sourceType = snapshot.sourceType || "none";
  const sourceName = clean(snapshot.sourceName);
  if (!sourceName) return sourceType === "none" ? "No compliance feed configured" : "Configured compliance feed";
  if (sourceType === "remote") {
    try { return `Remote feed (${new URL(sourceName).hostname})`; } catch { return "Configured remote feed"; }
  }
  if (sourceType === "file" && (sourceName.includes("/") || sourceName.includes("\\"))) return "Configured local feed";
  if (sourceType === "inline" && sourceName === "COMPLIANCE_CONTROLS_FEED_JSON") return "Configured inline feed";
  return sourceName;
}

function safePublicError(snapshot = {}) {
  const error = clean(snapshot.error);
  if (!error) return "";
  if (snapshot.status === "stale" && /older than|timestamp is too far in the future/i.test(error)) return error;
  if (snapshot.sourceType === "none") return "No compliance feed is configured.";
  if (snapshot.sourceType === "file") return snapshot.status === "stale" ? "The configured local compliance feed could not be refreshed; cached data is stale." : "The configured local compliance feed could not be loaded.";
  if (snapshot.sourceType === "remote") return snapshot.status === "stale" ? "The configured remote compliance feed could not be refreshed; cached data is stale." : "The configured remote compliance feed could not be loaded.";
  if (snapshot.sourceType === "inline") return "The configured inline compliance feed is unavailable or invalid.";
  return "Compliance screening data is unavailable.";
}

function activeEntries(items = [], now = new Date()) {
  return items.filter((item) => {
    if (!item.expiresAt) return true;
    const expiresAtMs = Date.parse(item.expiresAt);
    return !Number.isFinite(expiresAtMs) || expiresAtMs > now.getTime();
  });
}

export function summarizeComplianceControlsSnapshot(snapshot = {}, now = new Date()) {
  return {
    status: snapshot.status || "unavailable",
    sourceType: snapshot.sourceType || "none",
    sourceName: safeSourceName(snapshot),
    generatedAt: snapshot.generatedAt || "",
    fetchedAt: snapshot.fetchedAt || "",
    indicatorCount: Number(snapshot.indicatorCount || 0),
    activeIndicatorCount: activeEntries(Array.isArray(snapshot.indicators) ? snapshot.indicators : [], now).length,
    jurisdictionCount: Number(snapshot.jurisdictionCount || 0),
    activeJurisdictionCount: activeEntries(Array.isArray(snapshot.restrictedJurisdictions) ? snapshot.restrictedJurisdictions : [], now).length,
    ageMs: Number.isFinite(snapshot.ageMs) ? snapshot.ageMs : null,
    maxAgeMs: Number.isFinite(snapshot.maxAgeMs) ? snapshot.maxAgeMs : null,
    error: safePublicError(snapshot),
  };
}

function policySettings(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const configuredKeys = Object.keys(rules).filter((key) => key.startsWith("compliance"));
  return {
    configured: rules.complianceControlsEnabled === true || configuredKeys.length > 0,
    enabled: rules.complianceControlsEnabled !== false,
    mode: normalizeMode(rules.complianceControlMode),
    unavailableAction: normalizeUnavailableAction(rules.complianceUnavailableAction),
    requiredActions: list(rules.complianceRequiredActions, clean, 30),
    requireOriginatorAttestation: rules.complianceRequireOriginatorAttestation === true,
    requireBeneficiaryAttestation: rules.complianceRequireBeneficiaryAttestation === true,
    requireTravelRule: rules.complianceRequireTravelRule === true,
    travelRuleThreshold: Math.max(0, Number(rules.complianceTravelRuleThreshold || 0) || 0),
    requireSanctionsScreening: rules.complianceRequireSanctionsScreening === true,
    allowedJurisdictions: list(rules.complianceAllowedJurisdictions, normalizeJurisdiction, 250),
    blockedJurisdictions: list(rules.complianceBlockedJurisdictions, normalizeJurisdiction, 250),
    reviewJurisdictions: list(rules.complianceReviewJurisdictions, normalizeJurisdiction, 250),
    allowedCounterpartyTypes: list(rules.complianceAllowedCounterpartyTypes, normalizeCounterpartyType, 20).filter((item) => item !== "Unknown"),
    acceptedProviders: list(rules.complianceAcceptedProviders, lower, 100),
    maxAttestationAgeSeconds: safeInteger(rules.complianceMaxAttestationAgeSeconds, 30 * 24 * 60 * 60, { min: 60, max: 365 * 24 * 60 * 60 }),
    maxScreeningAgeSeconds: safeInteger(rules.complianceMaxScreeningAgeSeconds, 24 * 60 * 60, { min: 60, max: 30 * 24 * 60 * 60 }),
    maximumRiskRating: normalizeRiskRating(rules.complianceMaximumRiskRating || "Medium"),
  };
}

function requestContext(request = {}) {
  return {
    originatorJurisdiction: normalizeJurisdiction(request.complianceOriginatorJurisdiction),
    beneficiaryJurisdiction: normalizeJurisdiction(request.complianceBeneficiaryJurisdiction),
    counterpartyType: normalizeCounterpartyType(request.complianceCounterpartyType),
    originatorAttestation: {
      status: normalizeAttestationStatus(request.complianceOriginatorAttestationStatus),
      provider: clean(request.complianceOriginatorAttestationProvider),
      reference: clean(request.complianceOriginatorAttestationReference),
      issuedAt: clean(request.complianceOriginatorAttestationIssuedAt),
      expiresAt: clean(request.complianceOriginatorAttestationExpiresAt),
    },
    beneficiaryAttestation: {
      status: normalizeAttestationStatus(request.complianceBeneficiaryAttestationStatus),
      provider: clean(request.complianceBeneficiaryAttestationProvider),
      reference: clean(request.complianceBeneficiaryAttestationReference),
      issuedAt: clean(request.complianceBeneficiaryAttestationIssuedAt),
      expiresAt: clean(request.complianceBeneficiaryAttestationExpiresAt),
    },
    travelRule: {
      status: normalizeTravelRuleStatus(request.complianceTravelRuleStatus),
      reference: clean(request.complianceTravelRuleReference),
      dataHash: clean(request.complianceTravelRuleDataHash),
    },
    screening: {
      status: normalizeScreeningStatus(request.complianceScreeningStatus),
      provider: clean(request.complianceScreeningProvider),
      reference: clean(request.complianceScreeningReference),
      screenedAt: clean(request.complianceScreenedAt),
    },
    riskRating: normalizeRiskRating(request.complianceRiskRating),
    originatorVaspId: clean(request.complianceOriginatorVaspId),
    beneficiaryVaspId: clean(request.complianceBeneficiaryVaspId),
  };
}

function hasComplianceMetadata(context) {
  return Boolean(
    context.originatorJurisdiction || context.beneficiaryJurisdiction || context.counterpartyType !== "Unknown" ||
    context.originatorAttestation.status !== "Not Provided" || context.beneficiaryAttestation.status !== "Not Provided" ||
    context.travelRule.status !== "Not Provided" || context.screening.status !== "Not Provided" ||
    context.riskRating !== "Unknown" || context.originatorVaspId || context.beneficiaryVaspId
  );
}

function requestEntities(request = {}, context = {}) {
  const candidates = [
    { role: "execution-wallet", value: request.executionWalletAddress || request.walletAddress, typeHint: "" },
    { role: "target", value: request.target, typeHint: request.contractIdentifierType || "" },
    { role: "bridge-destination", value: request.bridgeDestinationAddress, typeHint: "" },
  ];
  if (context.originatorVaspId) candidates.push({ role: "originator-vasp", value: context.originatorVaspId, typeHint: "VASP ID" });
  if (context.beneficiaryVaspId) candidates.push({ role: "beneficiary-vasp", value: context.beneficiaryVaspId, typeHint: "VASP ID" });
  const seen = new Set();
  return candidates.flatMap((candidate) => {
    const identity = canonicalThreatIdentity(candidate.value, candidate.typeHint);
    const vasp = !identity && /vasp/i.test(candidate.typeHint) && REFERENCE.test(candidate.value) ? { canonical: `vasp:${lower(candidate.value)}`, kind: "vasp-id" } : null;
    const resolved = identity || vasp;
    if (!resolved || seen.has(resolved.canonical)) return [];
    seen.add(resolved.canonical);
    return [{ role: candidate.role, canonical: resolved.canonical, kind: resolved.kind }];
  });
}

function applyViolation(state, settings, details) {
  const status = settings.mode === "Enforce" ? "fail" : "warning";
  const severity = settings.mode === "Enforce" ? details.blockSeverity || "high" : details.reviewSeverity || "medium";
  state.findings.push(finding({ ...details, status, severity }));
  state.checksFailed.push(details.message);
  state.scoreDelta += settings.mode === "Enforce" ? details.blockScore || 28 : details.reviewScore || 14;
  if (settings.mode === "Enforce") state.hardBlock = true;
  else if (settings.mode === "Review") state.needsReview = true;
}

function applyUnavailable(state, settings, details) {
  if (settings.unavailableAction === "Block") {
    state.findings.push(finding({ ...details, status: "fail", severity: details.blockSeverity || "high" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.blockScore || 30;
    state.hardBlock = true;
  } else if (settings.unavailableAction === "Review") {
    state.findings.push(finding({ ...details, status: "unavailable", severity: details.reviewSeverity || "medium" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.reviewScore || 14;
    state.needsReview = true;
  } else {
    state.findings.push(finding({ ...details, status: "unavailable", severity: "low" }));
    state.scoreDelta += 2;
  }
}

function forceBlock(state, details) {
  state.findings.push(finding({ ...details, status: "fail", severity: details.severity || "critical" }));
  state.checksFailed.push(details.message);
  state.scoreDelta += details.score || 40;
  state.hardBlock = true;
}

function forceReview(state, details) {
  state.findings.push(finding({ ...details, status: "warning", severity: details.severity || "high" }));
  state.checksFailed.push(details.message);
  state.scoreDelta += details.score || 18;
  state.needsReview = true;
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "pass", rule, message, evidence }));
  state.checksPassed.push(message);
}

function providerAllowed(provider, acceptedProviders) {
  return acceptedProviders.length === 0 || acceptedProviders.includes(lower(provider));
}

function evaluateAttestation(state, settings, label, attestation, required, now) {
  const rule = `${label} attestation`;
  if (!required && attestation.status === "Not Provided") {
    state.findings.push(finding({ status: "skipped", rule, message: `${label} attestation is not required by this policy.`, evidence: { required: false } }));
    return;
  }
  if (attestation.status === "Not Provided") {
    applyViolation(state, settings, { rule, message: `${label} compliance attestation is required but was not supplied.`, evidence: { required }, remediation: `Provide a non-sensitive ${label.toLowerCase()} verification reference from an accepted provider. Do not send names, identity documents, or other raw personal data.` });
    return;
  }
  if (attestation.status === "Rejected") {
    forceBlock(state, { rule, message: `${label} compliance attestation was rejected.`, evidence: { status: attestation.status, provider: attestation.provider, reference: attestation.reference }, remediation: "Stop execution and resolve the rejected verification with the authorized compliance operator." });
    return;
  }
  if (["Pending", "Expired"].includes(attestation.status)) {
    applyViolation(state, settings, { rule, message: `${label} compliance attestation is ${attestation.status.toLowerCase()}.`, evidence: { status: attestation.status, provider: attestation.provider, reference: attestation.reference }, remediation: "Obtain a current verified attestation before retrying." });
    return;
  }
  if (!PROVIDER.test(attestation.provider) || !REFERENCE.test(attestation.reference)) {
    applyViolation(state, settings, { rule, message: `${label} attestation provider or reference is missing or malformed.`, evidence: { providerPresent: Boolean(attestation.provider), referencePresent: Boolean(attestation.reference) }, remediation: "Supply a short provider label and opaque verification reference. Do not include raw identity data." });
    return;
  }
  if (!providerAllowed(attestation.provider, settings.acceptedProviders)) {
    applyViolation(state, settings, { rule, message: `${label} attestation provider is not approved by the active policy.`, evidence: { provider: attestation.provider, acceptedProviders: settings.acceptedProviders }, remediation: "Use an approved verification provider or update the policy only if authorized." });
    return;
  }
  const issuedAtMs = parseIso(attestation.issuedAt);
  const expiresAtMs = parseIso(attestation.expiresAt);
  if (attestation.issuedAt && !Number.isFinite(issuedAtMs)) {
    applyViolation(state, settings, { rule, message: `${label} attestation issuedAt is not a valid ISO-8601 timestamp.`, evidence: { issuedAt: attestation.issuedAt }, remediation: "Use an ISO-8601 issuedAt timestamp." });
    return;
  }
  if (attestation.expiresAt && !Number.isFinite(expiresAtMs)) {
    applyViolation(state, settings, { rule, message: `${label} attestation expiresAt is not a valid ISO-8601 timestamp.`, evidence: { expiresAt: attestation.expiresAt }, remediation: "Use an ISO-8601 expiresAt timestamp." });
    return;
  }
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()) {
    applyViolation(state, settings, { rule, message: `${label} attestation has expired.`, evidence: { expiresAt: attestation.expiresAt }, remediation: "Obtain a current verified attestation." });
    return;
  }
  if (Number.isFinite(issuedAtMs) && now.getTime() - issuedAtMs > settings.maxAttestationAgeSeconds * 1_000) {
    applyViolation(state, settings, { rule, message: `${label} attestation is older than the policy maximum age.`, evidence: { issuedAt: attestation.issuedAt, maxAgeSeconds: settings.maxAttestationAgeSeconds }, remediation: "Refresh the compliance attestation before retrying." });
    return;
  }
  pass(state, rule, `${label} compliance attestation is verified and policy-compliant.`, { status: attestation.status, provider: attestation.provider, reference: attestation.reference, issuedAt: attestation.issuedAt, expiresAt: attestation.expiresAt });
}

export function evaluateComplianceControls({ request = {}, policy = {}, snapshot = {}, now = new Date() } = {}) {
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const settings = policySettings(policy);
  const compliance = requestContext(request);
  const metadataPresent = hasComplianceMetadata(compliance);
  const actionRequired = settings.requiredActions.includes(clean(request.actionType));
  const configuredApplicable = settings.configured && settings.enabled && (settings.requiredActions.length === 0 || actionRequired);

  if (!configuredApplicable && !metadataPresent) {
    state.findings.push(finding({ status: "skipped", rule: "Compliance applicability", message: "Compliance Controls were skipped because the active policy does not enable them for this action.", evidence: { actionType: request.actionType || "", configured: settings.configured } }));
    return { ...state, applicable: false, context: null };
  }

  const entities = requestEntities(request, compliance);
  const feedSummary = summarizeComplianceControlsSnapshot(snapshot, now);
  const context = {
    ...feedSummary,
    mode: settings.mode,
    unavailableAction: settings.unavailableAction,
    requiredActions: settings.requiredActions,
    requireOriginatorAttestation: settings.requireOriginatorAttestation,
    requireBeneficiaryAttestation: settings.requireBeneficiaryAttestation,
    requireTravelRule: settings.requireTravelRule,
    travelRuleThreshold: settings.travelRuleThreshold,
    requireSanctionsScreening: settings.requireSanctionsScreening,
    originatorJurisdiction: compliance.originatorJurisdiction,
    beneficiaryJurisdiction: compliance.beneficiaryJurisdiction,
    counterpartyType: compliance.counterpartyType,
    originatorAttestationStatus: compliance.originatorAttestation.status,
    beneficiaryAttestationStatus: compliance.beneficiaryAttestation.status,
    travelRuleStatus: compliance.travelRule.status,
    screeningStatus: compliance.screening.status,
    riskRating: compliance.riskRating,
    checkedEntities: entities,
    matchedIndicators: [],
    matchedJurisdictions: [],
  };

  pass(state, "Compliance applicability", "Compliance Controls are enabled for this intent.", { actionType: request.actionType || "", metadataPresent, requiredByPolicy: actionRequired });

  for (const [label, jurisdiction] of [["Originator", compliance.originatorJurisdiction], ["Beneficiary", compliance.beneficiaryJurisdiction]]) {
    if (!jurisdiction) continue;
    if (!JURISDICTION.test(jurisdiction)) {
      applyViolation(state, settings, { rule: `${label} jurisdiction`, message: `${label} jurisdiction must use a two-letter jurisdiction code.`, evidence: { received: jurisdiction }, remediation: "Use a two-letter jurisdiction code supplied by the authorized compliance workflow." });
      continue;
    }
    if (settings.blockedJurisdictions.includes(jurisdiction)) {
      forceBlock(state, { rule: `${label} jurisdiction`, message: `${label} jurisdiction is explicitly blocked by the active policy.`, evidence: { jurisdiction, blockedJurisdictions: settings.blockedJurisdictions }, remediation: "Stop execution or route the request through authorized legal/compliance review." });
      continue;
    }
    if (settings.reviewJurisdictions.includes(jurisdiction)) {
      forceReview(state, { rule: `${label} jurisdiction`, message: `${label} jurisdiction requires manual review under the active policy.`, evidence: { jurisdiction, reviewJurisdictions: settings.reviewJurisdictions }, remediation: "Pause execution for authorized compliance review." });
      continue;
    }
    if (settings.allowedJurisdictions.length > 0 && !settings.allowedJurisdictions.includes(jurisdiction)) {
      applyViolation(state, settings, { rule: `${label} jurisdiction`, message: `${label} jurisdiction is not in the policy allowlist.`, evidence: { jurisdiction, allowedJurisdictions: settings.allowedJurisdictions }, remediation: "Use an allowed jurisdiction or update the policy only after authorized review." });
      continue;
    }
    pass(state, `${label} jurisdiction`, `${label} jurisdiction is structurally valid and not prohibited by the policy.`, { jurisdiction });
  }

  if (settings.allowedCounterpartyTypes.length > 0) {
    if (compliance.counterpartyType === "Unknown") {
      applyViolation(state, settings, { rule: "Counterparty type", message: "Counterparty type is required by the active compliance policy.", evidence: { allowedCounterpartyTypes: settings.allowedCounterpartyTypes }, remediation: "Classify the counterparty without including personal identity data." });
    } else if (!settings.allowedCounterpartyTypes.includes(compliance.counterpartyType)) {
      applyViolation(state, settings, { rule: "Counterparty type", message: `Counterparty type ${compliance.counterpartyType} is not allowed by policy.`, evidence: { received: compliance.counterpartyType, allowedCounterpartyTypes: settings.allowedCounterpartyTypes }, remediation: "Use an allowed counterparty route or obtain authorized review." });
    } else {
      pass(state, "Counterparty type", `Counterparty type ${compliance.counterpartyType} is allowed by policy.`, { counterpartyType: compliance.counterpartyType });
    }
  } else if (compliance.counterpartyType !== "Unknown") {
    pass(state, "Counterparty type", `Counterparty type ${compliance.counterpartyType} was supplied for the compliance decision.`, { counterpartyType: compliance.counterpartyType });
  }

  evaluateAttestation(state, settings, "Originator", compliance.originatorAttestation, settings.requireOriginatorAttestation, now);
  evaluateAttestation(state, settings, "Beneficiary", compliance.beneficiaryAttestation, settings.requireBeneficiaryAttestation, now);

  const travelRuleRequired = settings.requireTravelRule && Number(request.amount || 0) >= settings.travelRuleThreshold;
  if (travelRuleRequired) {
    if (compliance.travelRule.status !== "Complete") {
      applyViolation(state, settings, { rule: "Travel Rule evidence", message: "Travel Rule evidence is required for this transfer but is not complete.", evidence: { status: compliance.travelRule.status, threshold: settings.travelRuleThreshold, amount: Number(request.amount || 0) }, remediation: "Complete the authorized Travel Rule workflow and submit only an opaque reference or data hash, not raw originator or beneficiary information." });
    } else if (!REFERENCE.test(compliance.travelRule.reference) && !DATA_HASH.test(compliance.travelRule.dataHash)) {
      applyViolation(state, settings, { rule: "Travel Rule evidence", message: "Travel Rule status is complete but no valid opaque reference or data hash was supplied.", evidence: { referencePresent: Boolean(compliance.travelRule.reference), dataHashPresent: Boolean(compliance.travelRule.dataHash) }, remediation: "Provide an opaque Travel Rule reference or 32-byte data hash. Do not include raw personal data." });
    } else {
      pass(state, "Travel Rule evidence", "Travel Rule completion evidence is present without exposing raw personal information.", { status: compliance.travelRule.status, reference: compliance.travelRule.reference, dataHash: compliance.travelRule.dataHash });
    }
  } else {
    state.findings.push(finding({ status: "skipped", rule: "Travel Rule evidence", message: "Travel Rule evidence is not required for this action under the active policy threshold.", evidence: { required: settings.requireTravelRule, threshold: settings.travelRuleThreshold, amount: Number(request.amount || 0) } }));
  }

  if (RISK_RANK[compliance.riskRating] > RISK_RANK[settings.maximumRiskRating]) {
    applyViolation(state, settings, { rule: "Compliance risk rating", message: `Compliance risk rating ${compliance.riskRating} exceeds the policy maximum of ${settings.maximumRiskRating}.`, evidence: { received: compliance.riskRating, maximum: settings.maximumRiskRating }, remediation: "Pause execution for authorized risk review or use a policy-compliant counterparty." });
  } else if (compliance.riskRating !== "Unknown") {
    pass(state, "Compliance risk rating", `Compliance risk rating ${compliance.riskRating} is within the policy maximum.`, { received: compliance.riskRating, maximum: settings.maximumRiskRating });
  }

  let externalScreeningUsable = false;
  if (compliance.screening.status !== "Not Provided") {
    if (compliance.screening.status === "Match") {
      forceBlock(state, { rule: "Sanctions screening result", message: "The submitted compliance screening result reports a positive match.", evidence: { status: compliance.screening.status, provider: compliance.screening.provider, reference: compliance.screening.reference, screenedAt: compliance.screening.screenedAt }, remediation: "Stop execution and escalate the match to the authorized compliance operator." });
    } else if (compliance.screening.status === "Review") {
      forceReview(state, { rule: "Sanctions screening result", message: "The submitted compliance screening result requires manual review.", evidence: { status: compliance.screening.status, provider: compliance.screening.provider, reference: compliance.screening.reference, screenedAt: compliance.screening.screenedAt }, remediation: "Pause execution for authorized compliance review." });
    } else if (compliance.screening.status === "Unavailable") {
      applyUnavailable(state, settings, { rule: "Sanctions screening result", message: "The submitted compliance screening result is unavailable.", evidence: { status: compliance.screening.status, provider: compliance.screening.provider }, remediation: "Restore screening or obtain an authorized current screening result." });
    } else {
      const screenedAtMs = parseIso(compliance.screening.screenedAt);
      if (!PROVIDER.test(compliance.screening.provider) || !REFERENCE.test(compliance.screening.reference)) {
        applyViolation(state, settings, { rule: "Sanctions screening result", message: "A clear screening result must include a valid provider and opaque reference.", evidence: { providerPresent: Boolean(compliance.screening.provider), referencePresent: Boolean(compliance.screening.reference) }, remediation: "Supply an accepted provider label and opaque screening reference." });
      } else if (!providerAllowed(compliance.screening.provider, settings.acceptedProviders)) {
        applyViolation(state, settings, { rule: "Sanctions screening result", message: "The screening provider is not approved by policy.", evidence: { provider: compliance.screening.provider, acceptedProviders: settings.acceptedProviders }, remediation: "Use an approved screening provider or update the policy only if authorized." });
      } else if (!Number.isFinite(screenedAtMs)) {
        applyViolation(state, settings, { rule: "Sanctions screening result", message: "A clear screening result must include a valid ISO-8601 screenedAt timestamp.", evidence: { screenedAt: compliance.screening.screenedAt }, remediation: "Supply a current ISO-8601 screening timestamp." });
      } else if (now.getTime() - screenedAtMs > settings.maxScreeningAgeSeconds * 1_000 || screenedAtMs - now.getTime() > MAX_FUTURE_SKEW_MS) {
        applyViolation(state, settings, { rule: "Sanctions screening result", message: "The submitted screening result is stale or dated too far in the future.", evidence: { screenedAt: compliance.screening.screenedAt, maxAgeSeconds: settings.maxScreeningAgeSeconds }, remediation: "Obtain a current screening result before retrying." });
      } else {
        externalScreeningUsable = true;
        pass(state, "Sanctions screening result", "A current clear screening result from an accepted provider is present.", { status: compliance.screening.status, provider: compliance.screening.provider, reference: compliance.screening.reference, screenedAt: compliance.screening.screenedAt });
      }
    }
  }

  const activeIndicators = activeEntries(Array.isArray(snapshot.indicators) ? snapshot.indicators : [], now);
  const activeJurisdictions = activeEntries(Array.isArray(snapshot.restrictedJurisdictions) ? snapshot.restrictedJurisdictions : [], now);
  const indicatorMap = new Map(activeIndicators.map((item) => [item.canonical, item]));
  const jurisdictionMap = new Map(activeJurisdictions.map((item) => [item.code, item]));
  const indicatorMatches = entities.flatMap((entity) => indicatorMap.has(entity.canonical) ? [{ entity, indicator: indicatorMap.get(entity.canonical) }] : []);
  const jurisdictionMatches = [compliance.originatorJurisdiction, compliance.beneficiaryJurisdiction].filter(Boolean).flatMap((code) => jurisdictionMap.has(code) ? [jurisdictionMap.get(code)] : []);
  context.matchedIndicators = indicatorMatches.map(({ entity, indicator }) => ({ entityRole: entity.role, kind: entity.kind, indicatorId: indicator.id, action: indicator.action, label: indicator.label, program: indicator.program, list: indicator.list, source: indicator.source || snapshot.sourceName, reference: indicator.reference }));
  context.matchedJurisdictions = jurisdictionMatches.map((item) => ({ code: item.code, action: item.action, label: item.label, program: item.program, source: item.source || snapshot.sourceName, reference: item.reference }));

  for (const { entity, indicator } of indicatorMatches) {
    const details = { rule: "Configured compliance indicator match", message: `${entity.role} matches a configured compliance restriction.`, evidence: { entityRole: entity.role, identifierKind: entity.kind, indicatorId: indicator.id, action: indicator.action, label: indicator.label, reason: indicator.reason, program: indicator.program, list: indicator.list, source: indicator.source || snapshot.sourceName, reference: indicator.reference }, remediation: "Stop execution and escalate the exact match to the authorized compliance operator." };
    if (indicator.action === "Block") forceBlock(state, details);
    else forceReview(state, { ...details, remediation: "Pause execution for authorized review of the configured compliance match." });
  }

  for (const restriction of jurisdictionMatches) {
    const details = { rule: "Configured jurisdiction restriction", message: `Jurisdiction ${restriction.code} matches a configured compliance restriction.`, evidence: { code: restriction.code, action: restriction.action, label: restriction.label, reason: restriction.reason, program: restriction.program, source: restriction.source || snapshot.sourceName, reference: restriction.reference }, remediation: "Stop execution or escalate the jurisdiction match to authorized legal/compliance review." };
    if (restriction.action === "Block") forceBlock(state, details);
    else forceReview(state, { ...details, remediation: "Pause execution for authorized jurisdiction review." });
  }

  if (settings.requireSanctionsScreening) {
    if (snapshot.status === "available") {
      pass(state, "Compliance feed availability", `Compliance feed ${snapshot.sourceName || "configured source"} is available with ${activeIndicators.length} active indicator${activeIndicators.length === 1 ? "" : "s"} and ${activeJurisdictions.length} active jurisdiction restriction${activeJurisdictions.length === 1 ? "" : "s"}.`, feedSummary);
      if (entities.length === 0 && !externalScreeningUsable) {
        applyUnavailable(state, settings, { rule: "Sanctions identity screening", message: "No valid wallet, contract, destination, or VASP identity was available for exact compliance screening.", evidence: { checkedEntities: entities }, remediation: "Correct the relevant identifiers or provide a current external screening attestation." });
      } else if (indicatorMatches.length === 0 && externalScreeningUsable === false) {
        pass(state, "Sanctions identity screening", "No active exact-match compliance indicator was found for the screened identities. This is a configured-feed result, not a guarantee of legal compliance.", { checkedEntities: entities, generatedAt: snapshot.generatedAt, source: snapshot.sourceName });
      }
    } else if (!externalScreeningUsable) {
      applyUnavailable(state, settings, { rule: "Compliance feed availability", message: snapshot.status === "stale" ? "The configured compliance feed is stale, so current sanctions and jurisdiction screening could not be confirmed." : "No usable compliance feed or current external screening result is available.", evidence: { ...feedSummary, policyAction: settings.unavailableAction }, remediation: "Restore a current trusted feed or provide a current screening attestation from an accepted provider." });
    }
  } else if (snapshot.status === "available") {
    state.findings.push(finding({ status: "pass", rule: "Compliance feed availability", message: "A compliance feed is available, although sanctions screening is not required by this policy.", evidence: feedSummary }));
  } else {
    state.findings.push(finding({ status: "skipped", rule: "Compliance feed availability", message: "A compliance feed is not required by the active policy.", evidence: { requireSanctionsScreening: false } }));
  }

  return { ...state, applicable: true, context };
}
