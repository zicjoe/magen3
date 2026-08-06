const CASPER_PUBLIC_KEY = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const CASPER_ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const PROVIDER_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,63}$/;

const BRIDGE_ACTIONS = new Set(["Bridge", "Cross-chain Transfer"]);
const EVM_CHAIN_HINTS = [
  "ethereum", "eth", "arbitrum", "optimism", "base", "polygon", "matic",
  "bsc", "binance smart chain", "avalanche", "avax", "fantom", "linea",
  "scroll", "zksync", "mantle", "gnosis", "celo",
];

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function list(value, transform = clean) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => transform(item))
    .filter(Boolean))];
}

function finiteNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
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

function normalizeChain(value) {
  return lower(value).replace(/[_\s]+/g, "-");
}

function normalizeAsset(value) {
  return clean(value).toUpperCase();
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Bridge Controls", status, severity, rule, message, evidence, remediation };
}

function policyConfig(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    mode: normalizeMode(rules.bridgeControlMode),
    unavailableAction: normalizeUnavailableAction(rules.bridgeControlUnavailableAction),
    allowedProviders: list(rules.bridgeAllowedProviders, lower),
    allowedSourceChains: list(rules.bridgeAllowedSourceChains, normalizeChain),
    allowedDestinationChains: list(rules.bridgeAllowedDestinationChains, normalizeChain),
    blockedDestinationChains: list(rules.bridgeBlockedDestinationChains, normalizeChain),
    allowedAssets: list(rules.bridgeAllowedAssets, normalizeAsset),
    maxAmount: Math.max(0, finiteNumber(rules.bridgeMaxAmount, 0) || 0),
    maxFeeBps: positiveInteger(rules.bridgeMaxFeeBps, 100, { min: 0, max: 10_000 }),
    maxQuoteAgeSeconds: positiveInteger(rules.bridgeMaxQuoteAgeSeconds, 300, { min: 5, max: 86_400 }),
    requireQuoteExpiry: rules.bridgeRequireQuoteExpiry !== false,
    minSourceConfirmations: positiveInteger(rules.bridgeMinSourceConfirmations, 1, { min: 0, max: 10_000 }),
    minDestinationConfirmations: positiveInteger(rules.bridgeMinDestinationConfirmations, 1, { min: 0, max: 10_000 }),
  };
}

function isApplicable(request = {}) {
  return BRIDGE_ACTIONS.has(clean(request.actionType)) || Boolean(
    request.bridgeProvider || request.bridgeSourceChain || request.bridgeDestinationChain ||
    request.bridgeRouteId || request.bridgeDestinationAddress
  );
}

function destinationFamily(chainName) {
  const normalized = normalizeChain(chainName);
  if (normalized.includes("casper")) return "casper";
  if (/^eip155-[1-9][0-9]*$/.test(normalized) || /^eip155:[1-9][0-9]*$/.test(lower(chainName))) return "evm";
  if (EVM_CHAIN_HINTS.some((hint) => normalized === hint || normalized.includes(`${hint}-`) || normalized.includes(`-${hint}`))) return "evm";
  return "unknown";
}

export function classifyBridgeDestinationAddress(value, destinationChain = "") {
  const address = clean(value);
  const family = destinationFamily(destinationChain);
  if (!address) return { valid: false, family, kind: "missing", reason: "No destination address was supplied." };
  if (family === "casper") {
    const valid = CASPER_PUBLIC_KEY.test(address) || CASPER_ACCOUNT_HASH.test(address);
    return {
      valid,
      family,
      kind: CASPER_PUBLIC_KEY.test(address) ? "casper-public-key" : CASPER_ACCOUNT_HASH.test(address) ? "casper-account-hash" : "invalid-casper-address",
      reason: valid ? "Valid Casper destination identifier format." : "Expected a Casper signing public key or account-hash identifier.",
    };
  }
  if (family === "evm") {
    const valid = EVM_ADDRESS.test(address);
    return { valid, family, kind: valid ? "evm-address" : "invalid-evm-address", reason: valid ? "Valid EVM address structure." : "Expected a 20-byte 0x-prefixed EVM address." };
  }
  return {
    valid: false,
    family,
    kind: "unsupported-chain-family",
    reason: "Magen3 does not yet have a deterministic address-format validator for this destination chain.",
  };
}

function applyViolation(state, config, details) {
  const { findings, checksFailed } = state;
  const mode = config.mode;
  const status = mode === "Enforce" ? "fail" : "warning";
  const severity = mode === "Enforce" ? details.blockSeverity || "high" : details.reviewSeverity || "medium";
  findings.push(finding({ ...details, status, severity }));
  checksFailed.push(details.message);
  state.scoreDelta += mode === "Enforce" ? details.blockScore || 30 : details.reviewScore || 18;
  if (mode === "Enforce") state.hardBlock = true;
  else if (mode === "Review") state.needsReview = true;
}

function applyUnavailable(state, config, details) {
  const action = config.unavailableAction;
  if (action === "Block") {
    state.findings.push(finding({ ...details, status: "fail", severity: details.blockSeverity || "high" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.blockScore || 30;
    state.hardBlock = true;
    return;
  }
  if (action === "Review") {
    state.findings.push(finding({ ...details, status: "warning", severity: details.reviewSeverity || "medium" }));
    state.checksFailed.push(details.message);
    state.scoreDelta += details.reviewScore || 16;
    state.needsReview = true;
    return;
  }
  state.findings.push(finding({ ...details, status: "unavailable", severity: "info" }));
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "pass", rule, message, evidence }));
  state.checksPassed.push(message);
}

function parseIso(value) {
  const raw = clean(value);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function derivedFeeBps(request = {}) {
  const explicit = finiteNumber(request.bridgeFeeBps, null);
  if (explicit !== null) return explicit;
  const atomicFee = clean(request.bridgeFeeAmount);
  const atomicAmount = clean(request.bridgeAmountAtomic);
  if (/^[0-9]+$/.test(atomicFee) && /^[1-9][0-9]*$/.test(atomicAmount)) {
    try { return Number((BigInt(atomicFee) * 10_000n) / BigInt(atomicAmount)); } catch {}
  }
  const feeAmount = finiteNumber(request.bridgeFeeAmount, null);
  const amount = finiteNumber(request.amount, null);
  if (feeAmount === null || amount === null || amount <= 0) return null;
  return (feeAmount / amount) * 10_000;
}

export function evaluateBridgeControls({ request = {}, policy = {}, now = new Date() } = {}) {
  const state = {
    findings: [],
    checksPassed: [],
    checksFailed: [],
    scoreDelta: 0,
    hardBlock: false,
    needsReview: false,
  };
  const applicable = isApplicable(request);
  const config = policyConfig(policy);

  if (!applicable) {
    state.findings.push(finding({
      status: "skipped",
      rule: "Bridge intent applicability",
      message: "Bridge Controls were skipped because this intent is not a bridge or cross-chain transfer.",
      evidence: { actionType: request.actionType || "" },
    }));
    return { ...state, applicable: false, context: null };
  }

  const sourceChain = normalizeChain(request.bridgeSourceChain || request.chainName);
  const destinationChain = normalizeChain(request.bridgeDestinationChain);
  const provider = lower(request.bridgeProvider);
  const routeId = clean(request.bridgeRouteId);
  const destinationAddress = clean(request.bridgeDestinationAddress);
  const asset = normalizeAsset(request.bridgeAsset || request.asset);
  const amount = Math.max(0, finiteNumber(request.amount, 0) || 0);
  const feeBps = derivedFeeBps(request);
  const quotedOutput = finiteNumber(request.bridgeExpectedOutput ?? request.expectedOutput, null);
  const minimumReceived = finiteNumber(request.bridgeMinimumReceived ?? request.minimumReceived, null);
  const quoteTimestamp = clean(request.bridgeQuoteTimestamp || request.quoteTimestamp || request.transactionTimestamp);
  const quoteExpiresAt = clean(request.bridgeQuoteExpiresAt);
  const sourceConfirmations = positiveInteger(request.bridgeSourceConfirmations, 0, { min: 0, max: 10_000 });
  const destinationConfirmations = positiveInteger(request.bridgeDestinationConfirmations, 0, { min: 0, max: 10_000 });
  const destinationAddressClassification = classifyBridgeDestinationAddress(destinationAddress, destinationChain);

  const required = [
    ["sourceChain", sourceChain],
    ["destinationChain", destinationChain],
    ["provider", provider],
    ["routeId", routeId],
    ["destinationAddress", destinationAddress],
    ["asset", asset],
  ];
  const missingFields = required.filter(([, value]) => !value).map(([name]) => name);
  if (missingFields.length > 0) {
    applyUnavailable(state, config, {
      rule: "Bridge route metadata",
      message: `Bridge route metadata is incomplete: ${missingFields.join(", ")}.`,
      evidence: { missingFields },
      remediation: "Include source chain, destination chain, provider, route ID, destination address, and bridge asset before retrying.",
    });
  } else {
    pass(state, "Bridge route metadata", "Required bridge route metadata is present.", { sourceChain, destinationChain, provider, routeId, asset });
  }

  if (routeId) {
    if (!ROUTE_ID.test(routeId)) {
      applyViolation(state, config, {
        rule: "Bridge route identifier",
        message: "Bridge route ID contains unsupported characters or exceeds 128 characters.",
        evidence: { routeId },
        remediation: "Use the route identifier exactly as returned by the bridge adapter, using letters, digits, dots, slashes, colons, underscores, or hyphens.",
      });
    } else pass(state, "Bridge route identifier", "Bridge route ID is structurally valid.", { routeId });
  }

  if (provider) {
    if (!PROVIDER_NAME.test(clean(request.bridgeProvider))) {
      applyViolation(state, config, {
        rule: "Bridge provider identity",
        message: "Bridge provider name is malformed.",
        evidence: { provider: request.bridgeProvider },
        remediation: "Use the canonical provider name supplied by the configured bridge adapter.",
      });
    } else if (config.allowedProviders.length === 0) {
      applyUnavailable(state, config, {
        rule: "Approved bridge provider",
        message: "No approved bridge-provider list is configured for this policy.",
        evidence: { provider: request.bridgeProvider },
        remediation: "Add reviewed providers to bridgeAllowedProviders before enabling automated bridge execution.",
      });
    } else if (!config.allowedProviders.includes(provider)) {
      applyViolation(state, config, {
        rule: "Approved bridge provider",
        message: `Bridge provider ${request.bridgeProvider} is not approved by the active policy.`,
        evidence: { provider: request.bridgeProvider, allowedProviders: config.allowedProviders },
        remediation: "Use an approved bridge provider or update the policy only after authorized review.",
      });
    } else pass(state, "Approved bridge provider", "Bridge provider is approved by the active policy.", { provider: request.bridgeProvider });
  }

  if (sourceChain && destinationChain) {
    if (sourceChain === destinationChain) {
      applyViolation(state, config, {
        rule: "Distinct bridge chains",
        message: "Bridge source and destination chains are identical.",
        evidence: { sourceChain, destinationChain },
        remediation: "Use a transfer or contract action for same-chain execution, or choose a different destination chain.",
      });
    } else pass(state, "Distinct bridge chains", "Bridge source and destination chains are distinct.", { sourceChain, destinationChain });
  }

  if (sourceChain) {
    if (config.allowedSourceChains.length === 0) {
      applyUnavailable(state, config, {
        rule: "Approved source chain",
        message: "No approved bridge source-chain list is configured.",
        evidence: { sourceChain },
        remediation: "Configure bridgeAllowedSourceChains, normally including the active Casper network.",
      });
    } else if (!config.allowedSourceChains.includes(sourceChain)) {
      applyViolation(state, config, {
        rule: "Approved source chain",
        message: `Bridge source chain ${sourceChain} is not approved by policy.`,
        evidence: { sourceChain, allowedSourceChains: config.allowedSourceChains },
        remediation: "Use an approved source chain or update the policy after authorized review.",
      });
    } else pass(state, "Approved source chain", "Bridge source chain is approved by policy.", { sourceChain });
  }

  if (destinationChain) {
    if (config.blockedDestinationChains.includes(destinationChain)) {
      state.findings.push(finding({
        status: "fail",
        severity: "critical",
        rule: "Blocked destination chain",
        message: `Bridge destination chain ${destinationChain} is explicitly blocked by policy.`,
        evidence: { destinationChain, blockedDestinationChains: config.blockedDestinationChains },
        remediation: "Do not bridge to this chain. Choose an authorized destination chain.",
      }));
      state.checksFailed.push(`Bridge destination chain ${destinationChain} is blocked`);
      state.scoreDelta += 40;
      state.hardBlock = true;
    } else if (config.allowedDestinationChains.length === 0) {
      applyUnavailable(state, config, {
        rule: "Approved destination chain",
        message: "No approved bridge destination-chain list is configured.",
        evidence: { destinationChain },
        remediation: "Configure bridgeAllowedDestinationChains before enabling automated bridge execution.",
      });
    } else if (!config.allowedDestinationChains.includes(destinationChain)) {
      applyViolation(state, config, {
        rule: "Approved destination chain",
        message: `Bridge destination chain ${destinationChain} is not approved by policy.`,
        evidence: { destinationChain, allowedDestinationChains: config.allowedDestinationChains },
        remediation: "Choose an approved destination chain or update the policy after authorized review.",
      });
    } else pass(state, "Approved destination chain", "Bridge destination chain is approved by policy.", { destinationChain });
  }

  if (asset) {
    if (config.allowedAssets.length === 0) {
      applyUnavailable(state, config, {
        rule: "Approved bridge asset",
        message: "No approved bridge-asset list is configured.",
        evidence: { asset },
        remediation: "Configure bridgeAllowedAssets before enabling automatic bridging.",
      });
    } else if (!config.allowedAssets.includes(asset)) {
      applyViolation(state, config, {
        rule: "Approved bridge asset",
        message: `Asset ${asset} is not approved for bridging by this policy.`,
        evidence: { asset, allowedAssets: config.allowedAssets },
        remediation: "Bridge an approved asset or update the policy only after authorized review.",
      });
    } else pass(state, "Approved bridge asset", "Bridge asset is approved by policy.", { asset });
  }

  if (config.maxAmount > 0 && amount > config.maxAmount) {
    applyViolation(state, config, {
      rule: "Maximum bridge amount",
      message: `Bridge amount exceeds the module limit (${amount} > ${config.maxAmount} ${asset || "units"}).`,
      evidence: { amount, maximum: config.maxAmount, asset },
      remediation: `Reduce the bridge amount to ${config.maxAmount} ${asset || "units"} or less, or update the policy if authorized.`,
    });
  } else if (amount > 0) {
    pass(state, "Maximum bridge amount", config.maxAmount > 0 ? "Bridge amount is within the module limit." : "No additional bridge-specific amount limit is configured; the global transaction limit still applies.", { amount, maximum: config.maxAmount, asset });
  }

  if (feeBps === null || !Number.isFinite(feeBps) || feeBps < 0) {
    applyUnavailable(state, config, {
      rule: "Maximum bridge fee",
      message: "Bridge fee information is missing or invalid.",
      evidence: { bridgeFeeAmount: request.bridgeFeeAmount ?? null, bridgeFeeBps: request.bridgeFeeBps ?? null, amount },
      remediation: "Include bridgeFeeBps or bridgeFeeAmount from the selected route quote before retrying.",
    });
  } else if (feeBps > config.maxFeeBps) {
    applyViolation(state, config, {
      rule: "Maximum bridge fee",
      message: `Bridge fee exceeds the policy limit (${Math.round(feeBps)} > ${config.maxFeeBps} bps).`,
      evidence: { receivedFeeBps: feeBps, maximumFeeBps: config.maxFeeBps },
      remediation: "Select a lower-fee route or obtain authorized policy review.",
    });
  } else pass(state, "Maximum bridge fee", "Bridge fee is within the configured policy limit.", { receivedFeeBps: feeBps, maximumFeeBps: config.maxFeeBps });

  if (quotedOutput !== null || minimumReceived !== null) {
    if (quotedOutput === null || minimumReceived === null || quotedOutput <= 0 || minimumReceived <= 0 || minimumReceived > quotedOutput) {
      applyViolation(state, config, {
        rule: "Bridge output bounds",
        message: "Bridge expected output and minimum received values are inconsistent.",
        evidence: { quotedOutput, minimumReceived },
        remediation: "Provide positive output bounds and ensure minimum received does not exceed expected output.",
      });
    } else pass(state, "Bridge output bounds", "Bridge output bounds are internally consistent.", { quotedOutput, minimumReceived });
  } else {
    applyUnavailable(state, config, {
      rule: "Bridge output bounds",
      message: "Bridge output bounds were not supplied.",
      evidence: { quotedOutput, minimumReceived },
      remediation: "Include expectedOutput and minimumReceived from the bridge quote.",
    });
  }

  const quoteTimestampMs = parseIso(quoteTimestamp);
  if (!quoteTimestamp || Number.isNaN(quoteTimestampMs)) {
    applyUnavailable(state, config, {
      rule: "Bridge quote freshness",
      message: "Bridge quote timestamp is missing or invalid.",
      evidence: { quoteTimestamp },
      remediation: "Include a valid ISO-8601 bridge quote timestamp.",
    });
  } else {
    const ageSeconds = (now.getTime() - quoteTimestampMs) / 1000;
    if (ageSeconds < -300 || ageSeconds > config.maxQuoteAgeSeconds) {
      applyViolation(state, config, {
        rule: "Bridge quote freshness",
        message: ageSeconds < 0 ? "Bridge quote timestamp is too far in the future." : `Bridge quote is stale (${Math.round(ageSeconds)}s > ${config.maxQuoteAgeSeconds}s).`,
        evidence: { quoteTimestamp, ageSeconds, maximumAgeSeconds: config.maxQuoteAgeSeconds },
        remediation: "Request a fresh bridge route quote before retrying.",
      });
    } else pass(state, "Bridge quote freshness", "Bridge quote timestamp is within the configured freshness window.", { quoteTimestamp, ageSeconds, maximumAgeSeconds: config.maxQuoteAgeSeconds });
  }

  const quoteExpiresMs = parseIso(quoteExpiresAt);
  if (!quoteExpiresAt) {
    if (config.requireQuoteExpiry) {
      applyUnavailable(state, config, {
        rule: "Bridge quote expiry",
        message: "Bridge quote expiry is required by policy but was not supplied.",
        evidence: { requireQuoteExpiry: true },
        remediation: "Include quoteExpiresAt from the bridge adapter before retrying.",
      });
    } else state.findings.push(finding({ status: "skipped", rule: "Bridge quote expiry", message: "Bridge quote expiry is not required by this policy.", evidence: { requireQuoteExpiry: false } }));
  } else if (Number.isNaN(quoteExpiresMs)) {
    applyViolation(state, config, {
      rule: "Bridge quote expiry",
      message: "Bridge quote expiry is not a valid ISO-8601 timestamp.",
      evidence: { quoteExpiresAt },
      remediation: "Use the exact ISO-8601 expiry timestamp returned by the bridge adapter.",
    });
  } else if (quoteExpiresMs <= now.getTime()) {
    applyViolation(state, config, {
      rule: "Bridge quote expiry",
      message: "Bridge route quote has expired.",
      evidence: { quoteExpiresAt, evaluatedAt: now.toISOString() },
      remediation: "Request a new bridge quote before wallet signing.",
    });
  } else pass(state, "Bridge quote expiry", "Bridge route quote has not expired.", { quoteExpiresAt });

  if (!destinationAddress) {
    // Covered by metadata completeness.
  } else if (destinationAddressClassification.family === "unknown") {
    applyUnavailable(state, config, {
      rule: "Destination-chain address format",
      message: destinationAddressClassification.reason,
      evidence: { destinationChain, destinationAddress, detectedFamily: "unknown" },
      remediation: "Use a supported Casper or EVM destination chain, or add a reviewed chain-specific adapter before automated execution.",
    });
  } else if (!destinationAddressClassification.valid) {
    applyViolation(state, config, {
      rule: "Destination-chain address format",
      message: destinationAddressClassification.reason,
      evidence: { destinationChain, destinationAddress, detectedFamily: destinationAddressClassification.family, detectedKind: destinationAddressClassification.kind },
      remediation: destinationAddressClassification.family === "evm" ? "Provide a valid 0x-prefixed 20-byte destination address." : "Provide a valid Casper public key or account-hash destination.",
    });
  } else pass(state, "Destination-chain address format", "Destination address matches the supported destination-chain format.", { destinationChain, destinationAddress, detectedKind: destinationAddressClassification.kind });

  if (sourceConfirmations < config.minSourceConfirmations) {
    applyViolation(state, config, {
      rule: "Source-chain confirmation requirement",
      message: `Bridge route provides fewer source confirmations than required (${sourceConfirmations} < ${config.minSourceConfirmations}).`,
      evidence: { sourceConfirmations, minimum: config.minSourceConfirmations },
      remediation: "Use a route with sufficient source-chain finality requirements.",
    });
  } else pass(state, "Source-chain confirmation requirement", "Source-chain confirmation requirement meets policy.", { sourceConfirmations, minimum: config.minSourceConfirmations });

  if (destinationConfirmations < config.minDestinationConfirmations) {
    applyViolation(state, config, {
      rule: "Destination-chain confirmation requirement",
      message: `Bridge route provides fewer destination confirmations than required (${destinationConfirmations} < ${config.minDestinationConfirmations}).`,
      evidence: { destinationConfirmations, minimum: config.minDestinationConfirmations },
      remediation: "Use a route with sufficient destination-chain finality requirements.",
    });
  } else pass(state, "Destination-chain confirmation requirement", "Destination-chain confirmation requirement meets policy.", { destinationConfirmations, minimum: config.minDestinationConfirmations });

  return {
    ...state,
    applicable: true,
    context: {
      status: missingFields.length > 0 ? "incomplete" : state.hardBlock ? "failed" : state.needsReview ? "review" : "evaluated",
      mode: config.mode,
      unavailableAction: config.unavailableAction,
      provider: clean(request.bridgeProvider),
      sourceChain,
      destinationChain,
      routeId,
      asset,
      amount,
      destinationAddress,
      destinationAddressFamily: destinationAddressClassification.family,
      destinationAddressValid: destinationAddressClassification.valid,
      feeBps: feeBps === null ? null : Math.round(feeBps * 100) / 100,
      maxFeeBps: config.maxFeeBps,
      quotedOutput,
      minimumReceived,
      quoteTimestamp,
      quoteExpiresAt,
      sourceConfirmations,
      destinationConfirmations,
      allowedProviders: config.allowedProviders,
      allowedSourceChains: config.allowedSourceChains,
      allowedDestinationChains: config.allowedDestinationChains,
      allowedAssets: config.allowedAssets,
      maxAmount: config.maxAmount,
    },
  };
}
