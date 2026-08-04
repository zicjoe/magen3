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
const PROTECTED_PARAMETER_FIELDS = [
  "actionType",
  "amount",
  "asset",
  "outputAsset",
  "target",
  "targetType",
  "entryPoint",
  "chainName",
  "destination",
  "contract",
  "runtimeArgs",
];
const FIELD_LABELS = {
  actionType: "action type",
  amount: "amount",
  asset: "asset",
  outputAsset: "output asset",
  target: "target",
  targetType: "target type",
  entryPoint: "contract method",
  chainName: "network",
  destination: "destination",
  contract: "contract",
  runtimeArgs: "contract arguments",
  goalId: "goal ID",
  originalUserGoalHash: "original request hash",
  originalParameterHash: "original parameter hash",
  currentParameterHash: "current parameter hash",
  sourceDomains: "source domain",
  permissionScopes: "permission scope",
  externalContentUsed: "external-content flag",
};

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
  return lower(value).replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "");
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
function hasOwn(value, key) {
  return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));
}
function comparable(value) {
  return JSON.stringify(canonicalize(value));
}
function safeDisplay(value, field = "") {
  if (field === "runtimeArgs") return "different contract arguments";
  if (value === null || value === undefined || value === "") return "not provided";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = clean(value);
  if (text.length <= 30) return text;
  return `${text.slice(0, 12)}…${text.slice(-8)}`;
}
function fieldLabel(field) {
  return FIELD_LABELS[field] || field || "instruction data";
}
function diagnostic(code, options = {}) {
  const result = { code };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== "") result[key] = value;
  }
  return result;
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
  state.violations.push({ rule, message, code: evidence?.code || "" });
}
function policyViolation(state, config, action, rule, message, evidence, remediation, severity = "medium") {
  const effective = action || (config.mode === "Enforce" ? "Block" : config.mode === "Observe" ? "Warn" : "Review");
  if (effective === "Block") return hardFail(state, rule, message, evidence, remediation, severity === "medium" ? "high" : severity);
  add(state, "warning", rule, message, evidence, remediation, severity);
  state.scoreDelta += 12;
  state.violations.push({ rule, message, code: evidence?.code || "" });
  if (effective !== "Warn") state.needsReview = true;
}
function unavailable(state, config, rule, message, evidence, remediation) {
  if (config.mode === "Enforce") return hardFail(state, rule, message, evidence, remediation, "high");
  add(state, "unavailable", rule, message, evidence, remediation, "medium");
  state.scoreDelta += 12;
  state.violations.push({ rule, message, code: evidence?.code || "" });
  state.needsReview = config.mode !== "Observe";
}

export function buildInstructionProtectedParameters(request = {}) {
  return {
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
}

function normalizeOriginalProtectedParameters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const normalized = {};
  for (const field of PROTECTED_PARAMETER_FIELDS) {
    if (!hasOwn(value, field)) continue;
    if (field === "amount") normalized[field] = Number(value[field] || 0);
    else if (field === "runtimeArgs") normalized[field] = value[field] && typeof value[field] === "object" && !Array.isArray(value[field]) ? value[field] : null;
    else normalized[field] = clean(value[field]);
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function fingerprintProtectedParameters(parameters = {}) {
  const full = {
    actionType: "",
    amount: 0,
    asset: "",
    outputAsset: "",
    target: "",
    targetType: "",
    entryPoint: "",
    chainName: "",
    destination: "",
    contract: "",
    runtimeArgs: null,
    ...parameters,
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(full)), "utf8").digest("hex");
}

export function buildInstructionParameterFingerprint(request = {}) {
  return fingerprintProtectedParameters(buildInstructionProtectedParameters(request));
}

export function diffInstructionProtectedParameters(original = null, current = {}) {
  if (!original || typeof original !== "object") return [];
  const differences = [];
  for (const field of PROTECTED_PARAMETER_FIELDS) {
    if (!hasOwn(original, field)) continue;
    if (comparable(original[field]) === comparable(current[field])) continue;
    differences.push({
      field,
      label: fieldLabel(field),
      expected: original[field],
      received: current[field],
    });
  }
  return differences;
}

function parameterChangeMessage(differences = []) {
  if (differences.length === 1) {
    const difference = differences[0];
    if (difference.field === "runtimeArgs") return "The contract arguments changed after the original request was recorded.";
    return `The prepared ${difference.label} changed from ${safeDisplay(difference.expected, difference.field)} to ${safeDisplay(difference.received, difference.field)} after the original request was recorded.`;
  }
  if (differences.length > 1) {
    return `The prepared transaction changed after the original request was recorded. Changed details: ${differences.map((item) => item.label).join(", ")}.`;
  }
  return "The protected transaction details no longer match the original request, but the agent did not include the original parameter snapshot needed to identify the changed field.";
}

function firstMalformedIssue({ goalId, originalUserGoalHash, originalParameterHash, suppliedCurrentParameterHash, sourceDomains, originalPermissionScopes, currentPermissionScopes, externalContentUsed, intentSource, currentParameterHash }) {
  if (goalId && !GOAL_ID.test(goalId)) return {
    code: "INSTRUCTION_GOAL_ID_INVALID",
    field: "goalId",
    message: "The agent supplied an invalid goal ID, so Magen3 could not reliably link this transaction to the original request.",
    remediation: "Generate a stable goal ID using letters, numbers, dots, underscores, colons, or hyphens, then retry the same business goal.",
    received: goalId,
  };
  if (originalUserGoalHash && !SHA256.test(originalUserGoalHash)) return {
    code: "INSTRUCTION_GOAL_HASH_INVALID",
    field: "originalUserGoalHash",
    message: "The agent supplied an invalid original-request hash, so Magen3 could not verify which user instruction authorized this transaction.",
    remediation: "Generate originalUserGoalHash as a 64-character SHA-256 hex value from the unchanged original user request.",
    received: originalUserGoalHash,
  };
  if (originalParameterHash && !SHA256.test(originalParameterHash)) return {
    code: "INSTRUCTION_ORIGINAL_PARAMETER_HASH_INVALID",
    field: "originalParameterHash",
    message: "The agent supplied an invalid original-parameter hash, so Magen3 could not verify the original protected transaction details.",
    remediation: "Generate originalParameterHash with the Magen3 SDK helper from the original protected parameters.",
    received: originalParameterHash,
  };
  if (suppliedCurrentParameterHash && !SHA256.test(suppliedCurrentParameterHash)) return {
    code: "INSTRUCTION_CURRENT_PARAMETER_HASH_INVALID",
    field: "currentParameterHash",
    message: "The agent supplied an invalid current-parameter hash, so Magen3 could not verify the transaction prepared for execution.",
    remediation: "Generate currentParameterHash with the Magen3 SDK helper from the exact transaction being submitted.",
    received: suppliedCurrentParameterHash,
  };
  const invalidDomains = sourceDomains.filter((domain) => !DOMAIN.test(domain));
  if (invalidDomains.length > 0) return {
    code: "INSTRUCTION_SOURCE_DOMAIN_INVALID",
    field: "sourceDomains",
    message: `The agent supplied an invalid instruction source domain: ${invalidDomains[0]}.`,
    remediation: "Send normalized hostnames only, without paths, credentials, query strings, or malformed characters.",
    received: invalidDomains,
  };
  const invalidScopes = [...originalPermissionScopes, ...currentPermissionScopes].filter((scope) => !validScope(scope));
  if (invalidScopes.length > 0) return {
    code: "INSTRUCTION_PERMISSION_SCOPE_INVALID",
    field: "permissionScopes",
    message: `The agent supplied an invalid permission scope: ${invalidScopes[0]}.`,
    remediation: "Use stable scope labels containing only letters, numbers, dots, underscores, colons, slashes, or hyphens.",
    received: invalidScopes,
  };
  if (externalContentUsed === false && ["external-content", "webpage", "email", "document"].includes(lower(intentSource))) return {
    code: "INSTRUCTION_SOURCE_FLAG_CONTRADICTION",
    field: "externalContentUsed",
    message: `The agent identified the instruction source as ${intentSource} but also claimed that no external content was used.`,
    remediation: "Set externalContentUsed to true or correct intentSource so both fields describe the same origin.",
    expected: true,
    received: false,
  };
  if (suppliedCurrentParameterHash && suppliedCurrentParameterHash !== currentParameterHash) return {
    code: "INSTRUCTION_CURRENT_PARAMETER_HASH_MISMATCH",
    field: "currentParameterHash",
    message: "The agent calculated the transaction-verification hash differently from Magen3, so the exact prepared action could not be trusted.",
    remediation: "Generate currentParameterHash from the exact normalized action using the Magen3 SDK binding helper. Do not reuse a hash from an earlier transaction.",
    expected: currentParameterHash,
    received: suppliedCurrentParameterHash,
  };
  return null;
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
  const currentProtectedParameters = buildInstructionProtectedParameters(request);
  const currentParameterHash = fingerprintProtectedParameters(currentProtectedParameters);
  const originalProtectedParameters = normalizeOriginalProtectedParameters(request.instructionOriginalProtectedParameters);
  const originalProtectedParametersHash = originalProtectedParameters ? fingerprintProtectedParameters(originalProtectedParameters) : "";
  const originalPermissionScopes = uniqueStrings(request.instructionOriginalPermissionScopes);
  const currentPermissionScopes = uniqueStrings(request.instructionCurrentPermissionScopes);
  const addedPermissionScopes = currentPermissionScopes.filter((scope) => !originalPermissionScopes.includes(scope));

  if (!metadataSupplied) {
    if (requiresGoal) {
      unavailable(
        state,
        config,
        "Required instruction provenance",
        `The agent did not include the instruction-verification data required for ${actionType || "this action"}.`,
        diagnostic("INSTRUCTION_PROVENANCE_MISSING", { field: "instructionIntegrity", actionType }),
        "Include a stable goal ID, original request hash, source information, and protected-parameter binding before retrying.",
      );
    } else {
      add(state, "skipped", "Instruction Integrity applicability", "No provenance metadata was supplied and this action is not configured to require goal binding.");
    }
    state.context = { enabled: true, mode: config.mode, metadataSupplied: false, requiresGoal, currentParameterHash, currentProtectedParameters, sourceDomains: [] };
    return state;
  }

  const malformedIssue = firstMalformedIssue({
    goalId,
    originalUserGoalHash,
    originalParameterHash,
    suppliedCurrentParameterHash,
    sourceDomains,
    originalPermissionScopes,
    currentPermissionScopes,
    externalContentUsed,
    intentSource,
    currentParameterHash,
  });

  if (malformedIssue) {
    hardFail(
      state,
      "Valid instruction provenance",
      malformedIssue.message,
      diagnostic(malformedIssue.code, {
        field: malformedIssue.field,
        expected: malformedIssue.expected,
        received: malformedIssue.received,
        suppliedCurrentParameterHash,
        computedCurrentParameterHash: currentParameterHash,
      }),
      malformedIssue.remediation,
      "critical",
    );
  } else {
    add(state, "pass", "Valid instruction provenance", "Instruction provenance metadata is structurally consistent with the normalized request.", { goalId, intentSource, sourceDomains, computedCurrentParameterHash: currentParameterHash });
  }

  if (originalProtectedParameters && originalParameterHash && originalProtectedParametersHash !== originalParameterHash) {
    hardFail(
      state,
      "Original parameter snapshot integrity",
      "The original protected-parameter snapshot does not match the originalParameterHash supplied by the agent.",
      diagnostic("INSTRUCTION_ORIGINAL_SNAPSHOT_HASH_MISMATCH", {
        field: "originalProtectedParameters",
        expected: originalParameterHash,
        received: originalProtectedParametersHash,
      }),
      "Regenerate the original snapshot and originalParameterHash together from the same trusted action using the Magen3 SDK binding helper.",
      "critical",
    );
  }

  if (requiresGoal) {
    if (!goalId || !originalUserGoalHash) {
      const missingFields = [!goalId ? "goalId" : "", !originalUserGoalHash ? "originalUserGoalHash" : ""].filter(Boolean);
      const label = missingFields.map(fieldLabel).join(" and ");
      policyViolation(
        state,
        config,
        "",
        "Stable goal binding",
        `The agent did not include the ${label} required to link this ${actionType} to the original user request.`,
        diagnostic("INSTRUCTION_GOAL_BINDING_MISSING", { field: missingFields[0], missingFields, actionType, goalIdPresent: Boolean(goalId), goalHashPresent: Boolean(originalUserGoalHash) }),
        `Add the missing ${label} and preserve the same values for every retry of this business goal.`,
        "high",
      );
    } else {
      add(state, "pass", "Stable goal binding", `The ${actionType} request is bound to a stable originating goal.`, { goalId, originalUserGoalHash });
    }
  }

  const blockedDomain = sourceDomains.find((domain) => config.blockedSourceDomains.some((blocked) => sameOrSubdomain(domain, blocked)));
  if (blockedDomain) {
    hardFail(
      state,
      "Blocked instruction source",
      `The instruction was influenced by ${blockedDomain}, which is blocked by the active policy.`,
      diagnostic("INSTRUCTION_SOURCE_BLOCKED", { field: "sourceDomains", received: blockedDomain, blockedDomain, sourceDomains }),
      "Remove the blocked source from the execution path and reconstruct the intent from an approved origin.",
      "critical",
    );
  }

  if (config.allowedSourceDomains.length > 0 && sourceDomains.length > 0) {
    const unapprovedDomains = sourceDomains.filter((domain) => !config.allowedSourceDomains.some((allowed) => sameOrSubdomain(domain, allowed)));
    if (unapprovedDomains.length > 0) {
      policyViolation(
        state,
        config,
        config.externalContentHighRiskAction,
        "Approved instruction sources",
        `The instruction was influenced by ${unapprovedDomains[0]}, which is not approved by the active policy.`,
        diagnostic("INSTRUCTION_SOURCE_NOT_APPROVED", { field: "sourceDomains", received: unapprovedDomains, expected: config.allowedSourceDomains, unapprovedDomains, allowedSourceDomains: config.allowedSourceDomains }),
        "Use an approved source domain or obtain authorized review before execution.",
        "high",
      );
    } else {
      add(state, "pass", "Approved instruction sources", "All supplied source domains are approved by policy.", { sourceDomains });
    }
  }

  const parametersChanged = Boolean(originalParameterHash && originalParameterHash !== currentParameterHash);
  const parameterDifferences = parametersChanged ? diffInstructionProtectedParameters(originalProtectedParameters, currentProtectedParameters) : [];
  const mismatchFields = parameterDifferences.map((item) => item.field);
  const primaryDifference = parameterDifferences[0] || null;
  if (parametersChanged) {
    const message = parameterChangeMessage(parameterDifferences);
    const evidence = diagnostic("INSTRUCTION_PROTECTED_PARAMETER_MISMATCH", {
      field: primaryDifference?.field || "protectedParameters",
      expected: primaryDifference?.expected,
      received: primaryDifference?.received,
      mismatchFields,
      differences: parameterDifferences,
      originalParameterHash,
      currentParameterHash,
      originalSnapshotSupplied: Boolean(originalProtectedParameters),
    });
    if (!config.allowParameterChangesAfterGoal) {
      policyViolation(
        state,
        config,
        "",
        "Protected parameter binding",
        message,
        evidence,
        parameterDifferences.length > 0
          ? `Restore the original ${parameterDifferences.map((item) => item.label).join(", ")} or create a new user-confirmed goal binding for the changed transaction.`
          : "Send originalProtectedParameters so Magen3 can identify the changed field, then restore the original transaction or create a new user-confirmed goal binding.",
        "high",
      );
    } else {
      add(state, "warning", "Protected parameter binding", `${message} The active policy permits controlled changes.`, evidence, "Verify the change reason and user confirmation before signing.", "medium");
      state.scoreDelta += 8;
      if (config.requireParameterChangeReason && !parameterChangeReason) {
        policyViolation(
          state,
          config,
          "",
          "Parameter change reason",
          `The ${primaryDifference?.label || "protected transaction details"} changed without a recorded reason.`,
          diagnostic("INSTRUCTION_PARAMETER_CHANGE_REASON_MISSING", { field: "parameterChangeReason", mismatchFields, differences: parameterDifferences, originalParameterHash, currentParameterHash }),
          "Supply a clear parameter-change reason from the trusted adapter.",
          "high",
        );
      } else if (parameterChangeReason) {
        add(state, "pass", "Parameter change reason", "The protected parameter change includes an explicit reason.", { parameterChangeReason });
      }
    }
  } else if (originalParameterHash) {
    add(state, "pass", "Protected parameter binding", "The current protected parameters match the original goal-bound fingerprint.", { parameterHash: currentParameterHash });
  }

  if (externalContentUsed && parametersChanged && config.requireUserConfirmationForExternalContent && !userConfirmed) {
    policyViolation(
      state,
      config,
      config.externalContentHighRiskAction,
      "External-content confirmation",
      parameterDifferences.length > 0
        ? `External content changed the ${parameterDifferences.map((item) => item.label).join(", ")} without explicit user confirmation.`
        : "External content changed protected transaction details without explicit user confirmation.",
      diagnostic("INSTRUCTION_EXTERNAL_CHANGE_UNCONFIRMED", { field: primaryDifference?.field || "userConfirmed", mismatchFields, differences: parameterDifferences, sourceDomains, userConfirmed }),
      "Ask the user to confirm the exact changed amount, destination, asset, contract, network, or action before retrying.",
      "critical",
    );
  } else if (externalContentUsed && config.requireUserConfirmationForExternalContent && userConfirmed) {
    add(state, "pass", "External-content confirmation", "The user explicitly confirmed the external-content-derived execution context.", { sourceDomains, userConfirmed });
  }

  const merchantDomain = canonicalDomain(request.x402MerchantDomain || hostFromUrl(request.x402ResourceUrl));
  const selfAuthorizingPayment = externalContentUsed && actionType === "x402 Payment" && merchantDomain && sourceDomains.some((domain) => sameOrSubdomain(domain, merchantDomain));
  if (selfAuthorizingPayment && !userConfirmed) {
    hardFail(
      state,
      "External resource self-authorization",
      `The external resource at ${merchantDomain} attempted to authorize a payment to its own merchant domain without independent user confirmation.`,
      diagnostic("INSTRUCTION_EXTERNAL_RESOURCE_SELF_AUTHORIZATION", { field: "userConfirmed", expected: true, received: false, sourceDomains, merchantDomain, resourceUrl: clean(request.x402ResourceUrl) }),
      "Obtain independent user confirmation or reconstruct the payment request from a trusted initiating context.",
      "critical",
    );
  }

  if (addedPermissionScopes.length > 0 && ["tool", "tool-output", "mcp"].includes(lower(initiatedBy) || lower(intentSource))) {
    hardFail(
      state,
      "Tool permission-scope containment",
      `A tool attempted to add permissions that were not present in the original request: ${addedPermissionScopes.join(", ")}.`,
      diagnostic("INSTRUCTION_TOOL_SCOPE_EXPANSION", { field: "currentPermissionScopes", expected: originalPermissionScopes, received: currentPermissionScopes, addedPermissionScopes, toolName, toolServer }),
      "Re-authorize the expanded scope outside the tool output and bind it to a new trusted user goal.",
      "critical",
    );
  } else if (originalPermissionScopes.length > 0 || currentPermissionScopes.length > 0) {
    add(state, "pass", "Tool permission-scope containment", "Tool permission scope did not expand beyond the originally approved scope.", { originalPermissionScopes, currentPermissionScopes, toolName, toolServer });
  }

  const untrusted = ["untrusted", "unknown", "external"].includes(sourceTrustLevel);
  const highRiskExternalAction = externalContentUsed && untrusted && ["DAO Treasury Payment", "x402 Payment", "Transfer", "Bridge"].includes(actionType);
  if (highRiskExternalAction) {
    policyViolation(
      state,
      config,
      config.externalContentHighRiskAction,
      "Untrusted-content high-risk execution",
      `This ${actionType} was derived from external content whose trust level is ${sourceTrustLevel}.`,
      diagnostic("INSTRUCTION_UNTRUSTED_EXTERNAL_ACTION", { field: "sourceTrustLevel", received: sourceTrustLevel, actionType, sourceDomains, userConfirmed }),
      "Route the exact intent through authorized review or reconstruct it from a trusted source.",
      "high",
    );
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
    originalProtectedParameters,
    currentProtectedParameters,
    originalProtectedParametersHash,
    parametersChanged,
    parameterDifferences,
    mismatchFields,
    originalPermissionScopes,
    currentPermissionScopes,
    addedPermissionScopes,
    selfAuthorizingPayment,
    violations: state.violations,
    limitation: "Instruction Integrity verifies supplied provenance and deterministic parameter bindings. It does not claim to detect every prompt-injection or semantic-manipulation attack.",
  };
  return state;
}
