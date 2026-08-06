import { createHash } from "node:crypto";

const norm = (value) => String(value ?? "").trim().toLowerCase();
const finite = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const actionFor = (value, fallback = "review") => ["allow", "warn", "review", "block"].includes(norm(value)) ? norm(value) : fallback;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function configFor(policy = {}) {
  const raw = policy?.structuredRules?.mevExecutionQuality || policy?.structuredRules?.executionQuality || {};
  return {
    enabled: raw.enabled === true || raw.required === true,
    required: raw.required === true,
    maxQuoteAgeSeconds: Math.max(0, finite(raw.maxQuoteAgeSeconds) ?? 60),
    requireQuoteExpiry: raw.requireQuoteExpiry === true,
    maxSlippageBps: Math.max(0, Math.min(10000, finite(raw.maxSlippageBps) ?? 500)),
    maxPriceImpactBps: Math.max(0, Math.min(10000, finite(raw.maxPriceImpactBps) ?? 1000)),
    maxSimulationDeviationBps: Math.max(0, Math.min(10000, finite(raw.maxSimulationDeviationBps) ?? 300)),
    requirePrivateExecution: raw.requirePrivateExecution === true,
    staleQuoteAction: actionFor(raw.staleQuoteAction, "review"),
    expiredQuoteAction: actionFor(raw.expiredQuoteAction, "block"),
    excessiveSlippageAction: actionFor(raw.excessiveSlippageAction, "block"),
    excessivePriceImpactAction: actionFor(raw.excessivePriceImpactAction, "review"),
    simulationDeviationAction: actionFor(raw.simulationDeviationAction, "review"),
    publicMempoolAction: actionFor(raw.publicMempoolAction, "review"),
    missingEvidenceAction: actionFor(raw.missingEvidenceAction, "review"),
    deadlineAction: actionFor(raw.deadlineAction, "block"),
  };
}

function finding({ status = "pass", severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "MEV & Execution Quality", status, severity, rule, message, evidence, remediation };
}

function apply(state, action, data) {
  if (action === "allow") return;
  if (action === "warn") state.findings.push(finding({ ...data, status: "warning", severity: "low" }));
  if (action === "review") { state.needsReview = true; state.scoreDelta += 18; state.findings.push(finding({ ...data, status: "warning", severity: "medium" })); }
  if (action === "block") { state.hardBlock = true; state.scoreDelta += 35; state.findings.push(finding({ ...data, status: "fail", severity: "high" })); }
  state.checksFailed.push(data.message);
}

const parseTime = (value) => value ? new Date(value).getTime() : NaN;
const bpsDifference = (expected, observed) => expected > 0 && observed >= 0 ? Math.max(0, Math.round(((expected - observed) / expected) * 10000)) : null;

export function evaluateMevExecutionQuality({ request = {}, policy = {}, now = new Date() } = {}) {
  const config = configFor(policy);
  const state = { checksPassed: [], checksFailed: [], findings: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const actionType = norm(request.actionType);
  const applicable = /swap|trade|exchange/.test(actionType);
  const expectedOutput = finite(request.expectedOutput);
  const minimumReceived = finite(request.minimumReceived);
  const simulatedOutput = finite(request.simulatedOutput ?? request.statefulSimulationEvidence?.executionResult?.decodedReturn ?? request.statefulSimulationEvidence?.simulatedOutput);
  const slippageBps = finite(request.slippageBps);
  const impliedSlippageBps = expectedOutput !== null && minimumReceived !== null ? bpsDifference(expectedOutput, minimumReceived) : null;
  const priceImpactBps = finite(request.priceImpactBps);
  const quoteTimestampMs = parseTime(request.executionQuoteTimestamp || request.quoteTimestamp);
  const quoteExpiresMs = parseTime(request.executionQuoteExpiresAt);
  const deadlineMs = parseTime(request.executionDeadline);
  const quoteAgeSeconds = Number.isFinite(quoteTimestampMs) ? Math.max(0, (now.getTime() - quoteTimestampMs) / 1000) : null;
  const simulationDeviationBps = expectedOutput !== null && simulatedOutput !== null ? bpsDifference(expectedOutput, simulatedOutput) : null;
  const executionChannel = norm(request.executionChannel || "unknown");
  const privateExecutionAvailable = request.privateExecutionAvailable === true;
  const context = {
    schemaVersion: "1.0.0", evaluatedAt: now.toISOString(), applicable, actionType,
    quoteProvider: request.executionQuoteProvider || null, quoteId: request.executionQuoteId || null,
    quoteTimestamp: request.executionQuoteTimestamp || request.quoteTimestamp || null,
    quoteExpiresAt: request.executionQuoteExpiresAt || null, quoteAgeSeconds,
    expectedOutput, minimumReceived, simulatedOutput, slippageBps, impliedSlippageBps,
    priceImpactBps, simulationDeviationBps, executionDeadline: request.executionDeadline || null,
    executionChannel, privateExecutionAvailable,
    simulationBlockNumber: request.statefulSimulationEvidence?.stateContext?.blockNumber ?? request.statefulSimulationEvidence?.blockNumber ?? null,
    evidenceFingerprint: hash({ actionType, expectedOutput, minimumReceived, simulatedOutput, slippageBps, priceImpactBps, quoteTimestampMs, quoteExpiresMs, deadlineMs, executionChannel }),
    config,
  };
  if (!config.enabled || !applicable) {
    state.findings.push(finding({ status: "skipped", rule: "Execution-quality activation", message: !config.enabled ? "MEV and execution-quality controls are not enabled for this policy." : "This action does not require swap execution-quality evaluation.", evidence: { enabled: config.enabled, actionType } }));
    return { ...state, context: { ...context, status: "not_required" } };
  }
  if (!Number.isFinite(quoteTimestampMs)) apply(state, config.missingEvidenceAction, { rule: "Quote freshness", message: "A valid execution quote timestamp was not supplied.", evidence: { quoteTimestamp: context.quoteTimestamp }, remediation: "Request a fresh quote and include its ISO-8601 timestamp." });
  else if (quoteAgeSeconds > config.maxQuoteAgeSeconds) apply(state, config.staleQuoteAction, { rule: "Quote freshness", message: `The execution quote is stale (${Math.round(quoteAgeSeconds)}s).`, evidence: { quoteAgeSeconds, maximumAgeSeconds: config.maxQuoteAgeSeconds }, remediation: "Refresh the quote immediately before signing." });
  else state.findings.push(finding({ rule: "Quote freshness", message: "The execution quote is within the configured freshness window.", evidence: { quoteAgeSeconds, maximumAgeSeconds: config.maxQuoteAgeSeconds } }));
  if (config.requireQuoteExpiry && !Number.isFinite(quoteExpiresMs)) apply(state, config.missingEvidenceAction, { rule: "Quote expiry", message: "Quote expiry is required but missing or invalid.", evidence: { quoteExpiresAt: context.quoteExpiresAt }, remediation: "Include the provider-issued quote expiry." });
  else if (Number.isFinite(quoteExpiresMs) && quoteExpiresMs <= now.getTime()) apply(state, config.expiredQuoteAction, { rule: "Quote expiry", message: "The execution quote has expired.", evidence: { quoteExpiresAt: context.quoteExpiresAt }, remediation: "Obtain a new quote before signing." });
  if (Number.isFinite(deadlineMs) && deadlineMs <= now.getTime()) apply(state, config.deadlineAction, { rule: "Execution deadline", message: "The transaction deadline has expired.", evidence: { executionDeadline: request.executionDeadline }, remediation: "Construct a new payload with an authorized future deadline." });
  const effectiveSlippage = slippageBps ?? impliedSlippageBps;
  if (effectiveSlippage === null) apply(state, config.missingEvidenceAction, { rule: "Slippage protection", message: "Slippage protection could not be verified.", evidence: { slippageBps, expectedOutput, minimumReceived }, remediation: "Include slippageBps or both expectedOutput and minimumReceived." });
  else if (effectiveSlippage > config.maxSlippageBps) apply(state, config.excessiveSlippageAction, { rule: "Slippage protection", message: "The proposed slippage exceeds policy.", evidence: { observedBps: effectiveSlippage, maximumBps: config.maxSlippageBps }, remediation: "Lower the slippage tolerance and reconstruct the payload." });
  else state.findings.push(finding({ rule: "Slippage protection", message: "Slippage is within the configured limit.", evidence: { observedBps: effectiveSlippage, maximumBps: config.maxSlippageBps } }));
  if (priceImpactBps !== null && priceImpactBps > config.maxPriceImpactBps) apply(state, config.excessivePriceImpactAction, { rule: "Price impact", message: "Quoted price impact exceeds policy.", evidence: { observedBps: priceImpactBps, maximumBps: config.maxPriceImpactBps }, remediation: "Reduce trade size or obtain a better execution quote." });
  if (simulationDeviationBps !== null && simulationDeviationBps > config.maxSimulationDeviationBps) apply(state, config.simulationDeviationAction, { rule: "Simulation-to-quote deviation", message: "The simulated output is materially below the quoted output.", evidence: { expectedOutput, simulatedOutput, deviationBps: simulationDeviationBps, maximumBps: config.maxSimulationDeviationBps }, remediation: "Refresh the quote and re-simulate the exact final payload." });
  if (config.requirePrivateExecution && !privateExecutionAvailable) apply(state, config.publicMempoolAction, { rule: "Execution channel", message: "Private execution is required but unavailable.", evidence: { executionChannel, privateExecutionAvailable }, remediation: "Use an approved private relay or request authorized review." });
  else if (executionChannel === "public" || executionChannel === "public_mempool") apply(state, config.publicMempoolAction, { rule: "Public mempool exposure", message: "The payload is configured for public-mempool submission and may be ordering-sensitive.", evidence: { executionChannel }, remediation: "Use an approved protected execution channel where available." });
  if (!state.hardBlock && !state.needsReview && state.checksFailed.length === 0) state.checksPassed.push("Execution-quality evidence is within configured deterministic limits");
  return { ...state, context: { ...context, status: state.hardBlock ? "blocked" : state.needsReview ? "review_required" : "passed" } };
}
