import { createHash } from "node:crypto";
import { verifyCasperWalletMessageSignature } from "./approvalSignatures.mjs";

export const DELEGATION_ATTESTATION_DOMAIN = "magen3.delegation.v1";
export const DEFAULT_DELEGATION_CHAIN_NAME = "casper-test";

const CASPER_KEY = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function unique(value) { return [...new Set(array(value).map(clean).filter(Boolean))]; }
function bool(value) { return value === true || lower(value) === "true"; }
function finite(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function integer(value) {
  const parsed = finite(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
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
function sha256Hex(value) { return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex"); }
function canonicalList(value) { return unique(value).map((item) => item.toLowerCase()).sort(); }
function parseTime(value) {
  const text = clean(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}
function same(left, right) { return lower(left) === lower(right); }
function includesCaseInsensitive(values, received) { return values.some((item) => same(item, received)); }
function formatNumber(value) { return value === null || value === undefined || value === "" ? "" : String(Number(value)); }
function normalizeTokenLimits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([asset, limit]) => [clean(asset), finite(limit)])
    .filter(([asset, limit]) => asset && limit !== null && limit >= 0)
    .sort(([left], [right]) => left.localeCompare(right)));
}
function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.delegationControlsEnabled === true,
    mode: normalizeMode(rules.delegationMode),
    requireExpiringDelegation: rules.requireExpiringDelegation !== false,
    maximumDelegationLifetime: Math.max(60, integer(rules.maximumDelegationLifetime) ?? 86400),
    maximumDelegationDepth: Math.max(0, integer(rules.maximumDelegationDepth) ?? 1),
    allowRedelegation: rules.allowRedelegation === true,
    approvedDelegates: unique(rules.approvedDelegates),
    blockedDelegates: unique(rules.blockedDelegates),
    revokedDelegationIds: unique(rules.revokedDelegationIds),
    unknownDelegateAction: normalizeAction(rules.unknownDelegateAction, "Review"),
    requireScopeBinding: rules.requireScopeBinding !== false,
    requireCryptographicDelegationAttestation: rules.requireCryptographicDelegationAttestation !== false,
    delegationUnavailableAction: normalizeAction(rules.delegationUnavailableAction, "Review"),
  };
}
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Delegation & Session Key Safety", status, severity, rule, message, evidence, remediation };
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
  return policyViolation(state, config, config.delegationUnavailableAction, rule, message, evidence, remediation, "high");
}

export function buildDelegationAttestationMessage(input = {}) {
  const tokenLimits = normalizeTokenLimits(input.tokenAmountLimits);
  const fields = [
    "Magen3 Delegated Permission Attestation",
    "Version: 1",
    `Domain: ${clean(input.domain || DELEGATION_ATTESTATION_DOMAIN)}`,
    `Chain: ${clean(input.chainName || DEFAULT_DELEGATION_CHAIN_NAME)}`,
    `Delegation ID: ${clean(input.delegationId)}`,
    `Agent ID: ${clean(input.agentId)}`,
    `Delegating Wallet: ${clean(input.delegatingWallet)}`,
    `Delegate: ${clean(input.delegate)}`,
    `Session Key: ${clean(input.sessionKey)}`,
    `Allowed Networks: ${canonicalList(input.allowedNetworks).join(",")}`,
    `Allowed Contracts: ${canonicalList(input.allowedContracts).join(",")}`,
    `Allowed Methods: ${canonicalList(input.allowedMethods).join(",")}`,
    `Allowed Assets: ${canonicalList(input.allowedAssets).join(",")}`,
    `Native Amount Limit: ${formatNumber(input.nativeAmountLimit)}`,
    `Token Amount Limits: ${Object.entries(tokenLimits).map(([asset, limit]) => `${asset.toLowerCase()}=${limit}`).join(",")}`,
    `Max Transaction Amount: ${formatNumber(input.maxTransactionAmount)}`,
    `Max Frequency: ${input.maxFrequency === null || input.maxFrequency === undefined || input.maxFrequency === "" ? "" : String(Number(input.maxFrequency))}`,
    `Valid From: ${clean(input.validFrom)}`,
    `Expires At: ${clean(input.expiresAt)}`,
    `Revocation Status: ${clean(input.revocationStatus || "Active")}`,
    `Delegation Depth: ${input.delegationDepth === null || input.delegationDepth === undefined || input.delegationDepth === "" ? "0" : String(Number(input.delegationDepth))}`,
    `Redelegation Allowed: ${bool(input.redelegationAllowed) ? "true" : "false"}`,
    `Nonce: ${clean(input.nonce)}`,
    "",
    "Signing this message authorizes only the bounded delegation above. It does not sign or submit a blockchain transaction.",
  ];
  return fields.join("\n");
}

export function buildDelegationAttestationHash(input = {}) {
  return sha256Hex(buildDelegationAttestationMessage(input));
}

function matchingHistoricalUses(auditLogs, request, delegationId, nowMs) {
  const since = nowMs - 60 * 60 * 1000;
  return array(auditLogs).filter((log) => {
    if (clean(log.agentId) !== clean(request.agentId)) return false;
    if (!["Allowed", "Review Required"].includes(clean(log.decision))) return false;
    const timestamp = Date.parse(log.timestamp || log.createdAt || 0);
    if (!Number.isFinite(timestamp) || timestamp < since || timestamp > nowMs) return false;
    return clean(log.originalIntent?.delegation?.delegationId) === clean(delegationId);
  }).length;
}

export function evaluateDelegationSafety({ request = {}, policy = {}, agent = {}, auditLogs = [], now = new Date() } = {}) {
  const config = settings(policy);
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, violations: [], context: null };
  const metadataSupplied = request.delegationMetadataSupplied === true;

  if (!config.enabled) {
    add(state, "skipped", "Delegation safety configuration", "Delegation & Session Key Safety is disabled for the active policy.");
    return state;
  }
  if (!metadataSupplied) {
    add(state, "skipped", "Delegation applicability", "No delegated permission or session-key metadata was supplied for this request.");
    state.context = { enabled: true, mode: config.mode, metadataSupplied: false, applicable: false };
    return state;
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const delegationId = clean(request.delegationId);
  const delegatingWallet = clean(request.delegationDelegatingWallet);
  const delegate = clean(request.delegationDelegate);
  const sessionKey = clean(request.delegationSessionKey);
  const allowedNetworks = unique(request.delegationAllowedNetworks);
  const allowedContracts = unique(request.delegationAllowedContracts);
  const allowedMethods = unique(request.delegationAllowedMethods);
  const allowedAssets = unique(request.delegationAllowedAssets);
  const nativeAmountLimit = finite(request.delegationNativeAmountLimit);
  const tokenAmountLimits = normalizeTokenLimits(request.delegationTokenAmountLimits);
  const maxTransactionAmount = finite(request.delegationMaxTransactionAmount);
  const maxFrequency = integer(request.delegationMaxFrequency);
  const validFrom = clean(request.delegationValidFrom);
  const expiresAt = clean(request.delegationExpiresAt);
  const revocationStatus = clean(request.delegationRevocationStatus || "Active");
  const delegationDepth = integer(request.delegationDepth) ?? 0;
  const redelegationAllowed = bool(request.delegationRedelegationAllowed);
  const nonce = clean(request.delegationNonce);
  const chainName = clean(request.delegationChainName || request.chainName || DEFAULT_DELEGATION_CHAIN_NAME);
  const suppliedHash = lower(request.delegationAttestationHash);
  const signatureHex = clean(request.delegationAttestationSignature);
  const attestation = {
    domain: DELEGATION_ATTESTATION_DOMAIN,
    chainName,
    delegationId,
    agentId: clean(request.agentId),
    delegatingWallet,
    delegate,
    sessionKey,
    allowedNetworks,
    allowedContracts,
    allowedMethods,
    allowedAssets,
    nativeAmountLimit,
    tokenAmountLimits,
    maxTransactionAmount,
    maxFrequency,
    validFrom,
    expiresAt,
    revocationStatus,
    delegationDepth,
    redelegationAllowed,
    nonce,
  };
  const message = buildDelegationAttestationMessage(attestation);
  const attestationHash = sha256Hex(message);
  const malformed = [];
  if (!delegationId || !ID.test(delegationId)) malformed.push("delegationId");
  if (!CASPER_KEY.test(delegatingWallet)) malformed.push("delegatingWallet");
  if (!delegate || !ID.test(delegate)) malformed.push("delegate");
  if (sessionKey && !CASPER_KEY.test(sessionKey)) malformed.push("sessionKey");
  if (!nonce || !ID.test(nonce)) malformed.push("nonce");
  if (allowedNetworks.some((item) => !ID.test(item))) malformed.push("allowedNetworks");
  if (allowedContracts.some((item) => item.length > 255)) malformed.push("allowedContracts");
  if (allowedMethods.some((item) => !ID.test(item))) malformed.push("allowedMethods");
  if (allowedAssets.some((item) => !ID.test(item))) malformed.push("allowedAssets");
  if (nativeAmountLimit !== null && nativeAmountLimit < 0) malformed.push("nativeAmountLimit");
  if (maxTransactionAmount !== null && maxTransactionAmount < 0) malformed.push("maxTransactionAmount");
  if (maxFrequency !== null && maxFrequency < 1) malformed.push("maxFrequency");
  if (delegationDepth < 0) malformed.push("delegationDepth");
  if (validFrom && parseTime(validFrom) === null) malformed.push("validFrom");
  if (expiresAt && parseTime(expiresAt) === null) malformed.push("expiresAt");
  if (suppliedHash && !/^[0-9a-f]{64}$/i.test(suppliedHash)) malformed.push("attestationHash");
  if (malformed.length > 0) {
    hardFail(state, "Valid delegation metadata", "Delegation or session-key metadata is malformed.", { malformedFields: malformed, delegationId }, "Regenerate the delegation from a trusted wallet adapter and bind every field before retrying.", "critical");
  } else {
    add(state, "pass", "Valid delegation metadata", "Delegation metadata is structurally valid.", { delegationId, delegate, sessionKeyPresent: Boolean(sessionKey) });
  }

  if (suppliedHash && suppliedHash !== attestationHash) {
    hardFail(state, "Delegation attestation binding", "The supplied delegation attestation hash does not match the normalized delegation fields.", { suppliedHash, computedHash: attestationHash }, "Recreate and re-sign the attestation for the exact delegation parameters.", "critical");
  } else {
    add(state, "pass", "Delegation attestation binding", "The delegation attestation is bound to the exact normalized delegation fields.", { attestationHash });
  }

  let verification = null;
  if (config.requireCryptographicDelegationAttestation) {
    if (!signatureHex || !CASPER_KEY.test(delegatingWallet)) {
      unavailable(state, config, "Cryptographic delegation attestation", "A valid Casper Wallet delegation signature is required but was not supplied.", { signaturePresent: Boolean(signatureHex), delegatingWallet }, "Sign the canonical Magen3 delegation attestation with the delegating Casper wallet before retrying.");
    } else {
      try {
        verification = verifyCasperWalletMessageSignature({ walletAddress: delegatingWallet, message, signatureHex });
        if (!verification.valid) {
          hardFail(state, "Cryptographic delegation attestation", "The Casper Wallet delegation signature could not be verified.", { delegatingWallet, attestationHash }, "Use the delegating wallet to sign the exact canonical attestation.", "critical");
        } else {
          add(state, "pass", "Cryptographic delegation attestation", "The delegation was cryptographically signed by the declared Casper wallet.", { delegatingWallet, signatureAlgorithm: verification.algorithm, signatureHash: verification.signatureHash, attestationHash });
        }
      } catch (error) {
        hardFail(state, "Cryptographic delegation attestation", "The Casper Wallet delegation signature is malformed or invalid.", { delegatingWallet, error: clean(error?.message) }, "Regenerate the signed attestation using a supported Casper Ed25519 or Secp256k1 wallet.", "critical");
      }
    }
  }

  const executionWallet = clean(request.executionWalletAddress || request.walletAddress);
  if (executionWallet && delegatingWallet && !same(executionWallet, delegatingWallet)) {
    hardFail(state, "Delegating wallet binding", "The request execution wallet does not match the wallet that granted delegation.", { executionWallet, delegatingWallet }, "Use the exact delegating execution wallet or issue a new bounded delegation.", "critical");
  } else if (delegatingWallet) {
    add(state, "pass", "Delegating wallet binding", "The delegated authority is bound to the configured execution wallet.", { delegatingWallet });
  }

  if (config.blockedDelegates.some((item) => same(item, delegate))) {
    hardFail(state, "Blocked delegate", "The delegate or session-key identity is blocked by policy.", { delegate }, "Revoke this delegation and use an approved delegate.", "critical");
  }
  if (config.approvedDelegates.length > 0 && !config.approvedDelegates.some((item) => same(item, delegate))) {
    policyViolation(state, config, config.unknownDelegateAction, "Approved delegate", "The delegate is not on the active policy allowlist.", { delegate, approvedDelegates: config.approvedDelegates }, "Authorize the delegate explicitly or obtain policy review before retrying.", "high");
  } else if (delegate) {
    add(state, "pass", "Approved delegate", config.approvedDelegates.length > 0 ? "The delegate is approved by policy." : "No delegate allowlist is configured.", { delegate });
  }

  if (config.revokedDelegationIds.some((item) => same(item, delegationId)) || ["revoked", "inactive", "cancelled", "canceled"].includes(lower(revocationStatus))) {
    hardFail(state, "Delegation revocation", "The delegated authority has been revoked or marked inactive.", { delegationId, revocationStatus }, "Issue a new delegation after confirming the prior authority is revoked.", "critical");
  } else {
    add(state, "pass", "Delegation revocation", "No policy or request evidence marks this delegation as revoked.", { delegationId, revocationStatus });
  }

  const validFromMs = parseTime(validFrom);
  const expiresAtMs = parseTime(expiresAt);
  if (validFromMs !== null && validFromMs > nowMs) {
    hardFail(state, "Delegation validity period", "The delegation is not active yet.", { validFrom, now: nowDate.toISOString() }, "Wait until the valid-from time or issue a corrected delegation.", "high");
  }
  if (expiresAtMs !== null && expiresAtMs <= nowMs) {
    hardFail(state, "Delegation expiration", "The delegation or session key has expired.", { expiresAt, now: nowDate.toISOString() }, "Issue a new short-lived delegation before retrying.", "critical");
  }
  if (config.requireExpiringDelegation && expiresAtMs === null) {
    policyViolation(state, config, "", "Expiring delegation", "Policy requires delegated authority to have an expiration time.", { delegationId }, "Add a bounded expiresAt value and re-sign the delegation.", "high");
  }
  if (expiresAtMs !== null) {
    const startMs = validFromMs ?? nowMs;
    const lifetimeSeconds = Math.max(0, Math.floor((expiresAtMs - startMs) / 1000));
    if (lifetimeSeconds > config.maximumDelegationLifetime) {
      policyViolation(state, config, "", "Delegation lifetime", "The delegated authority exceeds the maximum permitted lifetime.", { lifetimeSeconds, maximumDelegationLifetime: config.maximumDelegationLifetime }, "Issue a shorter-lived delegation.", "high");
    } else if (expiresAtMs > nowMs) {
      add(state, "pass", "Delegation lifetime", "The delegation lifetime is within policy limits.", { lifetimeSeconds, maximumDelegationLifetime: config.maximumDelegationLifetime, expiresAt });
    }
  }

  if (delegationDepth > config.maximumDelegationDepth) {
    hardFail(state, "Delegation depth", "Delegation depth exceeds the maximum policy scope.", { delegationDepth, maximumDelegationDepth: config.maximumDelegationDepth }, "Use a directly authorized delegate or reduce the delegation chain.", "critical");
  } else {
    add(state, "pass", "Delegation depth", "Delegation depth is within policy limits.", { delegationDepth, maximumDelegationDepth: config.maximumDelegationDepth });
  }
  if (redelegationAllowed && !config.allowRedelegation) {
    hardFail(state, "Redelegation restriction", "The delegation permits redelegation but policy forbids it.", { redelegationAllowed, allowRedelegation: config.allowRedelegation }, "Disable redelegation and re-sign the bounded authority.", "critical");
  }

  const requestedNetwork = clean(request.chainName || request.tokenPermissionNetwork || request.bridgeSourceChain || request.x402Network);
  const targetType = lower(request.targetType);
  const targetIsContract = targetType.includes("contract") || targetType.includes("package");
  const requestedContract = clean(
    (request.contractUpgradeMetadataSupplied ? request.contractUpgradeContract : "")
      || (request.privilegedActionMetadataSupplied ? request.privilegedActionContract : "")
      || (request.tokenPermissionMetadataSupplied ? request.tokenPermissionTokenContract : "")
      || (targetIsContract ? request.target : ""),
  );
  const requestedMethod = clean(request.entryPoint || request.privilegedActionMethodSignature || request.actionType);
  const requestedAsset = clean(request.asset || request.tokenPermissionTokenContract || request.x402Asset);
  const amount = finite(request.amount) ?? 0;
  const scopeMissing = [];
  if (config.requireScopeBinding) {
    if (requestedNetwork && allowedNetworks.length === 0) scopeMissing.push("allowedNetworks");
    if (requestedContract && allowedContracts.length === 0) scopeMissing.push("allowedContracts");
    if (requestedMethod && allowedMethods.length === 0) scopeMissing.push("allowedMethods");
    if (requestedAsset && allowedAssets.length === 0) scopeMissing.push("allowedAssets");
  }
  if (scopeMissing.length > 0) {
    policyViolation(state, config, "", "Delegation scope binding", "Required delegated-permission scopes are missing.", { missingScopes: scopeMissing }, "Bind every requested network, contract, method, and asset to the signed delegation.", "high");
  }
  const scopeChecks = [
    ["Delegated network scope", requestedNetwork, allowedNetworks],
    ["Delegated contract scope", requestedContract, allowedContracts],
    ["Delegated method scope", requestedMethod, allowedMethods],
    ["Delegated asset scope", requestedAsset, allowedAssets],
  ];
  for (const [rule, requested, allowed] of scopeChecks) {
    if (requested && allowed.length > 0 && !includesCaseInsensitive(allowed, requested)) {
      hardFail(state, rule, `${requested} is outside the signed delegation scope.`, { requested, allowed }, "Issue a new delegation whose exact scope includes this request.", "critical");
    } else if (requested && allowed.length > 0) {
      add(state, "pass", rule, `${requested} is inside the signed delegation scope.`, { requested, allowed });
    }
  }

  if (maxTransactionAmount !== null && amount > maxTransactionAmount) {
    hardFail(state, "Delegated transaction amount", "The requested amount exceeds the delegation transaction limit.", { amount, maxTransactionAmount }, "Reduce the amount or issue a separately approved delegation.", "critical");
  }
  if (nativeAmountLimit !== null && amount > nativeAmountLimit && !requestedAsset) {
    hardFail(state, "Delegated native amount", "The requested native-asset amount exceeds the delegated limit.", { amount, nativeAmountLimit }, "Reduce the amount or issue a new delegation with an authorized limit.", "critical");
  }
  if (requestedAsset && Object.keys(tokenAmountLimits).length > 0) {
    const entry = Object.entries(tokenAmountLimits).find(([asset]) => same(asset, requestedAsset));
    if (entry && amount > entry[1]) {
      hardFail(state, "Delegated token amount", "The requested token amount exceeds the delegated asset limit.", { asset: requestedAsset, amount, tokenAmountLimit: entry[1] }, "Reduce the amount or issue a new asset-specific delegation.", "critical");
    }
  }

  const usedLastHour = matchingHistoricalUses(auditLogs, request, delegationId, nowMs);
  if (maxFrequency !== null && usedLastHour >= maxFrequency) {
    hardFail(state, "Delegated frequency limit", "The delegation has reached its maximum hourly execution frequency.", { delegationId, usedLastHour, maxFrequency }, "Wait for the rolling window to clear or issue a separately authorized delegation.", "high");
  } else if (maxFrequency !== null) {
    add(state, "pass", "Delegated frequency limit", "The delegation remains within its rolling hourly frequency limit.", { usedLastHour, maxFrequency });
  }

  state.context = {
    enabled: true,
    mode: config.mode,
    metadataSupplied: true,
    applicable: true,
    delegationId,
    delegatingWallet,
    delegate,
    sessionKey,
    chainName,
    attestationHash,
    signatureVerified: verification?.valid === true,
    signatureHash: verification?.signatureHash || "",
    signatureAlgorithm: verification?.algorithm || "",
    allowedNetworks,
    allowedContracts,
    allowedMethods,
    allowedAssets,
    nativeAmountLimit,
    tokenAmountLimits,
    maxTransactionAmount,
    maxFrequency,
    validFrom,
    expiresAt,
    revocationStatus,
    delegationDepth,
    redelegationAllowed,
    usedLastHour,
    violations: state.violations,
  };
  return state;
}
