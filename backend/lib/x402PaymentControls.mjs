import { createHash } from "node:crypto";

const X402_ACTIONS = new Set(["x402 Payment"]);
const HASH_32 = /^(?:0x)?[0-9a-f]{64}$/i;
const CAIP2 = /^[a-z0-9][a-z0-9-]{1,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const SETTLEMENT_STATES = new Set(["not_submitted", "submitted", "pending", "confirmed", "failed", "uncertain"]);

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function uniqueList(value, transform = clean, limit = 250) {
  return [...new Set((Array.isArray(value) ? value : [])
    .slice(0, limit)
    .map((item) => transform(item))
    .filter(Boolean))];
}

function finiteNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeMode(value) {
  const candidate = clean(value);
  return ["Observe", "Review", "Enforce"].includes(candidate) ? candidate : "Observe";
}

function normalizeUnavailableAction(value) {
  const candidate = clean(value);
  return ["Warn", "Review", "Block"].includes(candidate) ? candidate : "Warn";
}

function normalizeScheme(value) {
  return lower(value).replace(/_/g, "-");
}

function normalizeNetwork(value) {
  return clean(value).toLowerCase();
}

function normalizeAsset(value) {
  return clean(value).toUpperCase();
}

function normalizeFacilitator(value) {
  return lower(value).replace(/\/+$/, "");
}

function normalizeAssetDecimals(value) {
  const entries = value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
    : (Array.isArray(value) ? value : []).map((item) => {
        const [asset, decimals] = clean(item).split(/[=:]/, 2);
        return [asset, decimals];
      });
  const result = {};
  for (const [assetRaw, decimalsRaw] of entries.slice(0, 250)) {
    const asset = normalizeAsset(assetRaw);
    const decimals = Number(decimalsRaw);
    if (asset && Number.isInteger(decimals) && decimals >= 0 && decimals <= 30) result[asset] = decimals;
  }
  return result;
}

function atomicToDisplay(amountAtomic, decimals) {
  if (!/^[1-9]\d*$/.test(clean(amountAtomic)) || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
  const raw = clean(amountAtomic);
  const padded = raw.padStart(decimals + 1, "0");
  const whole = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, "") : "";
  const text = fraction ? `${whole}.${fraction}` : whole;
  const number = Number(text);
  return Number.isFinite(number) ? { number, text } : null;
}

function normalizeMerchant(value) {
  const raw = lower(value).replace(/^https?:\/\//, "").replace(/\/$/, "");
  return raw.split("/")[0].split(":")[0];
}

function normalizeMethod(value) {
  return clean(value || "GET").toUpperCase();
}

function normalizeSettlementStatus(value) {
  const candidate = lower(value).replace(/[\s-]+/g, "_");
  return SETTLEMENT_STATES.has(candidate) ? candidate : "not_submitted";
}

function parseValidUntil(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" || /^\d+$/.test(clean(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return Number.NaN;
    return numeric > 10_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeHash(value) {
  const raw = lower(value);
  return raw.startsWith("0x") ? raw.slice(2) : raw;
}

export function canonicalizeX402ResourceUrl(value) {
  const raw = clean(value);
  if (!raw) return { valid: false, raw, canonical: "", hostname: "", protocol: "", hasCredentials: false, sensitiveQueryKeys: [], reason: "No resource URL was supplied." };
  try {
    const url = new URL(raw);
    url.hash = "";
    const entries = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
    url.search = "";
    for (const [key, item] of entries) url.searchParams.append(key, item);
    const pathname = url.pathname || "/";
    url.pathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const sensitiveQueryKeys = [...url.searchParams.keys()].filter((key) => /(?:api[-_]?key|access[-_]?token|token|secret|signature|authorization|auth|password|credential)/i.test(key));
    return {
      valid: ["https:", "http:"].includes(url.protocol),
      raw,
      canonical: url.toString(),
      hostname: url.hostname.toLowerCase(),
      protocol: url.protocol,
      hasCredentials: Boolean(url.username || url.password),
      sensitiveQueryKeys,
      reason: ["https:", "http:"].includes(url.protocol) ? "Valid HTTP resource URL." : "Only HTTP and HTTPS resource URLs are supported.",
    };
  } catch {
    return { valid: false, raw, canonical: "", hostname: "", protocol: "", hasCredentials: false, sensitiveQueryKeys: [], reason: "Resource URL is not a valid absolute URL." };
  }
}

export function classifyX402Recipient(value, network = "") {
  const recipient = clean(value);
  const normalizedNetwork = normalizeNetwork(network);
  if (!recipient) return { valid: false, family: "unknown", kind: "missing", reason: "No payment recipient was supplied." };
  if (normalizedNetwork.startsWith("eip155:")) {
    const valid = EVM_ADDRESS.test(recipient);
    return { valid, family: "evm", kind: valid ? "evm-address" : "invalid-evm-address", reason: valid ? "Valid EVM recipient structure." : "Expected a 20-byte 0x-prefixed EVM address." };
  }
  if (normalizedNetwork.startsWith("solana:")) {
    const valid = SOLANA_ADDRESS.test(recipient);
    return { valid, family: "solana", kind: valid ? "solana-address" : "invalid-solana-address", reason: valid ? "Valid Solana-style base58 address structure." : "Expected a 32-44 character base58 Solana address." };
  }
  return { valid: false, family: "unknown", kind: "unsupported-network-family", reason: "Magen3 does not yet have a deterministic recipient validator for this x402 network namespace." };
}

export function buildX402RequestFingerprint(input = {}) {
  const resource = canonicalizeX402ResourceUrl(input.resourceUrl || input.x402ResourceUrl);
  const canonical = [
    String(input.version ?? input.x402Version ?? ""),
    normalizeScheme(input.scheme || input.x402Scheme),
    normalizeMethod(input.method || input.x402HttpMethod),
    resource.canonical,
    normalizeMerchant(input.merchantDomain || input.x402MerchantDomain || resource.hostname),
    lower(input.payTo || input.recipient || input.x402PayTo),
    normalizeAsset(input.asset || input.x402Asset),
    normalizeNetwork(input.network || input.x402Network),
    clean(input.amountAtomic || input.x402AmountAtomic),
    clean(input.validUntil || input.x402ValidUntil),
    clean(input.maxTimeoutSeconds || input.x402MaxTimeoutSeconds),
    clean(input.requirementsReceivedAt || input.x402RequirementsReceivedAt),
    normalizeHash(input.requestBodyHash || input.x402RequestBodyHash),
    normalizeHash(input.paymentRequiredHash || input.x402PaymentRequiredHash),
    clean(input.requestId || input.nonce || input.x402RequestId),
  ].join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "x402 Payment Controls", status, severity, rule, message, evidence, remediation };
}

function policySettings(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const configured = Object.keys(rules).some((key) => key.startsWith("x402"));
  return {
    configured,
    enabled: rules.x402ControlsEnabled === true,
    mode: normalizeMode(rules.x402ControlMode),
    unavailableAction: normalizeUnavailableAction(rules.x402UnavailableAction),
    allowedVersions: uniqueList(rules.x402AllowedVersions, (item) => String(item), 10).length ? uniqueList(rules.x402AllowedVersions, (item) => String(item), 10) : ["2"],
    allowedSchemes: uniqueList(rules.x402AllowedSchemes, normalizeScheme, 10).length ? uniqueList(rules.x402AllowedSchemes, normalizeScheme, 10) : ["exact"],
    allowedMethods: uniqueList(rules.x402AllowedMethods, normalizeMethod, 10).length ? uniqueList(rules.x402AllowedMethods, normalizeMethod, 10) : ["GET", "HEAD", "POST"],
    allowedNetworks: uniqueList(rules.x402AllowedNetworks, normalizeNetwork),
    allowedAssets: uniqueList(rules.x402AllowedAssets, normalizeAsset),
    allowedFacilitators: uniqueList(rules.x402AllowedFacilitators, normalizeFacilitator),
    allowedMerchants: uniqueList(rules.x402AllowedMerchants, normalizeMerchant),
    blockedMerchants: uniqueList(rules.x402BlockedMerchants, normalizeMerchant),
    allowedRecipients: uniqueList(rules.x402AllowedRecipients, lower),
    assetDecimals: Object.keys(normalizeAssetDecimals(rules.x402AssetDecimals)).length
      ? normalizeAssetDecimals(rules.x402AssetDecimals)
      : { USDC: 6 },
    maxPayment: Math.max(0, finiteNumber(rules.x402MaxPayment, 0) || 0),
    dailyLimit: Math.max(0, finiteNumber(rules.x402DailyLimit, 0) || 0),
    monthlyLimit: Math.max(0, finiteNumber(rules.x402MonthlyLimit, 0) || 0),
    reviewThreshold: Math.max(0, finiteNumber(rules.x402ReviewThreshold, 0) || 0),
    maxPaymentsPerHour: safeInteger(rules.x402MaxPaymentsPerHour, 20, { min: 1, max: 10_000 }),
    maxAuthorizationLifetimeSeconds: safeInteger(rules.x402MaxAuthorizationLifetimeSeconds, 600, { min: 30, max: 86_400 }),
    requireHttps: rules.x402RequireHttps !== false,
    requirePaymentRequiredHash: rules.x402RequirePaymentRequiredHash !== false,
    requireBodyHashForUnsafeMethods: rules.x402RequireBodyHashForUnsafeMethods !== false,
    requireRequestId: rules.x402RequireRequestId !== false,
    requireClientFingerprint: rules.x402RequireClientFingerprint === true,
    preventAmbiguousRetry: rules.x402PreventAmbiguousRetry !== false,
    maxSettlementAttempts: safeInteger(rules.x402MaxSettlementAttempts, 1, { min: 1, max: 10 }),
  };
}

function isApplicable(request = {}) {
  return X402_ACTIONS.has(clean(request.actionType)) || Boolean(request.x402ResourceUrl || request.x402MerchantDomain || request.x402PaymentRequiredHash);
}

function applyViolation(state, config, details, { hard = false } = {}) {
  if (hard) {
    state.findings.push(finding({ ...details, status: "fail", severity: details.blockSeverity || "high" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.blockScore || 30;
    state.hardBlock = true;
    return;
  }
  const status = config.mode === "Enforce" ? "fail" : "warning";
  state.findings.push(finding({ ...details, status, severity: config.mode === "Enforce" ? details.blockSeverity || "high" : details.reviewSeverity || "medium" }));
  state.checksFailed.push(details.message);
  state.scoreDelta += config.mode === "Enforce" ? details.blockScore || 28 : details.reviewScore || 14;
  if (config.mode === "Enforce") state.hardBlock = true;
  else if (config.mode === "Review") state.needsReview = true;
}

function applyUnavailable(state, config, details) {
  if (config.unavailableAction === "Block") {
    state.findings.push(finding({ ...details, status: "fail", severity: details.blockSeverity || "high" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.blockScore || 28;
    state.hardBlock = true;
  } else if (config.unavailableAction === "Review") {
    state.findings.push(finding({ ...details, status: "unavailable", severity: details.reviewSeverity || "medium" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.reviewScore || 14;
    state.needsReview = true;
  } else {
    state.findings.push(finding({ ...details, status: "unavailable", severity: "low" }));
    state.scoreDelta += 2;
  }
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "pass", rule, message, evidence }));
  state.checksPassed.push(message);
}

function previousX402Records(auditLogs = [], request = {}, evaluationTime = new Date()) {
  const now = evaluationTime instanceof Date ? evaluationTime.getTime() : Date.parse(evaluationTime);
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const hourStart = safeNow - 60 * 60 * 1000;
  const day = new Date(safeNow);
  day.setHours(0, 0, 0, 0);
  const month = new Date(day.getFullYear(), day.getMonth(), 1);
  const records = auditLogs.filter((log) => log.agentId === request.agentId && log.action === "x402 Payment");
  const approved = records.filter((log) => log.decision === "Allowed");
  const amount = (log) => Number(log.amount || 0);
  return {
    records,
    hourlyCount: approved.filter((log) => Date.parse(log.timestamp) >= hourStart).length,
    dailySpend: approved.filter((log) => Date.parse(log.timestamp) >= day.getTime()).reduce((sum, log) => sum + amount(log), 0),
    monthlySpend: approved.filter((log) => Date.parse(log.timestamp) >= month.getTime()).reduce((sum, log) => sum + amount(log), 0),
  };
}

function previousFingerprintRecords(records = [], fingerprint = "") {
  if (!fingerprint) return [];
  return records.filter((log) => {
    const intent = log.originalIntent && typeof log.originalIntent === "object" ? log.originalIntent : {};
    const action = intent.action && typeof intent.action === "object" ? intent.action : {};
    const x402 = action.x402 && typeof action.x402 === "object" ? action.x402 : {};
    return lower(x402.requestFingerprint || x402.computedRequestFingerprint) === lower(fingerprint);
  });
}

export function evaluateX402PaymentControls({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const applicable = isApplicable(request);
  const config = policySettings(policy);
  if (!applicable) {
    state.findings.push(finding({ status: "skipped", rule: "x402 intent applicability", message: "x402 Payment Controls were skipped because this is not an x402 payment intent.", evidence: { actionType: request.actionType || "" } }));
    return { ...state, applicable: false, context: null };
  }
  if (!config.enabled) {
    const message = "x402 Payment Controls are not explicitly enabled by the active policy.";
    state.findings.push(finding({ status: "fail", severity: "high", rule: "x402 controls enabled", message, evidence: { configured: config.configured, enabled: false }, remediation: "Enable and configure x402 Payment Controls before allowing an autonomous agent to create PAYMENT-SIGNATURE." }));
    state.checksFailed.push(message);
    state.scoreDelta += 35;
    state.hardBlock = true;
    return { ...state, applicable: true, context: { status: "disabled", mode: config.mode, unavailableAction: config.unavailableAction } };
  }

  const version = String(request.x402Version ?? "").trim();
  const scheme = normalizeScheme(request.x402Scheme);
  const method = normalizeMethod(request.x402HttpMethod);
  const resource = canonicalizeX402ResourceUrl(request.x402ResourceUrl);
  const merchantDomain = normalizeMerchant(request.x402MerchantDomain || resource.hostname);
  const payTo = clean(request.x402PayTo);
  const network = normalizeNetwork(request.x402Network);
  const asset = normalizeAsset(request.x402Asset || request.asset);
  const facilitator = normalizeFacilitator(request.x402Facilitator);
  const amountAtomic = clean(request.x402AmountAtomic);
  const assetDecimals = config.assetDecimals[asset];
  const derivedAmount = atomicToDisplay(amountAtomic, assetDecimals);
  const submittedDisplayAmount = finiteNumber(request.amount, null);
  const displayAmount = derivedAmount?.number ?? null;
  const maxTimeoutSeconds = safeInteger(request.x402MaxTimeoutSeconds, 0, { min: 0, max: 86_400 });
  const requirementsReceivedAtRaw = clean(request.x402RequirementsReceivedAt);
  const requirementsReceivedAtMs = Date.parse(requirementsReceivedAtRaw);
  const validUntilRaw = request.x402ValidUntil;
  const explicitValidUntilMs = parseValidUntil(validUntilRaw);
  const validUntilMs = Number.isFinite(explicitValidUntilMs)
    ? explicitValidUntilMs
    : maxTimeoutSeconds > 0 && Number.isFinite(requirementsReceivedAtMs)
      ? requirementsReceivedAtMs + maxTimeoutSeconds * 1000
      : Number.NaN;
  const requestId = clean(request.x402RequestId);
  const requestBodyHash = normalizeHash(request.x402RequestBodyHash);
  const paymentRequiredHash = normalizeHash(request.x402PaymentRequiredHash);
  const clientFingerprint = normalizeHash(request.x402RequestFingerprint);
  const computedFingerprint = buildX402RequestFingerprint({
    version, scheme, method, resourceUrl: resource.canonical || request.x402ResourceUrl, merchantDomain, payTo, asset, network,
    amountAtomic,
    validUntil: Number.isFinite(validUntilMs) ? new Date(validUntilMs).toISOString() : clean(validUntilRaw),
    maxTimeoutSeconds,
    requirementsReceivedAt: requirementsReceivedAtRaw,
    requestBodyHash, paymentRequiredHash, requestId,
  });
  const settlementStatus = normalizeSettlementStatus(request.x402SettlementStatus);
  const settlementAttempt = safeInteger(request.x402SettlementAttempt, 0, { min: 0, max: 10_000 });
  const recipient = classifyX402Recipient(payTo, network);
  const stats = previousX402Records(auditLogs, request, now);
  const duplicateRecords = previousFingerprintRecords(stats.records, computedFingerprint);

  if (!version || !scheme || !resource.raw || !merchantDomain || !payTo || !network || !asset || !amountAtomic || (!validUntilRaw && !maxTimeoutSeconds)) {
    applyUnavailable(state, config, {
      rule: "Complete x402 payment requirements",
      message: "The x402 payment requirement is incomplete.",
      evidence: { missing: [
        ["version", version], ["scheme", scheme], ["resourceUrl", resource.raw], ["merchantDomain", merchantDomain], ["payTo", payTo],
        ["network", network], ["asset", asset], ["amountAtomic", amountAtomic], ["validUntil or maxTimeoutSeconds", clean(validUntilRaw) || maxTimeoutSeconds],
      ].filter(([, value]) => !value).map(([name]) => name) },
      remediation: "Parse the complete PAYMENT-REQUIRED object and submit its payment fields before requesting authorization.",
    });
  } else {
    pass(state, "Complete x402 payment requirements", "Required x402 payment fields are present.", { version, scheme, merchantDomain, network, asset });
  }

  if (!config.allowedVersions.includes(version)) {
    applyViolation(state, config, { rule: "Allowed x402 protocol versions", message: `x402 protocol version ${version || "missing"} is not permitted.`, evidence: { received: version, allowed: config.allowedVersions }, remediation: "Use an x402 protocol version allowed by the active policy." });
  } else pass(state, "Allowed x402 protocol versions", `x402 protocol version ${version} is allowed.`, { version });

  if (!config.allowedSchemes.includes(scheme)) {
    applyViolation(state, config, { rule: "Allowed x402 payment schemes", message: `x402 scheme ${scheme || "missing"} is not permitted.`, evidence: { received: scheme, allowed: config.allowedSchemes }, remediation: "Use the exact scheme or explicitly authorize and test another scheme in policy." });
  } else pass(state, "Allowed x402 payment schemes", `x402 scheme ${scheme} is allowed.`, { scheme });

  if (!HTTP_METHODS.has(method) || !config.allowedMethods.includes(method)) {
    applyViolation(state, config, { rule: "Allowed HTTP methods", message: `HTTP method ${method || "missing"} is not allowed for x402 payment.`, evidence: { received: method, allowed: config.allowedMethods }, remediation: "Use an HTTP method allowed by the x402 policy." });
  } else pass(state, "Allowed HTTP methods", `HTTP method ${method} is allowed.`, { method });

  if (!resource.valid) {
    applyViolation(state, config, { rule: "Canonical paid resource", message: resource.reason, evidence: { received: resource.raw }, remediation: "Use an absolute HTTP or HTTPS resource URL." }, { hard: true });
  } else if (config.requireHttps && resource.protocol !== "https:") {
    const localhost = ["localhost", "127.0.0.1", "::1"].includes(resource.hostname);
    if (!localhost) applyViolation(state, config, { rule: "HTTPS paid resource", message: "The paid resource is not protected by HTTPS.", evidence: { resourceUrl: resource.canonical }, remediation: "Use HTTPS so payment requirements and paid content are not exposed or modified in transit." }, { hard: true });
    else pass(state, "HTTPS paid resource", "HTTP is accepted only because the resource is localhost development traffic.", { resourceUrl: resource.canonical });
  } else pass(state, "Canonical paid resource", "The paid resource URL is valid and canonicalized.", { resourceUrl: resource.canonical });

  if (resource.hasCredentials || resource.sensitiveQueryKeys.length > 0) {
    applyViolation(state, config, {
      rule: "Secret-free paid resource URL",
      message: "The paid resource URL contains embedded credentials or query parameters that appear to contain secrets.",
      evidence: { hasEmbeddedCredentials: resource.hasCredentials, sensitiveQueryKeys: resource.sensitiveQueryKeys },
      remediation: "Remove credentials, API keys, tokens, and signatures from the URL. Put authentication in protected headers outside the Magen3 audit payload.",
    }, { hard: true });
  } else if (resource.valid) pass(state, "Secret-free paid resource URL", "The paid resource URL does not contain embedded credentials or obvious secret-bearing query keys.", {});

  const targetResource = canonicalizeX402ResourceUrl(request.target);
  if (request.targetType !== "x402 Merchant") {
    applyViolation(state, config, { rule: "x402 target classification", message: "x402 Payment actions must classify the target as x402 Merchant.", evidence: { targetType: request.targetType || "" }, remediation: "Set action.targetType to x402 Merchant." }, { hard: true });
  } else pass(state, "x402 target classification", "The intent is classified as an x402 merchant payment.", { targetType: request.targetType });
  if (!targetResource.valid || targetResource.canonical !== resource.canonical) {
    applyViolation(state, config, { rule: "Intent-resource binding", message: "The intent target does not match the canonical paid resource URL.", evidence: { target: request.target || "", canonicalTarget: targetResource.canonical, resourceUrl: resource.canonical }, remediation: "Use the same canonical resource URL in action.target and action.x402.resourceUrl." }, { hard: true });
  } else pass(state, "Intent-resource binding", "The intent target is bound to the canonical paid resource URL.", { resourceUrl: resource.canonical });

  if (resource.hostname && merchantDomain && resource.hostname !== merchantDomain) {
    applyViolation(state, config, { rule: "Merchant-resource binding", message: "The submitted merchant domain does not match the paid resource hostname.", evidence: { resourceHostname: resource.hostname, merchantDomain }, remediation: "Re-parse the original 402 response and bind the payment to the resource server hostname." }, { hard: true });
  } else if (merchantDomain) pass(state, "Merchant-resource binding", "Merchant domain matches the paid resource hostname.", { merchantDomain });

  if (config.blockedMerchants.includes(merchantDomain)) {
    applyViolation(state, config, { rule: "Blocked x402 merchants", message: `Merchant ${merchantDomain} is explicitly blocked.`, evidence: { merchantDomain }, remediation: "Do not pay this merchant. Use an approved service instead." }, { hard: true });
  } else if (config.allowedMerchants.length > 0 && !config.allowedMerchants.includes(merchantDomain)) {
    applyViolation(state, config, { rule: "Approved x402 merchants", message: `Merchant ${merchantDomain || "missing"} is not approved.`, evidence: { merchantDomain, approvedMerchants: config.allowedMerchants }, remediation: "Add the merchant to policy only after authorized review, or use an approved merchant." });
  } else if (merchantDomain) pass(state, "Approved x402 merchants", config.allowedMerchants.length ? "Merchant is approved by policy." : "No merchant allowlist is configured; the merchant was evaluated without allowlist enforcement.", { merchantDomain });

  if (!CAIP2.test(network)) {
    applyViolation(state, config, { rule: "CAIP-2 payment network", message: "The x402 payment network is not a valid CAIP-2 identifier.", evidence: { network }, remediation: "Use a CAIP-2 identifier such as eip155:84532." }, { hard: true });
  } else if (config.allowedNetworks.length > 0 && !config.allowedNetworks.includes(network)) {
    applyViolation(state, config, { rule: "Approved x402 networks", message: `Network ${network} is not approved.`, evidence: { network, approvedNetworks: config.allowedNetworks }, remediation: "Use an approved payment network or update policy after authorized review." });
  } else pass(state, "Approved x402 networks", "The x402 payment network is structurally valid and policy-compatible.", { network });

  if (config.allowedAssets.length > 0 && !config.allowedAssets.includes(asset)) {
    applyViolation(state, config, { rule: "Approved x402 assets", message: `Payment asset ${asset || "missing"} is not approved.`, evidence: { asset, approvedAssets: config.allowedAssets }, remediation: "Pay with an approved asset or update policy after review." });
  } else if (asset) pass(state, "Approved x402 assets", "The payment asset is policy-compatible.", { asset });

  if (!recipient.valid) {
    if (recipient.kind === "unsupported-network-family") applyUnavailable(state, config, { rule: "x402 recipient structure", message: recipient.reason, evidence: { payTo, network, family: recipient.family }, remediation: "Use a supported EVM or Solana payment network, or add a reviewed validator for this network." });
    else applyViolation(state, config, { rule: "x402 recipient structure", message: recipient.reason, evidence: { payTo, network, kind: recipient.kind }, remediation: "Use the recipient address from the original PAYMENT-REQUIRED requirements." }, { hard: true });
  } else if (config.allowedRecipients.length > 0 && !config.allowedRecipients.includes(lower(payTo))) {
    applyViolation(state, config, { rule: "Approved x402 recipients", message: "The payment recipient is not approved by policy.", evidence: { payTo, approvedRecipients: config.allowedRecipients }, remediation: "Use an approved recipient or update the policy after verifying the merchant." });
  } else pass(state, "x402 recipient structure", "The payment recipient is structurally valid and policy-compatible.", { payTo, network, family: recipient.family });

  if (config.allowedFacilitators.length > 0 && !config.allowedFacilitators.includes(facilitator)) {
    applyViolation(state, config, { rule: "Approved x402 facilitators", message: `Facilitator ${facilitator || "missing"} is not approved.`, evidence: { facilitator, approvedFacilitators: config.allowedFacilitators }, remediation: "Use an approved facilitator or update policy after validating its verify and settle behavior." });
  } else if (!facilitator) {
    applyUnavailable(state, config, { rule: "x402 facilitator identity", message: "No facilitator identity was supplied.", evidence: {}, remediation: "Include the facilitator label or origin selected by the payment adapter." });
  } else pass(state, "Approved x402 facilitators", config.allowedFacilitators.length ? "The selected facilitator is approved." : "No facilitator allowlist is configured; the submitted facilitator was recorded.", { facilitator });

  if (!/^[1-9]\d*$/.test(amountAtomic)) {
    applyViolation(state, config, { rule: "Atomic payment amount", message: "x402 amountAtomic must be a positive integer string.", evidence: { amountAtomic }, remediation: "Use the amount from the selected x402 v2 payment requirement in atomic token units." }, { hard: true });
  } else pass(state, "Atomic payment amount", "The x402 atomic amount is structurally valid.", { amountAtomic });

  if (!Number.isInteger(assetDecimals)) {
    applyUnavailable(state, config, { rule: "x402 asset decimals", message: `No decimal precision is configured for payment asset ${asset || "missing"}.`, evidence: { asset, configuredAssets: Object.keys(config.assetDecimals) }, remediation: "Configure structuredRules.x402AssetDecimals so Magen3 can derive limits from the atomic payment amount rather than trusting a display amount." });
  } else if (!derivedAmount || derivedAmount.number <= 0) {
    applyViolation(state, config, { rule: "Atomic-to-display amount conversion", message: "The atomic payment amount cannot be converted safely using the configured asset decimals.", evidence: { amountAtomic, asset, assetDecimals }, remediation: "Use a positive atomic amount and the correct reviewed decimal precision for the payment asset." }, { hard: true });
  } else if (!Number.isFinite(submittedDisplayAmount) || submittedDisplayAmount <= 0 || Math.abs(submittedDisplayAmount - derivedAmount.number) > Math.max(1e-12, derivedAmount.number * 1e-9)) {
    applyViolation(state, config, { rule: "Atomic/display amount consistency", message: "action.amount does not match the amount derived from amountAtomic and the configured asset decimals.", evidence: { submittedAmount: submittedDisplayAmount, derivedAmount: derivedAmount.number, amountAtomic, asset, assetDecimals }, remediation: "Set action.amount to the exact display-unit value represented by the selected x402 payment requirement." }, { hard: true });
  } else {
    pass(state, "Atomic/display amount consistency", "The display amount is derived consistently from the atomic payment requirement.", { amount: derivedAmount.number, amountText: derivedAmount.text, amountAtomic, asset, assetDecimals });
    if (config.maxPayment > 0 && displayAmount > config.maxPayment) applyViolation(state, config, { rule: "Maximum x402 payment", message: `Payment amount ${displayAmount} exceeds the policy maximum of ${config.maxPayment}.`, evidence: { received: displayAmount, maximum: config.maxPayment, asset }, remediation: "Reduce the payment or obtain authorized policy approval." });
    else pass(state, "Maximum x402 payment", "The payment is within the per-payment limit.", { amount: displayAmount, maximum: config.maxPayment || null, asset });
    if (config.reviewThreshold > 0 && displayAmount > config.reviewThreshold) {
      state.findings.push(finding({ status: "warning", severity: "medium", rule: "x402 review threshold", message: `Payment amount ${displayAmount} exceeds the review threshold of ${config.reviewThreshold}.`, evidence: { amount: displayAmount, reviewThreshold: config.reviewThreshold, asset }, remediation: "Obtain human approval or reduce the payment amount." }));
      state.checksFailed.push("x402 payment exceeds the human-review threshold");
      state.needsReview = true;
      state.scoreDelta += 12;
    } else pass(state, "x402 review threshold", "The payment does not exceed the x402 review threshold.", { amount: displayAmount, reviewThreshold: config.reviewThreshold || null });
    if (config.dailyLimit > 0 && stats.dailySpend + displayAmount > config.dailyLimit) applyViolation(state, config, { rule: "Daily x402 spending limit", message: "This payment would exceed the daily x402 spending limit.", evidence: { used: stats.dailySpend, requested: displayAmount, projected: stats.dailySpend + displayAmount, limit: config.dailyLimit }, remediation: "Wait for the spending window to reset or obtain an authorized policy change." });
    else pass(state, "Daily x402 spending limit", "The payment is within the daily x402 spending limit.", { used: stats.dailySpend, requested: displayAmount, limit: config.dailyLimit || null });
    if (config.monthlyLimit > 0 && stats.monthlySpend + displayAmount > config.monthlyLimit) applyViolation(state, config, { rule: "Monthly x402 spending limit", message: "This payment would exceed the monthly x402 spending limit.", evidence: { used: stats.monthlySpend, requested: displayAmount, projected: stats.monthlySpend + displayAmount, limit: config.monthlyLimit }, remediation: "Wait for the monthly window to reset or obtain an authorized policy change." });
    else pass(state, "Monthly x402 spending limit", "The payment is within the monthly x402 spending limit.", { used: stats.monthlySpend, requested: displayAmount, limit: config.monthlyLimit || null });
  }

  if (stats.hourlyCount >= config.maxPaymentsPerHour) applyViolation(state, config, { rule: "x402 payment frequency", message: "The agent has reached the hourly x402 payment limit.", evidence: { hourlyCount: stats.hourlyCount, maximum: config.maxPaymentsPerHour }, remediation: "Wait for the hourly window to reset or obtain authorized policy approval." });
  else pass(state, "x402 payment frequency", "The agent is within the hourly x402 payment-frequency limit.", { hourlyCount: stats.hourlyCount, maximum: config.maxPaymentsPerHour });

  if (!Number.isFinite(validUntilMs)) {
    applyViolation(state, config, { rule: "x402 authorization expiry", message: "Neither a valid expiration nor a usable maxTimeoutSeconds window was supplied.", evidence: { validUntil: clean(validUntilRaw), maxTimeoutSeconds, requirementsReceivedAt: requirementsReceivedAtRaw }, remediation: "Submit validUntil, or submit maxTimeoutSeconds with the time the PAYMENT-REQUIRED header was received." }, { hard: true });
  } else if (validUntilMs <= now.getTime()) {
    applyViolation(state, config, { rule: "x402 authorization expiry", message: "The x402 payment requirement has expired.", evidence: { validUntil: new Date(validUntilMs).toISOString(), evaluatedAt: now.toISOString() }, remediation: "Request fresh payment requirements before retrying." }, { hard: true });
  } else if (validUntilMs - now.getTime() > config.maxAuthorizationLifetimeSeconds * 1000) {
    applyViolation(state, config, { rule: "x402 authorization lifetime", message: "The payment authorization lifetime exceeds the policy maximum.", evidence: { validUntil: new Date(validUntilMs).toISOString(), lifetimeSeconds: Math.round((validUntilMs - now.getTime()) / 1000), maximumSeconds: config.maxAuthorizationLifetimeSeconds }, remediation: "Use a shorter-lived payment requirement." });
  } else pass(state, "x402 authorization expiry", "The payment requirement is current and expires within the allowed lifetime.", { validUntil: new Date(validUntilMs).toISOString(), maximumLifetimeSeconds: config.maxAuthorizationLifetimeSeconds });

  if (config.requireRequestId && (!requestId || !REFERENCE.test(requestId))) applyViolation(state, config, { rule: "Unique x402 request identifier", message: "A valid unique request identifier or nonce is required.", evidence: { requestId }, remediation: "Generate a unique request ID for this paid resource request." });
  else if (requestId) pass(state, "Unique x402 request identifier", "A structurally valid request identifier is present.", { requestId });

  if (config.requirePaymentRequiredHash && !HASH_32.test(paymentRequiredHash)) applyViolation(state, config, { rule: "PAYMENT-REQUIRED binding", message: "A SHA-256 hash of the decoded PAYMENT-REQUIRED object is required.", evidence: { paymentRequiredHash: request.x402PaymentRequiredHash || "" }, remediation: "Hash the canonical decoded PAYMENT-REQUIRED JSON and submit it before signing." });
  else if (paymentRequiredHash) pass(state, "PAYMENT-REQUIRED binding", "The payment requirements include a structurally valid binding hash.", { paymentRequiredHash });

  const unsafeMethod = !["GET", "HEAD"].includes(method);
  if (unsafeMethod && config.requireBodyHashForUnsafeMethods && !HASH_32.test(requestBodyHash)) applyViolation(state, config, { rule: "HTTP request-body binding", message: `${method} x402 payments require a SHA-256 request-body hash.`, evidence: { method, requestBodyHash: request.x402RequestBodyHash || "" }, remediation: "Hash the exact request body that will be retried with PAYMENT-SIGNATURE." });
  else if (!unsafeMethod || requestBodyHash) pass(state, "HTTP request-body binding", unsafeMethod ? "The paid request body is bound by a SHA-256 hash." : "No request-body hash is required for this safe HTTP method.", { method, requestBodyHash: requestBodyHash || null });

  if (config.requireClientFingerprint && !HASH_32.test(clientFingerprint)) applyViolation(state, config, { rule: "Client request fingerprint", message: "The policy requires a client-generated request fingerprint.", evidence: { provided: request.x402RequestFingerprint || "", computedFingerprint }, remediation: "Use Magen3's canonical field order to compute the request fingerprint before authorization." });
  else if (clientFingerprint && clientFingerprint !== computedFingerprint) applyViolation(state, config, { rule: "Client request fingerprint", message: "The submitted request fingerprint does not match Magen3's canonical fingerprint.", evidence: { provided: clientFingerprint, computed: computedFingerprint }, remediation: "Rebuild the fingerprint from the original method, URL, merchant, recipient, asset, network, amount, expiry, hashes, and request ID." }, { hard: true });
  else pass(state, "Canonical request fingerprint", "Magen3 computed a deterministic request fingerprint for replay and settlement binding.", { computedFingerprint, clientFingerprint: clientFingerprint || null });

  if (settlementAttempt > config.maxSettlementAttempts) applyViolation(state, config, { rule: "Maximum settlement attempts", message: "The submitted settlement attempt exceeds the policy maximum.", evidence: { settlementAttempt, maximum: config.maxSettlementAttempts }, remediation: "Stop automatic retry and reconcile the existing settlement attempt." }, { hard: true });
  else pass(state, "Maximum settlement attempts", "The submitted settlement attempt is within the policy limit.", { settlementAttempt, maximum: config.maxSettlementAttempts });

  if (config.preventAmbiguousRetry && ["submitted", "pending", "confirmed", "uncertain"].includes(settlementStatus)) {
    applyViolation(state, config, { rule: "Ambiguous-settlement retry prevention", message: `Automatic payment is not permitted while settlement status is ${settlementStatus}.`, evidence: { settlementStatus, settlementAttempt }, remediation: "Reconcile the existing settlement or transaction hash before creating another payment authorization." }, { hard: true });
  } else pass(state, "Ambiguous-settlement retry prevention", "No unresolved settlement state was supplied for this authorization request.", { settlementStatus });

  const settledDuplicate = duplicateRecords.find((log) => {
    const x402 = log.originalIntent?.action?.x402 || {};
    const status = normalizeSettlementStatus(x402.settlement?.status || x402.settlementStatus);
    return ["submitted", "pending", "confirmed", "uncertain"].includes(status);
  });
  if (settledDuplicate) applyViolation(state, config, { rule: "x402 replay prevention", message: "This request fingerprint is already associated with an unresolved or completed payment attempt.", evidence: { computedFingerprint, priorAuditLogId: settledDuplicate.id, priorDecision: settledDuplicate.decision }, remediation: "Do not sign or settle again. Reconcile the prior audit record." }, { hard: true });
  else if (duplicateRecords.length > 0) applyViolation(state, config, { rule: "x402 replay prevention", message: "This request fingerprint has already been evaluated by Magen3.", evidence: { computedFingerprint, priorAuditLogIds: duplicateRecords.map((log) => log.id).slice(0, 10) }, remediation: "Use the existing authorization or request fresh payment requirements with a new request ID." });
  else pass(state, "x402 replay prevention", "No previous audit record uses this request fingerprint.", { computedFingerprint });

  return {
    ...state,
    applicable: true,
    context: {
      status: "foundation-available",
      mode: config.mode,
      unavailableAction: config.unavailableAction,
      version,
      scheme,
      method,
      resourceUrl: resource.canonical || resource.raw,
      merchantDomain,
      payTo,
      network,
      asset,
      facilitator,
      amountAtomic,
      amount: displayAmount,
      submittedAmount: submittedDisplayAmount,
      assetDecimals: Number.isInteger(assetDecimals) ? assetDecimals : null,
      maxTimeoutSeconds,
      requirementsReceivedAt: requirementsReceivedAtRaw,
      validUntil: Number.isFinite(validUntilMs) ? new Date(validUntilMs).toISOString() : clean(validUntilRaw),
      requestId,
      requestBodyHash: requestBodyHash || "",
      paymentRequiredHash: paymentRequiredHash || "",
      requestFingerprint: computedFingerprint,
      clientFingerprint: clientFingerprint || "",
      recipientFamily: recipient.family,
      settlementStatus,
      settlementAttempt,
      hourlyCount: stats.hourlyCount,
      dailySpend: stats.dailySpend,
      monthlySpend: stats.monthlySpend,
      previousFingerprintCount: duplicateRecords.length,
    },
  };
}

export function normalizeX402SettlementUpdate(body = {}) {
  const status = normalizeSettlementStatus(body.status || body.settlementStatus);
  if (!["submitted", "pending", "confirmed", "failed", "uncertain"].includes(status)) {
    const err = new Error("x402 settlement status must be submitted, pending, confirmed, failed, or uncertain");
    err.status = 400;
    throw err;
  }
  const transactionHash = clean(body.transactionHash || body.txHash);
  if (transactionHash && !/^(?:0x[0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{32,100})$/i.test(transactionHash)) {
    const err = new Error("x402 settlement transactionHash must be a 32-byte EVM hash or a base58 transaction identifier");
    err.status = 400;
    throw err;
  }
  if (status === "confirmed" && !transactionHash) {
    const err = new Error("A confirmed x402 settlement requires transactionHash");
    err.status = 400;
    throw err;
  }
  const resourceDeliveredProvided = Object.prototype.hasOwnProperty.call(body, "resourceDelivered");
  const resourceDelivered = body.resourceDelivered === true;
  if (resourceDelivered && status !== "confirmed") {
    const err = new Error("resourceDelivered can only be true for a confirmed x402 settlement");
    err.status = 400;
    throw err;
  }
  const attempt = safeInteger(body.attempt ?? body.settlementAttempt, 1, { min: 1, max: 10 });
  const requestFingerprint = normalizeHash(body.requestFingerprint);
  if (!HASH_32.test(requestFingerprint)) {
    const err = new Error("requestFingerprint must be the 32-byte fingerprint returned by Magen3");
    err.status = 400;
    throw err;
  }
  return {
    status,
    transactionHash,
    attempt,
    requestFingerprint,
    facilitatorReference: clean(body.facilitatorReference || body.reference).slice(0, 256),
    resourceDelivered,
    resourceDeliveredProvided,
    note: clean(body.note).slice(0, 500),
    updatedAt: new Date().toISOString(),
  };
}


export function mergeX402SettlementTransition(previous = {}, update = {}) {
  const previousStatus = normalizeSettlementStatus(previous.status);
  const previousAttempt = safeInteger(previous.attempt, 0, { min: 0, max: 10 });
  const previousTransactionHash = clean(previous.transactionHash);
  const previousDelivered = previous.resourceDelivered === true;

  if (update.attempt < previousAttempt) {
    const err = new Error("x402 settlement attempts cannot move backwards");
    err.status = 409;
    throw err;
  }
  if (previousStatus === "failed" && update.status !== "failed" && update.attempt <= previousAttempt) {
    const err = new Error("Retrying a failed x402 settlement requires a higher attempt number");
    err.status = 409;
    throw err;
  }
  if (previousStatus === "confirmed" && update.status !== "confirmed") {
    const err = new Error("A confirmed x402 settlement cannot be replaced with a different result");
    err.status = 409;
    throw err;
  }
  if (previousTransactionHash && update.transactionHash && lower(previousTransactionHash) !== lower(update.transactionHash)) {
    const err = new Error("An x402 settlement transaction hash cannot be changed once recorded");
    err.status = 409;
    throw err;
  }
  if (previousDelivered && update.resourceDeliveredProvided && !update.resourceDelivered) {
    const err = new Error("Paid-resource delivery cannot be reverted after it is recorded");
    err.status = 409;
    throw err;
  }

  const { resourceDeliveredProvided: _internal, ...publicUpdate } = update;
  return {
    ...publicUpdate,
    transactionHash: update.transactionHash || previousTransactionHash,
    resourceDelivered: update.resourceDeliveredProvided ? update.resourceDelivered : previousDelivered,
  };
}
