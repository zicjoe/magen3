const SHA256 = /^(?:0x)?[0-9a-f]{64}$/i;
const ENDPOINT_LIMIT = 10;

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function bool(value) { return value === true || lower(value) === "true"; }
function array(value) { return Array.isArray(value) ? value : []; }
function unique(values) { return [...new Set(array(values).map(clean).filter(Boolean))]; }
function finiteInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
function normalizeUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/$/, "");
  }
}
function validEndpoint(value) {
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
function parseEndpointEntry(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return {
      id: clean(entry.id || entry.providerId || entry.provider_id),
      endpoint: normalizeUrl(entry.endpoint || entry.url || entry.rpcUrl || entry.rpc_url),
      chainName: clean(entry.chainName || entry.chain_name),
      networkIdentifier: clean(entry.networkIdentifier || entry.network_identifier),
      genesisHash: lower(entry.genesisHash || entry.genesis_hash).replace(/^0x/, ""),
    };
  }
  const [endpoint = "", id = "", chainName = "", networkIdentifier = "", genesisHash = ""] = clean(entry).split("|").map((item) => item.trim());
  return { endpoint: normalizeUrl(endpoint), id, chainName, networkIdentifier, genesisHash: lower(genesisHash).replace(/^0x/, "") };
}
function normalizeObservation(item = {}) {
  const source = item && typeof item === "object" && !Array.isArray(item) ? item : {};
  return {
    providerId: clean(source.providerId || source.provider_id || source.id),
    endpoint: normalizeUrl(source.endpoint || source.url || source.rpcUrl || source.rpc_url),
    chainName: clean(source.chainName || source.chain_name),
    networkIdentifier: clean(source.networkIdentifier || source.network_identifier || source.networkId || source.network_id),
    genesisHash: lower(source.genesisHash || source.genesis_hash || source.chainFingerprint || source.chain_fingerprint).replace(/^0x/, ""),
    tls: bool(source.tls) || normalizeUrl(source.endpoint || source.url || source.rpcUrl || source.rpc_url).startsWith("https://"),
    synced: source.synced === undefined && source.isSynced === undefined && source.is_synced === undefined ? null : bool(source.synced ?? source.isSynced ?? source.is_synced),
    latestBlockHeight: finiteInteger(source.latestBlockHeight ?? source.latest_block_height ?? source.blockHeight ?? source.block_height, null, { min: 0 }),
    latestBlockTimestamp: clean(source.latestBlockTimestamp || source.latest_block_timestamp || source.blockTimestamp || source.block_timestamp),
    responseTimestamp: clean(source.responseTimestamp || source.response_timestamp || source.observedAt || source.observed_at),
    timedOut: bool(source.timedOut ?? source.timed_out),
    rateLimited: bool(source.rateLimited ?? source.rate_limited),
    speculative: bool(source.speculative ?? source.speculativeExecution ?? source.speculative_execution),
    transactionStatusHash: lower(source.transactionStatusHash || source.transaction_status_hash || source.transactionStateHash || source.transaction_state_hash).replace(/^0x/, ""),
    contractStateHash: lower(source.contractStateHash || source.contract_state_hash).replace(/^0x/, ""),
  };
}
function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.rpcIntegrityEnabled === true,
    mode: normalizeMode(rules.rpcIntegrityMode),
    approvedRpcEndpoints: array(rules.approvedRpcEndpoints).map(parseEndpointEntry).filter((item) => item.endpoint || item.id).slice(0, ENDPOINT_LIMIT),
    requireTls: rules.rpcIntegrityRequireTls !== false && rules.requireTls !== false,
    maximumBlockAgeSeconds: finiteInteger(rules.rpcIntegrityMaximumBlockAgeSeconds ?? rules.maximumBlockAgeSeconds, 120, { min: 5, max: 86400 }),
    minimumRpcProviders: finiteInteger(rules.rpcIntegrityMinimumProviders ?? rules.minimumRpcProviders, 1, { min: 1, max: ENDPOINT_LIMIT }),
    maximumHeightDifference: finiteInteger(rules.rpcIntegrityMaximumHeightDifference, 5, { min: 0, max: 1000000 }),
    disagreementAction: normalizeAction(rules.rpcIntegrityDisagreementAction ?? rules.rpcDisagreementAction, "Block"),
    unavailableAction: normalizeAction(rules.rpcIntegrityUnavailableAction ?? rules.rpcUnavailableAction, "Review"),
    requireNetworkIdentity: rules.rpcIntegrityRequireNetworkIdentity !== false && rules.requireNetworkIdentity !== false,
    allowAutomaticFailover: rules.rpcIntegrityAllowAutomaticFailover === true || rules.allowAutomaticFailover === true,
  };
}
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "RPC & Chain Integrity", status, severity, rule, message, evidence, remediation };
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
  state.scoreDelta += effective === "Review" ? 16 : 8;
  state.violations.push({ rule, message });
  if (effective === "Review") state.needsReview = true;
}
function unavailable(state, config, rule, message, evidence, remediation) {
  if (config.unavailableAction === "Block") return hardFail(state, rule, message, evidence, remediation, "high");
  add(state, "unavailable", rule, message, evidence, remediation, config.unavailableAction === "Review" ? "high" : "medium");
  state.scoreDelta += config.unavailableAction === "Review" ? 16 : 6;
  state.violations.push({ rule, message });
  if (config.unavailableAction === "Review") state.needsReview = true;
}
function endpointMatches(entry, observation) {
  const idMatch = entry.id && observation.providerId && lower(entry.id) === lower(observation.providerId);
  const urlMatch = entry.endpoint && observation.endpoint && entry.endpoint === observation.endpoint;
  return Boolean(idMatch || urlMatch);
}
function nonEmptySet(values) { return new Set(values.map(clean).filter(Boolean).map((item) => item.toLowerCase())); }
function dateAgeSeconds(value, nowMs) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.max(0, Math.floor((nowMs - parsed) / 1000));
}
function previousProviderHeights(auditLogs = [], agentId = "") {
  const heights = new Map();
  for (const log of auditLogs) {
    if (agentId && log.agentId !== agentId) continue;
    const original = log.originalIntent && typeof log.originalIntent === "object" ? log.originalIntent : {};
    const rpc = original.rpcIntegrity && typeof original.rpcIntegrity === "object" ? original.rpcIntegrity : {};
    const observations = array(rpc.providerObservations || rpc.observations);
    for (const raw of observations) {
      const observation = normalizeObservation(raw);
      const key = lower(observation.providerId || observation.endpoint);
      if (!key || observation.latestBlockHeight === null) continue;
      heights.set(key, Math.max(heights.get(key) ?? -1, observation.latestBlockHeight));
    }
  }
  return heights;
}

export function evaluateRpcChainIntegrity({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const config = settings(policy);
  const state = createState(config);
  const metadataSupplied = request.rpcIntegrityMetadataSupplied === true;
  const observations = array(request.rpcProviderObservations).slice(0, ENDPOINT_LIMIT).map(normalizeObservation);
  const expectedChainName = clean(request.rpcExpectedChainName || request.chainName);
  const expectedNetworkIdentifier = clean(request.rpcExpectedNetworkIdentifier);
  const expectedGenesisHash = lower(request.rpcExpectedGenesisHash).replace(/^0x/, "");
  const selectedEndpoint = normalizeUrl(request.rpcSelectedEndpoint);
  const selectedProviderId = clean(request.rpcSelectedProviderId);
  const automaticFailoverUsed = request.rpcAutomaticFailoverUsed === true;
  const failoverFrom = normalizeUrl(request.rpcFailoverFrom);
  const failoverReason = clean(request.rpcFailoverReason);

  if (!config.enabled) {
    add(state, "skipped", "RPC integrity configuration", "RPC & Chain Integrity is disabled for the active policy.");
    state.context = { enabled: false, status: "skipped", metadataSupplied };
    return state;
  }

  if (!metadataSupplied) {
    unavailable(state, config, "Verifiable RPC observations", "The request does not include verifiable RPC and chain observations.", {}, "Submit provider observations from a trusted adapter or configure the control to Observe until provider evidence is available.");
    state.context = { enabled: true, mode: config.mode, metadataSupplied: false, providerCount: 0 };
    return state;
  }

  const malformed = [];
  if (expectedGenesisHash && !SHA256.test(expectedGenesisHash)) malformed.push("expectedGenesisHash");
  if (selectedEndpoint && !validEndpoint(selectedEndpoint)) malformed.push("selectedEndpoint");
  observations.forEach((observation, index) => {
    if (!observation.providerId && !observation.endpoint) malformed.push(`providerObservations[${index}].providerId or endpoint`);
    if (observation.endpoint && !validEndpoint(observation.endpoint)) malformed.push(`providerObservations[${index}].endpoint`);
    if (observation.genesisHash && !SHA256.test(observation.genesisHash)) malformed.push(`providerObservations[${index}].genesisHash`);
    if (observation.latestBlockTimestamp && Number.isNaN(Date.parse(observation.latestBlockTimestamp))) malformed.push(`providerObservations[${index}].latestBlockTimestamp`);
    if (observation.responseTimestamp && Number.isNaN(Date.parse(observation.responseTimestamp))) malformed.push(`providerObservations[${index}].responseTimestamp`);
    if (observation.transactionStatusHash && !SHA256.test(observation.transactionStatusHash)) malformed.push(`providerObservations[${index}].transactionStatusHash`);
    if (observation.contractStateHash && !SHA256.test(observation.contractStateHash)) malformed.push(`providerObservations[${index}].contractStateHash`);
  });
  if (malformed.length > 0) {
    hardFail(state, "Valid RPC evidence", "RPC or chain-integrity metadata is malformed.", { malformed }, "Rebuild the provider observations using valid endpoint URLs, timestamps, heights, and 64-character hashes.", "critical");
    state.context = { enabled: true, mode: config.mode, metadataSupplied: true, malformed };
    return state;
  }

  const usable = observations.filter((item) => !item.timedOut && !item.rateLimited);
  const selected = observations.find((item) => (selectedProviderId && lower(item.providerId) === lower(selectedProviderId)) || (selectedEndpoint && item.endpoint === selectedEndpoint));
  const previousHeights = previousProviderHeights(auditLogs, request.agentId);
  const nowMs = now.getTime();

  if (observations.length === 0) {
    unavailable(state, config, "RPC provider observations", "No provider observations were supplied.", {}, "Supply at least the policy minimum number of independent provider observations.");
  } else {
    add(state, "pass", "RPC provider observations", `${observations.length} RPC provider observation${observations.length === 1 ? " was" : "s were"} supplied.`, { providerCount: observations.length });
  }

  if (usable.length < config.minimumRpcProviders) {
    unavailable(state, config, "Minimum RPC provider quorum", `Only ${usable.length} usable RPC provider observation${usable.length === 1 ? " is" : "s are"} available; policy requires ${config.minimumRpcProviders}.`, { usableProviders: usable.length, requiredProviders: config.minimumRpcProviders }, "Restore the required provider quorum or use an authorized failover path before execution.");
  } else {
    add(state, "pass", "Minimum RPC provider quorum", `The request includes ${usable.length} usable provider observations, meeting the required quorum of ${config.minimumRpcProviders}.`, { usableProviders: usable.length, requiredProviders: config.minimumRpcProviders });
  }

  if (selectedEndpoint || selectedProviderId) {
    if (!selected) {
      hardFail(state, "Selected RPC provider evidence", "The selected RPC provider is not represented in the submitted observations.", { selectedEndpoint, selectedProviderId }, "Include the exact selected provider observation before authorization.");
    } else {
      add(state, "pass", "Selected RPC provider evidence", "The selected RPC provider is represented in the submitted evidence.", { selectedEndpoint: selected.endpoint, selectedProviderId: selected.providerId });
    }
  } else {
    unavailable(state, config, "Selected RPC provider", "The execution path does not identify which observed RPC provider supplied the selected chain state.", {}, "Identify the selected endpoint or provider ID so authorization can bind to the exact execution data source.");
  }

  if (config.approvedRpcEndpoints.length > 0) {
    for (const observation of observations) {
      if (!config.approvedRpcEndpoints.some((entry) => endpointMatches(entry, observation))) {
        policyViolation(state, config, null, "Approved RPC endpoint", "An RPC observation came from an endpoint or provider not approved by policy.", { providerId: observation.providerId, endpoint: observation.endpoint }, "Use an approved RPC endpoint or update the policy through an authorized configuration change.", "high");
      }
    }
    if (selected && config.approvedRpcEndpoints.some((entry) => endpointMatches(entry, selected))) {
      add(state, "pass", "Selected approved RPC endpoint", "The selected provider is approved by policy.", { providerId: selected.providerId, endpoint: selected.endpoint });
    }
  } else {
    unavailable(state, config, "Approved RPC endpoint policy", "No approved RPC endpoints are configured for this policy.", {}, "Configure explicit approved provider IDs or HTTPS RPC endpoints.");
  }

  if (config.requireTls) {
    for (const observation of observations) {
      if (!observation.tls) {
        policyViolation(state, config, null, "TLS-protected RPC transport", "An RPC observation used a non-TLS transport.", { providerId: observation.providerId, endpoint: observation.endpoint }, "Use HTTPS RPC transport or a separately authenticated local execution channel.", "high");
      }
    }
    if (observations.length > 0 && observations.every((item) => item.tls)) add(state, "pass", "TLS-protected RPC transport", "All observed RPC providers used TLS-protected endpoints.", { providerCount: observations.length });
  }

  for (const observation of observations) {
    if (observation.speculative && selected === observation) {
      hardFail(state, "Speculative endpoint isolation", "The selected execution state came from an endpoint marked for speculative execution.", { providerId: observation.providerId, endpoint: observation.endpoint }, "Use an approved non-speculative endpoint for authorization and execution.", "critical");
    }
    if (observation.synced === null) {
      unavailable(state, config, "RPC synchronization evidence", `RPC provider ${observation.providerId || observation.endpoint} did not supply a synchronization state.`, { providerId: observation.providerId, endpoint: observation.endpoint }, "Submit an explicit synchronized or unsynchronized observation from the trusted provider adapter.");
    } else if (observation.synced === false) {
      policyViolation(state, config, null, "RPC synchronization state", "An RPC provider reported that it was not synchronized.", { providerId: observation.providerId, endpoint: observation.endpoint }, "Remove the unsynchronized provider from the authorization quorum and retry with synchronized providers.", "high");
    }
    if (observation.latestBlockHeight === null) {
      unavailable(state, config, "Latest block height", `RPC provider ${observation.providerId || observation.endpoint} did not supply a latest block height.`, { providerId: observation.providerId, endpoint: observation.endpoint }, "Submit the latest observed block height so regression and provider-agreement checks can run.");
    }
    if (observation.timedOut || observation.rateLimited) {
      unavailable(state, config, "RPC provider availability", `RPC provider ${observation.providerId || observation.endpoint} was unavailable due to ${observation.timedOut ? "timeout" : "rate limiting"}.`, { providerId: observation.providerId, endpoint: observation.endpoint, timedOut: observation.timedOut, rateLimited: observation.rateLimited }, "Use an approved healthy provider or perform an authorized failover.");
    }
    const age = dateAgeSeconds(observation.latestBlockTimestamp, nowMs);
    if (age === null) {
      unavailable(state, config, "Latest block freshness", `RPC provider ${observation.providerId || observation.endpoint} did not supply a valid latest-block timestamp.`, { providerId: observation.providerId, endpoint: observation.endpoint }, "Submit the observed latest-block timestamp from the provider.");
    } else if (age > config.maximumBlockAgeSeconds) {
      policyViolation(state, config, null, "Latest block freshness", "An RPC provider's latest block is older than the configured freshness limit.", { providerId: observation.providerId, endpoint: observation.endpoint, ageSeconds: age, maximumAgeSeconds: config.maximumBlockAgeSeconds }, "Use a synchronized provider with a fresh latest block before execution.", "high");
    }
    const key = lower(observation.providerId || observation.endpoint);
    const previousHeight = key ? previousHeights.get(key) : undefined;
    if (observation.latestBlockHeight !== null && previousHeight !== undefined && observation.latestBlockHeight < previousHeight) {
      hardFail(state, "Block-height regression", "An RPC provider reported a block height lower than its previously audited height.", { providerId: observation.providerId, endpoint: observation.endpoint, currentHeight: observation.latestBlockHeight, previousHeight }, "Treat the provider as unsafe until the regression is explained and a trusted provider confirms canonical state.", "critical");
    }
  }

  const chainNames = nonEmptySet(usable.map((item) => item.chainName));
  const networkIds = nonEmptySet(usable.map((item) => item.networkIdentifier));
  const genesisHashes = nonEmptySet(usable.map((item) => item.genesisHash));
  let networkIdentityEvidenceComplete = true;
  if (config.requireNetworkIdentity) {
    if (!expectedChainName && !expectedNetworkIdentifier && !expectedGenesisHash) {
      networkIdentityEvidenceComplete = false;
      unavailable(state, config, "Expected network identity", "The request does not declare an expected chain name, network identifier, or genesis hash.", {}, "Bind the request to the expected chain identity before execution.");
    }
    for (const observation of usable) {
      const missingIdentityFields = [];
      if (expectedChainName && !observation.chainName) missingIdentityFields.push("chainName");
      if (expectedNetworkIdentifier && !observation.networkIdentifier) missingIdentityFields.push("networkIdentifier");
      if (expectedGenesisHash && !observation.genesisHash) missingIdentityFields.push("genesisHash");
      if (missingIdentityFields.length > 0) {
        networkIdentityEvidenceComplete = false;
        unavailable(state, config, "RPC network identity evidence", "An RPC provider omitted identity fields required to verify the expected network.", { providerId: observation.providerId, endpoint: observation.endpoint, missingIdentityFields }, "Configure the trusted adapter to submit every network-identity field required by policy.");
      }
      const mismatch = (expectedChainName && observation.chainName && lower(observation.chainName) !== lower(expectedChainName)) ||
        (expectedNetworkIdentifier && observation.networkIdentifier && lower(observation.networkIdentifier) !== lower(expectedNetworkIdentifier)) ||
        (expectedGenesisHash && observation.genesisHash && lower(observation.genesisHash) !== lower(expectedGenesisHash));
      if (mismatch) {
        hardFail(state, "Network identity binding", "An RPC provider reported a chain identity that does not match the expected network.", { expectedChainName, expectedNetworkIdentifier, expectedGenesisHash, providerId: observation.providerId, observedChainName: observation.chainName, observedNetworkIdentifier: observation.networkIdentifier, observedGenesisHash: observation.genesisHash }, "Stop execution and use an RPC provider for the exact expected network.", "critical");
      }
    }
    if (usable.length > 0 && networkIdentityEvidenceComplete && !state.findings.some((item) => item.rule === "Network identity binding" && item.status === "fail")) add(state, "pass", "Network identity binding", "Usable RPC providers match the expected chain identity.", { expectedChainName, expectedNetworkIdentifier, expectedGenesisHash });
  }

  const disagreement = chainNames.size > 1 || networkIds.size > 1 || genesisHashes.size > 1;
  if (disagreement) {
    policyViolation(state, config, config.disagreementAction, "RPC network disagreement", "RPC providers disagree about the chain identity.", { chainNames: [...chainNames], networkIdentifiers: [...networkIds], genesisHashes: [...genesisHashes] }, "Do not execute until approved providers agree on the canonical network identity.", "critical");
  } else if (usable.length > 1) {
    add(state, "pass", "RPC network agreement", "Usable RPC providers agree on the chain identity.", { providerCount: usable.length });
  }

  const heights = usable.map((item) => item.latestBlockHeight).filter((value) => value !== null);
  if (heights.length > 1) {
    const spread = Math.max(...heights) - Math.min(...heights);
    if (spread > config.maximumHeightDifference) {
      policyViolation(state, config, config.disagreementAction, "RPC block-height agreement", "RPC providers disagree beyond the configured block-height tolerance.", { minimumHeight: Math.min(...heights), maximumHeight: Math.max(...heights), difference: spread, maximumDifference: config.maximumHeightDifference }, "Wait for provider convergence or remove stale providers from the approved quorum.", "high");
    } else add(state, "pass", "RPC block-height agreement", "RPC provider heights are within the configured tolerance.", { difference: spread, maximumDifference: config.maximumHeightDifference });
  }

  const transactionHashes = nonEmptySet(usable.map((item) => item.transactionStatusHash));
  if (transactionHashes.size > 1) {
    policyViolation(state, config, config.disagreementAction, "Transaction-status consistency", "RPC providers returned inconsistent transaction-status evidence.", { transactionStatusHashes: [...transactionHashes] }, "Do not retry or finalize execution until transaction status agrees across approved providers.", "critical");
  } else if (transactionHashes.size === 1) add(state, "pass", "Transaction-status consistency", "RPC providers agree on the submitted transaction-status evidence.", { transactionStatusHash: [...transactionHashes][0] });

  const contractStateHashes = nonEmptySet(usable.map((item) => item.contractStateHash));
  if (contractStateHashes.size > 1) {
    policyViolation(state, config, config.disagreementAction, "Contract-state consistency", "RPC providers returned inconsistent contract-state evidence.", { contractStateHashes: [...contractStateHashes] }, "Do not authorize state-sensitive execution until approved providers agree on the contract state.", "critical");
  } else if (contractStateHashes.size === 1) add(state, "pass", "Contract-state consistency", "RPC providers agree on the contract-state evidence.", { contractStateHash: [...contractStateHashes][0] });

  if (automaticFailoverUsed) {
    if (!config.allowAutomaticFailover) {
      policyViolation(state, config, null, "Authorized RPC failover", "Automatic RPC failover was used but is not permitted by policy.", { failoverFrom, selectedEndpoint, failoverReason }, "Require explicit review or enable automatic failover only after approving both providers.", "high");
    } else if (!failoverFrom || !failoverReason || !selected) {
      unavailable(state, config, "Auditable RPC failover", "Automatic failover metadata is incomplete.", { failoverFrom, selectedEndpoint, failoverReason }, "Record the failed provider, selected provider, and deterministic failover reason.");
    } else {
      add(state, "pass", "Authorized RPC failover", "Automatic failover used approved, auditable provider evidence.", { failoverFrom, selectedEndpoint: selected.endpoint, selectedProviderId: selected.providerId, failoverReason });
    }
  }

  state.context = {
    status: state.hardBlock ? "failed" : state.needsReview ? "review" : state.violations.length > 0 ? "warning" : "passed",
    enabled: true,
    mode: config.mode,
    metadataSupplied: true,
    expectedChainName,
    expectedNetworkIdentifier,
    expectedGenesisHash,
    selectedEndpoint,
    selectedProviderId,
    providerCount: observations.length,
    usableProviderCount: usable.length,
    approvedProviderCount: observations.filter((observation) => config.approvedRpcEndpoints.some((entry) => endpointMatches(entry, observation))).length,
    automaticFailoverUsed,
    failoverFrom,
    failoverReason,
    networkIdentityVerified: config.requireNetworkIdentity ? networkIdentityEvidenceComplete && usable.length > 0 && !state.findings.some((item) => item.rule === "Network identity binding" && item.status === "fail") : null,
    networkAgreement: !disagreement,
    transactionStatusAgreement: transactionHashes.size <= 1,
    contractStateAgreement: contractStateHashes.size <= 1,
    providerObservations: observations.map((item) => ({ ...item })),
    violations: state.violations,
  };
  return state;
}

export function getRpcChainIntegrityStatus() {
  return {
    status: "foundation_available",
    protectionArea: "Execution Integrity",
    control: "RPC & Chain Integrity",
    deterministicEvidenceValidation: true,
    networkIdentityBinding: true,
    approvedProviderPolicy: true,
    tlsAndSyncChecks: true,
    freshnessAndHeightRegression: true,
    multiProviderAgreement: true,
    transactionAndContractStateConsistency: true,
    auditableFailover: true,
    liveCriteriaRemaining: "Connect and verify trusted RPC adapters in the deployed environment so provider observations are collected directly rather than supplied by an integration.",
  };
}
