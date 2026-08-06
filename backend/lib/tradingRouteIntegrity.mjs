import { createHash } from "node:crypto";

const norm = (value) => String(value ?? "").trim().toLowerCase();
const text = (value) => String(value ?? "").trim();
const finite = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const actionFor = (value, fallback = "review") => ["allow", "warn", "review", "block"].includes(norm(value)) ? norm(value) : fallback;
const ordered = (value) => (Array.isArray(value) ? value : []).map(text).filter(Boolean);
const unique = (value) => [...new Set(ordered(value))];
const comparable = (value) => norm(value).replace(/^eip155:/, "");

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = canonicalize(value[key]);
      return out;
    }, {});
  }
  if (typeof value === "string") return value.trim();
  return value;
}

const hash = (value) => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
const hashHex = (value) => createHash("sha256").update(text(value).toLowerCase()).digest("hex");
const SHA256_HEX = /^[0-9a-f]{64}$/;
const HEX_DATA = /^0x(?:[0-9a-f]{2})*$/i;

function configFor(policy = {}) {
  const raw = policy?.structuredRules?.tradingRouteIntegrity || policy?.structuredRules?.routeIntegrity || {};
  return {
    enabled: raw.enabled === true || raw.required === true,
    required: raw.required === true,
    requireQuoteId: raw.requireQuoteId !== false,
    requireCalldataHash: raw.requireCalldataHash === true,
    requirePayloadBinding: raw.requirePayloadBinding === true,
    requireAuthorizedRouteHash: raw.requireAuthorizedRouteHash === true,
    maxPools: Math.max(1, Math.min(32, Math.trunc(finite(raw.maxPools) ?? 8))),
    maxIntermediaryAssets: Math.max(0, Math.min(16, Math.trunc(finite(raw.maxIntermediaryAssets) ?? 4))),
    maxRouteFeeBps: Math.max(0, Math.min(10000, finite(raw.maxRouteFeeBps) ?? 300)),
    missingEvidenceAction: actionFor(raw.missingEvidenceAction, "review"),
    routeMutationAction: actionFor(raw.routeMutationAction, "block"),
    payloadMismatchAction: actionFor(raw.payloadMismatchAction, "block"),
    routerMismatchAction: actionFor(raw.routerMismatchAction, "block"),
    assetMismatchAction: actionFor(raw.assetMismatchAction, "block"),
    amountMismatchAction: actionFor(raw.amountMismatchAction, "block"),
    unapprovedRouterAction: actionFor(raw.unapprovedRouterAction, "block"),
    unapprovedAggregatorAction: actionFor(raw.unapprovedAggregatorAction, "review"),
    unexpectedIntermediaryAction: actionFor(raw.unexpectedIntermediaryAction, "review"),
    unexpectedPoolAction: actionFor(raw.unexpectedPoolAction, "review"),
    unexpectedFeeRecipientAction: actionFor(raw.unexpectedFeeRecipientAction, "review"),
    excessiveRouteFeeAction: actionFor(raw.excessiveRouteFeeAction, "review"),
    allowedRouters: unique(raw.allowedRouters).map(comparable),
    allowedAggregators: unique(raw.allowedAggregators).map(comparable),
    allowedPools: unique(raw.allowedPools).map(comparable),
    allowedIntermediaryContracts: unique(raw.allowedIntermediaryContracts).map(comparable),
    allowedIntermediateAssets: unique(raw.allowedIntermediateAssets).map(comparable),
    allowedFeeRecipients: unique(raw.allowedFeeRecipients).map(comparable),
  };
}

function finding({ status = "pass", severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Trading Route Integrity", status, severity, rule, message, evidence, remediation };
}

function apply(state, action, data) {
  if (action === "allow") return;
  if (action === "warn") state.findings.push(finding({ ...data, status: "warning", severity: "low" }));
  if (action === "review") {
    state.needsReview = true;
    state.scoreDelta += 18;
    state.findings.push(finding({ ...data, status: "warning", severity: "medium" }));
  }
  if (action === "block") {
    state.hardBlock = true;
    state.scoreDelta += 40;
    state.findings.push(finding({ ...data, status: "fail", severity: "high" }));
  }
  state.checksFailed.push(data.message);
}

function listMismatch(observed, allowed) {
  if (allowed.length === 0) return [];
  return observed.filter((item) => !allowed.includes(comparable(item)));
}

function routeSnapshot(request) {
  const tokenPath = ordered(request.tradingRouteTokenPath);
  const poolSequence = ordered(request.tradingRoutePoolSequence);
  const feeRecipients = ordered(request.tradingRouteFeeRecipients);
  const intermediaryContracts = ordered(request.tradingRouteIntermediaryContracts);
  return {
    quoteProvider: text(request.tradingRouteQuoteProvider || request.executionQuoteProvider),
    quoteId: text(request.tradingRouteQuoteId || request.executionQuoteId),
    router: text(request.tradingRouteRouter || request.target),
    aggregator: text(request.tradingRouteAggregator),
    protocol: text(request.tradingRouteProtocol),
    poolSequence,
    tokenPath,
    inputAsset: text(request.tradingRouteInputAsset || request.asset),
    outputAsset: text(request.tradingRouteOutputAsset || request.outputAsset),
    inputAmount: finite(request.tradingRouteInputAmount ?? request.amount),
    expectedOutput: finite(request.tradingRouteExpectedOutput ?? request.expectedOutput),
    minimumOutput: finite(request.tradingRouteMinimumOutput ?? request.minimumReceived),
    executionMode: norm(request.tradingRouteExecutionMode || "exact_input"),
    routeFeeBps: finite(request.tradingRouteFeeBps),
    routeFeeAmount: finite(request.tradingRouteFeeAmount),
    feeRecipients,
    intermediaryContracts,
    calldataHash: norm(request.tradingRouteCalldataHash),
    payloadHash: norm(request.tradingRoutePayloadHash),
    expiresAt: text(request.tradingRouteExpiresAt || request.executionQuoteExpiresAt),
  };
}

export function buildTradingRouteFingerprint(request = {}) {
  return hash(routeSnapshot(request));
}

export function evaluateTradingRouteIntegrity({ request = {}, policy = {} } = {}) {
  const config = configFor(policy);
  const state = { checksPassed: [], checksFailed: [], findings: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const actionType = norm(request.actionType);
  const applicable = /swap|trade|exchange/.test(actionType);
  const route = routeSnapshot(request);
  const routeFingerprint = hash(route);
  const suppliedAuthorizedRouteHash = norm(request.tradingRouteAuthorizedRouteHash);
  const calldata = text(request.tradingRouteCalldata);
  const validCalldata = !calldata || HEX_DATA.test(calldata);
  const computedCalldataHash = calldata && validCalldata ? hashHex(calldata) : "";
  const simulationPayloadHash = norm(request.statefulSimulationEvidence?.payloadHash || request.statefulSimulationEvidence?.binding?.payloadHash);
  const inputAsset = comparable(route.inputAsset);
  const outputAsset = comparable(route.outputAsset);
  const tokenPath = route.tokenPath.map(comparable);
  const intermediaryAssets = tokenPath.length > 2 ? tokenPath.slice(1, -1) : [];
  const unexpectedIntermediaryAssets = listMismatch(intermediaryAssets, config.allowedIntermediateAssets);
  const unexpectedPools = listMismatch(route.poolSequence, config.allowedPools);
  const unexpectedFeeRecipients = listMismatch(route.feeRecipients, config.allowedFeeRecipients);
  const unexpectedIntermediaryContracts = listMismatch(route.intermediaryContracts, config.allowedIntermediaryContracts);

  const context = {
    schemaVersion: "1.0.0",
    evaluatedAt: new Date().toISOString(),
    applicable,
    actionType,
    ...route,
    routeFingerprint,
    authorizedRouteHash: suppliedAuthorizedRouteHash || null,
    computedCalldataHash: computedCalldataHash || null,
    simulationPayloadHash: simulationPayloadHash || null,
    intermediaryAssets,
    unexpectedIntermediaryAssets,
    unexpectedPools,
    unexpectedFeeRecipients,
    unexpectedIntermediaryContracts,
    config,
  };

  if (!config.enabled || !applicable) {
    state.findings.push(finding({ status: "skipped", rule: "Route-integrity activation", message: !config.enabled ? "Trading Route Integrity is not enabled for this policy." : "This action does not require trading-route validation.", evidence: { enabled: config.enabled, actionType } }));
    return { ...state, context: { ...context, status: "not_required" } };
  }

  const missing = [];
  if (!route.router) missing.push("router");
  if (!route.inputAsset) missing.push("inputAsset");
  if (!route.outputAsset) missing.push("outputAsset");
  if (route.inputAmount === null) missing.push("inputAmount");
  if (route.expectedOutput === null) missing.push("expectedOutput");
  if (route.minimumOutput === null) missing.push("minimumOutput");
  if (config.requireQuoteId && !route.quoteId) missing.push("quoteId");
  if (missing.length > 0) {
    apply(state, config.missingEvidenceAction, {
      rule: "Route evidence completeness",
      message: `Trading route evidence is incomplete: ${missing.join(", ")}.`,
      evidence: { code: "TRADING_ROUTE_EVIDENCE_MISSING", field: missing[0], missingFields: missing },
      remediation: "Reconstruct the quote with the exact router, assets, amounts, output bounds, and provider route identifier.",
    });
  } else {
    state.checksPassed.push("Trading route evidence is complete.");
    state.findings.push(finding({ rule: "Route evidence completeness", message: "Required route identity and amount fields are present.", evidence: { quoteId: route.quoteId, router: route.router } }));
  }

  if (request.target && route.router && comparable(request.target) !== comparable(route.router)) {
    apply(state, config.routerMismatchAction, {
      rule: "Router-to-payload binding",
      message: "The final transaction target differs from the authorized route router.",
      evidence: { code: "TRADING_ROUTE_ROUTER_MISMATCH", field: "target", expected: route.router, received: request.target, mismatchFields: ["target", "tradingRoute.router"] },
      remediation: "Rebuild the payload using the exact router returned by the authorized quote.",
    });
  }

  if (config.allowedRouters.length > 0 && route.router && !config.allowedRouters.includes(comparable(route.router))) {
    apply(state, config.unapprovedRouterAction, {
      rule: "Approved router",
      message: "The trading router is not approved by policy.",
      evidence: { code: "TRADING_ROUTE_ROUTER_NOT_APPROVED", field: "tradingRoute.router", received: route.router, expected: config.allowedRouters },
      remediation: "Use a router explicitly approved by the active policy.",
    });
  }

  if (config.allowedAggregators.length > 0 && route.aggregator && !config.allowedAggregators.includes(comparable(route.aggregator))) {
    apply(state, config.unapprovedAggregatorAction, {
      rule: "Approved aggregator",
      message: "The quote aggregator is not approved by policy.",
      evidence: { code: "TRADING_ROUTE_AGGREGATOR_NOT_APPROVED", field: "tradingRoute.aggregator", received: route.aggregator, expected: config.allowedAggregators },
      remediation: "Obtain the route from an approved aggregator.",
    });
  }

  if (inputAsset && comparable(request.asset) && inputAsset !== comparable(request.asset)) {
    apply(state, config.assetMismatchAction, {
      rule: "Input asset binding",
      message: "The route input asset differs from the protected intent.",
      evidence: { code: "TRADING_ROUTE_INPUT_ASSET_MISMATCH", field: "tradingRoute.inputAsset", expected: request.asset, received: route.inputAsset, mismatchFields: ["asset", "tradingRoute.inputAsset"] },
      remediation: "Request a route for the exact authorized input asset.",
    });
  }
  if (outputAsset && comparable(request.outputAsset) && outputAsset !== comparable(request.outputAsset)) {
    apply(state, config.assetMismatchAction, {
      rule: "Output asset binding",
      message: "The route output asset differs from the protected intent.",
      evidence: { code: "TRADING_ROUTE_OUTPUT_ASSET_MISMATCH", field: "tradingRoute.outputAsset", expected: request.outputAsset, received: route.outputAsset, mismatchFields: ["outputAsset", "tradingRoute.outputAsset"] },
      remediation: "Request a route for the exact authorized output asset.",
    });
  }

  if (tokenPath.length > 0) {
    const first = tokenPath[0];
    const last = tokenPath[tokenPath.length - 1];
    if ((inputAsset && first !== inputAsset) || (outputAsset && last !== outputAsset)) {
      apply(state, config.assetMismatchAction, {
        rule: "Token-path endpoints",
        message: "The token path does not begin and end with the authorized assets.",
        evidence: { code: "TRADING_ROUTE_TOKEN_PATH_MISMATCH", field: "tradingRoute.tokenPath", expected: [route.inputAsset, route.outputAsset], received: route.tokenPath },
        remediation: "Use a route whose first and last assets exactly match the protected input and output assets.",
      });
    }
  }

  if (route.inputAmount !== null && finite(request.amount) !== null && route.inputAmount !== finite(request.amount)) {
    apply(state, config.amountMismatchAction, {
      rule: "Input amount binding",
      message: "The route input amount differs from the policy-evaluated amount.",
      evidence: { code: "TRADING_ROUTE_INPUT_AMOUNT_MISMATCH", field: "tradingRoute.inputAmount", expected: finite(request.amount), received: route.inputAmount, mismatchFields: ["amount", "tradingRoute.inputAmount"] },
      remediation: "Requote and rebuild the route for the exact authorized input amount.",
    });
  }
  if (route.expectedOutput !== null && finite(request.expectedOutput) !== null && route.expectedOutput !== finite(request.expectedOutput)) {
    apply(state, config.amountMismatchAction, {
      rule: "Expected output binding",
      message: "The route expected output differs from the protected quote output.",
      evidence: { code: "TRADING_ROUTE_EXPECTED_OUTPUT_MISMATCH", field: "tradingRoute.expectedOutput", expected: finite(request.expectedOutput), received: route.expectedOutput },
      remediation: "Refresh the quote and bind the payload to its exact expected output.",
    });
  }
  if (route.minimumOutput !== null && finite(request.minimumReceived) !== null && route.minimumOutput !== finite(request.minimumReceived)) {
    apply(state, config.amountMismatchAction, {
      rule: "Minimum output binding",
      message: "The route minimum output differs from the policy-evaluated minimum received.",
      evidence: { code: "TRADING_ROUTE_MINIMUM_OUTPUT_MISMATCH", field: "tradingRoute.minimumOutput", expected: finite(request.minimumReceived), received: route.minimumOutput },
      remediation: "Rebuild the exact calldata using the authorized minimum output.",
    });
  }

  if (route.poolSequence.length > config.maxPools) {
    apply(state, config.unexpectedPoolAction, { rule: "Pool sequence length", message: "The route uses more pools than policy permits.", evidence: { field: "tradingRoute.poolSequence", received: route.poolSequence.length, expected: config.maxPools }, remediation: "Use a shorter approved route." });
  }
  if (intermediaryAssets.length > config.maxIntermediaryAssets || unexpectedIntermediaryAssets.length > 0) {
    apply(state, config.unexpectedIntermediaryAction, { rule: "Intermediate assets", message: "The route contains an unexpected or excessive intermediary asset path.", evidence: { field: "tradingRoute.tokenPath", intermediaryAssets, unexpectedIntermediaryAssets, maximum: config.maxIntermediaryAssets }, remediation: "Use only policy-approved intermediary assets or a direct route." });
  }
  if (unexpectedPools.length > 0 || unexpectedIntermediaryContracts.length > 0) {
    apply(state, config.unexpectedPoolAction, { rule: "Pools and intermediary contracts", message: "The route reaches a pool or intermediary contract not approved by policy.", evidence: { field: "tradingRoute.poolSequence", unexpectedPools, unexpectedIntermediaryContracts }, remediation: "Use only approved pools and intermediary contracts." });
  }
  if (unexpectedFeeRecipients.length > 0) {
    apply(state, config.unexpectedFeeRecipientAction, { rule: "Route fee recipients", message: "The route includes an unexpected fee recipient.", evidence: { field: "tradingRoute.feeRecipients", unexpectedFeeRecipients, expected: config.allowedFeeRecipients }, remediation: "Remove the unexpected recipient or use a policy-approved route." });
  }
  if (route.routeFeeBps !== null && route.routeFeeBps > config.maxRouteFeeBps) {
    apply(state, config.excessiveRouteFeeAction, { rule: "Route fees", message: "The route fee exceeds policy.", evidence: { field: "tradingRoute.routeFeeBps", received: route.routeFeeBps, expected: config.maxRouteFeeBps }, remediation: "Obtain a lower-fee route or authorized review." });
  }

  if (calldata && !validCalldata) {
    apply(state, config.routeMutationAction, { rule: "Calldata integrity", message: "Trading route calldata is malformed.", evidence: { code: "TRADING_ROUTE_CALLDATA_MALFORMED", field: "tradingRoute.calldata" }, remediation: "Provide bounded even-length hexadecimal calldata beginning with 0x." });
  }
  if (route.calldataHash && !SHA256_HEX.test(route.calldataHash)) {
    apply(state, config.routeMutationAction, { rule: "Calldata integrity", message: "The declared calldata hash is not a valid SHA-256 value.", evidence: { code: "TRADING_ROUTE_CALLDATA_HASH_INVALID", field: "tradingRoute.calldataHash", received: route.calldataHash }, remediation: "Provide the 64-character lowercase SHA-256 hash of the final calldata." });
  }
  if (calldata && validCalldata) {
    if (route.calldataHash && SHA256_HEX.test(route.calldataHash) && route.calldataHash !== computedCalldataHash) {
      apply(state, config.routeMutationAction, { rule: "Calldata integrity", message: "The supplied calldata differs from its declared hash.", evidence: { code: "TRADING_ROUTE_CALLDATA_MUTATED", field: "tradingRoute.calldata", expected: route.calldataHash, received: computedCalldataHash }, remediation: "Discard the payload and reconstruct calldata from the authorized quote." });
    }
  } else if (config.requireCalldataHash && !route.calldataHash) {
    apply(state, config.missingEvidenceAction, { rule: "Calldata integrity", message: "Policy requires a calldata hash but none was supplied.", evidence: { code: "TRADING_ROUTE_CALLDATA_HASH_MISSING", field: "tradingRoute.calldataHash" }, remediation: "Include the deterministic SHA-256 hash of the final calldata." });
  }

  if (route.payloadHash && !SHA256_HEX.test(route.payloadHash)) {
    apply(state, config.payloadMismatchAction, { rule: "Quote-to-payload binding", message: "The route payload hash is not a valid SHA-256 value.", evidence: { code: "TRADING_ROUTE_PAYLOAD_HASH_INVALID", field: "tradingRoute.payloadHash", received: route.payloadHash }, remediation: "Use the exact 64-character payload hash produced by the trusted construction adapter." });
  }
  if (simulationPayloadHash && !SHA256_HEX.test(simulationPayloadHash)) {
    apply(state, config.payloadMismatchAction, { rule: "Quote-to-payload binding", message: "Stateful Simulation returned an invalid payload hash.", evidence: { code: "TRADING_ROUTE_SIMULATION_HASH_INVALID", field: "statefulSimulation.payloadHash", received: simulationPayloadHash }, remediation: "Re-run simulation through a trusted adapter and do not sign this payload." });
  }
  if (config.requirePayloadBinding && (!route.payloadHash || !simulationPayloadHash)) {
    apply(state, config.missingEvidenceAction, { rule: "Quote-to-payload binding", message: "Policy requires payload binding, but the route or simulation payload hash is missing.", evidence: { code: "TRADING_ROUTE_PAYLOAD_BINDING_MISSING", field: "tradingRoute.payloadHash", missingFields: [!route.payloadHash ? "tradingRoute.payloadHash" : null, !simulationPayloadHash ? "statefulSimulation.payloadHash" : null].filter(Boolean) }, remediation: "Simulate the exact final payload and bind the route to the returned payload hash." });
  } else if (SHA256_HEX.test(route.payloadHash) && SHA256_HEX.test(simulationPayloadHash) && route.payloadHash !== simulationPayloadHash) {
    apply(state, config.payloadMismatchAction, { rule: "Quote-to-payload binding", message: "The final simulated payload differs from the payload authorized by the trading route.", evidence: { code: "TRADING_ROUTE_PAYLOAD_MISMATCH", field: "tradingRoute.payloadHash", expected: route.payloadHash, received: simulationPayloadHash, mismatchFields: ["tradingRoute.payloadHash", "statefulSimulation.payloadHash"] }, remediation: "Discard the mutated payload, reconstruct it from the quote, and re-simulate before signing." });
  }

  if (suppliedAuthorizedRouteHash && !SHA256_HEX.test(suppliedAuthorizedRouteHash)) {
    apply(state, config.routeMutationAction, { rule: "Authorized route fingerprint", message: "The authorized route fingerprint is not a valid SHA-256 value.", evidence: { code: "TRADING_ROUTE_AUTHORIZED_HASH_INVALID", field: "tradingRoute.authorizedRouteHash", received: suppliedAuthorizedRouteHash }, remediation: "Use the exact 64-character route fingerprint from the trusted quote adapter." });
  }
  if (config.requireAuthorizedRouteHash && !suppliedAuthorizedRouteHash) {
    apply(state, config.missingEvidenceAction, { rule: "Authorized route fingerprint", message: "Policy requires the provider-authorized route fingerprint.", evidence: { code: "TRADING_ROUTE_AUTHORIZED_HASH_MISSING", field: "tradingRoute.authorizedRouteHash" }, remediation: "Bind the trusted quote adapter's authorized route fingerprint to the request." });
  } else if (SHA256_HEX.test(suppliedAuthorizedRouteHash) && suppliedAuthorizedRouteHash !== routeFingerprint) {
    apply(state, config.routeMutationAction, { rule: "Authorized route fingerprint", message: "The submitted trading route differs from the authorized route snapshot.", evidence: { code: "TRADING_ROUTE_MUTATED", field: "tradingRoute.authorizedRouteHash", expected: suppliedAuthorizedRouteHash, received: routeFingerprint, mismatchFields: ["tradingRoute"] }, remediation: "Obtain a fresh quote and submit its unchanged route metadata and payload." });
  }

  if (!state.hardBlock && !state.needsReview) {
    state.checksPassed.push("Trading route identity and payload bindings passed.");
    state.findings.push(finding({ rule: "Trading route integrity", message: "The submitted route matches the protected assets, amounts, target, and available payload bindings.", evidence: { routeFingerprint, router: route.router, quoteId: route.quoteId } }));
  }

  return { ...state, context: { ...context, status: state.hardBlock ? "blocked" : state.needsReview ? "review_required" : "passed" } };
}
