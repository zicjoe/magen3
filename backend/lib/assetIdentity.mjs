import { createHash } from "node:crypto";

const SCHEMA_VERSION = "magen3.asset-identity.v1";
const NATIVE_BY_NETWORK = new Map([
  ["casper", { symbol: "CSPR", decimals: 9, family: "CASPER" }],
  ["casper-test", { symbol: "CSPR", decimals: 9, family: "CASPER" }],
  ["casper-testnet", { symbol: "CSPR", decimals: 9, family: "CASPER" }],
  ["casper-mainnet", { symbol: "CSPR", decimals: 9, family: "CASPER" }],
  ["ethereum", { symbol: "ETH", decimals: 18, family: "EVM" }],
  ["ethereum-mainnet", { symbol: "ETH", decimals: 18, family: "EVM" }],
  ["base", { symbol: "ETH", decimals: 18, family: "EVM" }],
  ["base-sepolia", { symbol: "ETH", decimals: 18, family: "EVM" }],
  ["bnb", { symbol: "BNB", decimals: 18, family: "EVM" }],
  ["bsc", { symbol: "BNB", decimals: 18, family: "EVM" }],
  ["solana", { symbol: "SOL", decimals: 9, family: "SOLANA" }],
  ["solana-devnet", { symbol: "SOL", decimals: 9, family: "SOLANA" }],
]);

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function integer(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isInteger(n) && n >= 0 && n <= 255 ? n : null; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Asset & Token Identity", control: "Canonical asset identity", status, severity, rule, message, evidence, remediation };
}

export function normalizeChainFamily(value = "", network = "") {
  const explicit = clean(value).toUpperCase();
  if (explicit) return explicit;
  const known = NATIVE_BY_NETWORK.get(lower(network));
  return known?.family || "UNKNOWN";
}

export function canonicalAssetReference(input = {}) {
  const network = clean(input.network || input.executionNetwork || input.chainName);
  const chainFamily = normalizeChainFamily(input.chainFamily, network);
  const chainId = clean(input.chainId || input.networkId);
  const contractAddress = clean(input.contractAddress || input.assetContractAddress || input.tokenAddress || input.mintAddress || input.assetId);
  const declaredType = lower(input.assetType || input.tokenType);
  const nativeKnown = NATIVE_BY_NETWORK.get(lower(network));
  const symbol = clean(input.symbol || input.asset || input.tokenSymbol || input.currency).toUpperCase();
  const isNative = declaredType === "native" || (!contractAddress && nativeKnown && (!symbol || symbol === nativeKnown.symbol));
  const assetType = isNative ? "native" : declaredType || (contractAddress ? "fungible_token" : "unknown");
  const identifier = isNative ? "native" : lower(contractAddress);
  const decimals = integer(input.decimals ?? input.assetDecimals ?? input.tokenDecimals ?? (isNative ? nativeKnown?.decimals : null));
  const standard = clean(input.standard || input.tokenStandard).toUpperCase();
  const canonicalId = `${chainFamily.toLowerCase()}:${lower(chainId || network || "unknown")}:${assetType}:${identifier || "unresolved"}`;
  return {
    schemaVersion: SCHEMA_VERSION,
    canonicalId,
    chainFamily,
    network,
    chainId,
    assetType,
    identifier,
    contractAddress: isNative ? "" : contractAddress,
    standard,
    symbol,
    name: clean(input.name || input.assetName || input.tokenName),
    decimals,
    native: isNative,
    resolved: Boolean((network || chainId) && (isNative || contractAddress)),
    metadata: {
      source: clean(input.metadataSource || input.assetMetadataSource || input.tokenMetadataSource),
      provenance: clean(input.metadataProvenance || input.assetMetadataProvenance),
      verified: input.metadataVerified === true || input.assetVerified === true,
      confidence: clean(input.metadataConfidence || input.assetResolutionConfidence || "unknown"),
    },
  };
}

function policySettings(policy = {}) {
  const rules = object(policy.structuredRules);
  const config = object(rules.assetIdentity);
  return {
    required: config.required === true || rules.assetIdentityRequired === true,
    unresolvedAction: clean(config.unresolvedAction || rules.assetIdentityUnresolvedAction || ((config.required === true || rules.assetIdentityRequired === true) ? "review" : "warn")).toLowerCase(),
    metadataConflictAction: clean(config.metadataConflictAction || "review").toLowerCase(),
    requireVerifiedMetadata: config.requireVerifiedMetadata === true,
    allowedCanonicalIds: Array.isArray(config.allowedCanonicalIds) ? config.allowedCanonicalIds.map(clean).filter(Boolean) : [],
    blockedCanonicalIds: Array.isArray(config.blockedCanonicalIds) ? config.blockedCanonicalIds.map(clean).filter(Boolean) : [],
    registry: object(config.registry),
  };
}

function applyFallback(state, action, message) {
  if (action === "block") { state.hardBlock = true; state.scoreDelta += 45; }
  else if (action !== "allow" && action !== "warn") { state.needsReview = true; state.scoreDelta += 25; }
  state.checksFailed.push(message);
}

export function evaluateAssetIdentity({ request = {}, policy = {} } = {}) {
  const config = policySettings(policy);
  const supplied = object(request.assetIdentity || request.assetIdentityEvidence);
  const reference = canonicalAssetReference({ ...request, ...supplied });
  const state = { hardBlock: false, needsReview: false, scoreDelta: 0, findings: [], checksPassed: [], checksFailed: [], context: { ...reference, policy: config } };
  const registryRecord = object(config.registry[reference.canonicalId]);
  const declaredSymbol = reference.symbol;
  const registrySymbol = clean(registryRecord.symbol).toUpperCase();
  const registryDecimals = integer(registryRecord.decimals);
  const conflicts = [];
  if (registrySymbol && declaredSymbol && registrySymbol !== declaredSymbol) conflicts.push({ field: "symbol", expected: registrySymbol, observed: declaredSymbol });
  if (registryDecimals !== null && reference.decimals !== null && registryDecimals !== reference.decimals) conflicts.push({ field: "decimals", expected: registryDecimals, observed: reference.decimals });
  state.context.registryMatched = Boolean(Object.keys(registryRecord).length);
  state.context.metadataConflicts = conflicts;
  state.context.identityHash = hash({ canonicalId: reference.canonicalId, symbol: reference.symbol, decimals: reference.decimals, standard: reference.standard });

  if (!reference.resolved) {
    const message = "Magen3 could not resolve the asset to a chain-aware canonical identity.";
    state.findings.push(finding({ status: config.required ? "fail" : "warning", severity: "high", rule: "Canonical asset resolution", message, evidence: { network: reference.network, chainFamily: reference.chainFamily, symbol: reference.symbol, identifier: reference.identifier }, remediation: "Provide the execution network and the exact contract, mint, or native-asset reference. Do not rely on a symbol alone." }));
    applyFallback(state, config.unresolvedAction, message);
    return state;
  }
  if (config.blockedCanonicalIds.includes(reference.canonicalId)) {
    const message = `The canonical asset identity is blocked by policy: ${reference.canonicalId}`;
    state.hardBlock = true; state.scoreDelta += 55; state.checksFailed.push(message);
    state.findings.push(finding({ status: "fail", severity: "critical", rule: "Blocked canonical asset", message, evidence: { canonicalId: reference.canonicalId }, remediation: "Use an asset permitted by the active policy." }));
    return state;
  }
  if (config.allowedCanonicalIds.length && !config.allowedCanonicalIds.includes(reference.canonicalId)) {
    const message = "The resolved canonical asset is not on the policy allowlist.";
    state.hardBlock = true; state.scoreDelta += 50; state.checksFailed.push(message);
    state.findings.push(finding({ status: "fail", severity: "critical", rule: "Allowed canonical assets", message, evidence: { canonicalId: reference.canonicalId, allowedCanonicalIds: config.allowedCanonicalIds }, remediation: "Use an allowlisted canonical asset identity or update the policy through an authorized administrator." }));
    return state;
  }
  if (conflicts.length) {
    const message = `Asset metadata conflicts with the configured registry for ${conflicts.map((item) => item.field).join(", ")}.`;
    state.findings.push(finding({ status: "warning", severity: "high", rule: "Asset metadata consistency", message, evidence: { canonicalId: reference.canonicalId, conflicts }, remediation: "Refresh metadata from the approved source and rebuild the intent using contract-address identity rather than display metadata." }));
    applyFallback(state, config.metadataConflictAction, message);
  }
  if (config.requireVerifiedMetadata && !reference.metadata.verified && !registryRecord.verified) {
    const message = "The policy requires verified asset metadata, but verified provenance was not supplied.";
    state.needsReview = true; state.scoreDelta += 20; state.checksFailed.push(message);
    state.findings.push(finding({ status: "warning", severity: "high", rule: "Verified asset metadata", message, evidence: { canonicalId: reference.canonicalId, metadata: reference.metadata }, remediation: "Resolve metadata through an approved registry or provider and include its provenance." }));
  }
  if (!state.hardBlock && !state.needsReview && !conflicts.length) {
    const message = `Canonical asset identity resolved: ${reference.canonicalId}`;
    state.checksPassed.push(message);
    state.findings.push(finding({ status: "pass", rule: "Canonical asset resolution", message, evidence: { canonicalId: reference.canonicalId, assetType: reference.assetType, symbol: reference.symbol, decimals: reference.decimals, metadata: reference.metadata } }));
  }
  return state;
}

export function attachCanonicalAssetIdentity(request = {}) {
  const reference = canonicalAssetReference(request);
  return { ...request, assetIdentity: reference, assetCanonicalId: reference.canonicalId };
}
