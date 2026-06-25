function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDailyUsed(agentId, auditLogs) {
  const now = new Date();
  return auditLogs
    .filter((log) => log.agentId === agentId && log.decision === "Allowed" && isSameDay(new Date(log.timestamp), now))
    .reduce((sum, log) => sum + Number(log.amount || 0), 0);
}

function targetIsTrusted(request, policy) {
  const normalizedTarget = String(request.target || "").trim().toLowerCase();
  const trustedList = (policy.trustedContracts || []).map((contract) => String(contract).trim().toLowerCase());
  return request.targetType === "Trusted Contract" || Boolean(normalizedTarget && trustedList.includes(normalizedTarget));
}

export function evaluateAction({ request, agents, policies, auditLogs }) {
  const agent = agents.find((item) => item.id === request.agentId);
  const policy = policies.find((item) => item.agentId === request.agentId && item.status === "Active");
  const checksPassed = [];
  const checksFailed = [];

  if (!agent) {
    return {
      decision: "Blocked",
      risk: "High",
      riskScore: 82,
      policyChecksPassed: [],
      policyChecksFailed: ["Selected agent is not registered in Magen3"],
      reason: "Magen3 cannot allow execution from an unknown agent.",
      recommendedAction: "Register the agent before allowing any Web3 action.",
    };
  }

  if (!policy) {
    return {
      decision: "Blocked",
      risk: "High",
      riskScore: 78,
      policyChecksPassed: [`Agent ${agent.name} is registered`],
      policyChecksFailed: ["No active security policy found for this agent"],
      reason: "This agent has no active policy, so Magen3 blocks execution by default.",
      recommendedAction: "Create and activate a policy for this agent first.",
    };
  }

  const amount = Number(request.amount || 0);
  const dailyUsed = getDailyUsed(request.agentId, auditLogs);
  const dailyAfterAction = dailyUsed + amount;
  const isTrusted = targetIsTrusted(request, policy);
  const isBlockedAction = (policy.blockedActions || []).includes(request.actionType);
  const strictMode = policy.riskMode === "Conservative";
  const relaxedMode = policy.riskMode === "Aggressive";
  let score = 5;

  checksPassed.push(`Active policy found: ${policy.name}`);

  if (isBlockedAction) {
    checksFailed.push(`Action type is blocked by policy: ${request.actionType}`);
    score += 35;
  } else {
    checksPassed.push(`Action type is not blocked: ${request.actionType}`);
  }

  if (amount > Number(policy.maxTransaction)) {
    checksFailed.push(`Amount exceeds max transaction limit (${amount} > ${policy.maxTransaction} CSPR)`);
    score += 30;
  } else {
    checksPassed.push(`Amount within max transaction limit (${amount} ≤ ${policy.maxTransaction} CSPR)`);
  }

  if (dailyAfterAction > Number(policy.dailyLimit)) {
    checksFailed.push(`Daily limit would be exceeded (${dailyAfterAction} > ${policy.dailyLimit} CSPR)`);
    score += 25;
  } else {
    checksPassed.push(`Daily limit remains valid (${dailyAfterAction} ≤ ${policy.dailyLimit} CSPR)`);
  }

  if (isTrusted) {
    checksPassed.push("Target is trusted or policy-approved");
  } else {
    checksFailed.push("Target is not in the trusted contract list");
    score += strictMode ? 35 : 25;
  }

  if (amount > Number(policy.approvalThreshold)) {
    checksFailed.push(`Amount exceeds approval threshold (${amount} > ${policy.approvalThreshold} CSPR)`);
    score += relaxedMode ? 10 : 18;
  } else {
    checksPassed.push(`Amount below approval threshold (${amount} ≤ ${policy.approvalThreshold} CSPR)`);
  }

  const hardBlock =
    isBlockedAction ||
    amount > Number(policy.maxTransaction) ||
    dailyAfterAction > Number(policy.dailyLimit) ||
    (!isTrusted && (strictMode || request.targetType === "Unknown Contract"));
  const needsReview = !hardBlock && (amount > Number(policy.approvalThreshold) || !isTrusted || request.targetType !== "Trusted Contract");

  const decision = hardBlock ? "Blocked" : needsReview ? "Review Required" : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk = riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";

  return {
    decision,
    risk,
    riskScore,
    policyChecksPassed: checksPassed,
    policyChecksFailed: checksFailed,
    reason:
      decision === "Allowed"
        ? "This action matches the active policy and can be safely executed."
        : decision === "Blocked"
          ? "This action violates one or more hard policy rules and should not execute."
          : "This action is not fully unsafe, but it needs human approval before execution.",
    recommendedAction:
      decision === "Allowed"
        ? "Proceed with execution and record the decision on Casper."
        : decision === "Blocked"
          ? "Do not execute. Update the request or create a stricter review workflow."
          : "Ask the wallet owner or protocol admin to approve once or reject.",
  };
}
