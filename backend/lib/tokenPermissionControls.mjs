import { createHash } from "node:crypto";
import { classifyCasperContractIdentifier } from "./contractValidation.mjs";

const MODULE = "Token Approval & Permit Safety";
const MODES = new Set(["Observe", "Review", "Enforce"]);
const ACTIONS = new Set(["Warn", "Review", "Block"]);
const APPROVAL_ACTIONS = new Set([
  "Token Approval",
  "Allowance Increase",
  "Allowance Decrease",
  "Allowance Reset",
  "Permit Authorization",
  "NFT Operator Approval",
  "Batch Approval",
  "Delegated Spender Permission",
]);
const PERMIT_KINDS = new Set(["Permit Authorization", "permit", "permit authorization"]);
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const CASPER_PUBLIC_KEY = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const CASPER_ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;
const HASH_32 = /^(?:0x)?[0-9a-f]{64}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const UINT256_MAX = (2n ** 256n) - 1n;

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function list(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(lower).filter(Boolean))];
}

function finiteNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function normalizeMode(value) {
  return MODES.has(clean(value)) ? clean(value) : "Observe";
}

function normalizeAction(value, fallback = "Warn") {
  return ACTIONS.has(clean(value)) ? clean(value) : fallback;
}

function normalizeKind(value) {
  const raw = clean(value);
  const normalized = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases = new Map([
    ["token approval", "Token Approval"],
    ["fungible token approval", "Token Approval"],
    ["approve", "Token Approval"],
    ["allowance increase", "Allowance Increase"],
    ["increase allowance", "Allowance Increase"],
    ["allowance decrease", "Allowance Decrease"],
    ["decrease allowance", "Allowance Decrease"],
    ["allowance reset", "Allowance Reset"],
    ["reset allowance", "Allowance Reset"],
    ["permit", "Permit Authorization"],
    ["permit authorization", "Permit Authorization"],
    ["nft operator approval", "NFT Operator Approval"],
    ["operator approval", "NFT Operator Approval"],
    ["approval for all", "NFT Operator Approval"],
    ["batch approval", "Batch Approval"],
    ["delegated permission", "Delegated Spender Permission"],
    ["delegated spender permission", "Delegated Spender Permission"],
  ]);
  return aliases.get(normalized) || raw;
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: MODULE, status, severity, rule, message, evidence, remediation };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeHash(value) {
  return lower(value).replace(/^0x/, "");
}

function normalizeNetwork(value) {
  return lower(value).replace(/[_\s]+/g, "-");
}

function networkFamily(value) {
  const network = normalizeNetwork(value);
  if (!network) return "unknown";
  if (network.startsWith("eip155:") || ["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc", "avalanche", "linea", "scroll", "zksync"].some((hint) => network.includes(hint))) return "evm";
  if (network.includes("casper")) return "casper";
  return "unknown";
}

function eip155ChainReference(value) {
  const network = normalizeNetwork(value);
  if (!network.startsWith("eip155:")) return "";
  return network.slice("eip155:".length);
}

function normalizedChainId(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return "";
  if (/^0x[0-9a-f]+$/.test(raw)) {
    try { return BigInt(raw).toString(10); } catch { return raw; }
  }
  if (/^\d+$/.test(raw)) {
    try { return BigInt(raw).toString(10); } catch { return raw; }
  }
  return raw;
}

function parseAtomic(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  try { return BigInt(raw); } catch { return null; }
}

function isUnlimited(permission) {
  if (permission.unlimited === true) return true;
  const raw = lower(permission.approvalAmountAtomic || permission.amountAtomic || permission.approvalAmount);
  if (["unlimited", "max", "maximum", "infinite", "infinity"].includes(raw)) return true;
  const atomic = parseAtomic(raw);
  return atomic !== null && atomic === UINT256_MAX;
}

function parseDeadline(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const number = Number(raw);
    if (!Number.isFinite(number)) return Number.NaN;
    return number < 10_000_000_000 ? number * 1000 : number;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeConfig(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.tokenPermissionControlsEnabled === true,
    mode: normalizeMode(rules.tokenPermissionMode),
    unknownSpenderAction: normalizeAction(rules.tokenPermissionUnknownSpenderAction, "Review"),
    unlimitedApprovalAction: normalizeAction(rules.tokenPermissionUnlimitedApprovalAction, "Review"),
    maxApprovalAmount: Math.max(0, finiteNumber(rules.tokenPermissionMaxApprovalAmount, 0) || 0),
    maxApprovalToTransactionRatio: Math.max(0, finiteNumber(rules.tokenPermissionMaxApprovalToTransactionRatio, 0) || 0),
    maxLifetimeSeconds: finiteInteger(rules.tokenPermissionMaxLifetimeSeconds, 3600, { min: 1, max: 31_536_000 }),
    requireExpiry: bool(rules.tokenPermissionRequireExpiry, false),
    requireAllowanceReset: bool(rules.tokenPermissionRequireAllowanceReset, false),
    approvedSpenders: list(rules.tokenPermissionApprovedSpenders),
    blockedSpenders: list(rules.tokenPermissionBlockedSpenders),
    allowNftOperatorApproval: bool(rules.tokenPermissionAllowNftOperatorApproval, false),
    allowBatchApproval: bool(rules.tokenPermissionAllowBatchApproval, false),
    requireChainBinding: bool(rules.tokenPermissionRequireChainBinding, true),
    requireNonce: bool(rules.tokenPermissionRequireNonce, true),
    maximumBatchSize: finiteInteger(rules.tokenPermissionMaximumBatchSize, 10, { min: 1, max: 100 }),
    blockedContracts: list(rules.blockedContracts),
    trustedContracts: list(policy.trustedContracts),
  };
}

function permissionFromAudit(log = {}) {
  const original = log.originalIntent && typeof log.originalIntent === "object" ? log.originalIntent : {};
  const action = original.action && typeof original.action === "object" ? original.action : {};
  return action.tokenPermission && typeof action.tokenPermission === "object" ? action.tokenPermission : null;
}

function addressKind(value, family, expectedContract = false, identifierType = "") {
  const raw = clean(value);
  if (!raw) return { valid: false, kind: "missing", canonical: "" };
  if (family === "evm") return { valid: EVM_ADDRESS.test(raw), kind: EVM_ADDRESS.test(raw) ? "evm-address" : "invalid-evm-address", canonical: lower(raw) };
  if (family === "casper") {
    if (expectedContract) {
      const parsed = classifyCasperContractIdentifier(raw, identifierType);
      return { valid: parsed.valid, kind: parsed.kind, canonical: parsed.canonical || lower(raw), reason: parsed.reason };
    }
    if (CASPER_PUBLIC_KEY.test(raw)) return { valid: true, kind: "casper-public-key", canonical: lower(raw) };
    if (CASPER_ACCOUNT_HASH.test(raw)) return { valid: true, kind: "casper-account-hash", canonical: lower(raw) };
    const parsed = classifyCasperContractIdentifier(raw, identifierType);
    return { valid: parsed.valid, kind: parsed.kind, canonical: parsed.canonical || lower(raw), reason: parsed.reason };
  }
  if (EVM_ADDRESS.test(raw)) return { valid: true, kind: "evm-address", canonical: lower(raw) };
  if (CASPER_PUBLIC_KEY.test(raw)) return { valid: true, kind: "casper-public-key", canonical: lower(raw) };
  if (CASPER_ACCOUNT_HASH.test(raw)) return { valid: true, kind: "casper-account-hash", canonical: lower(raw) };
  const parsed = classifyCasperContractIdentifier(raw, identifierType);
  if (parsed.valid) return { valid: true, kind: parsed.kind, canonical: parsed.canonical };
  return { valid: false, kind: "unsupported-address-family", canonical: lower(raw) };
}

function applyModeViolation(state, config, details, { hard = false } = {}) {
  if (hard || config.mode === "Enforce") {
    state.findings.push(finding({ ...details, status: "fail", severity: details.blockSeverity || "high" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.blockScore || 30;
    state.hardBlock = true;
    return;
  }
  state.findings.push(finding({ ...details, status: "warning", severity: details.reviewSeverity || "medium" }));
  state.checksFailed.push(details.message);
  state.scoreDelta += details.reviewScore || 15;
  if (config.mode === "Review") state.needsReview = true;
}

function applyConfiguredAction(state, action, details) {
  if (action === "Block") {
    state.findings.push(finding({ ...details, status: "fail", severity: details.blockSeverity || "high" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.blockScore || 30;
    state.hardBlock = true;
    return;
  }
  state.findings.push(finding({ ...details, status: "warning", severity: action === "Review" ? details.reviewSeverity || "high" : details.warnSeverity || "medium" }));
  state.checksFailed.push(details.message);
  state.scoreDelta += action === "Review" ? details.reviewScore || 18 : details.warnScore || 8;
  if (action === "Review") state.needsReview = true;
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "pass", rule, message, evidence }));
  state.checksPassed.push(message);
}

function skip(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "skipped", rule, message, evidence }));
}

function canonicalPermission(permission = {}) {
  const batch = Array.isArray(permission.batch) ? permission.batch : [];
  return stableValue({
    kind: normalizeKind(permission.kind),
    standard: clean(permission.standard).toUpperCase(),
    network: normalizeNetwork(permission.network),
    chainId: clean(permission.chainId),
    tokenContract: lower(permission.tokenContract),
    tokenIdentifierType: clean(permission.tokenIdentifierType),
    owner: lower(permission.owner),
    spender: lower(permission.spender),
    intendedSpender: lower(permission.intendedSpender),
    approvalAmount: clean(permission.approvalAmount),
    approvalAmountAtomic: clean(permission.approvalAmountAtomic),
    intendedTransactionAmount: permission.intendedTransactionAmount ?? null,
    unlimited: permission.unlimited === true,
    deadline: clean(permission.deadline || permission.expiresAt),
    nonce: clean(permission.nonce),
    permitIdentifier: clean(permission.permitIdentifier),
    permitSignatureHash: normalizeHash(permission.permitSignatureHash),
    reusable: permission.reusable === true,
    oneTime: permission.oneTime === true,
    resetAfterUse: permission.resetAfterUse === true,
    operatorApprovalForAll: permission.operatorApprovalForAll === true,
    batch: batch.map((item) => canonicalPermission({ ...item, batch: [] })),
  });
}

export function buildTokenPermissionFingerprint(permission = {}) {
  return sha256(JSON.stringify(canonicalPermission(permission)));
}

function isApplicable(request = {}) {
  const permission = request.tokenPermission;
  return Boolean(permission && typeof permission === "object") || APPROVAL_ACTIONS.has(clean(request.actionType));
}

export function evaluateTokenPermissionControls({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const applicable = isApplicable(request);
  if (!applicable) {
    skip(state, "Token permission applicability", "Token Approval & Permit Safety was skipped because the intent does not declare approval or permit metadata.", { actionType: request.actionType || "" });
    return { ...state, applicable: false, context: null };
  }

  const config = normalizeConfig(policy);
  const permission = request.tokenPermission && typeof request.tokenPermission === "object" ? request.tokenPermission : {};
  const kind = normalizeKind(permission.kind || request.actionType);
  if (!config.enabled) {
    state.findings.push(finding({
      status: "unavailable",
      severity: "low",
      rule: "Token permission controls enabled",
      message: "Token approval metadata was supplied, but Token Approval & Permit Safety is disabled in the active policy.",
      evidence: { kind, enabled: false },
      remediation: "Enable Token Permissions in the active policy before allowing autonomous approval or permit actions.",
    }));
    return { ...state, applicable: true, context: { status: "disabled", enabled: false, kind } };
  }

  const network = normalizeNetwork(permission.network || request.chainName);
  const family = networkFamily(network);
  const chainId = normalizedChainId(permission.chainId);
  const networkChainReference = normalizedChainId(eip155ChainReference(network));
  const tokenContract = clean(permission.tokenContract || request.target);
  const tokenIdentifierType = clean(permission.tokenIdentifierType || request.contractIdentifierType);
  const owner = clean(permission.owner || request.executionWalletAddress || request.walletAddress);
  const spender = clean(permission.spender);
  const intendedSpender = clean(permission.intendedSpender || permission.protocolSpender);
  const standard = clean(permission.standard).toUpperCase();
  const token = addressKind(tokenContract, family, true, tokenIdentifierType);
  const ownerIdentity = addressKind(owner, family, false);
  const spenderIdentity = addressKind(spender, family, false, clean(permission.spenderIdentifierType));
  const approvalAmount = finiteNumber(permission.approvalAmount, null);
  const intendedAmount = finiteNumber(permission.intendedTransactionAmount ?? request.amount, null);
  const unlimited = isUnlimited(permission);
  const ratio = unlimited ? null : approvalAmount !== null && intendedAmount !== null && intendedAmount > 0 ? approvalAmount / intendedAmount : null;
  const deadlineRaw = clean(permission.deadline || permission.expiresAt);
  const deadlineMs = parseDeadline(deadlineRaw);
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const lifetimeSeconds = Number.isFinite(deadlineMs) ? Math.round((deadlineMs - nowMs) / 1000) : null;
  const nonce = clean(permission.nonce);
  const permitIdentifier = clean(permission.permitIdentifier || permission.permitId);
  const signatureHash = normalizeHash(permission.permitSignatureHash || permission.signatureHash);
  const clientFingerprint = normalizeHash(permission.permitFingerprint || permission.fingerprint);
  const fingerprint = buildTokenPermissionFingerprint({ ...permission, kind, network, tokenContract, owner, spender });
  const isPermit = kind === "Permit Authorization" || PERMIT_KINDS.has(lower(kind));
  const batch = Array.isArray(permission.batch) ? permission.batch : [];
  const targetMatchesToken = !clean(request.target) || lower(request.target) === lower(tokenContract);

  if (!kind || !APPROVAL_ACTIONS.has(kind)) applyModeViolation(state, config, { rule: "Approval classification", message: "The token permission kind is missing or unsupported.", evidence: { kind: kind || "", supportedKinds: [...APPROVAL_ACTIONS] }, remediation: "Declare action.tokenPermission.kind using a supported approval or permit classification." }, { hard: true });
  else pass(state, "Approval classification", `The intent is explicitly classified as ${kind}.`, { kind });

  if (config.requireChainBinding && !network) applyModeViolation(state, config, { rule: "Token permission chain binding", message: "The active policy requires an explicit network binding for token permissions.", evidence: { network: "" }, remediation: "Set action.tokenPermission.network to the exact chain or CAIP-2 network identifier." }, { hard: true });
  else if (network && family === "unknown") applyModeViolation(state, config, { rule: "Token permission chain binding", message: "Magen3 does not have a deterministic address validator for the declared token-permission network.", evidence: { network }, remediation: "Use a supported Casper or EVM network identifier, or keep this control in Review mode until a chain adapter is available." });
  else if (network) pass(state, "Token permission chain binding", "The token permission declares a supported network family.", { network, family });

  const requestNetwork = normalizeNetwork(request.chainName);
  if (requestNetwork && network && requestNetwork !== network) applyModeViolation(state, config, { rule: "Network binding mismatch", message: "The token permission network does not match the action chain binding.", evidence: { permissionNetwork: network, actionChainName: requestNetwork }, remediation: "Rebuild the intent so the token permission and transaction target the same network." }, { hard: true });
  if (family === "evm" && chainId && networkChainReference && chainId !== networkChainReference) applyModeViolation(state, config, { rule: "EVM chain ID binding", message: "The token permission chainId does not match the eip155 network reference.", evidence: { network, networkChainReference, chainId }, remediation: "Use the exact chain ID encoded by the selected eip155 network." }, { hard: true });
  else if (family === "evm" && chainId && networkChainReference) pass(state, "EVM chain ID binding", "The explicit chain ID matches the eip155 network reference.", { network, chainId });

  if (!tokenContract || !token.valid) applyModeViolation(state, config, { rule: "Token contract identity", message: "The token contract is missing or malformed for the declared network.", evidence: { tokenContract, network, detectedKind: token.kind, reason: token.reason || "" }, remediation: "Provide the exact token contract address or Casper Contract/Package Hash with the correct identifier type." }, { hard: true });
  else pass(state, "Token contract identity", "The token contract is structurally valid for the declared network.", { tokenContract, network, detectedKind: token.kind });

  if (!targetMatchesToken) applyModeViolation(state, config, { rule: "Token-contract binding", message: "The action target does not match the token contract bound to the approval.", evidence: { actionTarget: request.target || "", tokenContract }, remediation: "Submit the token approval to the exact declared token contract." }, { hard: true });
  else pass(state, "Token-contract binding", "The action target is bound to the declared token contract.", { actionTarget: request.target || tokenContract, tokenContract });

  if (!owner || !ownerIdentity.valid) applyModeViolation(state, config, { rule: "Token owner binding", message: "The token owner is missing or malformed for the declared network.", evidence: { owner, network, detectedKind: ownerIdentity.kind }, remediation: "Bind the permission to the exact execution wallet or token owner address." }, { hard: true });
  else if (lower(owner) !== lower(request.executionWalletAddress || request.walletAddress)) applyModeViolation(state, config, { rule: "Token owner binding", message: "The declared token owner does not match the execution wallet submitted to Magen3.", evidence: { owner, executionWalletAddress: request.executionWalletAddress || request.walletAddress || "" }, remediation: "Use the exact wallet that will sign or own the token permission." }, { hard: true });
  else pass(state, "Token owner binding", "The permission owner matches the execution wallet.", { owner });

  if (!spender || !spenderIdentity.valid) applyModeViolation(state, config, { rule: "Spender identity", message: "The spender is missing or malformed for the declared network.", evidence: { spender, network, detectedKind: spenderIdentity.kind }, remediation: "Provide the exact spender wallet or contract identifier before requesting approval." }, { hard: true });
  else if (lower(spender) === lower(owner)) applyModeViolation(state, config, { rule: "Owner-spender separation", message: "The spender is the same identity as the token owner.", evidence: { owner, spender }, remediation: "Confirm the intended protocol spender; do not grant redundant authority back to the token owner." });
  else pass(state, "Spender identity", "The spender is structurally valid and distinct from the token owner.", { spender, detectedKind: spenderIdentity.kind });

  if (intendedSpender && lower(spender) !== lower(intendedSpender)) applyModeViolation(state, config, { rule: "Intended spender binding", message: "The submitted spender does not match the protocol spender declared by the adapter.", evidence: { spender, intendedSpender }, remediation: "Stop and rebuild the action from trusted protocol metadata." }, { hard: true });
  else if (intendedSpender) pass(state, "Intended spender binding", "The spender matches the protocol identity declared by the adapter.", { spender, intendedSpender });
  else skip(state, "Intended spender binding", "No separate intended protocol spender was supplied.", { spender });

  const normalizedSpender = lower(spender);
  if (normalizedSpender && (config.blockedSpenders.includes(normalizedSpender) || config.blockedContracts.includes(normalizedSpender))) applyConfiguredAction(state, "Block", { rule: "Blocked spender", message: "The token spender is explicitly blocked by the active policy.", evidence: { spender }, remediation: "Do not grant authority to this spender. Use an approved protocol contract." });
  else if (normalizedSpender && (config.approvedSpenders.includes(normalizedSpender) || config.trustedContracts.includes(normalizedSpender))) pass(state, "Approved spender", "The spender is approved by the active policy.", { spender });
  else if (normalizedSpender) applyConfiguredAction(state, config.unknownSpenderAction, { rule: "Unknown spender", message: "The spender is not approved by the active policy.", evidence: { spender, approvedSpenders: config.approvedSpenders }, remediation: "Add the verified spender to the policy only after independent protocol verification, or use an already approved spender." });

  const normalizedToken = lower(tokenContract);
  if (normalizedToken && config.blockedContracts.includes(normalizedToken)) applyConfiguredAction(state, "Block", { rule: "Blocked token contract", message: "The token contract is explicitly blocked by the active policy.", evidence: { tokenContract }, remediation: "Do not grant token authority through this contract." });
  else if (normalizedToken && config.trustedContracts.includes(normalizedToken)) pass(state, "Token contract policy", "The token contract is present in the active policy trusted-contract list.", { tokenContract });
  else skip(state, "Token contract policy", "The token contract is structurally valid but is not claimed safe solely from its address.", { tokenContract });

  const resetKind = kind === "Allowance Reset";
  if (!resetKind && !unlimited && (approvalAmount === null || approvalAmount <= 0)) applyModeViolation(state, config, { rule: "Positive approval amount", message: "The approval amount must be a positive finite number for this permission type.", evidence: { approvalAmount: permission.approvalAmount ?? null, kind }, remediation: "Approve only the positive amount required for the intended transaction." }, { hard: true });
  else if (resetKind && approvalAmount !== 0) applyModeViolation(state, config, { rule: "Allowance reset amount", message: "An allowance reset must set the approval amount to zero.", evidence: { approvalAmount: permission.approvalAmount ?? null }, remediation: "Set approvalAmount to 0 for an allowance reset." }, { hard: true });
  else pass(state, "Approval amount structure", resetKind ? "The allowance reset sets authority to zero." : unlimited ? "The approval amount is explicitly marked unlimited for policy handling." : "The approval amount is positive.", { approvalAmount, unlimited, kind });

  if (unlimited) applyConfiguredAction(state, config.unlimitedApprovalAction, { rule: "Unlimited token approval", message: "The agent is granting unlimited or maximum token authority.", evidence: { tokenContract, spender, approvalAmount: permission.approvalAmount ?? permission.approvalAmountAtomic ?? "unlimited", intendedTransactionAmount: intendedAmount, network, deadline: deadlineRaw || null }, remediation: "Approve only the amount required for the intended transaction and use a short expiry where supported." });

  if (!unlimited && config.maxApprovalAmount > 0 && approvalAmount !== null && approvalAmount > config.maxApprovalAmount) applyModeViolation(state, config, { rule: "Maximum approval amount", message: "The token approval exceeds the maximum amount configured by policy.", evidence: { approvalAmount, maximum: config.maxApprovalAmount }, remediation: "Reduce the approval amount or obtain an authorized policy change." });
  else if (!unlimited && approvalAmount !== null && config.maxApprovalAmount > 0) pass(state, "Maximum approval amount", "The approval amount is within the policy maximum.", { approvalAmount, maximum: config.maxApprovalAmount });

  if (!unlimited && config.maxApprovalToTransactionRatio > 0 && ratio !== null && ratio > config.maxApprovalToTransactionRatio) applyModeViolation(state, config, { rule: "Approval-to-transaction ratio", message: "The requested allowance is far above the amount required for the intended transaction.", evidence: { approvalAmount, intendedTransactionAmount: intendedAmount, approvalRatio: ratio, maximumRatio: config.maxApprovalToTransactionRatio }, remediation: "Limit the allowance to the intended transaction amount or the configured bounded ratio." });
  else if (!unlimited && ratio !== null && config.maxApprovalToTransactionRatio > 0) pass(state, "Approval-to-transaction ratio", "The approval-to-transaction ratio is within policy bounds.", { approvalAmount, intendedTransactionAmount: intendedAmount, approvalRatio: ratio, maximumRatio: config.maxApprovalToTransactionRatio });
  else if (!unlimited) skip(state, "Approval-to-transaction ratio", "A ratio could not be enforced because the policy maximum or intended transaction amount is unavailable.", { approvalAmount, intendedTransactionAmount: intendedAmount });

  if (!deadlineRaw) {
    if (isPermit) applyModeViolation(state, config, { rule: "Token permission expiration", message: "The permit does not include a deadline.", evidence: { deadline: "", kind }, remediation: "Use a short explicit permit deadline." }, { hard: true });
    else if (config.requireExpiry) applyModeViolation(state, config, { rule: "Token permission expiration", message: "The active policy requires token-permission expiration metadata.", evidence: { deadline: "", kind }, remediation: "Use a short explicit expiration supported by the token standard." });
    else skip(state, "Token permission expiration", "No approval expiration was supplied; the policy does not require one.", {});
  } else if (!Number.isFinite(deadlineMs)) applyModeViolation(state, config, { rule: "Token permission expiration", message: "The approval or permit deadline is malformed.", evidence: { deadline: deadlineRaw }, remediation: "Use ISO-8601 or a Unix timestamp." }, { hard: true });
  else if (deadlineMs <= nowMs) applyModeViolation(state, config, { rule: "Expired token permission", message: "The approval or permit authorization is already expired.", evidence: { deadline: new Date(deadlineMs).toISOString() }, remediation: "Create a new short-lived authorization with a new nonce and identifier." }, { hard: true });
  else if (lifetimeSeconds > config.maxLifetimeSeconds) applyModeViolation(state, config, { rule: "Maximum token permission lifetime", message: "The approval or permit lifetime exceeds the active policy maximum.", evidence: { deadline: new Date(deadlineMs).toISOString(), lifetimeSeconds, maximumSeconds: config.maxLifetimeSeconds }, remediation: "Reduce the authorization lifetime." });
  else pass(state, "Token permission expiration", "The token permission is unexpired and within the policy lifetime.", { deadline: new Date(deadlineMs).toISOString(), lifetimeSeconds, maximumSeconds: config.maxLifetimeSeconds });

  if (isPermit && config.requireNonce && !nonce) applyModeViolation(state, config, { rule: "Permit nonce", message: "The active policy requires a permit nonce.", evidence: { nonce: "" }, remediation: "Include the exact nonce read from the token contract before signing." }, { hard: true });
  else if (isPermit && nonce && !SAFE_IDENTIFIER.test(nonce)) applyModeViolation(state, config, { rule: "Permit nonce", message: "The permit nonce contains unsupported characters or is too long.", evidence: { nonce }, remediation: "Use the token contract's nonce as a compact string or integer." }, { hard: true });
  else if (isPermit && nonce) pass(state, "Permit nonce", "A structurally valid permit nonce is bound to the authorization.", { nonce });
  else if (!isPermit) skip(state, "Permit nonce", "Nonce validation is not applicable to this non-permit action.", {});

  if (signatureHash && !HASH_32.test(signatureHash)) applyModeViolation(state, config, { rule: "Permit signature hash", message: "permitSignatureHash must be a SHA-256 or 32-byte hash, not raw signature material.", evidence: { permitSignatureHash: signatureHash }, remediation: "Hash the signed permit outside Magen3 and submit only the hash for replay detection." }, { hard: true });
  else if (signatureHash) pass(state, "Permit signature hash", "Only a non-sensitive permit signature hash was supplied for replay detection.", { permitSignatureHash: signatureHash });

  if (clientFingerprint && !HASH_32.test(clientFingerprint)) applyModeViolation(state, config, { rule: "Permit fingerprint", message: "The submitted permit fingerprint is malformed.", evidence: { provided: clientFingerprint, computed: fingerprint }, remediation: "Compute a SHA-256 fingerprint from the exact token, owner, spender, amount, network, nonce, and deadline fields." }, { hard: true });
  else if (clientFingerprint && clientFingerprint !== fingerprint) applyModeViolation(state, config, { rule: "Permit fingerprint", message: "The submitted permit fingerprint does not match Magen3's canonical token-permission fingerprint.", evidence: { provided: clientFingerprint, computed: fingerprint }, remediation: "Rebuild the permit from the unchanged approved parameters." }, { hard: true });
  else pass(state, "Canonical token permission fingerprint", "Magen3 computed a deterministic token-permission fingerprint for binding and replay checks.", { fingerprint, clientFingerprint: clientFingerprint || null });

  const previous = auditLogs.filter((log) => log.agentId === request.agentId).map((log) => ({ log, permission: permissionFromAudit(log) })).filter((item) => item.permission);
  const sameFingerprint = previous.filter(({ permission: item }) => lower(item.fingerprint || item.permitFingerprint) === fingerprint || buildTokenPermissionFingerprint(item) === fingerprint);
  const sameSignatureHash = signatureHash ? previous.filter(({ permission: item }) => normalizeHash(item.permitSignatureHash || item.signatureHash) === signatureHash) : [];
  const samePermitIdentifier = permitIdentifier ? previous.filter(({ permission: item }) => clean(item.permitIdentifier || item.permitId) === permitIdentifier) : [];

  if (isPermit && sameSignatureHash.length > 0) applyModeViolation(state, config, { rule: "Reused permit signature", message: "The permit signature hash has already been recorded for this agent.", evidence: { permitSignatureHash: signatureHash, previousAuditIds: sameSignatureHash.map(({ log }) => log.id) }, remediation: "Do not reuse a signed permit. Create a fresh permit with a new nonce and deadline." }, { hard: true });
  if (isPermit && sameFingerprint.length > 0) applyModeViolation(state, config, { rule: "Permit replay", message: "An equivalent permit authorization has already been evaluated by Magen3.", evidence: { fingerprint, previousAuditIds: sameFingerprint.map(({ log }) => log.id) }, remediation: "Use the existing authorization or create a new permit with a fresh nonce and identifier." }, { hard: true });
  else if (isPermit) pass(state, "Permit replay", "No previous audit record contains the same permit fingerprint.", { fingerprint });

  if (permitIdentifier && samePermitIdentifier.length > 0) {
    const changed = samePermitIdentifier.filter(({ permission: item }) => buildTokenPermissionFingerprint(item) !== fingerprint);
    if (changed.length > 0) applyModeViolation(state, config, { rule: "Changed permit parameters", message: "A reused permit identifier is bound to different token-permission parameters.", evidence: { permitIdentifier, previousAuditIds: changed.map(({ log }) => log.id), fingerprint }, remediation: "Never reuse a permit identifier after changing token, owner, spender, amount, network, nonce, or deadline." }, { hard: true });
    else if (!isPermit) applyModeViolation(state, config, { rule: "Reused permission identifier", message: "The token-permission identifier has already been used.", evidence: { permitIdentifier, previousAuditIds: samePermitIdentifier.map(({ log }) => log.id) }, remediation: "Use a unique identifier for each delegated authorization." }, { hard: true });
  }

  if (kind === "NFT Operator Approval" || permission.operatorApprovalForAll === true) {
    if (!config.allowNftOperatorApproval) applyModeViolation(state, config, { rule: "NFT operator approval", message: "The intent grants operator authority over all NFTs, but the active policy does not allow it.", evidence: { spender, operatorApprovalForAll: true }, remediation: "Use token-specific approval or require an explicitly authorized human review." });
    else pass(state, "NFT operator approval", "The policy explicitly allows NFT operator approval.", { spender });
  }

  if (kind === "Batch Approval" || batch.length > 0) {
    if (!config.allowBatchApproval) applyModeViolation(state, config, { rule: "Batch token approval", message: "The intent grants authority in a batch, but batch approvals are disabled by policy.", evidence: { batchSize: batch.length }, remediation: "Submit individual bounded approvals or explicitly authorize batch approvals." });
    if (batch.length === 0) applyModeViolation(state, config, { rule: "Batch token approval", message: "A Batch Approval intent must include at least one approval item.", evidence: { batchSize: 0 }, remediation: "Include each bounded token, spender, and amount in action.tokenPermission.batch." }, { hard: true });
    if (batch.length > config.maximumBatchSize) applyModeViolation(state, config, { rule: "Maximum token approval batch size", message: "The approval batch exceeds the policy maximum.", evidence: { batchSize: batch.length, maximum: config.maximumBatchSize }, remediation: "Reduce the batch size and review each spender independently." }, { hard: true });

    let batchAggregate = 0;
    const batchSpenders = new Set();
    batch.forEach((item, index) => {
      const itemNetwork = normalizeNetwork(item.network || network);
      const itemFamily = networkFamily(itemNetwork);
      const itemTokenContract = clean(item.tokenContract || tokenContract);
      const itemOwner = clean(item.owner || owner);
      const itemSpender = clean(item.spender);
      const itemToken = addressKind(itemTokenContract, itemFamily, true, clean(item.tokenIdentifierType || tokenIdentifierType));
      const itemOwnerIdentity = addressKind(itemOwner, itemFamily, false);
      const itemSpenderIdentity = addressKind(itemSpender, itemFamily, false, clean(item.spenderIdentifierType));
      const itemAmount = finiteNumber(item.approvalAmount, null);
      const itemUnlimited = isUnlimited(item);
      const itemEvidence = { index, network: itemNetwork, tokenContract: itemTokenContract, owner: itemOwner, spender: itemSpender, approvalAmount: item.approvalAmount ?? null, unlimited: itemUnlimited };

      if (!itemNetwork || itemNetwork !== network) applyModeViolation(state, config, { rule: "Batch item network binding", message: `Batch approval item ${index + 1} is not bound to the parent token-permission network.`, evidence: itemEvidence, remediation: "Use one exact network for the parent intent and every batch item." }, { hard: true });
      if (!itemToken.valid) applyModeViolation(state, config, { rule: "Batch token contract identity", message: `Batch approval item ${index + 1} has a malformed token contract.`, evidence: { ...itemEvidence, detectedKind: itemToken.kind }, remediation: "Provide a structurally valid token contract for every batch item." }, { hard: true });
      if (!itemOwnerIdentity.valid || lower(itemOwner) !== lower(owner)) applyModeViolation(state, config, { rule: "Batch token owner binding", message: `Batch approval item ${index + 1} is not bound to the parent execution wallet.`, evidence: { ...itemEvidence, detectedKind: itemOwnerIdentity.kind }, remediation: "Use the same exact token owner and execution wallet for the full batch." }, { hard: true });
      if (!itemSpenderIdentity.valid) applyModeViolation(state, config, { rule: "Batch spender identity", message: `Batch approval item ${index + 1} has a missing or malformed spender.`, evidence: { ...itemEvidence, detectedKind: itemSpenderIdentity.kind }, remediation: "Provide a valid spender for every batch item." }, { hard: true });
      else {
        const normalizedItemSpender = lower(itemSpender);
        batchSpenders.add(normalizedItemSpender);
        if (normalizedItemSpender === lower(owner)) applyModeViolation(state, config, { rule: "Batch owner-spender separation", message: `Batch approval item ${index + 1} grants authority back to the token owner.`, evidence: itemEvidence, remediation: "Confirm the intended protocol spender." });
        if (config.blockedSpenders.includes(normalizedItemSpender) || config.blockedContracts.includes(normalizedItemSpender)) applyConfiguredAction(state, "Block", { rule: "Blocked batch spender", message: `Batch approval item ${index + 1} targets a blocked spender.`, evidence: itemEvidence, remediation: "Remove the blocked spender from the batch." });
        else if (!(config.approvedSpenders.includes(normalizedItemSpender) || config.trustedContracts.includes(normalizedItemSpender))) applyConfiguredAction(state, config.unknownSpenderAction, { rule: "Unknown batch spender", message: `Batch approval item ${index + 1} targets a spender not approved by policy.`, evidence: itemEvidence, remediation: "Verify and approve the spender independently or remove it from the batch." });
      }
      if (!itemUnlimited && (itemAmount === null || itemAmount <= 0)) applyModeViolation(state, config, { rule: "Batch approval amount", message: `Batch approval item ${index + 1} must have a positive finite amount.`, evidence: itemEvidence, remediation: "Use a positive bounded amount for every batch item." }, { hard: true });
      if (itemUnlimited) applyConfiguredAction(state, config.unlimitedApprovalAction, { rule: "Unlimited batch approval", message: `Batch approval item ${index + 1} grants unlimited token authority.`, evidence: itemEvidence, remediation: "Replace the item with a bounded amount." });
      if (!itemUnlimited && itemAmount !== null) {
        batchAggregate += Math.max(0, itemAmount);
        if (config.maxApprovalAmount > 0 && itemAmount > config.maxApprovalAmount) applyModeViolation(state, config, { rule: "Maximum batch item amount", message: `Batch approval item ${index + 1} exceeds the policy maximum.`, evidence: { ...itemEvidence, maximum: config.maxApprovalAmount }, remediation: "Reduce the item allowance." });
      }
    });

    if (batchSpenders.size > 1) applyModeViolation(state, config, { rule: "Multiple batch spenders", message: "The batch grants delegated authority to multiple distinct spenders.", evidence: { batchSize: batch.length, distinctSpenders: batchSpenders.size, spenders: [...batchSpenders] }, remediation: "Prefer separate, independently reviewable approvals for each spender." });
    if (config.maxApprovalAmount > 0 && batchAggregate > config.maxApprovalAmount) applyModeViolation(state, config, { rule: "Batch aggregate approval amount", message: "The aggregate approval amount across the batch exceeds policy.", evidence: { batchAggregate, maximum: config.maxApprovalAmount, batchSize: batch.length }, remediation: "Reduce the batch amounts or split the approvals into independently reviewed intents." });
    else if (batch.length > 0) pass(state, "Batch aggregate approval amount", "The batch aggregate is within the configured maximum.", { batchAggregate, maximum: config.maxApprovalAmount || null, batchSize: batch.length });
  }

  if (config.requireAllowanceReset && !resetKind && permission.resetAfterUse !== true && permission.oneTime !== true) applyModeViolation(state, config, { rule: "Allowance reset after use", message: "The policy requires a one-time authorization or an explicit allowance-reset plan after use.", evidence: { resetAfterUse: permission.resetAfterUse === true, oneTime: permission.oneTime === true, reusable: permission.reusable === true }, remediation: "Use a one-time permit or set resetAfterUse and submit a zero-allowance reset after execution." });
  else if (config.requireAllowanceReset && !resetKind) pass(state, "Allowance reset after use", "The intent declares one-time authority or a post-use allowance reset.", { resetAfterUse: permission.resetAfterUse === true, oneTime: permission.oneTime === true });

  if (permission.reusable === true && (!deadlineRaw || lifetimeSeconds === null || lifetimeSeconds > Math.min(config.maxLifetimeSeconds, 86_400))) applyModeViolation(state, config, { rule: "Long-lived reusable authority", message: "The intent grants reusable delegated authority without a sufficiently short lifetime.", evidence: { reusable: true, deadline: deadlineRaw || null, lifetimeSeconds }, remediation: "Prefer one-time authority or a short-lived reusable permit." });

  return {
    ...state,
    applicable: true,
    context: {
      status: state.hardBlock ? "failed" : state.needsReview ? "review" : state.findings.some((item) => ["warning", "unavailable"].includes(item.status)) ? "observed" : "passed",
      availability: "foundation-available",
      enabled: config.enabled,
      mode: config.mode,
      kind,
      standard: standard || "unknown",
      network,
      networkFamily: family,
      chainId: chainId || networkChainReference || "",
      tokenContract,
      tokenContractKind: token.kind,
      owner,
      spender,
      intendedSpender,
      approvalAmount,
      intendedTransactionAmount: intendedAmount,
      approvalRatio: ratio,
      unlimited,
      deadline: Number.isFinite(deadlineMs) ? new Date(deadlineMs).toISOString() : deadlineRaw,
      lifetimeSeconds,
      nonce,
      permitIdentifier,
      permitSignatureHash: signatureHash,
      fingerprint,
      clientFingerprint,
      batchSize: batch.length,
      resetAfterUse: permission.resetAfterUse === true,
      oneTime: permission.oneTime === true,
      reusable: permission.reusable === true,
      previousFingerprintCount: sameFingerprint.length,
      previousSignatureHashCount: sameSignatureHash.length,
      humanApprovalBinding: "The full normalized token-permission object is stored inside originalIntent and therefore included in the exact Human Approval binding hash when review is required.",
      securityBoundary: "Magen3 evaluates declared unsigned approval metadata and optional hashes. It does not receive raw permit signatures or independently query on-chain allowance state in this foundation release.",
    },
  };
}
