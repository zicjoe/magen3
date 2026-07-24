import { createHash } from "node:crypto";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const CASPER_PUBLIC_KEY = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const CASPER_ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;
const CASPER_CONTRACT = /^(?:contract-hash-|contract-|contract-package-hash-|contract-package-|package-|hash-)?[0-9a-f]{64}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const ROLE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,127}$/;

export const PRIVILEGED_ACTIONS = new Set([
  "Ownership Transfer",
  "Administrator Change",
  "Proxy Upgrade",
  "Implementation Change",
  "Role Grant",
  "Role Revoke",
  "Mint",
  "Burn",
  "Pause",
  "Unpause",
  "Freeze",
  "Emergency Withdrawal",
  "Treasury Withdrawal",
  "Oracle Replacement",
  "Fee Recipient Change",
  "Bridge Validator Change",
  "Permission Change",
]);

const ADMIN_RECIPIENT_ACTIONS = new Set([
  "Ownership Transfer",
  "Administrator Change",
  "Role Grant",
  "Role Revoke",
  "Oracle Replacement",
  "Fee Recipient Change",
  "Bridge Validator Change",
  "Permission Change",
]);

const IMPLEMENTATION_ACTIONS = new Set(["Proxy Upgrade", "Implementation Change"]);
const AMOUNT_ACTIONS = new Set(["Mint", "Burn", "Emergency Withdrawal", "Treasury Withdrawal"]);
const RECIPIENT_REQUIRED_ACTIONS = new Set([
  ...ADMIN_RECIPIENT_ACTIONS,
  "Mint",
  "Freeze",
  "Emergency Withdrawal",
  "Treasury Withdrawal",
]);
const ROLE_REQUIRED_ACTIONS = new Set(["Role Grant", "Role Revoke", "Permission Change"]);

const ACTION_ALIASES = new Map([
  ["ownershiptransfer", "Ownership Transfer"],
  ["transferownership", "Ownership Transfer"],
  ["changeowner", "Ownership Transfer"],
  ["setowner", "Ownership Transfer"],
  ["administratorchange", "Administrator Change"],
  ["changeadministrator", "Administrator Change"],
  ["changeadmin", "Administrator Change"],
  ["setadministrator", "Administrator Change"],
  ["setadmin", "Administrator Change"],
  ["proxyupgrade", "Proxy Upgrade"],
  ["upgradeproxy", "Proxy Upgrade"],
  ["upgradeto", "Proxy Upgrade"],
  ["upgradeandcall", "Proxy Upgrade"],
  ["upgrade", "Proxy Upgrade"],
  ["implementationchange", "Implementation Change"],
  ["changeimplementation", "Implementation Change"],
  ["setimplementation", "Implementation Change"],
  ["rolegrant", "Role Grant"],
  ["grantrole", "Role Grant"],
  ["addrole", "Role Grant"],
  ["rolerevoke", "Role Revoke"],
  ["revokerole", "Role Revoke"],
  ["removerole", "Role Revoke"],
  ["mint", "Mint"],
  ["mintto", "Mint"],
  ["burn", "Burn"],
  ["burnfrom", "Burn"],
  ["pause", "Pause"],
  ["unpause", "Unpause"],
  ["freeze", "Freeze"],
  ["freezeaccount", "Freeze"],
  ["emergencywithdrawal", "Emergency Withdrawal"],
  ["emergencywithdraw", "Emergency Withdrawal"],
  ["emergencyexit", "Emergency Withdrawal"],
  ["treasurywithdrawal", "Treasury Withdrawal"],
  ["treasurywithdraw", "Treasury Withdrawal"],
  ["withdrawtreasury", "Treasury Withdrawal"],
  ["oraclereplacement", "Oracle Replacement"],
  ["replaceoracle", "Oracle Replacement"],
  ["setoracle", "Oracle Replacement"],
  ["updateoracle", "Oracle Replacement"],
  ["feerecipientchange", "Fee Recipient Change"],
  ["changefeerecipient", "Fee Recipient Change"],
  ["setfeerecipient", "Fee Recipient Change"],
  ["bridgevalidatorchange", "Bridge Validator Change"],
  ["setbridgevalidator", "Bridge Validator Change"],
  ["addbridgevalidator", "Bridge Validator Change"],
  ["removebridgevalidator", "Bridge Validator Change"],
  ["changebridgevalidator", "Bridge Validator Change"],
  ["permissionchange", "Permission Change"],
  ["changepermission", "Permission Change"],
  ["setpermission", "Permission Change"],
  ["grantpermission", "Permission Change"],
  ["revokepermission", "Permission Change"],
]);

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "yes", "1"].includes(value.toLowerCase())) return true;
    if (["false", "no", "0"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function finiteNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMode(value) {
  const normalized = lower(value);
  if (normalized === "observe") return "Observe";
  if (normalized === "enforce" || normalized === "block") return "Enforce";
  return "Review";
}

function normalizePolicyAction(value, fallback = "Review") {
  const normalized = lower(value);
  if (["warn", "observe", "allow"].includes(normalized)) return "Warn";
  if (["block", "enforce"].includes(normalized)) return "Block";
  if (normalized === "review") return "Review";
  return fallback;
}

function compactMethod(value) {
  const base = clean(value).split("(")[0];
  return base.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizePrivilegedAction(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (PRIVILEGED_ACTIONS.has(raw)) return raw;
  return ACTION_ALIASES.get(compactMethod(raw)) || raw;
}

export function classifyPrivilegedMethod({ entryPoint = "", methodSignature = "" } = {}) {
  const entryPointAction = ACTION_ALIASES.get(compactMethod(entryPoint)) || "";
  const signatureAction = ACTION_ALIASES.get(compactMethod(methodSignature)) || "";
  if (entryPointAction && signatureAction && entryPointAction !== signatureAction) {
    return {
      classifiedAction: "",
      contradictory: true,
      entryPointAction,
      signatureAction,
      source: "magen3-supported-method-map",
      version: "1.0.0",
    };
  }
  return {
    classifiedAction: entryPointAction || signatureAction,
    contradictory: false,
    entryPointAction,
    signatureAction,
    source: "magen3-supported-method-map",
    version: "1.0.0",
  };
}

function canonicalIdentity(value) {
  return lower(value)
    .replace(/^contract-hash-/, "contract-")
    .replace(/^contract-package-hash-/, "contract-package-");
}

function validIdentity(value) {
  const input = clean(value);
  return EVM_ADDRESS.test(input) || CASPER_PUBLIC_KEY.test(input) || CASPER_ACCOUNT_HASH.test(input) || CASPER_CONTRACT.test(input);
}

function validImplementation(value) {
  return validIdentity(value) || REFERENCE.test(clean(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function normalizeMetadataValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(normalizeMetadataValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, child]) => [clean(key).slice(0, 80), normalizeMetadataValue(child)]));
  }
  return clean(value);
}

export function buildPrivilegedActionFingerprint(input = {}) {
  const payload = {
    classifiedAction: normalizePrivilegedAction(input.classifiedAction),
    contract: canonicalIdentity(input.contract),
    package: canonicalIdentity(input.package),
    entryPoint: clean(input.entryPoint),
    methodSignature: clean(input.methodSignature),
    currentValue: normalizeMetadataValue(input.currentValue),
    requestedValue: normalizeMetadataValue(input.requestedValue),
    role: clean(input.role),
    recipient: canonicalIdentity(input.recipient),
    implementation: canonicalIdentity(input.implementation),
    network: lower(input.network),
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(payload)), "utf8").digest("hex");
}

function normalizedList(value, mapper = (item) => item) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => mapper(item)).filter(Boolean))];
}

function normalizeQuorumRules(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [rawAction, rawCount]) => {
    const action = normalizePrivilegedAction(rawAction);
    const count = Number(rawCount);
    if (PRIVILEGED_ACTIONS.has(action) && Number.isInteger(count) && count >= 1 && count <= 10) acc[action] = count;
    return acc;
  }, {});
}

function policySettings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.privilegedActionControlsEnabled === true,
    mode: normalizeMode(rules.privilegedActionMode),
    actionsRequiringReview: normalizedList(rules.privilegedActionsRequiringReview, normalizePrivilegedAction),
    blockedActions: normalizedList(rules.privilegedActionsBlocked, normalizePrivilegedAction),
    approvedAdministrators: normalizedList(rules.approvedAdministrators, canonicalIdentity),
    approvedImplementations: normalizedList(rules.approvedImplementations, canonicalIdentity),
    quorumRules: normalizeQuorumRules(rules.privilegedActionQuorumRules),
    unknownAction: normalizePolicyAction(rules.unknownPrivilegedAction, "Review"),
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Privileged Action Controls", status, severity, rule, message, evidence, remediation };
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "pass", rule, message, evidence }));
  state.checksPassed.push(message);
}

function skipped(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "skipped", rule, message, evidence }));
}

function fail(state, rule, message, evidence, remediation, { hard = true, severity = "critical", score = 30 } = {}) {
  state.findings.push(finding({ status: "fail", severity, rule, message, evidence, remediation }));
  state.checksFailed.push(message);
  state.scoreDelta += score;
  if (hard) state.hardBlock = true;
}

function warn(state, rule, message, evidence, remediation, { review = false, severity = "medium", score = 12 } = {}) {
  state.findings.push(finding({ status: "warning", severity, rule, message, evidence, remediation }));
  state.checksFailed.push(message);
  state.scoreDelta += score;
  if (review) state.needsReview = true;
}

function applyPolicyAction(state, config, action, details, { hard = false } = {}) {
  const shouldBlock = hard || action === "Block" || config.mode === "Enforce";
  const shouldReview = !shouldBlock && action !== "Warn" && config.mode !== "Observe";
  if (shouldBlock) {
    fail(state, details.rule, details.message, details.evidence, details.remediation, { hard: true, severity: details.severity || "high", score: details.score || 24 });
  } else {
    warn(state, details.rule, details.message, details.evidence, details.remediation, { review: shouldReview, severity: details.severity || "medium", score: details.score || 10 });
  }
}

function requestContext(request = {}) {
  const methodClassification = classifyPrivilegedMethod({
    entryPoint: request.privilegedActionEntryPoint || request.entryPoint,
    methodSignature: request.privilegedActionMethodSignature,
  });
  const declaredAction = normalizePrivilegedAction(request.privilegedActionClassifiedAction);
  const classifiedAction = PRIVILEGED_ACTIONS.has(declaredAction) ? declaredAction : methodClassification.classifiedAction;
  const metadataSupplied = Boolean(request.privilegedActionMetadataSupplied);
  const targetContract = clean(request.privilegedActionContract || request.target || request.contractHash);
  const packageIdentifier = clean(request.privilegedActionPackage || request.contractPackageHash);
  const currentValue = normalizeMetadataValue(request.privilegedActionCurrentValue);
  const requestedValue = normalizeMetadataValue(request.privilegedActionRequestedValue);
  const context = {
    metadataSupplied,
    declaredAction,
    classifiedAction,
    methodClassifiedAction: methodClassification.classifiedAction,
    classificationContradiction: methodClassification.contradictory || Boolean(PRIVILEGED_ACTIONS.has(declaredAction) && methodClassification.classifiedAction && declaredAction !== methodClassification.classifiedAction),
    entryPointAction: methodClassification.entryPointAction,
    signatureAction: methodClassification.signatureAction,
    contract: targetContract,
    package: packageIdentifier,
    entryPoint: clean(request.privilegedActionEntryPoint || request.entryPoint),
    methodSignature: clean(request.privilegedActionMethodSignature),
    currentValue,
    requestedValue,
    role: clean(request.privilegedActionRole),
    recipient: clean(request.privilegedActionRecipient),
    implementation: clean(request.privilegedActionImplementation),
    classifierSource: clean(request.privilegedActionClassifierSource || (declaredAction ? "adapter-declared" : methodClassification.source)),
    classifierVersion: clean(request.privilegedActionClassifierVersion || (declaredAction ? "adapter" : methodClassification.version)),
    network: clean(request.privilegedActionNetwork || request.chainName),
    requestNetwork: clean(request.chainName),
    target: clean(request.target),
  };
  context.parameterFingerprint = classifiedAction ? buildPrivilegedActionFingerprint(context) : "";
  return context;
}

function sameProtectedValue(a, b) {
  return JSON.stringify(canonicalize(normalizeMetadataValue(a))) === JSON.stringify(canonicalize(normalizeMetadataValue(b)));
}

export function evaluatePrivilegedActionControls({ request = {}, policy = {} } = {}) {
  const config = policySettings(policy);
  const context = requestContext(request);
  const state = {
    findings: [],
    checksPassed: [],
    checksFailed: [],
    scoreDelta: 0,
    hardBlock: false,
    needsReview: false,
    context: null,
  };

  const recognizedMethod = Boolean(context.methodClassifiedAction);
  if (!context.metadataSupplied && !recognizedMethod) {
    skipped(state, "Privileged action applicability", "The request did not include privileged-action metadata and its entry point or method signature is not in Magen3's supported privileged-action map.", { entryPoint: context.entryPoint, methodSignature: context.methodSignature });
    return state;
  }

  if (!config.enabled) {
    skipped(state, "Privileged action controls enabled", "Privileged Action Controls are not enabled by the active policy.", { policyId: policy?.id || "", recognizedMethod, metadataSupplied: context.metadataSupplied });
    return state;
  }

  if (context.classificationContradiction) {
    fail(
      state,
      "Consistent privileged-action classification",
      "Declared privileged-action metadata contradicts the deterministic entry-point or method-signature classification.",
      {
        declaredAction: context.declaredAction,
        methodClassifiedAction: context.methodClassifiedAction,
        entryPointAction: context.entryPointAction,
        signatureAction: context.signatureAction,
      },
      "Correct the adapter classification and submit a fresh unsigned intent. Do not override a known privileged method with a different action label.",
    );
    state.context = { ...context, classificationStatus: "contradictory", requiredApprovalCount: 0, approvalRequired: false, config: { mode: config.mode } };
    return state;
  }

  if (!PRIVILEGED_ACTIONS.has(context.classifiedAction)) {
    applyPolicyAction(state, config, config.unknownAction, {
      rule: "Supported privileged-action classification",
      message: "The supplied privileged-action metadata could not be classified as a supported administrative action.",
      evidence: {
        declaredAction: context.declaredAction,
        entryPoint: context.entryPoint,
        methodSignature: context.methodSignature,
        supportedActions: [...PRIVILEGED_ACTIONS],
      },
      remediation: "Use a supported classifiedAction or a supported entry point and include classifier provenance. Unknown administrative calls must follow the active policy's Warn, Review, or Block behavior.",
    });
    state.context = { ...context, classificationStatus: "unknown", requiredApprovalCount: 0, approvalRequired: state.needsReview, config: { mode: config.mode, unknownAction: config.unknownAction } };
    return state;
  }

  pass(state, "Supported privileged-action classification", `Contract call classified as ${context.classifiedAction}.`, {
    classifiedAction: context.classifiedAction,
    classifierSource: context.classifierSource,
    classifierVersion: context.classifierVersion,
    entryPoint: context.entryPoint,
    methodSignature: context.methodSignature,
  });

  if (!context.classifierSource || !context.classifierVersion) {
    applyPolicyAction(state, config, "Review", {
      rule: "Classifier provenance",
      message: "Privileged-action classifier provenance is incomplete.",
      evidence: { classifierSource: context.classifierSource, classifierVersion: context.classifierVersion },
      remediation: "Include the deterministic classifier source and version used by the adapter, or rely on Magen3's supported method map.",
    });
  } else {
    pass(state, "Classifier provenance", "Privileged-action classifier source and version are recorded.", { classifierSource: context.classifierSource, classifierVersion: context.classifierVersion });
  }

  if (context.requestNetwork && context.network && lower(context.requestNetwork) !== lower(context.network)) {
    fail(state, "Privileged action network binding", "Privileged-action metadata is bound to a different network than the transaction.", { metadataNetwork: context.network, transactionNetwork: context.requestNetwork }, "Bind the classified action to the exact transaction network and create a new authorization request.");
  } else if (context.network || context.requestNetwork) {
    pass(state, "Privileged action network binding", "Privileged-action metadata is bound to the transaction network.", { metadataNetwork: context.network, transactionNetwork: context.requestNetwork });
  } else {
    applyPolicyAction(state, config, "Review", {
      rule: "Privileged action network binding",
      message: "No network binding was available for this privileged action.",
      evidence: {},
      remediation: "Include chainName or privilegedAction.network before authorizing an administrative call.",
    });
  }

  if (!context.contract && !context.package && !context.target) {
    fail(state, "Privileged target binding", "Privileged action is missing the target contract or package identifier.", {}, "Provide the exact target contract or package and retain Contract Validation for structural and allowlist checks.");
  } else if (context.contract && context.target && canonicalIdentity(context.contract) !== canonicalIdentity(context.target)) {
    fail(state, "Privileged target binding", "Privileged-action contract metadata does not match the transaction target.", { privilegedContract: context.contract, transactionTarget: context.target }, "Use the exact same contract identifier in the transaction and privileged-action metadata.");
  } else {
    pass(state, "Privileged target binding", "Privileged action is bound to the transaction target.", { contract: context.contract || context.target, package: context.package });
  }

  if (config.blockedActions.includes(context.classifiedAction)) {
    fail(state, "Blocked privileged action", `${context.classifiedAction} is explicitly blocked by the active policy.`, { classifiedAction: context.classifiedAction, blockedActions: config.blockedActions }, "Do not execute this administrative action. Only an authorized policy owner may change the block rule after security review.");
  } else {
    pass(state, "Privileged action block policy", `${context.classifiedAction} is not explicitly blocked.`, { classifiedAction: context.classifiedAction });
  }

  if (IMPLEMENTATION_ACTIONS.has(context.classifiedAction)) {
    if (!context.implementation || !validImplementation(context.implementation)) {
      fail(state, "Approved implementation", "Upgrade action is missing a structurally valid proposed implementation.", { implementation: context.implementation }, "Provide the exact proposed implementation address, contract hash, package hash, or approved code reference.");
    } else if (config.approvedImplementations.includes(canonicalIdentity(context.implementation))) {
      pass(state, "Approved implementation", "Proposed implementation is approved by policy.", { implementation: context.implementation });
    } else {
      applyPolicyAction(state, config, "Review", {
        rule: "Approved implementation",
        message: "Proposed implementation is not in the active policy's approved-implementation list.",
        evidence: { implementation: context.implementation, approvedImplementationCount: config.approvedImplementations.length },
        remediation: "Use an approved implementation or complete authorized code review before adding this exact implementation to policy.",
      });
    }
  } else {
    skipped(state, "Approved implementation", "Implementation allowlist is not applicable to this privileged-action classification.", { classifiedAction: context.classifiedAction });
  }

  if (RECIPIENT_REQUIRED_ACTIONS.has(context.classifiedAction)) {
    if (!validIdentity(context.recipient)) {
      fail(state, "Valid privileged recipient", `${context.classifiedAction} requires a structurally valid recipient or affected identity.`, { recipient: context.recipient }, "Provide the exact public wallet, account-hash, contract, or package identifier affected by the privileged action.");
    } else {
      pass(state, "Valid privileged recipient", "Privileged-action recipient is structurally valid.", { recipient: context.recipient });
    }
  } else {
    skipped(state, "Valid privileged recipient", "A recipient is not required for this privileged-action classification.", { classifiedAction: context.classifiedAction });
  }

  if (ADMIN_RECIPIENT_ACTIONS.has(context.classifiedAction) && validIdentity(context.recipient)) {
    const canonicalRecipient = canonicalIdentity(context.recipient);
    if (config.approvedAdministrators.includes(canonicalRecipient)) {
      pass(state, "Approved administrative recipient", "Administrative recipient is approved by policy.", { recipient: context.recipient });
    } else {
      applyPolicyAction(state, config, "Review", {
        rule: "Approved administrative recipient",
        message: "Administrative recipient is not in the active policy's approved-administrator list.",
        evidence: { recipient: context.recipient, approvedAdministratorCount: config.approvedAdministrators.length },
        remediation: "Use an approved administrator or complete authorized review before adding this exact identity to policy.",
      });
    }
  } else {
    skipped(state, "Approved administrative recipient", "Administrative-recipient allowlisting is not applicable to this classification.", { classifiedAction: context.classifiedAction });
  }

  if (ROLE_REQUIRED_ACTIONS.has(context.classifiedAction)) {
    if (!ROLE_REFERENCE.test(context.role)) {
      fail(state, "Valid privileged role", `${context.classifiedAction} requires a valid role or permission identifier.`, { role: context.role }, "Provide the exact role or permission identifier being granted, revoked, or changed.");
    } else {
      pass(state, "Valid privileged role", "Role or permission identifier is structurally valid.", { role: context.role });
    }
  } else {
    skipped(state, "Valid privileged role", "A role identifier is not required for this privileged-action classification.", { classifiedAction: context.classifiedAction });
  }

  if (AMOUNT_ACTIONS.has(context.classifiedAction)) {
    const requestedAmount = finiteNumber(context.requestedValue, null);
    if (requestedAmount === null || requestedAmount <= 0) {
      fail(state, "Valid privileged amount", `${context.classifiedAction} requires a positive requestedValue amount.`, { requestedValue: context.requestedValue }, "Provide the exact positive mint, burn, emergency-withdrawal, or treasury-withdrawal amount.");
    } else {
      pass(state, "Valid privileged amount", "Privileged-action amount is positive and explicit.", { requestedValue: requestedAmount });
    }
  } else {
    skipped(state, "Valid privileged amount", "A numeric requested amount is not required for this classification.", { classifiedAction: context.classifiedAction });
  }

  if (["Ownership Transfer", "Administrator Change", "Proxy Upgrade", "Implementation Change", "Oracle Replacement", "Fee Recipient Change", "Bridge Validator Change"].includes(context.classifiedAction) && context.currentValue !== null && context.requestedValue !== null) {
    if (sameProtectedValue(context.currentValue, context.requestedValue)) {
      fail(state, "Material privileged change", "Current and requested protected values are identical, so the administrative change is inconsistent or a no-op.", { currentValue: context.currentValue, requestedValue: context.requestedValue }, "Correct the requested protected value and submit a fresh intent.");
    } else {
      pass(state, "Material privileged change", "Requested protected value differs from the current value.", { currentValue: context.currentValue, requestedValue: context.requestedValue });
    }
  } else {
    skipped(state, "Material privileged change", "Current/requested value comparison is not available or not required for this classification.", { classifiedAction: context.classifiedAction });
  }

  if (!context.parameterFingerprint) {
    fail(state, "Protected parameter fingerprint", "Magen3 could not build a protected-parameter fingerprint for the privileged action.", {}, "Provide complete classified action, target, method, network, and protected parameter metadata.");
  } else {
    pass(state, "Protected parameter fingerprint", "Privileged contract, method, recipient, role, implementation, and requested values are bound into a canonical fingerprint.", { parameterFingerprint: context.parameterFingerprint });
  }

  const requiredApprovalCount = Number(config.quorumRules[context.classifiedAction] || 0);
  const actionRequiresReview = config.actionsRequiringReview.includes(context.classifiedAction) || requiredApprovalCount > 0;
  if (actionRequiresReview) {
    warn(
      state,
      "Privileged action human approval",
      `${context.classifiedAction} requires exact-bound Human Approval before wallet signing.`,
      {
        classifiedAction: context.classifiedAction,
        requiredApprovalCount: Math.max(1, requiredApprovalCount || 1),
        parameterFingerprint: context.parameterFingerprint,
      },
      "Complete the configured Human Approval workflow. Any protected parameter change requires a new intent and new approval binding.",
      { review: true, severity: "high", score: 18 },
    );
  } else {
    pass(state, "Privileged action human approval", "This classified action is not configured to require Human Approval.", { classifiedAction: context.classifiedAction });
  }

  state.context = {
    ...context,
    classificationStatus: "classified",
    approvalRequired: actionRequiresReview,
    requiredApprovalCount: actionRequiresReview ? Math.max(1, requiredApprovalCount || 1) : 0,
    config: {
      mode: config.mode,
      actionsRequiringReview: config.actionsRequiringReview,
      blockedActions: config.blockedActions,
      approvedAdministratorCount: config.approvedAdministrators.length,
      approvedImplementationCount: config.approvedImplementations.length,
      unknownAction: config.unknownAction,
    },
  };
  return state;
}
