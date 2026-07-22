import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyCasperWalletIdentifier } from "./walletValidation.mjs";
import { classifyCasperContractIdentifier } from "./contractValidation.mjs";

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

export function canonicalThreatIdentity(value, typeHint = "") {
  const raw = clean(value);
  if (!raw) return null;

  const wallet = classifyCasperWalletIdentifier(raw, { allowAccountHash: true });
  if (wallet.valid) {
    return {
      canonical: wallet.kind === "account-hash" ? `account:${wallet.normalized}` : `wallet:${wallet.normalized}`,
      value: raw,
      normalized: wallet.normalized,
      kind: wallet.kind,
      label: wallet.label,
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
    };
  }

  return null;
}

function normalizeIndicator(raw, index = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = clean(raw.value || raw.identifier || raw.address || raw.hash);
  const identity = canonicalThreatIdentity(value, raw.identifierType || raw.identifier_type || raw.type || "");
  if (!identity) return null;

  const expiresAt = clean(raw.expiresAt || raw.expires_at);
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : null;
  return {
    id: clean(raw.id) || `indicator-${index + 1}`,
    value,
    canonical: identity.canonical,
    kind: identity.kind,
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
  const credentialFingerprint = clean(env.THREAT_INTELLIGENCE_API_KEY)
    ? createHash("sha256").update(clean(env.THREAT_INTELLIGENCE_API_KEY)).digest("hex").slice(0, 12)
    : "none";
  return [
    source.type,
    source.value,
    clean(env.THREAT_INTELLIGENCE_MAX_AGE_MS),
    clean(env.THREAT_INTELLIGENCE_CACHE_TTL_MS),
    credentialFingerprint,
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
    const fileStats = await stat(source.value);
    if (fileStats.size > MAX_FEED_BYTES) {
      throw new Error(`${source.name} exceeds the ${MAX_FEED_BYTES}-byte safety limit`);
    }
    const raw = await readFile(source.value, "utf8");
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

export async function getThreatIntelligenceSnapshot({ force = false, env = process.env, fetchImpl = globalThis.fetch, now = new Date() } = {}) {
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

export function resetThreatIntelligenceCache() {
  cached = null;
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
  };
}

function policySettings(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    mode: normalizeMode(rules.threatIntelligenceMode),
    unavailableAction: normalizeUnavailableAction(rules.threatIntelligenceUnavailableAction),
    minConfidence: safeInteger(rules.threatIntelligenceMinConfidence, 70, { min: 0, max: 100 }),
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Threat Intelligence", status, severity, rule, message, evidence, remediation };
}

function requestEntities(request = {}) {
  const candidates = [
    { role: "execution-wallet", value: request.executionWalletAddress || request.walletAddress, typeHint: "" },
    { role: "target", value: request.target, typeHint: request.contractIdentifierType || "" },
  ];
  const seen = new Set();
  return candidates.flatMap((candidate) => {
    const identity = canonicalThreatIdentity(candidate.value, candidate.typeHint);
    if (!identity || seen.has(identity.canonical)) return [];
    seen.add(identity.canonical);
    return [{ ...identity, role: candidate.role }];
  });
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
    unavailableAction: settings.unavailableAction,
    minConfidence: settings.minConfidence,
    checkedEntities: entities.map((entity) => ({ role: entity.role, kind: entity.kind, canonical: entity.canonical })),
    matchedIndicators: [],
  };

  if (entities.length === 0) {
    findings.push(finding({
      status: "skipped",
      rule: "Threat intelligence applicability",
      message: "Threat intelligence matching was skipped because no valid wallet or contract identity was available.",
      evidence: { actionType: request.actionType || "", targetType: request.targetType || "" },
      remediation: "Correct wallet or contract identifiers so the target can be screened.",
    }));
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  findings.push(finding({
    status: "pass",
    rule: "Threat intelligence applicability",
    message: `${entities.length} normalized wallet or contract ${entities.length === 1 ? "identity is" : "identities are"} available for exact-match screening.`,
    evidence: { entities: context.checkedEntities },
  }));

  if (!["available"].includes(snapshot.status)) {
    const unavailableStatus = snapshot.status === "stale" ? "stale" : "unavailable";
    const message = unavailableStatus === "stale"
      ? "The configured threat intelligence feed is stale, so current reputation could not be confirmed."
      : "No usable threat intelligence feed is available for this request.";
    const evidence = { ...summarizeThreatIntelligenceSnapshot(snapshot, now), policyAction: settings.unavailableAction };

    if (settings.unavailableAction === "Block") {
      findings.push(finding({
        status: "fail",
        severity: "high",
        rule: "Threat feed availability",
        message,
        evidence,
        remediation: "Restore a fresh trusted feed or change the policy only after authorized risk review.",
      }));
      checksFailed.push(message);
      hardBlock = true;
      scoreDelta += 35;
    } else if (settings.unavailableAction === "Review") {
      findings.push(finding({
        status: "unavailable",
        severity: "medium",
        rule: "Threat feed availability",
        message,
        evidence,
        remediation: "Pause for human review or restore a fresh trusted threat feed before retrying.",
      }));
      checksFailed.push(message);
      needsReview = true;
      scoreDelta += 14;
    } else {
      findings.push(finding({
        status: "unavailable",
        severity: "low",
        rule: "Threat feed availability",
        message,
        evidence,
        remediation: "Configure or restore a trusted feed to add reputation signals. The module did not count this as a pass.",
      }));
      scoreDelta += 2;
    }

    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  const active = activeIndicators(snapshot, now);
  const activeCount = active.length;
  findings.push(finding({
    status: "pass",
    rule: "Threat feed availability",
    message: `Threat intelligence feed ${snapshot.sourceName || "configured source"} is available with ${activeCount} active record${activeCount === 1 ? "" : "s"}.`,
    evidence: summarizeThreatIntelligenceSnapshot(snapshot, now),
  }));
  checksPassed.push("Threat intelligence feed is available and fresh");

  const indicatorMap = new Map(active.map((indicator) => [indicator.canonical, indicator]));
  const matches = entities.flatMap((entity) => {
    const indicator = indicatorMap.get(entity.canonical);
    return indicator ? [{ entity, indicator }] : [];
  });
  context.matchedIndicators = matches.map(({ entity, indicator }) => ({
    entityRole: entity.role,
    kind: entity.kind,
    indicatorId: indicator.id,
    severity: indicator.severity,
    confidence: indicator.confidence,
    categories: indicator.categories,
    source: indicator.source || snapshot.sourceName,
  }));

  if (matches.length === 0) {
    const message = "No active exact-match threat indicator was found for the screened wallet or contract identities.";
    findings.push(finding({
      status: "pass",
      rule: "Known threat indicator match",
      message,
      evidence: { checkedEntities: context.checkedEntities, source: snapshot.sourceName, generatedAt: snapshot.generatedAt },
    }));
    checksPassed.push(message);
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  const rankedMatches = [...matches].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.indicator.severity] - SEVERITY_RANK[a.indicator.severity];
    return severityDelta || b.indicator.confidence - a.indicator.confidence;
  });
  // Choose the strongest match that meets the policy confidence threshold. A
  // low-confidence critical signal must not hide a high-confidence high signal.
  const strongest = rankedMatches.find(({ indicator }) => indicator.confidence >= settings.minConfidence) || rankedMatches[0];
  const { entity, indicator } = strongest;
  const belowConfidence = indicator.confidence < settings.minConfidence;
  const highSeverity = ["critical", "high"].includes(indicator.severity);
  const mediumSeverity = indicator.severity === "medium";
  const evidence = {
    entityRole: entity.role,
    identifierKind: entity.kind,
    indicatorId: indicator.id,
    label: indicator.label,
    description: indicator.description,
    severity: indicator.severity,
    confidence: indicator.confidence,
    minimumConfidence: settings.minConfidence,
    categories: indicator.categories,
    source: indicator.source || snapshot.sourceName,
    firstSeenAt: indicator.firstSeenAt,
    lastSeenAt: indicator.lastSeenAt,
    references: indicator.references,
    mode: settings.mode,
  };

  if (belowConfidence) {
    const message = `A ${indicator.severity} threat indicator matched, but its ${indicator.confidence}% confidence is below the policy threshold of ${settings.minConfidence}%.`;
    findings.push(finding({
      status: "warning",
      severity: "medium",
      rule: "Known threat indicator match",
      message,
      evidence,
      remediation: "Review the indicator evidence and lower the confidence threshold only through an authorized policy change.",
    }));
    checksFailed.push(message);
    scoreDelta += 8;
    return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
  }

  if (settings.mode === "Enforce" && highSeverity) {
    const message = `Execution target matched a ${indicator.severity}-severity threat indicator: ${indicator.label}.`;
    findings.push(finding({
      status: "fail",
      severity: indicator.severity,
      rule: "Known threat indicator match",
      message,
      evidence,
      remediation: "Do not execute. Use a verified alternative target or remove the indicator only after authorized investigation confirms it is a false positive.",
    }));
    checksFailed.push(message);
    hardBlock = true;
    scoreDelta += indicator.severity === "critical" ? 55 : 45;
  } else if ((settings.mode === "Enforce" && mediumSeverity) || (settings.mode === "Review" && ["critical", "high", "medium"].includes(indicator.severity))) {
    const message = `Execution target matched a ${indicator.severity}-severity threat indicator and requires review: ${indicator.label}.`;
    findings.push(finding({
      status: "warning",
      severity: indicator.severity,
      rule: "Known threat indicator match",
      message,
      evidence,
      remediation: "Pause execution and investigate the indicator evidence before approving or updating the policy.",
    }));
    checksFailed.push(message);
    needsReview = true;
    scoreDelta += highSeverity ? 28 : 18;
  } else {
    const message = `Threat intelligence observed a ${indicator.severity}-severity exact match: ${indicator.label}.`;
    findings.push(finding({
      status: "warning",
      severity: indicator.severity,
      rule: "Known threat indicator match",
      message,
      evidence,
      remediation: settings.mode === "Observe"
        ? "Review the match and change Threat Intelligence mode to Review or Enforce if this signal should affect authorization."
        : "Review the indicator evidence before execution.",
    }));
    checksFailed.push(message);
    scoreDelta += highSeverity ? 16 : 8;
  }

  return { findings, checksPassed, checksFailed, scoreDelta, hardBlock, needsReview, context };
}
