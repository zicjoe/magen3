const HEX_64 = "[0-9a-f]{64}";
const CONTRACT_HASH = new RegExp(`^(?:contract-hash-|contract-)(?<hex>${HEX_64})$`, "i");
const PACKAGE_HASH = new RegExp(`^(?:contract-package-hash-|contract-package-|package-)(?<hex>${HEX_64})$`, "i");
const GENERIC_HASH = new RegExp(`^hash-(?<hex>${HEX_64})$`, "i");
const RAW_HASH = new RegExp(`^(?<hex>${HEX_64})$`, "i");
const ED25519_PUBLIC_KEY = /^01[0-9a-f]{64}$/i;
const SECP256K1_PUBLIC_KEY = /^02[0-9a-f]{66}$/i;
const ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;
const ENTRY_POINT = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

export const CONTRACT_ACTIONS = new Set([
  "Swap",
  "Deposit to Vault",
  "Contract Interaction",
  "RWA Proof Update",
  "Oracle Data Update",
  "Bridge",
]);

export const ENTRY_POINT_REQUIRED_ACTIONS = new Set([
  "Contract Interaction",
]);

export const CONTRACT_TARGET_TYPES = new Set([
  "Trusted Contract",
  "Unknown Contract",
  "RWA Registry",
  "Oracle Feed",
  "Bridge Contract",
]);

const CONTRACT_IDENTIFIER_TYPES = new Map([
  ["contract hash", "Contract Hash"],
  ["contract", "Contract Hash"],
  ["stored contract", "Contract Hash"],
  ["package hash", "Package Hash"],
  ["contract package hash", "Package Hash"],
  ["package", "Package Hash"],
  ["stored package", "Package Hash"],
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeIdentifierType(value) {
  const raw = clean(value);
  if (!raw) return "";
  return CONTRACT_IDENTIFIER_TYPES.get(raw.toLowerCase()) || raw;
}

function normalizeContractList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item).toLowerCase())
    .filter(Boolean);
}

function structuredContractRules(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object"
    ? policy.structuredRules
    : {};
  return {
    blockedContracts: normalizeContractList(rules.blockedContracts),
    allowedEntryPoints: Array.isArray(rules.allowedEntryPoints)
      ? rules.allowedEntryPoints.map((item) => clean(item)).filter(Boolean)
      : [],
  };
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return {
    module: "Contract Validation",
    status,
    severity,
    rule,
    message,
    evidence,
    remediation,
  };
}

export function isContractIntent(request = {}) {
  return CONTRACT_ACTIONS.has(request.actionType) || CONTRACT_TARGET_TYPES.has(request.targetType);
}

export function expectedTargetTypesForAction(actionType) {
  if (["Swap", "Deposit to Vault", "Contract Interaction"].includes(actionType)) {
    return ["Trusted Contract", "Unknown Contract"];
  }
  if (actionType === "Bridge") return ["Bridge Contract", "Trusted Contract", "Unknown Contract"];
  if (actionType === "RWA Proof Update") return ["RWA Registry"];
  if (actionType === "Oracle Data Update") return ["Oracle Feed"];
  return [...CONTRACT_TARGET_TYPES];
}

export function classifyCasperContractIdentifier(value, expectedType = "") {
  const raw = clean(value);
  const normalized = raw.toLowerCase();
  const normalizedExpectedType = normalizeIdentifierType(expectedType);

  if (!raw) {
    return {
      value: raw,
      normalized,
      valid: false,
      kind: "missing",
      label: "Missing contract identifier",
      canonical: "",
      reason: "No contract or package hash was provided.",
    };
  }

  if (ED25519_PUBLIC_KEY.test(raw) || SECP256K1_PUBLIC_KEY.test(raw)) {
    return {
      value: raw,
      normalized,
      valid: false,
      kind: "wallet-public-key",
      label: "Wallet public key",
      canonical: "",
      reason: "A Casper wallet public key is not a contract identifier.",
    };
  }

  if (ACCOUNT_HASH.test(raw)) {
    return {
      value: raw,
      normalized,
      valid: false,
      kind: "account-hash",
      label: "Account hash",
      canonical: "",
      reason: "A Casper account-hash is not a contract or contract-package hash.",
    };
  }

  const contractMatch = raw.match(CONTRACT_HASH);
  if (contractMatch?.groups?.hex) {
    const hex = contractMatch.groups.hex.toLowerCase();
    return {
      value: raw,
      normalized,
      valid: !normalizedExpectedType || normalizedExpectedType === "Contract Hash",
      kind: "contract-hash",
      label: "Contract Hash",
      canonical: `contract:${hex}`,
      hex,
      reason: normalizedExpectedType && normalizedExpectedType !== "Contract Hash"
        ? `The identifier is a Contract Hash but the request declares ${normalizedExpectedType}.`
        : "Valid Casper Contract Hash format.",
    };
  }

  const packageMatch = raw.match(PACKAGE_HASH);
  if (packageMatch?.groups?.hex) {
    const hex = packageMatch.groups.hex.toLowerCase();
    return {
      value: raw,
      normalized,
      valid: !normalizedExpectedType || normalizedExpectedType === "Package Hash",
      kind: "package-hash",
      label: "Package Hash",
      canonical: `package:${hex}`,
      hex,
      reason: normalizedExpectedType && normalizedExpectedType !== "Package Hash"
        ? `The identifier is a Package Hash but the request declares ${normalizedExpectedType}.`
        : "Valid Casper Contract Package Hash format.",
    };
  }

  const genericMatch = raw.match(GENERIC_HASH) || raw.match(RAW_HASH);
  if (genericMatch?.groups?.hex) {
    const hex = genericMatch.groups.hex.toLowerCase();
    if (!normalizedExpectedType) {
      return {
        value: raw,
        normalized,
        valid: false,
        kind: "ambiguous-hash",
        label: "Ambiguous 32-byte hash",
        canonical: "",
        hex,
        reason: "The hash format is valid but does not distinguish a Contract Hash from a Package Hash.",
      };
    }
    const packageIdentifier = normalizedExpectedType === "Package Hash";
    return {
      value: raw,
      normalized,
      valid: ["Contract Hash", "Package Hash"].includes(normalizedExpectedType),
      kind: packageIdentifier ? "package-hash" : "contract-hash",
      label: normalizedExpectedType,
      canonical: `${packageIdentifier ? "package" : "contract"}:${hex}`,
      hex,
      reason: `Valid 32-byte hash interpreted as ${normalizedExpectedType} from contractIdentifierType.`,
    };
  }

  return {
    value: raw,
    normalized,
    valid: false,
    kind: "invalid",
    label: "Invalid contract identifier",
    canonical: "",
    reason: "Expected a Casper Contract Hash or Contract Package Hash containing exactly 32 bytes of hexadecimal data.",
  };
}

function policyEntryMatchesIdentifier(entry, identifier) {
  const normalizedEntry = clean(entry).toLowerCase();
  if (!normalizedEntry || !identifier?.valid) return false;
  if (normalizedEntry === identifier.normalized) return true;

  const parsed = classifyCasperContractIdentifier(entry, identifier.label);
  return Boolean(parsed.valid && parsed.canonical && parsed.canonical === identifier.canonical);
}

function contractPolicyMatch(list, identifier) {
  return (Array.isArray(list) ? list : []).some((entry) => policyEntryMatchesIdentifier(entry, identifier));
}

export function evaluateContractValidation({ request = {}, policy = {} } = {}) {
  const findings = [];
  const checksPassed = [];
  const checksFailed = [];
  let scoreDelta = 0;
  let hardBlock = false;
  let needsReview = false;

  const contractIntent = isContractIntent(request);
  if (!contractIntent) {
    return {
      findings,
      checksPassed,
      checksFailed,
      scoreDelta,
      hardBlock,
      needsReview,
      contractIntent: false,
      identifier: null,
      approved: false,
      blocked: false,
    };
  }

  const target = clean(request.target || request.contractHash || request.contractPackageHash);
  const identifierType = normalizeIdentifierType(request.contractIdentifierType);
  const entryPoint = clean(request.entryPoint);
  const contractVersionRaw = request.contractVersion;
  const contractVersion = contractVersionRaw === "" || contractVersionRaw === undefined || contractVersionRaw === null
    ? null
    : Number(contractVersionRaw);
  const chainName = clean(request.chainName);
  const expectedChainName = clean(process.env.CASPER_CHAIN_NAME || "casper-test");
  const expectedTargetTypes = expectedTargetTypesForAction(request.actionType);
  const identifier = classifyCasperContractIdentifier(target, identifierType);
  const trustedContracts = Array.isArray(policy.trustedContracts) ? policy.trustedContracts : [];
  const { blockedContracts, allowedEntryPoints } = structuredContractRules(policy);
  const approved = contractPolicyMatch(trustedContracts, identifier);
  const blocked = contractPolicyMatch(blockedContracts, identifier);
  const strictMode = policy.riskMode === "Conservative";

  if (!expectedTargetTypes.includes(request.targetType)) {
    const message = `${request.actionType || "This action"} must use ${expectedTargetTypes.join(" or ")}, not ${request.targetType || "an unspecified target type"}.`;
    checksFailed.push(message);
    scoreDelta += 40;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Contract target classification",
      message,
      evidence: { actionType: request.actionType, receivedTargetType: request.targetType || "", expectedTargetTypes },
      remediation: `Set action.targetType to ${expectedTargetTypes[0]} and provide the matching Casper contract identifier.`,
    }));
  } else {
    const message = "The intent uses a contract-compatible target classification.";
    checksPassed.push(message);
    findings.push(finding({
      status: "pass",
      rule: "Contract target classification",
      message,
      evidence: { actionType: request.actionType, targetType: request.targetType, expectedTargetTypes },
    }));
  }

  if (!target) {
    const message = "Contract target is missing.";
    checksFailed.push(message);
    scoreDelta += 45;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Valid Casper contract identifier",
      message,
      evidence: { target: "", expected: "Contract Hash or Package Hash" },
      remediation: "Provide the deployed Casper contract hash or contract package hash before retrying.",
    }));
  } else if (!identifier.valid) {
    const message = identifier.kind === "ambiguous-hash"
      ? "Contract hash type is ambiguous."
      : "Contract target is not a valid Casper Contract Hash or Package Hash.";
    checksFailed.push(message);
    scoreDelta += 45;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Valid Casper contract identifier",
      message,
      evidence: {
        target,
        detectedFormat: identifier.kind,
        declaredIdentifierType: identifierType || "",
        reason: identifier.reason,
      },
      remediation: identifier.kind === "ambiguous-hash"
        ? "Set action.contractIdentifierType to Contract Hash or Package Hash, or use an explicit contract-/contract-package- prefix."
        : "Replace the target with a valid Casper contract or package hash. Do not use a wallet public key or account-hash as a contract target.",
    }));
  } else {
    const message = `Contract target uses a valid ${identifier.label} format.`;
    checksPassed.push(message);
    findings.push(finding({
      status: "pass",
      rule: "Valid Casper contract identifier",
      message,
      evidence: { target, identifierType: identifier.label, canonicalIdentifier: identifier.canonical },
    }));
  }

  const requiresEntryPoint = ENTRY_POINT_REQUIRED_ACTIONS.has(request.actionType);
  if (requiresEntryPoint && !entryPoint) {
    const message = "Contract entry point is missing.";
    checksFailed.push(message);
    scoreDelta += 35;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "high",
      rule: "Valid contract entry point",
      message,
      evidence: { actionType: request.actionType, entryPoint: "" },
      remediation: "Provide action.entryPoint for the contract call before retrying.",
    }));
  } else if (entryPoint && !ENTRY_POINT.test(entryPoint)) {
    const message = "Contract entry point contains unsupported characters or exceeds the supported length.";
    checksFailed.push(message);
    scoreDelta += 35;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "high",
      rule: "Valid contract entry point",
      message,
      evidence: { entryPoint, expectedPattern: "letter or underscore followed by letters, digits, underscores, or hyphens; maximum 64 characters" },
      remediation: "Use the exact deployed contract entry-point name without spaces or unsupported characters.",
    }));
  } else if (entryPoint) {
    const message = `Contract entry point is structurally valid: ${entryPoint}.`;
    checksPassed.push(message);
    findings.push(finding({
      status: "pass",
      rule: "Valid contract entry point",
      message,
      evidence: { entryPoint },
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Valid contract entry point",
      message: "No direct contract entry point was declared for this high-level action, so Magen3 evaluated contract identity and policy controls only.",
      evidence: { actionType: request.actionType, targetType: request.targetType },
      remediation: "Include action.entryPoint when the external agent has already resolved the exact contract entry point.",
    }));
  }

  if (identifier.valid && identifier.kind === "contract-hash" && contractVersion !== null) {
    const message = "A contract version must not be supplied when calling a specific Contract Hash.";
    checksFailed.push(message);
    scoreDelta += 25;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "high",
      rule: "Contract version semantics",
      message,
      evidence: { identifierType: identifier.label, contractVersion },
      remediation: "Remove action.contractVersion, or call a Package Hash when selecting a contract version.",
    }));
  } else if (identifier.valid && identifier.kind === "package-hash" && contractVersion !== null && (!Number.isInteger(contractVersion) || contractVersion < 1)) {
    const message = "Contract package version must be a positive integer when supplied.";
    checksFailed.push(message);
    scoreDelta += 25;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "high",
      rule: "Contract version semantics",
      message,
      evidence: { identifierType: identifier.label, contractVersion: contractVersionRaw },
      remediation: "Use a positive integer contractVersion, or omit it to call the latest enabled package version.",
    }));
  } else if (identifier.valid && identifier.kind === "package-hash") {
    findings.push(finding({
      status: "pass",
      rule: "Contract version semantics",
      message: contractVersion === null
        ? "Package Hash call will use the latest enabled contract version."
        : `Package Hash call declares contract version ${contractVersion}.`,
      evidence: { identifierType: identifier.label, contractVersion },
    }));
  } else if (identifier.valid) {
    findings.push(finding({
      status: "pass",
      rule: "Contract version semantics",
      message: "Specific Contract Hash call does not declare a package version.",
      evidence: { identifierType: identifier.label, contractVersion: null },
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Contract version semantics",
      message: "Contract-version validation was skipped because the contract identifier is invalid.",
      evidence: { contractVersion: contractVersionRaw ?? null },
    }));
  }

  if (chainName && chainName !== expectedChainName) {
    const message = `Contract intent targets ${chainName}, but this Magen3 deployment is configured for ${expectedChainName}.`;
    checksFailed.push(message);
    scoreDelta += 40;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Casper network consistency",
      message,
      evidence: { receivedChainName: chainName, expectedChainName },
      remediation: `Submit the intent for ${expectedChainName}, or use the Magen3 deployment configured for the intended Casper network.`,
    }));
  } else if (chainName) {
    const message = `Contract intent matches the configured Casper chain: ${expectedChainName}.`;
    checksPassed.push(message);
    findings.push(finding({
      status: "pass",
      rule: "Casper network consistency",
      message,
      evidence: { chainName, expectedChainName },
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Casper network consistency",
      message: `No chainName was supplied; Magen3 evaluated the request under its configured chain ${expectedChainName}.`,
      evidence: { expectedChainName },
      remediation: `Include action.chainName: "${expectedChainName}" for explicit network binding.`,
    }));
  }

  if (identifier.valid && blocked) {
    const message = "Contract is explicitly blocked by the active policy.";
    checksFailed.push(message);
    scoreDelta += 55;
    hardBlock = true;
    findings.push(finding({
      status: "fail",
      severity: "critical",
      rule: "Blocked contract",
      message,
      evidence: { target, canonicalIdentifier: identifier.canonical, blockedContractCount: blockedContracts.length },
      remediation: "Do not execute against this contract. Only an authorized policy owner should remove a blocked contract after security review.",
    }));
  } else if (identifier.valid) {
    findings.push(finding({
      status: "pass",
      rule: "Blocked contract",
      message: "Contract is not present in the active policy's blocked-contract list.",
      evidence: { target, blockedContractCount: blockedContracts.length },
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Blocked contract",
      message: "Blocked-contract evaluation was skipped because the contract identifier is invalid.",
      evidence: { target },
    }));
  }

  if (identifier.valid && approved && !blocked) {
    const message = "Contract is approved by the active policy.";
    checksPassed.push(message);
    findings.push(finding({
      status: "pass",
      rule: "Approved contract",
      message,
      evidence: { target, canonicalIdentifier: identifier.canonical, approvedContractCount: trustedContracts.length },
    }));
  } else if (identifier.valid && !blocked) {
    const message = "Contract is not in the active policy's approved target list.";
    checksFailed.push(message);
    scoreDelta += strictMode ? 40 : 25;
    if (strictMode) hardBlock = true;
    else needsReview = true;
    findings.push(finding({
      status: strictMode ? "fail" : "warning",
      severity: strictMode ? "high" : "medium",
      rule: "Approved contract",
      message,
      evidence: {
        target,
        canonicalIdentifier: identifier.canonical,
        approvedContractCount: trustedContracts.length,
        riskMode: policy.riskMode || "Balanced",
        declaredTargetType: request.targetType,
      },
      remediation: "Use a policy-approved contract, or add this exact Contract Hash or Package Hash after authorized review. Target labels do not grant trust by themselves.",
    }));
  } else {
    findings.push(finding({
      status: "skipped",
      rule: "Approved contract",
      message: "Approved-contract evaluation was skipped because the contract identifier is invalid.",
      evidence: { target },
    }));
  }

  if (entryPoint && allowedEntryPoints.length > 0) {
    const allowed = allowedEntryPoints.includes(entryPoint);
    if (!allowed) {
      const message = `Entry point ${entryPoint} is not allowed by the active policy.`;
      checksFailed.push(message);
      scoreDelta += 40;
      hardBlock = true;
      findings.push(finding({
        status: "fail",
        severity: "critical",
        rule: "Allowed contract entry points",
        message,
        evidence: { entryPoint, allowedEntryPoints },
        remediation: "Use an allowed entry point, or update the policy only after authorized contract review.",
      }));
    } else {
      const message = `Entry point ${entryPoint} is allowed by the active policy.`;
      checksPassed.push(message);
      findings.push(finding({
        status: "pass",
        rule: "Allowed contract entry points",
        message,
        evidence: { entryPoint, allowedEntryPoints },
      }));
    }
  } else if (entryPoint) {
    findings.push(finding({
      status: "skipped",
      rule: "Allowed contract entry points",
      message: "No entry-point allowlist is configured, so only structural entry-point validation was applied.",
      evidence: { entryPoint },
      remediation: "Add allowedEntryPoints to the policy's contract controls for narrower execution permissions.",
    }));
  }

  return {
    findings,
    checksPassed,
    checksFailed,
    scoreDelta,
    hardBlock,
    needsReview,
    contractIntent: true,
    identifier,
    approved,
    blocked,
    entryPoint,
    chainName: chainName || expectedChainName,
  };
}
