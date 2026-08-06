import { createHash } from "node:crypto";

const norm = (v) => String(v ?? "").trim().toLowerCase();
const asNumber = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const actionFor = (value, fallback = "review") => ["allow","warn","review","block"].includes(norm(value)) ? norm(value) : fallback;
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function policyConfig(policy = {}) {
  const raw = policy?.structuredRules?.walletBehavioralControls || policy?.structuredRules?.walletBehavior || {};
  return {
    enabled: raw.enabled === true || raw.required === true,
    required: raw.required === true,
    windowMinutes: Math.max(1, Math.min(10080, asNumber(raw.windowMinutes, 60))),
    maxTransactionsInWindow: Math.max(0, asNumber(raw.maxTransactionsInWindow, 0)),
    maxBlockedAttemptsInWindow: Math.max(0, asNumber(raw.maxBlockedAttemptsInWindow, 0)),
    maxFailedAttemptsInWindow: Math.max(0, asNumber(raw.maxFailedAttemptsInWindow, 0)),
    newRecipientAction: actionFor(raw.newRecipientAction, "review"),
    firstContractAction: actionFor(raw.firstContractAction, "review"),
    velocityAction: actionFor(raw.velocityAction, "review"),
    repeatedBlockedAction: actionFor(raw.repeatedBlockedAction, "block"),
    repeatedFailedAction: actionFor(raw.repeatedFailedAction, "review"),
    unusualAmountMultiplier: Math.max(1, asNumber(raw.unusualAmountMultiplier, 0)),
    unusualAmountAction: actionFor(raw.unusualAmountAction, "review"),
    minimumHistory: Math.max(1, asNumber(raw.minimumHistory, 3)),
  };
}

function finding({status="pass", severity="info", rule, message, evidence={}, remediation=""}) {
  return { module: "Wallet Behavioral Controls", status, severity, rule, message, evidence, remediation };
}

function applyAction(state, action, data) {
  if (action === "allow") return;
  if (action === "warn") state.findings.push(finding({ ...data, status:"warning", severity:"low" }));
  if (action === "review") { state.needsReview = true; state.scoreDelta += 18; state.findings.push(finding({ ...data, status:"warning", severity:"medium" })); }
  if (action === "block") { state.hardBlock = true; state.scoreDelta += 35; state.findings.push(finding({ ...data, status:"fail", severity:"high" })); }
  state.checksFailed.push(data.message);
}

function extractWallet(log = {}) {
  return norm(log.executionWalletAddress || log.originalIntent?.executionWalletAddress || log.originalIntent?.walletAddress || log.gatewayRequest?.executionWalletAddress);
}
function extractTarget(log = {}) { return norm(log.target || log.originalIntent?.target || log.originalIntent?.action?.target || log.gatewayRequest?.target); }
function extractAction(log = {}) { return norm(log.action || log.originalIntent?.actionType || log.gatewayRequest?.actionType); }
function extractAmount(log = {}) { return asNumber(log.amount ?? log.originalIntent?.amount ?? log.gatewayRequest?.amount, 0); }

export function evaluateWalletBehavioralControls({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const config = policyConfig(policy);
  const state = { checksPassed: [], checksFailed: [], findings: [], scoreDelta: 0, hardBlock: false, needsReview: false };
  const wallet = norm(request.executionWalletAddress || request.walletAddress);
  const agentId = String(request.agentId || "");
  const target = norm(request.target);
  const actionType = norm(request.actionType);
  const amount = asNumber(request.amount, 0);
  const relevant = (Array.isArray(auditLogs) ? auditLogs : []).filter((log) => {
    if (agentId && log.agentId !== agentId) return false;
    const priorWallet = extractWallet(log);
    return !wallet || !priorWallet || priorWallet === wallet;
  });
  const cutoff = now.getTime() - config.windowMinutes * 60_000;
  const recent = relevant.filter((log) => Number.isFinite(new Date(log.timestamp).getTime()) && new Date(log.timestamp).getTime() >= cutoff);
  const priorTargets = new Set(relevant.map(extractTarget).filter(Boolean));
  const priorActionsForTarget = relevant.filter((log) => extractTarget(log) === target);
  const blockedRecent = recent.filter((log) => log.decision === "Blocked").length;
  const failedRecent = recent.filter((log) => ["failed","uncertain"].includes(norm(log.executionStatus))).length;
  const successfulAmounts = relevant.filter((log) => log.decision === "Allowed").map(extractAmount).filter((v) => v > 0);
  const averageAmount = successfulAmounts.length ? successfulAmounts.reduce((a,b)=>a+b,0) / successfulAmounts.length : 0;
  const newRecipient = Boolean(target) && !priorTargets.has(target);
  const firstContractInteraction = Boolean(target) && /contract|swap|stake|bridge|dapp/.test(actionType) && priorActionsForTarget.length === 0;
  const metrics = {
    schemaVersion: "1.0.0", evaluatedAt: now.toISOString(), agentId, executionWalletAddress: wallet || null,
    historyCount: relevant.length, windowMinutes: config.windowMinutes, recentTransactionCount: recent.length,
    recentBlockedCount: blockedRecent, recentFailedCount: failedRecent, target: target || null,
    newRecipient, firstContractInteraction, averageHistoricalAllowedAmount: averageAmount,
    currentAmount: amount, historyFingerprint: hash(relevant.map((log)=>[log.id,log.timestamp,log.decision,extractTarget(log),extractAmount(log)])),
  };
  if (!config.enabled) {
    state.findings.push(finding({ status:"skipped", rule:"Behavioral policy activation", message:"Wallet behavioral controls are not enabled for this policy.", evidence:{ historyCount: relevant.length } }));
    return { ...state, context: { ...metrics, status:"not_required", config } };
  }
  if (config.maxTransactionsInWindow > 0 && recent.length >= config.maxTransactionsInWindow) applyAction(state, config.velocityAction, { rule:"Transaction velocity", message:`Transaction velocity reached ${recent.length} actions within ${config.windowMinutes} minutes.`, evidence:{ observed:recent.length, limit:config.maxTransactionsInWindow, windowMinutes:config.windowMinutes }, remediation:"Wait for the rolling window to clear or obtain authorized policy review." });
  else state.findings.push(finding({ rule:"Transaction velocity", message:"Transaction velocity is within the configured limit.", evidence:{ observed:recent.length, limit:config.maxTransactionsInWindow || null } }));
  if (config.maxBlockedAttemptsInWindow > 0 && blockedRecent >= config.maxBlockedAttemptsInWindow) applyAction(state, config.repeatedBlockedAction, { rule:"Repeated blocked attempts", message:`Detected ${blockedRecent} blocked attempts within the behavioral window.`, evidence:{ observed:blockedRecent, limit:config.maxBlockedAttemptsInWindow }, remediation:"Pause the agent and investigate repeated policy violations before retrying." });
  if (config.maxFailedAttemptsInWindow > 0 && failedRecent >= config.maxFailedAttemptsInWindow) applyAction(state, config.repeatedFailedAction, { rule:"Repeated failed executions", message:`Detected ${failedRecent} failed or uncertain executions within the behavioral window.`, evidence:{ observed:failedRecent, limit:config.maxFailedAttemptsInWindow }, remediation:"Investigate execution failures and reconciliation state before submitting another action." });
  if (newRecipient && relevant.length >= config.minimumHistory) applyAction(state, config.newRecipientAction, { rule:"New recipient", message:"The target has not appeared in this agent and wallet history.", evidence:{ target, historyCount:relevant.length }, remediation:"Verify and approve the recipient before execution." });
  if (firstContractInteraction && relevant.length >= config.minimumHistory) applyAction(state, config.firstContractAction, { rule:"First contract interaction", message:"This is the first recorded interaction with the target contract for this agent and wallet.", evidence:{ target, actionType }, remediation:"Review the contract target and intended method before execution." });
  if (config.unusualAmountMultiplier > 0 && successfulAmounts.length >= config.minimumHistory && averageAmount > 0 && amount > averageAmount * config.unusualAmountMultiplier) applyAction(state, config.unusualAmountAction, { rule:"Unusual amount", message:"The requested amount is materially above this wallet's historical allowed average.", evidence:{ currentAmount:amount, averageHistoricalAllowedAmount:averageAmount, multiplier:config.unusualAmountMultiplier }, remediation:"Confirm the unusually large amount or lower it to the expected operating range." });
  if (!state.hardBlock && !state.needsReview && state.checksFailed.length === 0) state.checksPassed.push("Wallet behavior is within configured deterministic controls");
  return { ...state, context: { ...metrics, status: state.hardBlock ? "blocked" : state.needsReview ? "review_required" : "passed", config } };
}
