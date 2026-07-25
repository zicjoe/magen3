import { createHash } from "node:crypto";

const SHA256 = /^(?:0x)?[0-9a-f]{64}$/i;
const MAX_LIST = 100;

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(array(values).map(clean).filter(Boolean))]; }
function bool(value) { return value === true || lower(value) === "true"; }
function finite(value, fallback = null, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}
function integer(value, fallback = null, options = {}) {
  const parsed = finite(value, fallback, options);
  return parsed === null || !Number.isInteger(parsed) ? fallback : parsed;
}
function normalizeMode(value) {
  const normalized = lower(value);
  if (normalized === "observe") return "Observe";
  if (["enforce", "block"].includes(normalized)) return "Enforce";
  return "Review";
}
function normalizeAction(value, fallback = "Review") {
  const normalized = lower(value);
  if (["warn", "observe", "allow"].includes(normalized)) return "Warn";
  if (["block", "enforce"].includes(normalized)) return "Block";
  if (normalized === "review") return "Review";
  return fallback;
}
function chainFamily(value, chainName = "") {
  const normalized = lower(value || chainName);
  if (["evm", "ethereum", "base", "arbitrum", "optimism", "polygon", "bsc", "avalanche"].some((item) => normalized.includes(item))) return "EVM";
  if (normalized.includes("casper")) return "Casper";
  return clean(value) || "Other";
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function fingerprint(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Gas Sponsorship & Fee Safety", status, severity, rule, message, evidence, remediation };
}
function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.feeSafetyEnabled === true,
    mode: normalizeMode(rules.feeSafetyMode),
    maximumNetworkFee: finite(rules.feeSafetyMaximumNetworkFee ?? rules.maximumNetworkFee, null, { min: 0 }),
    maximumGasPrice: finite(rules.feeSafetyMaximumGasPrice ?? rules.maximumGasPrice, null, { min: 0 }),
    maximumPriorityFee: finite(rules.feeSafetyMaximumPriorityFee ?? rules.maximumPriorityFee, null, { min: 0 }),
    approvedSponsors: unique(rules.feeSafetyApprovedSponsors || rules.approvedSponsors).slice(0, MAX_LIST),
    approvedPaymasters: unique(rules.feeSafetyApprovedPaymasters || rules.approvedPaymasters).slice(0, MAX_LIST),
    sponsorshipUnavailableAction: normalizeAction(rules.feeSafetySponsorshipUnavailableAction ?? rules.sponsorshipUnavailableAction, "Review"),
    sponsoredBudget: finite(rules.feeSafetySponsoredBudget ?? rules.sponsoredBudget, null, { min: 0 }),
    maximumSponsoredOperations: integer(rules.feeSafetyMaximumSponsoredOperations ?? rules.maximumSponsoredOperations, null, { min: 1, max: 1000000 }),
    maximumFailedSponsoredOperations: integer(rules.feeSafetyMaximumFailedSponsoredOperations, 3, { min: 0, max: 1000000 }),
    lookbackSeconds: integer(rules.feeSafetyLookbackSeconds, 86400, { min: 60, max: 31536000 }),
    requireSponsorshipExpiry: rules.feeSafetyRequireSponsorshipExpiry !== false,
    requireSponsorEvidence: rules.feeSafetyRequireSponsorEvidence === true,
  };
}
function createState(config) {
  return { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, violations: [], config, context: null };
}
function add(state, status, rule, message, evidence = {}, remediation = "", severity = "info") {
  state.findings.push(finding({ status, severity, rule, message, evidence, remediation }));
  if (status === "pass") state.checksPassed.push(message);
  if (["fail", "warning", "unavailable"].includes(status)) state.checksFailed.push(message);
}
function hardFail(state, rule, message, evidence, remediation, severity = "high") {
  add(state, "fail", rule, message, evidence, remediation, severity);
  state.scoreDelta += severity === "critical" ? 40 : 28;
  state.hardBlock = true;
  state.violations.push({ rule, message });
}
function policyViolation(state, config, action, rule, message, evidence, remediation, severity = "medium") {
  const effective = action || (config.mode === "Enforce" ? "Block" : config.mode === "Observe" ? "Warn" : "Review");
  if (effective === "Block") return hardFail(state, rule, message, evidence, remediation, severity === "medium" ? "high" : severity);
  add(state, "warning", rule, message, evidence, remediation, severity);
  state.scoreDelta += effective === "Review" ? 16 : 7;
  state.violations.push({ rule, message });
  if (effective === "Review") state.needsReview = true;
}
function unavailable(state, config, rule, message, evidence, remediation) {
  const action = config.sponsorshipUnavailableAction;
  if (action === "Block") return hardFail(state, rule, message, evidence, remediation, "high");
  add(state, "unavailable", rule, message, evidence, remediation, action === "Review" ? "high" : "medium");
  state.scoreDelta += action === "Review" ? 16 : 6;
  state.violations.push({ rule, message });
  if (action === "Review") state.needsReview = true;
}
function auditFeeContext(log = {}) {
  const original = log.originalIntent && typeof log.originalIntent === "object" ? log.originalIntent : {};
  const fee = original.feeSafety && typeof original.feeSafety === "object" ? original.feeSafety : {};
  return { original, fee };
}
function historicalUsage({ auditLogs = [], agentId = "", nowMs, lookbackSeconds }) {
  let sponsoredBudgetUsed = 0;
  let sponsoredOperationsUsed = 0;
  let failedSponsoredOperations = 0;
  const cutoff = nowMs - lookbackSeconds * 1000;
  for (const log of auditLogs) {
    if (agentId && log.agentId !== agentId) continue;
    const timestamp = Date.parse(log.timestamp || log.createdAt || "");
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
    const { fee } = auditFeeContext(log);
    if (fee.sponsored !== true) continue;
    sponsoredOperationsUsed += 1;
    sponsoredBudgetUsed += Number(fee.networkFee ?? fee.maximumFee ?? 0) || 0;
    const executionStatus = lower(log.executionStatus || log.settlementStatus || fee.executionStatus);
    if (["failed", "uncertain", "reverted"].includes(executionStatus)) failedSponsoredOperations += 1;
  }
  return { sponsoredBudgetUsed, sponsoredOperationsUsed, failedSponsoredOperations };
}

export function evaluateGasSponsorshipFeeSafety({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const config = settings(policy);
  const state = createState(config);
  const metadataSupplied = request.feeSafetyMetadataSupplied === true;
  if (!config.enabled) {
    add(state, "skipped", "Fee safety enabled", "Gas Sponsorship & Fee Safety is disabled for the active policy.", { metadataSupplied }, "Enable the control before relying on fee or sponsorship enforcement.");
    state.context = { metadataSupplied, status: "skipped", violations: [] };
    return state;
  }
  if (!metadataSupplied) {
    add(state, "skipped", "Fee metadata relevance", "No fee-safety or sponsorship metadata was supplied for this request.", {}, "Supply trusted public fee and sponsorship evidence when this control is relevant.");
    state.context = { metadataSupplied: false, status: "skipped", violations: [] };
    return state;
  }

  const family = chainFamily(request.feeChainFamily, request.feeChainName || request.chainName);
  const networkFee = finite(request.feeNetworkFee, null, { min: 0 });
  const estimatedGas = finite(request.feeEstimatedGas, null, { min: 0 });
  const gasLimit = finite(request.feeGasLimit, null, { min: 0 });
  const gasPrice = finite(request.feeGasPrice, null, { min: 0 });
  const priorityFee = finite(request.feePriorityFee, null, { min: 0 });
  const maximumFee = finite(request.feeMaximumFee, null, { min: 0 });
  const sponsor = clean(request.feeSponsor);
  const paymaster = clean(request.feePaymaster);
  const sponsorshipId = clean(request.feeSponsorshipId);
  const sponsorshipExpiry = clean(request.feeSponsorshipExpiry);
  const sponsorshipScopes = unique(request.feeSponsorshipScopes).map(lower);
  const sponsorSignatureHash = lower(request.feeSponsorSignatureHash).replace(/^0x/, "");
  const expectedPayer = clean(request.feeExpectedPayer);
  const actualPayer = clean(request.feeActualPayer);
  const sponsored = request.feeSponsored === true || Boolean(sponsor || paymaster || sponsorshipId);
  const sponsorshipAvailable = request.feeSponsorshipAvailable !== false;
  const chainName = clean(request.feeChainName || request.chainName);
  const actionType = clean(request.actionType);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const historical = historicalUsage({ auditLogs, agentId: request.agentId, nowMs, lookbackSeconds: config.lookbackSeconds });
  const protectedEvidence = {
    chainFamily: family, chainName, networkFee, estimatedGas, gasLimit, gasPrice, priorityFee, maximumFee,
    sponsor, paymaster, sponsorshipId, sponsorshipExpiry, sponsorshipScopes: [...sponsorshipScopes].sort(),
    sponsorSignatureHash, expectedPayer, actualPayer, sponsored,
  };
  const protectedFingerprint = fingerprint(protectedEvidence);
  const sponsorApproved = !sponsor || config.approvedSponsors.some((item) => lower(item) === lower(sponsor));
  const paymasterApproved = !paymaster || config.approvedPaymasters.some((item) => lower(item) === lower(paymaster));
  const sponsorEvidenceVerified = Boolean(sponsorSignatureHash && SHA256.test(sponsorSignatureHash));

  if (!chainName) hardFail(state, "Chain binding", "Fee-safety metadata is missing the target chain name.", {}, "Bind fee and sponsorship evidence to the exact target chain before retrying.");
  else if (request.chainName && lower(chainName) !== lower(request.chainName)) hardFail(state, "Chain binding", "Fee-safety metadata is bound to a different chain than the requested action.", { actionChain: request.chainName, feeChain: chainName }, "Rebuild the fee evidence for the exact action network.");
  else add(state, "pass", "Chain binding", `Fee evidence is bound to ${chainName}.`, { chainName, family });

  if (family !== "EVM" && (paymaster || gasPrice !== null || priorityFee !== null)) {
    hardFail(state, "Chain-specific fee fields", "EVM-only Paymaster, gas-price, or priority-fee fields were supplied for a non-EVM flow.", { chainFamily: family, paymaster: Boolean(paymaster), gasPrice, priorityFee }, "Remove EVM-only fields or declare and bind the request to the correct EVM chain.");
  } else add(state, "pass", "Chain-specific fee fields", `Fee fields are compatible with the declared ${family} chain family.`, { chainFamily: family });

  const suppliedNumericPairs = [
    [request.feeNetworkFee, networkFee],
    [request.feeEstimatedGas, estimatedGas],
    [request.feeGasLimit, gasLimit],
    [request.feeGasPrice, gasPrice],
    [request.feePriorityFee, priorityFee],
    [request.feeMaximumFee, maximumFee],
  ];
  if (suppliedNumericPairs.some(([raw, normalized]) => raw !== null && raw !== undefined && raw !== "" && normalized === null)) {
    hardFail(state, "Numeric fee values", "One or more supplied fee values are malformed or negative.", {}, "Supply finite non-negative numeric fee values.");
  }

  if (estimatedGas !== null && gasLimit !== null && gasLimit < estimatedGas) {
    hardFail(state, "Gas limit", "The gas limit is lower than the trusted gas estimate.", { estimatedGas, gasLimit }, "Raise the gas limit to at least the estimate or refresh the estimate.");
  } else if (estimatedGas !== null && gasLimit !== null) add(state, "pass", "Gas limit", "The gas limit covers the supplied estimate.", { estimatedGas, gasLimit });

  if (priorityFee !== null && gasPrice !== null && priorityFee > gasPrice) {
    hardFail(state, "Priority fee consistency", "The priority fee exceeds the total gas price.", { priorityFee, gasPrice }, "Correct the EVM fee fields before signing.");
  }

  if (config.maximumNetworkFee !== null && (networkFee ?? maximumFee) !== null && (networkFee ?? maximumFee) > config.maximumNetworkFee) {
    policyViolation(state, config, null, "Maximum network fee", "The proposed network fee exceeds the configured maximum.", { received: networkFee ?? maximumFee, maximum: config.maximumNetworkFee }, "Reduce the fee or obtain an authorized policy change.", "high");
  } else if (config.maximumNetworkFee !== null && (networkFee ?? maximumFee) !== null) add(state, "pass", "Maximum network fee", "The network fee is within policy.", { received: networkFee ?? maximumFee, maximum: config.maximumNetworkFee });

  if (config.maximumGasPrice !== null && gasPrice !== null && gasPrice > config.maximumGasPrice) {
    policyViolation(state, config, null, "Maximum gas price", "The proposed gas price exceeds policy.", { received: gasPrice, maximum: config.maximumGasPrice }, "Refresh the quote or lower the gas price.", "high");
  } else if (config.maximumGasPrice !== null && gasPrice !== null) add(state, "pass", "Maximum gas price", "The gas price is within policy.", { received: gasPrice, maximum: config.maximumGasPrice });

  if (config.maximumPriorityFee !== null && priorityFee !== null && priorityFee > config.maximumPriorityFee) {
    policyViolation(state, config, null, "Maximum priority fee", "The proposed priority fee exceeds policy.", { received: priorityFee, maximum: config.maximumPriorityFee }, "Lower the priority fee before retrying.", "high");
  } else if (config.maximumPriorityFee !== null && priorityFee !== null) add(state, "pass", "Maximum priority fee", "The priority fee is within policy.", { received: priorityFee, maximum: config.maximumPriorityFee });

  if (sponsored) {
    if (!sponsorshipAvailable) unavailable(state, config, "Sponsorship availability", "The expected sponsorship service is unavailable.", { sponsor, paymaster, sponsorshipId }, "Restore the sponsor or Paymaster service or require the expected payer explicitly.");
    else add(state, "pass", "Sponsorship availability", "Sponsorship evidence reports the service as available.", { sponsor, paymaster, sponsorshipId });

    if (sponsor && config.approvedSponsors.length === 0) policyViolation(state, config, null, "Approved sponsor", "A sponsor was supplied but the policy has no approved sponsor allowlist.", { sponsor }, "Add the exact sponsor to policy or remove sponsorship.");
    else if (!sponsorApproved) policyViolation(state, config, null, "Approved sponsor", "The proposed sponsor is not approved by policy.", { sponsor, approvedSponsors: config.approvedSponsors }, "Use an approved sponsor.", "high");
    else if (sponsor) add(state, "pass", "Approved sponsor", "The sponsor is approved by policy.", { sponsor });

    if (paymaster && family !== "EVM") {
      // Already handled as a hard chain-specific violation.
    } else if (paymaster && config.approvedPaymasters.length === 0) policyViolation(state, config, null, "Approved Paymaster", "A Paymaster was supplied but the policy has no approved Paymaster allowlist.", { paymaster }, "Add the exact Paymaster to policy or remove it.");
    else if (!paymasterApproved) policyViolation(state, config, null, "Approved Paymaster", "The proposed Paymaster is not approved by policy.", { paymaster, approvedPaymasters: config.approvedPaymasters }, "Use an approved Paymaster.", "high");
    else if (paymaster) add(state, "pass", "Approved Paymaster", "The Paymaster is approved by policy.", { paymaster });

    if (config.requireSponsorshipExpiry && !sponsorshipExpiry) unavailable(state, config, "Sponsorship expiry", "The sponsorship has no expiry evidence.", { sponsorshipId }, "Use a bounded sponsorship with an explicit expiry.");
    else if (sponsorshipExpiry) {
      const expiryMs = Date.parse(sponsorshipExpiry);
      if (!Number.isFinite(expiryMs)) hardFail(state, "Sponsorship expiry", "The sponsorship expiry is malformed.", { sponsorshipExpiry }, "Supply a valid ISO-8601 expiry.");
      else if (expiryMs <= nowMs) hardFail(state, "Sponsorship expiry", "The sponsorship has expired.", { sponsorshipExpiry, now: new Date(nowMs).toISOString() }, "Request a new bounded sponsorship.");
      else add(state, "pass", "Sponsorship expiry", "The sponsorship is unexpired.", { sponsorshipExpiry });
    }

    if (config.requireSponsorEvidence && !sponsorSignatureHash) unavailable(state, config, "Sponsor evidence", "The policy requires a sponsor evidence hash, but none was supplied.", { sponsorshipId }, "Supply a verifiable sponsor or Paymaster evidence hash.");
    else if (sponsorSignatureHash && !SHA256.test(sponsorSignatureHash)) hardFail(state, "Sponsor evidence", "The sponsor evidence hash is malformed.", { sponsorSignatureHash }, "Supply a 32-byte SHA-256 evidence hash; do not submit the raw signature.");
    else if (sponsorSignatureHash) add(state, "pass", "Sponsor evidence", "A structurally valid sponsor evidence hash is present.", { sponsorSignatureHash });

    if (sponsorshipScopes.length > 0 && !sponsorshipScopes.includes(lower(actionType)) && !sponsorshipScopes.includes("all") && !sponsorshipScopes.includes("*")) {
      hardFail(state, "Sponsorship scope", "The requested action is outside the declared sponsorship scope.", { actionType, sponsorshipScopes }, "Issue a sponsorship bound to this exact action type.");
    } else if (sponsorshipScopes.length > 0) add(state, "pass", "Sponsorship scope", "The action is inside the declared sponsorship scope.", { actionType, sponsorshipScopes });

    if (expectedPayer && actualPayer && lower(expectedPayer) !== lower(actualPayer)) hardFail(state, "Expected payer", "The actual fee payer does not match the expected payer.", { expectedPayer, actualPayer }, "Rebuild the transaction with the exact authorized payer.");
    else if (expectedPayer && actualPayer) add(state, "pass", "Expected payer", "The actual fee payer matches the expected payer.", { expectedPayer, actualPayer });
    else if (expectedPayer && !actualPayer) unavailable(state, config, "Expected payer", "The expected payer was supplied but the actual payer evidence is unavailable.", { expectedPayer }, "Supply the constructed transaction payer identity before signing.");

    const currentFee = networkFee ?? maximumFee ?? 0;
    if (config.sponsoredBudget !== null && historical.sponsoredBudgetUsed + currentFee > config.sponsoredBudget) {
      policyViolation(state, config, null, "Sponsored budget", "This sponsored operation would exceed the configured rolling budget.", { used: historical.sponsoredBudgetUsed, proposed: currentFee, maximum: config.sponsoredBudget, lookbackSeconds: config.lookbackSeconds }, "Wait for the budget window to reset or obtain an authorized policy change.", "high");
    } else if (config.sponsoredBudget !== null) add(state, "pass", "Sponsored budget", "The sponsored operation remains within the rolling budget.", { used: historical.sponsoredBudgetUsed, proposed: currentFee, maximum: config.sponsoredBudget, lookbackSeconds: config.lookbackSeconds });

    if (config.maximumSponsoredOperations !== null && historical.sponsoredOperationsUsed + 1 > config.maximumSponsoredOperations) {
      policyViolation(state, config, null, "Sponsored operation count", "This operation would exceed the sponsored-operation limit.", { used: historical.sponsoredOperationsUsed, maximum: config.maximumSponsoredOperations, lookbackSeconds: config.lookbackSeconds }, "Wait for the rolling window to reset.", "high");
    } else if (config.maximumSponsoredOperations !== null) add(state, "pass", "Sponsored operation count", "The sponsored-operation count remains within policy.", { used: historical.sponsoredOperationsUsed, proposed: 1, maximum: config.maximumSponsoredOperations });

    if (historical.failedSponsoredOperations > config.maximumFailedSponsoredOperations) {
      policyViolation(state, config, null, "Failed sponsored operations", "Recent failed or uncertain sponsored operations exceed the configured threshold.", { failed: historical.failedSponsoredOperations, maximum: config.maximumFailedSponsoredOperations, lookbackSeconds: config.lookbackSeconds }, "Pause sponsorship and investigate repeated failures before retrying.", "high");
    } else add(state, "pass", "Failed sponsored operations", "Recent sponsored-operation failures are within policy.", { failed: historical.failedSponsoredOperations, maximum: config.maximumFailedSponsoredOperations });
  } else {
    add(state, "pass", "Expected payer", "The request does not claim sponsor or Paymaster use.", { expectedPayer, actualPayer });
    if (expectedPayer && actualPayer && lower(expectedPayer) !== lower(actualPayer)) hardFail(state, "Expected payer", "The transaction payer does not match the expected payer.", { expectedPayer, actualPayer }, "Rebuild the transaction with the exact authorized payer.");
  }

  const status = state.hardBlock ? "blocked" : state.needsReview ? "review" : state.violations.length > 0 ? "warning" : "passed";
  state.context = {
    metadataSupplied,
    status,
    chainFamily: family,
    chainName,
    feeUnit: clean(request.feeUnit),
    networkFee,
    estimatedGas,
    gasLimit,
    gasPrice,
    priorityFee,
    maximumFee,
    sponsored,
    sponsor,
    paymaster,
    sponsorshipId,
    sponsorshipExpiry,
    sponsorshipScopes,
    sponsorApproved,
    paymasterApproved,
    sponsorEvidenceVerified,
    expectedPayer,
    actualPayer,
    sponsorshipAvailable,
    rollingBudgetUsed: historical.sponsoredBudgetUsed,
    rollingSponsoredOperations: historical.sponsoredOperationsUsed,
    recentFailedSponsoredOperations: historical.failedSponsoredOperations,
    protectedFingerprint,
    violations: state.violations,
  };
  return state;
}

export function gasSponsorshipFeeSafetySettings(policy = {}) { return settings(policy); }

export function getGasSponsorshipFeeSafetyStatus() {
  return {
    status: "foundation_available",
    protectionArea: "Execution Integrity",
    metadataPath: "action.feeSafety",
    deterministicChecks: {
      feeBounds: true,
      sponsorAndPaymasterAllowlists: true,
      chainSpecificIsolation: true,
      expiryAndScope: true,
      payerBinding: true,
      rollingBudgetAndOperationLimits: true,
      repeatedFailureThreshold: true,
      exactFingerprinting: true,
    },
    liveCriteria: "Promote to Live only after deployed adapters supply real fee or sponsorship evidence and end-to-end Casper relayer or EVM Paymaster execution is verified.",
    securityBoundary: "Magen3 evaluates public unsigned fee and sponsorship evidence before signing. It never accepts raw sponsor signatures, Paymaster credentials, private keys, or signed transactions.",
  };
}
