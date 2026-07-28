import { normalizeReconciliationState } from "./executionReconciliation.mjs";

const ACTIVE_APPROVAL_STATUSES = new Set(["pending", "configuration required"]);
const ACTIVE_PAUSE_STATUSES = new Set(["active"]);
const BLOCKING_EXECUTION_STATES = new Set([
  "submitted",
  "pending",
  "uncertain",
  "replaced",
  "approved_pending_signature",
  "review_approved_pending_signature",
]);

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function executionState(log = {}) {
  const raw = String(log.executionReconciliation?.status || log.executionStatus || "").trim();
  if (BLOCKING_EXECUTION_STATES.has(lower(raw))) return lower(raw);
  return normalizeReconciliationState(raw);
}

export function agentDeletionReadiness({ agent, policies = [], approvals = [], auditLogs = [], emergencyPauses = [] } = {}) {
  if (!agent) {
    return {
      allowed: false,
      blockers: [{ code: "agent-not-found", message: "Connected agent not found." }],
      policyIds: [],
      preservedEvidence: {},
    };
  }

  const agentId = String(agent.id || "");
  const blockers = [];
  const policyIds = policies.filter((policy) => policy.agentId === agentId).map((policy) => policy.id);
  const activeApprovals = approvals.filter((approval) => approval.agentId === agentId && ACTIVE_APPROVAL_STATUSES.has(lower(approval.reviewStatus)));
  const activePauses = emergencyPauses.filter((pause) => pause.agentId === agentId && ACTIVE_PAUSE_STATUSES.has(lower(pause.status || (pause.active ? "active" : ""))));
  const unresolvedExecutions = auditLogs.filter((log) => log.agentId === agentId && BLOCKING_EXECUTION_STATES.has(executionState(log)));

  if (lower(agent.status) !== "revoked") {
    blockers.push({
      code: "agent-active",
      message: "Revoke this agent before permanently deleting it.",
    });
  }
  if (activeApprovals.length > 0) {
    blockers.push({
      code: "pending-approvals",
      message: `${activeApprovals.length} approval request${activeApprovals.length === 1 ? " is" : "s are"} still pending or require configuration.`,
      count: activeApprovals.length,
    });
  }
  if (activePauses.length > 0) {
    blockers.push({
      code: "active-pauses",
      message: `${activePauses.length} active emergency pause${activePauses.length === 1 ? " must" : "s must"} be resumed or allowed to expire first.`,
      count: activePauses.length,
    });
  }
  if (unresolvedExecutions.length > 0) {
    blockers.push({
      code: "unresolved-executions",
      message: `${unresolvedExecutions.length} execution${unresolvedExecutions.length === 1 ? " is" : "s are"} still pending, uncertain, replaced, or awaiting signature.`,
      count: unresolvedExecutions.length,
    });
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    policyIds,
    preservedEvidence: {
      auditLogs: auditLogs.filter((log) => log.agentId === agentId).length,
      approvals: approvals.filter((approval) => approval.agentId === agentId).length,
      gatewayRequests: 0,
    },
  };
}

export function assertAgentDeletionAllowed(input) {
  const readiness = agentDeletionReadiness(input);
  if (!readiness.allowed) {
    const error = new Error(`Agent cannot be deleted: ${readiness.blockers.map((item) => item.message).join(" ")}`);
    error.status = 409;
    error.code = "AGENT_DELETE_BLOCKED";
    error.details = readiness;
    throw error;
  }
  return readiness;
}
