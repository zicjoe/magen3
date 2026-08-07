const NATIVE_ASSETS = new Map([
  ["casper", "CSPR"], ["casper-test", "CSPR"], ["casper-testnet", "CSPR"], ["casper-mainnet", "CSPR"],
  ["ethereum", "ETH"], ["ethereum-mainnet", "ETH"], ["base", "ETH"], ["base-sepolia", "ETH"],
  ["solana", "SOL"], ["solana-devnet", "SOL"], ["bnb", "BNB"], ["bnb-chain", "BNB"], ["bsc", "BNB"],
]);

const TERMINAL_FAILED = new Set(["failed", "reverted", "dropped", "cancelled", "refunded"]);
const EXPOSURE_STATES = new Set(["submitted", "pending", "confirmed", "finalized", "delivered", "uncertain", "replaced"]);

function clean(value) { return String(value ?? "").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function lower(value) { return clean(value).toLowerCase(); }
function nowMs(now) { return now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime(); }
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Value & Exposure Limits", control: "Chain-agnostic value and exposure", status, severity, rule, message, evidence, remediation };
}

export function nativeAssetForNetwork(network = "", registry = {}) {
  const key = lower(network);
  return clean(registry[key] || NATIVE_ASSETS.get(key)).toUpperCase();
}

export function valueExposurePolicy(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const configured = rules.valueExposure && typeof rules.valueExposure === "object" ? rules.valueExposure : {};
  const explicitBasis = clean(configured.limitBasis || rules.limitBasis);
  const legacy = !explicitBasis;
  return {
    enabled: configured.enabled !== false,
    limitBasis: explicitBasis || "Legacy Native Amount",
    referenceCurrency: clean(configured.referenceCurrency || rules.referenceCurrency || "USD").toUpperCase(),
    automaticLimit: finite(configured.automaticLimit ?? policy.approvalThreshold),
    reviewLimit: finite(configured.reviewLimit ?? configured.automaticLimit ?? policy.approvalThreshold),
    maximumTransactionLimit: finite(configured.maximumTransactionLimit ?? policy.maxTransaction),
    hourlyLimit: finite(configured.hourlyLimit),
    dailyLimit: finite(configured.dailyLimit ?? (legacy ? policy.dailyLimit : null)),
    perDestinationLimit: finite(configured.perDestinationLimit),
    walletPercentageLimit: finite(configured.walletPercentageLimit),
    nativeAsset: clean(configured.nativeAsset).toUpperCase(),
    assetOverrides: configured.assetOverrides && typeof configured.assetOverrides === "object" ? configured.assetOverrides : {},
    maxPriceAgeSeconds: Math.max(1, finite(configured.maxPriceAgeSeconds) ?? 120),
    stablecoinPeg: configured.stablecoinPeg && typeof configured.stablecoinPeg === "object" ? configured.stablecoinPeg : {},
    networkAssetRegistry: configured.networkAssetRegistry && typeof configured.networkAssetRegistry === "object" ? configured.networkAssetRegistry : {},
    humanReviewRequired: configured.humanReviewRequired === true,
    legacy,
  };
}

function canonicalAsset(request = {}) {
  const resolved = request.assetIdentity && typeof request.assetIdentity === "object" ? request.assetIdentity : {};
  const network = clean(resolved.network || request.executionNetwork || request.network || request.chainName);
  const asset = clean(resolved.symbol || request.asset || request.tokenSymbol || request.currency).toUpperCase();
  const contractAddress = clean(resolved.contractAddress || request.assetContractAddress || request.tokenAddress || request.contractAddress);
  const decimals = finite(resolved.decimals ?? request.assetDecimals ?? request.decimals);
  const identity = clean(resolved.canonicalId || `${lower(network)}:${lower(contractAddress || asset)}`);
  return { network, asset, contractAddress, decimals, identity };
}

function priceEvidence(request = {}, identity, referenceCurrency, now) {
  const source = request.valueEvidence || request.priceEvidence || request.oracle?.valueEvidence || {};
  const price = finite(source.price ?? source.quotePrice ?? request.verifiedPrice);
  const currency = clean(source.referenceCurrency || source.quoteAsset || referenceCurrency).toUpperCase();
  const timestamp = clean(source.timestamp || source.quoteTimestamp || source.observedAt);
  const timestampMs = timestamp ? new Date(timestamp).getTime() : NaN;
  const quoteAgeSeconds = Number.isFinite(timestampMs) ? Math.max(0, (nowMs(now) - timestampMs) / 1000) : Infinity;
  return {
    provider: clean(source.provider || source.providerIdentity || source.source),
    assetIdentity: clean(source.assetIdentity || source.canonicalAssetIdentity || identity.identity),
    network: clean(source.network || identity.network),
    price,
    referenceCurrency: currency,
    timestamp,
    quoteAgeSeconds,
    confidence: finite(source.confidence),
    agreeingSources: finite(source.agreeingSources ?? source.sourceCount),
    sourceDisagreement: Boolean(source.sourceDisagreement || source.disagreement),
    evidenceHash: clean(source.evidenceHash),
  };
}

function recordState(log = {}) {
  return lower(log.executionReconciliation?.status || log.executionStatus || "not_submitted");
}

function exposureAmount(log = {}, basis, referenceCurrency, assetIdentity) {
  const evidence = log.valueExposureContext || log.originalIntent?.valueExposureContext || {};
  if (basis === "Fiat Value") {
    if (clean(evidence.referenceCurrency).toUpperCase() !== referenceCurrency) return 0;
    return finite(evidence.verifiedReferenceValue) ?? 0;
  }
  const logIdentity = clean(evidence.assetIdentity || `${lower(log.originalIntent?.executionNetwork || log.originalIntent?.network || log.originalIntent?.chainName)}:${lower(log.originalIntent?.assetContractAddress || log.originalIntent?.asset || "")}`);
  if (assetIdentity && logIdentity && logIdentity !== assetIdentity) return 0;
  return finite(evidence.nativeAmount ?? log.amount) ?? 0;
}

function cumulativeExposure({ auditLogs = [], request, config, basis, unit, identity, now }) {
  const current = nowMs(now);
  const executionWallet = lower(request.executionWalletAddress || request.walletAddress);
  const destination = lower(request.destination || request.target);
  const agentId = clean(request.agentId);
  const rows = auditLogs.filter((log) => {
    if (clean(log.agentId) !== agentId) return false;
    const state = recordState(log);
    if (TERMINAL_FAILED.has(state) || !EXPOSURE_STATES.has(state)) return false;
    const logWallet = lower(log.executionWalletAddress || log.originalIntent?.executionWalletAddress || log.walletAddress);
    return !executionWallet || !logWallet || logWallet === executionWallet;
  });
  const sumSince = (ms, destinationOnly = false) => rows.reduce((sum, log) => {
    const time = new Date(log.executionUpdatedAt || log.timestamp).getTime();
    if (!Number.isFinite(time) || current - time > ms) return sum;
    if (destinationOnly && destination && lower(log.target || log.originalIntent?.destination || log.originalIntent?.target) !== destination) return sum;
    return sum + exposureAmount(log, basis, config.referenceCurrency, identity.identity);
  }, 0);
  return {
    hourlyUsed: sumSince(60 * 60 * 1000),
    dailyUsed: sumSince(24 * 60 * 60 * 1000),
    destinationUsed: sumSince(24 * 60 * 60 * 1000, true),
    countedRecords: rows.length,
    unit,
  };
}

export function evaluateValueExposureLimits({ request = {}, policy = {}, auditLogs = [], now = new Date() }) {
  const config = valueExposurePolicy(policy);
  const findings = [], checksPassed = [], checksFailed = [];
  const actionType = lower(request.actionType);
  const dedicatedAction = actionType.includes("x402") || actionType.includes("bridge");
  const applicable = !dedicatedAction && ["transfer", "swap", "stake", "unstake", "withdraw", "deposit", "payment", "treasury withdrawal"].some((name) => actionType === name || actionType.includes(name));
  if (!applicable) return { hardBlock: false, needsReview: false, scoreDelta: 0, findings: [finding({ status: "skipped", rule: "Value-bearing action", message: "This action type is evaluated by its dedicated control and does not use generic value limits." })], checksPassed, checksFailed, context: { enabled: config.enabled, applicable: false } };
  if (!config.enabled) return { hardBlock: false, needsReview: false, scoreDelta: 0, findings: [finding({ status: "skipped", rule: "Value limit enforcement", message: "Value and exposure enforcement is disabled by policy." })], checksPassed, checksFailed, context: { enabled: false } };

  const amount = finite(request.amount);
  let identity = canonicalAsset(request);
  if (config.legacy && (!identity.asset || !identity.network)) {
    identity = { network: identity.network || "casper", asset: identity.asset || "CSPR", contractAddress: identity.contractAddress, decimals: identity.decimals, identity: `${lower(identity.network || "casper")}:${lower(identity.contractAddress || identity.asset || "CSPR")}` };
  }
  if (!(amount >= 0) || !identity.asset || !identity.network) {
    const message = "Magen3 could not evaluate value limits because amount, execution network, or asset identity is missing.";
    findings.push(finding({ status: "warning", severity: "high", rule: "Canonical asset identity", message, evidence: { amount: request.amount, network: identity.network, asset: identity.asset }, remediation: "Provide the exact native amount, execution network, asset symbol, and token contract address where relevant." }));
    return { hardBlock: false, needsReview: true, scoreDelta: 30, findings, checksPassed, checksFailed: [message], context: { config, identity, evidenceState: "missing_asset_identity" } };
  }

  let basis = config.limitBasis;
  let unit = identity.asset;
  let evaluatedValue = amount;
  let price = null;
  let legacyNativeAsset = "";

  if (basis === "Legacy Native Amount") {
    legacyNativeAsset = config.nativeAsset || nativeAssetForNetwork(identity.network, config.networkAssetRegistry);
    if (identity.asset && legacyNativeAsset && identity.asset !== legacyNativeAsset) {
      return { hardBlock: false, needsReview: false, scoreDelta: 0, findings: [finding({ status: "skipped", rule: "Legacy policy denomination", message: `Legacy numeric limits remain preserved as ${legacyNativeAsset}; ${identity.asset} is not silently reinterpreted.` })], checksPassed, checksFailed, context: { config, identity, evidenceState: "legacy_non_native_preserved" } };
    }
    if (!legacyNativeAsset) {
      const message = `This legacy policy has no confirmed denomination for ${identity.asset} on ${identity.network}.`;
      findings.push(finding({ status: "warning", severity: "high", rule: "Legacy policy denomination", message, evidence: { receivedAsset: identity.asset, network: identity.network, preservedBasis: "Legacy Native Amount" }, remediation: "Edit the policy and explicitly choose Fiat value or Network native asset before retrying." }));
      return { hardBlock: false, needsReview: true, scoreDelta: 28, findings, checksPassed, checksFailed: [message], context: { config, identity, evidenceState: "legacy_denomination_required" } };
    }
    basis = "Network Native Asset";
  }

  if (basis === "Network Native Asset") {
    const expectedNative = config.nativeAsset || nativeAssetForNetwork(identity.network, config.networkAssetRegistry);
    if (!expectedNative || identity.asset !== expectedNative) {
      const message = `The action asset ${identity.asset} does not match the native asset ${expectedNative || "registered for this network"} on ${identity.network}.`;
      findings.push(finding({ status: "fail", severity: "critical", rule: "Network native asset binding", message, evidence: { receivedAsset: identity.asset, expectedAsset: expectedNative, network: identity.network }, remediation: "Use the correct native asset for the execution network or select a Fiat value policy for token transfers." }));
      return { hardBlock: true, needsReview: false, scoreDelta: 45, findings, checksPassed, checksFailed: [message], context: { config, identity, evidenceState: "native_asset_mismatch" } };
    }
    unit = expectedNative;
  } else if (basis === "Fiat Value") {
    price = priceEvidence(request, identity, config.referenceCurrency, now);
    unit = config.referenceCurrency;
    if (!price.price || price.referenceCurrency !== config.referenceCurrency || price.assetIdentity !== identity.identity || lower(price.network) !== lower(identity.network) || !price.timestamp || price.quoteAgeSeconds > config.maxPriceAgeSeconds || price.sourceDisagreement) {
      const reason = price.sourceDisagreement ? "trusted price sources disagree" : !price.price ? "no verified price is available" : price.quoteAgeSeconds > config.maxPriceAgeSeconds ? "the verified price is stale" : "the price evidence is not bound to the exact asset, network, and reference currency";
      const message = `Magen3 paused this transaction because ${reason} for ${identity.asset}. Nothing was signed or sent.`;
      findings.push(finding({ status: "warning", severity: "high", rule: "Fresh verified price evidence", message, evidence: price, remediation: "Refresh provider-backed price evidence for the exact canonical asset and resubmit for deterministic reevaluation." }));
      return { hardBlock: false, needsReview: true, scoreDelta: 32, findings, checksPassed, checksFailed: [message], context: { config, identity, priceEvidence: price, evidenceState: "price_unavailable" } };
    }
    evaluatedValue = amount * price.price;
    const peg = config.stablecoinPeg[identity.identity] || config.stablecoinPeg[identity.asset];
    if (peg) {
      const expected = finite(peg.expectedValue) ?? 1;
      const allowedDeviationPercent = finite(peg.allowedDeviationPercent) ?? 2;
      const deviationPercent = Math.abs(price.price - expected) / expected * 100;
      if (deviationPercent > allowedDeviationPercent) {
        const action = clean(peg.action || "Review Required");
        const message = `${identity.asset} is outside its configured peg range: observed ${price.price} ${unit}, expected ${expected} ${unit} ± ${allowedDeviationPercent}%. Nothing was signed or sent.`;
        findings.push(finding({ status: action === "Blocked" ? "fail" : "warning", severity: "high", rule: "Stablecoin peg deviation", message, evidence: { observedPrice: price.price, expectedPeg: expected, allowedDeviationPercent, deviationPercent }, remediation: "Wait for verified peg recovery, use another approved asset, or update the policy only through an authorized change." }));
        return { hardBlock: action === "Blocked", needsReview: action !== "Blocked", scoreDelta: action === "Blocked" ? 48 : 34, findings, checksPassed, checksFailed: [message], context: { config, identity, priceEvidence: price, verifiedReferenceValue: evaluatedValue, evidenceState: "stablecoin_depeg" } };
      }
    }
  } else {
    const message = `Unsupported policy limit basis: ${config.limitBasis}.`;
    findings.push(finding({ status: "fail", severity: "critical", rule: "Supported limit basis", message, remediation: "Choose Fiat Value or Network Native Asset." }));
    return { hardBlock: true, needsReview: false, scoreDelta: 45, findings, checksPassed, checksFailed: [message], context: { config, identity } };
  }

  const override = config.assetOverrides[identity.identity] || config.assetOverrides[identity.asset] || {};
  const automaticLimit = finite(override.automaticLimit ?? config.automaticLimit);
  const reviewLimit = finite(override.reviewLimit ?? config.reviewLimit ?? automaticLimit);
  const maximum = finite(override.maximumTransactionLimit ?? config.maximumTransactionLimit);
  const exposure = cumulativeExposure({ auditLogs, request, config, basis, unit, identity, now });
  const walletBalance = finite(request.walletBalanceEvidence?.balance ?? request.executionWalletBalance);
  const walletPercentage = walletBalance > 0 ? (amount / walletBalance) * 100 : null;

  const hardBreaches = [];
  const reviewBreaches = [];
  if (maximum > 0 && evaluatedValue > maximum) hardBreaches.push({ rule: "Maximum transaction", value: evaluatedValue, threshold: maximum });
  if (config.hourlyLimit > 0 && exposure.hourlyUsed + evaluatedValue > config.hourlyLimit) hardBreaches.push({ rule: "Hourly cumulative exposure", value: exposure.hourlyUsed + evaluatedValue, threshold: config.hourlyLimit });
  if (config.dailyLimit > 0 && exposure.dailyUsed + evaluatedValue > config.dailyLimit) hardBreaches.push({ rule: "Daily cumulative exposure", value: exposure.dailyUsed + evaluatedValue, threshold: config.dailyLimit });
  if (config.perDestinationLimit > 0 && exposure.destinationUsed + evaluatedValue > config.perDestinationLimit) hardBreaches.push({ rule: "Per-destination cumulative exposure", value: exposure.destinationUsed + evaluatedValue, threshold: config.perDestinationLimit });
  if (config.walletPercentageLimit > 0) {
    if (walletPercentage === null) reviewBreaches.push({ rule: "Wallet percentage evidence", value: null, threshold: config.walletPercentageLimit });
    else if (walletPercentage > config.walletPercentageLimit) hardBreaches.push({ rule: "Wallet percentage exposure", value: walletPercentage, threshold: config.walletPercentageLimit, unit: "%" });
  }
  if (!hardBreaches.length && reviewLimit > 0 && evaluatedValue > reviewLimit) reviewBreaches.push({ rule: "Automatic execution threshold", value: evaluatedValue, threshold: reviewLimit });

  const context = { config, basis, referenceCurrency: config.referenceCurrency, identity, nativeAmount: amount, unit, verifiedReferenceValue: basis === "Fiat Value" ? evaluatedValue : null, priceEvidence: price, thresholds: { automaticLimit, reviewLimit, maximum, hourlyLimit: config.hourlyLimit, dailyLimit: config.dailyLimit, perDestinationLimit: config.perDestinationLimit, walletPercentageLimit: config.walletPercentageLimit }, cumulativeExposure: exposure, walletPercentage };
  if (hardBreaches.length) {
    const breach = hardBreaches[0];
    const message = basis === "Fiat Value" ? `Magen3 blocked this transaction because ${amount} ${identity.asset} is approximately ${evaluatedValue.toFixed(2)} ${unit}, exceeding the ${breach.rule.toLowerCase()} of ${breach.threshold} ${breach.unit || unit}. Nothing was signed or sent.` : `Magen3 blocked this transaction because ${amount} ${unit} exceeds the ${breach.rule.toLowerCase()} of ${breach.threshold} ${breach.unit || unit}. Nothing was signed or sent.`;
    findings.push(finding({ status: "fail", severity: "critical", rule: breach.rule, message, evidence: { ...context, breach }, remediation: "Reduce the amount or update the policy through an authorized policy change." }));
    return { hardBlock: true, needsReview: false, scoreDelta: 48, findings, checksPassed, checksFailed: [message], context: { ...context, triggeredBreach: breach } };
  }
  if (reviewBreaches.length) {
    const breach = reviewBreaches[0];
    const message = breach.value === null ? `Magen3 paused this transaction because wallet-balance evidence is required to enforce the ${breach.threshold}% exposure limit. Nothing was signed or sent.` : basis === "Fiat Value" ? `Magen3 paused this transaction because ${amount} ${identity.asset} is approximately ${evaluatedValue.toFixed(2)} ${unit}, exceeding the automatic threshold of ${breach.threshold} ${unit}. Nothing was signed or sent.` : `Magen3 paused this transaction because ${amount} ${unit} exceeds the automatic threshold of ${breach.threshold} ${unit}. Nothing was signed or sent.`;
    findings.push(finding({ status: "warning", severity: "high", rule: breach.rule, message, evidence: { ...context, breach }, remediation: breach.value === null ? "Provide fresh execution-wallet balance evidence and retry." : "Reduce the amount or follow the configured autonomous review-resolution flow." }));
    return { hardBlock: false, needsReview: true, scoreDelta: 30, findings, checksPassed, checksFailed: [message], context: { ...context, triggeredBreach: breach } };
  }

  const message = basis === "Fiat Value" ? `Magen3 verified ${amount} ${identity.asset} at approximately ${evaluatedValue.toFixed(2)} ${unit}; configured value and cumulative exposure limits pass.` : `Magen3 verified ${amount} ${unit}; configured native-asset and cumulative exposure limits pass.`;
  findings.push(finding({ status: "pass", rule: "Value and exposure thresholds", message, evidence: context }));
  checksPassed.push(message);
  return { hardBlock: false, needsReview: false, scoreDelta: 0, findings, checksPassed, checksFailed, context };
}

// Milestone 24 extension point: dedicated payment controls keep base-unit accounting,
// while reusing Milestone 14 exposure semantics instead of creating a second vocabulary.
export function buildReservedExposureSnapshot({ maximumAtomic = "0", reservedAtomic = "0", capturedAtomic = "0", settledAtomic = "0", releasedAtomic = "0", refundedAtomic = "0", asset = "", network = "" } = {}) {
  const parse = (value, field) => {
    const text = String(value ?? "0").trim();
    if (!/^\d+$/.test(text)) throw new TypeError(`${field} must be a non-negative base-unit integer string`);
    return BigInt(text);
  };
  const maximum = parse(maximumAtomic, "maximumAtomic");
  const reserved = parse(reservedAtomic, "reservedAtomic");
  const actual = parse(capturedAtomic, "capturedAtomic");
  const settled = parse(settledAtomic, "settledAtomic");
  const released = parse(releasedAtomic, "releasedAtomic");
  const refunded = parse(refundedAtomic, "refundedAtomic");
  return {
    basis: "base-unit-integer",
    asset: String(asset || "").trim().toUpperCase(),
    network: String(network || "").trim().toLowerCase(),
    maximumExposureAtomic: maximum.toString(),
    reservedExposureAtomic: reserved.toString(),
    actualExposureAtomic: actual.toString(),
    settledExposureAtomic: settled.toString(),
    releasedExposureAtomic: released.toString(),
    refundedExposureAtomic: refunded.toString(),
    remainingAuthorizationAtomic: (maximum >= actual ? maximum - actual : 0n).toString(),
    netSettledExposureAtomic: (settled >= refunded ? settled - refunded : 0n).toString(),
  };
}
