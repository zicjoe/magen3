import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/i;
const GOAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const DEFAULT_SENSITIVE_ACTIONS = [
  "Transfer",
  "Swap",
  "Stake",
  "Bridge",
  "x402 Payment",
  "DAO Treasury Payment",
  "Contract Interaction",
  "Deposit to Vault",
  "RWA Proof Update",
  "Oracle Data Update",
];

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function uniqueStrings(value) { return [...new Set(array(value).map(clean).filter(Boolean))]; }
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
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}
function canonicalDomain(value) {
  const raw = lower(value).replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "");
  return raw;
}
function hostFromUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    return canonicalDomain(new URL(raw.includes("://") ? raw : `https://${raw}`).hostname);
  } catch {
    return canonicalDomain(raw);
  }
}
function sameOrSubdomain(left, right) {
  const a = canonicalDomain(left);
  const b = canonicalDomain(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}
function bool(value) {
  return value === true || lower(value) === "true";
}
function validScope(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value);
}

function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.instructionIntegrityEnabled === true,
    mode: normalizeMode(rules.instructionIntegrityMode),
    requireGoalBindingForActions: uniqueStrings(rules.requireGoalBindingForActions).length > 0
      ? uniqueStrings(rules.requireGoalBindingForActions)
      : DEFAULT_SENSITIVE_ACTIONS,
    requireUserConfirmationForExternalContent: rules.requireUserConfirmationForExternalContent !== false,
    allowedSourceDomains: uniqueStrings(rules.allowedSourceDomains).map(canonicalDomain).filter(Boolean),
    blockedSourceDomains: uniqueStrings(rules.blockedSourceDomains).map(canonicalDomain).filter(Boolean),
    externalContentHighRiskAction: normalizeAction(rules.externalContentHighRiskAction, "Review"),
    allowParameterChangesAfterGoal: rules.allowParameterChangesAfterGoal === true,
    requireParameterChangeReason: rules.requireParameterChangeReason !== false,
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Agent Instruction Integrity", status, severity, rule, message, evidence, remediation };
}
function add(state, status, rule, message, evidence = {}, remediation = "", severity = "info") {
  state.findings.push(finding({ status, severity, rule, message, evidence, remediation }));
  if (status === "pass") state.checksPassed.push(message);
  if (["fail", "warning", "unavailable"].includes(status)) state.checksFailed.push(message);
}
function hardFail(state, rule, message, evidence, remediation, severity = "high") {
  add(state, "fail", rule, message, evidence, remediation, severity);
  state.scoreDelta += severity === "critical" ? 35 : 24;
  state.hardBlock = true;
  state.violations.push({ rule, message });
}
function policyViolation(state, config, action, rule, message, evidence, remediation, severity = "medium") {
  const effective = action || (config.mode === "Enforce" ? "Block" : config.mode === "Observe" ? "Warn" : "Review");
  if (effective === "Block") return hardFail(state, rule, message, evidence, remediation, severity === "medium" ? "high" : severity);
  add(state, "warning", rule, message, evidence, remediation, severity);
  state.scoreDelta += 12;
  state.violations.push({ rule, message });
  if (effective !== "Warn") state.needsReview = true;
}
function unavailable(state, config, rule, message, evidence, remediation) {
  if (config.mode === "Enforce") return hardFail(state, rule, message, evidence, remediation, "high");
  add(state, "unavailable", rule, message, evidence, remediation, "medium");
  state.scoreDelta += 12;
  state.violations.push({ rule, message });
  state.needsReview = config.mode !== "Observe";
}

export function buildInstructionParameterFingerprint(request = {}) {
  const payload = {
    actionType: clean(request.actionType),
    amount: Number(request.amount || 0),
    asset: clean(request.asset),
    outputAsset: clean(request.outputAsset),
    target: clean(request.target),
    targetType: clean(request.targetType),
    entryPoint: clean(request.entryPoint),
    chainName: clean(request.chainName || request.tokenPermissionNetwork || request.bridgeDestinationChain || request.x402Network),
    destination: clean(request.bridgeDestinationAddress || request.x402PayTo || request.tokenPermissionSpender || request.target),
    contract: clean(request.contractUpgradeContract || request.privilegedActionContract || request.tokenPermissionTokenContract || request.target),
    runtimeArgs: request.runtimeArgs && typeof request.runtimeArgs === "object" ? request.runtimeArgs : null,
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(payload)), "utf8").digest("hex");
}

export function evaluateInstructionIntegrity({ request = {}, policy = {} } = {}) {
  const config = settings(policy);
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, violations: [], context: null };
  const metadataSupplied = request.instructionIntegrityMetadataSupplied === true;

  if (!config.enabled) {
    add(state, "skipped", "Instruction Integrity configuration", "Instruction Integrity is disabled for the active policy.");
    return state;
  }

  const actionType = clean(request.actionType);
  const requiresGoal = config.requireGoalBindingForActions.includes(actionType);
  const goalId = clean(request.instructionGoalId);
  const originalUserGoalHash = lower(request.instructionOriginalUserGoalHash);
  const initiatedBy = clean(request.instructionInitiatedBy);
  const intentSource = clean(request.instructionIntentSource);
  const toolName = clean(request.instructionToolName);
  const toolServer = clean(request.instructionToolServer);
  const sourceDomains = uniqueStrings(request.instructionSourceDomains).map(canonicalDomain).filter(Boolean);
  const externalContentUsed = bool(request.instructionExternalContentUsed);
  const userConfirmed = bool(request.instructionUserConfirmed);
  const sourceTrustLevel = lower(request.instructionSourceTrustLevel) || "unknown";
  const parameterChangeReason = clean(request.instructionParameterChangeReason);
  const originalParameterHash = lower(request.instructionOriginalParameterHash);
  const suppliedCurrentParameterHash = lower(request.instructionCurrentParameterHash);
  const currentParameterHash = buildInstructionParameterFingerprint(request);
  const originalPermissionScopes = uniqueStrings(request.instructionOriginalPermissionScopes);
  const currentPermissionScopes = uniqueStrings(request.instructionCurrentPermissionScopes);
  const addedPermissionScopes = currentPermissionScopes.filter((scope) => !originalPermissionScopes.includes(scope));
  const malformed = [];

  if (!metadataSupplied) {
    if (requiresGoal) {
      unavailable(state, config, "Required instruction provenance", `Instruction provenance is required for ${actionType || "this action"}, but no provenance metadata was supplied.`, { actionType }, "Submit a stable goal ID, the original user-goal hash, source provenance, and protected-parameter hashes before retrying.");
    } else {
      add(state, "skipped", "Instruction Integrity applicability", "No provenance metadata was supplied and this action is not configured to require goal binding.");
    }
    state.context = { enabled: true, mode: config.mode, metadataSupplied: false, requiresGoal, currentParameterHash, sourceDomains: [] };
    return state;
  }

  if (goalId && !GOAL_ID.test(goalId)) malformed.push("goalId");
  if (originalUserGoalHash && !SHA256.test(originalUserGoalHash)) malformed.push("originalUserGoalHash");
  if (originalParameterHash && !SHA256.test(originalParameterHash)) malformed.push("originalParameterHash");
  if (suppliedCurrentParameterHash && !SHA256.test(suppliedCurrentParameterHash)) malformed.push("currentParameterHash");
  if (sourceDomains.some((domain) => !DOMAIN.test(domain))) malformed.push("sourceDomains");
  if ([...originalPermissionScopes, ...currentPermissionScopes].some((scope) => !validScope(scope))) malformed.push("permissionScopes");
  if (externalContentUsed === false && ["external-content", "webpage", "email", "document"].includes(lower(intentSource))) malformed.push("externalContentUsed/intentSource contradiction");
  if (suppliedCurrentParameterHash && suppliedCurrentParameterHash !== currentParameterHash) malformed.push("currentParameterHash mismatch");

  if (malformed.length > 0) {
    hardFail(state, "Valid instruction provenance", "Instruction provenance is malformed or contradicts the normalized execution intent.", { malformedFields: malformed, suppliedCurrentParameterHash, computedCurrentParameterHash: currentParameterHash }, "Regenerate provenance from the trusted agent adapter and bind it to the exact normalized execution parameters.", "critical");
  } else {
    add(state, "pass", "Valid instruction provenance", "Instruction provenance metadata is structurally consistent with the normalized request.", { goalId, intentSource, sourceDomains, computedCurrentParameterHash: currentParameterHash });
  }

  if (requiresGoal) {
    if (!goalId || !originalUserGoalHash) {
      policyViolation(state, config, "", "Stable goal binding", `A stable goal ID and original user-goal hash are required for ${actionType}.`, { actionType, goalIdPresent: Boolean(goalId), goalHashPresent: Boolean(originalUserGoalHash) }, "Bind the request to the originating user goal before retrying.", "high");
    } else {
      add(state, "pass", "Stable goal binding", `The ${actionType} request is bound to a stable originating goal.`, { goalId, originalUserGoalHash });
    }
  }

  const blockedDomain = sourceDomains.find((domain) => config.blockedSourceDomains.some((blocked) => sameOrSubdomain(domain, blocked)));
  if (blockedDomain) {
    hardFail(state, "Blocked instruction source", `Instruction provenance includes blocked source domain ${blockedDomain}.`, { blockedDomain, sourceDomains }, "Remove the blocked source from the execution path and reconstruct the intent from an approved origin.", "critical");
  }

  if (config.allowedSourceDomains.length > 0 && sourceDomains.length > 0) {
    const unapprovedDomains = sourceDomains.filter((domain) => !config.allowedSourceDomains.some((allowed) => sameOrSubdomain(domain, allowed)));
    if (unapprovedDomains.length > 0) {
      policyViolation(state, config, config.externalContentHighRiskAction, "Approved instruction sources", "One or more instruction sources are not on the policy allowlist.", { unapprovedDomains, allowedSourceDomains: config.allowedSourceDomains }, "Use an approved source domain or obtain authorized review before execution.", "high");
    } else {
      add(state, "pass", "Approved instruction sources", "All supplied source domains are approved by policy.", { sourceDomains });
    }
  }

  const parametersChanged = Boolean(originalParameterHash && originalParameterHash !== currentParameterHash);
  if (parametersChanged) {
    if (!config.allowParameterChangesAfterGoal) {
      policyViolation(state, config, "", "Protected parameter binding", "Protected execution parameters changed after the original goal was recorded.", { originalParameterHash, currentParameterHash }, "Reconstruct the exact original intent or create a new user-confirmed goal binding for the changed parameters.", "high");
    } else {
      add(state, "warning", "Protected parameter binding", "Protected execution parameters changed after the original goal and policy permits controlled changes.", { originalParameterHash, currentParameterHash }, "Verify the reason and user confirmation before signing.", "medium");
      state.scoreDelta += 8;
      if (config.requireParameterChangeReason && !parameterChangeReason) {
        policyViolation(state, config, "", "Parameter change reason", "A protected parameter changed without a recorded reason.", { originalParameterHash, currentParameterHash }, "Supply a clear parameter-change reason from the trusted adapter.", "high");
      } else if (parameterChangeReason) {
        add(state, "pass", "Parameter change reason", "The protected parameter change includes an explicit reason.", { parameterChangeReason });
      }
    }
  } else if (originalParameterHash) {
    add(state, "pass", "Protected parameter binding", "The current protected parameters match the original goal-bound fingerprint.", { parameterHash: currentParameterHash });
  }

  if (externalContentUsed && parametersChanged && config.requireUserConfirmationForExternalContent && !userConfirmed) {
    policyViolation(state, config, config.externalContentHighRiskAction, "External-content confirmation", "External content changed protected execution parameters without explicit user confirmation.", { sourceDomains, originalParameterHash, currentParameterHash, userConfirmed }, "Require explicit confirmation of the changed amount, destination, asset, contract, network, and action before retrying.", "critical");
  } else if (externalContentUsed && config.requireUserConfirmationForExternalContent && userConfirmed) {
    add(state, "pass", "External-content confirmation", "The user explicitly confirmed the external-content-derived execution context.", { sourceDomains, userConfirmed });
  }

  const merchantDomain = canonicalDomain(request.x402MerchantDomain || hostFromUrl(request.x402ResourceUrl));
  const selfAuthorizingPayment = externalContentUsed && actionType === "x402 Payment" && merchantDomain && sourceDomains.some((domain) => sameOrSubdomain(domain, merchantDomain));
  if (selfAuthorizingPayment && !userConfirmed) {
    hardFail(state, "External resource self-authorization", "An external resource attempted to authorize payment to its own merchant domain without independent user confirmation.", { sourceDomains, merchantDomain, resourceUrl: clean(request.x402ResourceUrl) }, "Obtain independent user confirmation or reconstruct the payment request from a trusted initiating context.", "critical");
  }

  if (addedPermissionScopes.length > 0 && ["tool", "tool-output", "mcp"].includes(lower(initiatedBy) || lower(intentSource))) {
    hardFail(state, "Tool permission-scope containment", "Tool-derived output attempted to expand its own permission scope.", { originalPermissionScopes, currentPermissionScopes, addedPermissionScopes, toolName, toolServer }, "Re-authorize the expanded scope outside the tool output and bind it to a new trusted user goal.", "critical");
  } else if (originalPermissionScopes.length > 0 || currentPermissionScopes.length > 0) {
    add(state, "pass", "Tool permission-scope containment", "Tool permission scope did not expand beyond the originally approved scope.", { originalPermissionScopes, currentPermissionScopes, toolName, toolServer });
  }

  const untrusted = ["untrusted", "unknown", "external"].includes(sourceTrustLevel);
  const highRiskExternalAction = externalContentUsed && untrusted && ["DAO Treasury Payment", "x402 Payment", "Transfer", "Bridge"].includes(actionType);
  if (highRiskExternalAction) {
    policyViolation(state, config, config.externalContentHighRiskAction, "Untrusted-content high-risk execution", `${actionType} was derived from untrusted or unknown external content.`, { actionType, sourceTrustLevel, sourceDomains, userConfirmed }, "Route the exact intent through authorized review or reconstruct it from a trusted source.", "high");
  }

  if (!externalContentUsed && sourceTrustLevel === "trusted") {
    add(state, "pass", "Trusted instruction source", "The request is marked as originating from a trusted non-external source.", { initiatedBy, intentSource, sourceTrustLevel });
  }

  state.context = {
    enabled: true,
    mode: config.mode,
    metadataSupplied: true,
    requiresGoal,
    goalId,
    originalUserGoalHash,
    initiatedBy,
    intentSource,
    toolName,
    toolServer,
    sourceDomains,
    externalContentUsed,
    userConfirmed,
    sourceTrustLevel,
    parameterChangeReason,
    originalParameterHash,
    suppliedCurrentParameterHash,
    currentParameterHash,
    parametersChanged,
    originalPermissionScopes,
    currentPermissionScopes,
    addedPermissionScopes,
    selfAuthorizingPayment,
    violations: state.violations,
    limitation: "Instruction Integrity verifies supplied provenance and deterministic parameter bindings. It does not claim to detect every prompt-injection or semantic-manipulation attack.",
  };
  return state;
}
