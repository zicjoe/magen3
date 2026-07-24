function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase();
}

function boolRule(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["yes", "true", "enabled", "on"].includes(value.toLowerCase());
  return fallback;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function finiteNumber(value, fallback = null) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Map(value.map(clean).filter(Boolean).map((item) => [normalized(item), item])).values()];
}

function slug(value, fallback) {
  const text = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return text || fallback;
}

function mergeGroupRequirements(...sets) {
  const merged = new Map();
  for (const set of sets) {
    for (const item of Array.isArray(set) ? set : []) {
      const groupId = clean(item?.groupId || item?.id);
      if (!groupId) continue;
      const approvals = boundedInteger(item?.approvals ?? item?.requiredApprovals, 1, 1, 10);
      const key = normalized(groupId);
      const current = merged.get(key);
      if (!current || approvals > current.approvals) merged.set(key, { groupId, approvals });
    }
  }
  return [...merged.values()];
}

function requiredDistinctApprovals(requirements = []) {
  return (Array.isArray(requirements) ? requirements : []).reduce(
    (total, item) => total + boundedInteger(item?.approvals, 0, 0, 10),
    0,
  );
}

export function normalizeApprovalGroups(value) {
  const groups = [];
  const seen = new Set();
  for (const [index, raw] of (Array.isArray(value) ? value : []).entries()) {
    if (!raw || typeof raw !== "object") continue;
    const id = slug(raw.id || raw.name || raw.role, `group-${index + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    groups.push({
      id,
      name: clean(raw.name || raw.role || id),
      role: clean(raw.role || raw.name || id),
      wallets: stringList(raw.wallets || raw.approverWallets),
      backupGroupIds: stringList(raw.backupGroupIds || raw.backupGroups).map((item) => slug(item, item)),
      emergency: boolRule(raw.emergency, false),
    });
  }
  return groups;
}

function normalizeEscalationRules(value, prefix = "escalation") {
  return (Array.isArray(value) ? value : [])
    .filter((raw) => raw && typeof raw === "object")
    .map((raw, index) => ({
      id: slug(raw.id || raw.name, `${prefix}-${index + 1}`),
      name: clean(raw.name || `Escalation ${index + 1}`),
      afterSeconds: boundedInteger(raw.afterSeconds, 0, 0, 2_592_000),
      addGroupIds: stringList(raw.addGroupIds || raw.groups).map((item) => slug(item, item)),
      addApproverWallets: stringList(raw.addApproverWallets || raw.approverWallets),
      requiredApprovals: boundedInteger(raw.requiredApprovals, 0, 0, 10),
      requiredGroups: mergeGroupRequirements(raw.requiredGroups),
      activateBackups: boolRule(raw.activateBackups, false),
      activateEmergencyGroups: boolRule(raw.activateEmergencyGroups, false),
    }))
    .sort((a, b) => a.afterSeconds - b.afterSeconds || a.id.localeCompare(b.id));
}

function normalizeTier(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: slug(raw.id || raw.name, `tier-${index + 1}`),
    name: clean(raw.name || `Approval Tier ${index + 1}`),
    priority: boundedInteger(raw.priority, 0, -1000, 1000),
    minAmount: finiteNumber(raw.minAmount, null),
    maxAmount: finiteNumber(raw.maxAmount, null),
    actions: stringList(raw.actions),
    capabilities: stringList(raw.capabilities),
    contracts: stringList(raw.contracts || raw.targets),
    requiredGroups: mergeGroupRequirements(raw.requiredGroups),
    requiredApprovals: boundedInteger(raw.requiredApprovals, 0, 0, 10),
    executionDelaySeconds: raw.executionDelaySeconds === undefined || raw.executionDelaySeconds === null ? null : boundedInteger(raw.executionDelaySeconds, 0, 0, 604_800),
    executionWindowSeconds: raw.executionWindowSeconds === undefined || raw.executionWindowSeconds === null ? null : boundedInteger(raw.executionWindowSeconds, 0, 0, 604_800),
    escalationRules: normalizeEscalationRules(raw.escalationRules, `tier-${index + 1}-escalation`),
  };
}

function tierSpecificity(tier) {
  return [
    tier.minAmount !== null || tier.maxAmount !== null,
    tier.actions.length > 0,
    tier.capabilities.length > 0,
    tier.contracts.length > 0,
  ].filter(Boolean).length;
}

function matchesTier(tier, auditLog = {}) {
  const amount = Number(auditLog.amount || 0);
  if (tier.minAmount !== null && amount < tier.minAmount) return false;
  if (tier.maxAmount !== null && amount > tier.maxAmount) return false;
  const action = normalized(auditLog.action);
  if (tier.actions.length > 0 && !tier.actions.some((item) => normalized(item) === action)) return false;
  const capabilities = new Set((Array.isArray(auditLog.capabilityContext) ? auditLog.capabilityContext : []).map(normalized));
  if (tier.capabilities.length > 0 && !tier.capabilities.some((item) => capabilities.has(normalized(item)))) return false;
  const target = normalized(auditLog.target);
  if (tier.contracts.length > 0 && !tier.contracts.some((item) => normalized(item) === target)) return false;
  return true;
}

function resolveTier(tiers, auditLog) {
  return tiers
    .filter((tier) => matchesTier(tier, auditLog))
    .sort((a, b) => b.priority - a.priority || tierSpecificity(b) - tierSpecificity(a) || Number(b.minAmount || 0) - Number(a.minAmount || 0) || a.id.localeCompare(b.id))[0] || null;
}

function groupWallets(groups, groupIds) {
  const wanted = new Set((groupIds || []).map(normalized));
  return stringList(groups.filter((group) => wanted.has(normalized(group.id))).flatMap((group) => group.wallets));
}

function possibleGroupIds({ groups, initialGroupIds, escalationRules, emergencyGroupIds }) {
  let ids = new Set(initialGroupIds.map(normalized));
  for (const rule of escalationRules) {
    for (const groupId of rule.addGroupIds) ids.add(normalized(groupId));
    for (const requirement of rule.requiredGroups || []) ids.add(normalized(requirement.groupId));
    if (rule.activateEmergencyGroups) emergencyGroupIds.forEach((groupId) => ids.add(normalized(groupId)));
    if (rule.activateBackups) ids = new Set(addBackups([...ids], groups).activeGroupIds.map(normalized));
  }
  return [...ids];
}

export function resolveOrganizationalApproval({ policy = {}, auditLog = {}, baseApproverWallets = [], baseRequiredApprovals = 1, minimumRequiredApprovals = 0 }) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const enabled = boolRule(rules.approvalOrganizationalQuorumEnabled, false);
  const rawGroups = Array.isArray(rules.approvalGroups) ? rules.approvalGroups : [];
  const groups = normalizeApprovalGroups(rawGroups);
  const rawTiers = Array.isArray(rules.approvalTiers) ? rules.approvalTiers : [];
  const tiers = rawTiers.map(normalizeTier).filter(Boolean);
  const defaultsRaw = rules.approvalOrganizationDefaults && typeof rules.approvalOrganizationDefaults === "object" ? rules.approvalOrganizationDefaults : {};
  const defaults = {
    requiredGroups: mergeGroupRequirements(defaultsRaw.requiredGroups),
    requiredApprovals: boundedInteger(defaultsRaw.requiredApprovals, 0, 0, 10),
    executionDelaySeconds: boundedInteger(defaultsRaw.executionDelaySeconds ?? rules.approvalExecutionDelaySeconds, 0, 0, 604_800),
    executionWindowSeconds: boundedInteger(defaultsRaw.executionWindowSeconds ?? rules.approvalExecutionWindowSeconds, 0, 0, 604_800),
  };
  const resolvedTier = enabled ? resolveTier(tiers, auditLog) : null;
  const requiredGroups = mergeGroupRequirements(defaults.requiredGroups, resolvedTier?.requiredGroups);
  const initialGroupIds = [...new Set(requiredGroups.map((item) => normalized(item.groupId)))];
  const emergencyGroupIds = stringList(rules.approvalEmergencyGroupIds).map((item) => slug(item, item));
  const escalationRules = enabled ? [...normalizeEscalationRules(rules.approvalEscalationRules), ...(resolvedTier?.escalationRules || [])]
    .sort((a, b) => a.afterSeconds - b.afterSeconds || a.id.localeCompare(b.id)) : [];
  const directApproverWallets = stringList(baseApproverWallets);
  const eligibleWallets = enabled ? stringList([...directApproverWallets, ...groupWallets(groups, initialGroupIds)]) : directApproverWallets;
  const organizationalRequiredApprovals = Math.max(
    Number(defaults.requiredApprovals || 0),
    Number(resolvedTier?.requiredApprovals || 0),
    requiredDistinctApprovals(requiredGroups),
  );
  const requiredApprovals = enabled
    ? Math.max(Number(minimumRequiredApprovals || 0), organizationalRequiredApprovals || Number(baseRequiredApprovals || 1))
    : Math.max(Number(baseRequiredApprovals || 1), Number(minimumRequiredApprovals || 0));
  const executionDelaySeconds = Number(resolvedTier?.executionDelaySeconds ?? defaults.executionDelaySeconds ?? 0);
  const executionWindowSeconds = Number(resolvedTier?.executionWindowSeconds ?? defaults.executionWindowSeconds ?? 0);
  const groupById = new Map(groups.map((group) => [normalized(group.id), group]));
  const configurationErrors = [];

  if (enabled) {
    const rawGroupIds = rawGroups
      .filter((item) => item && typeof item === "object")
      .map((item, index) => slug(item.id || item.name || item.role, `group-${index + 1}`));
    const duplicateGroupIds = rawGroupIds.filter((id, index) => rawGroupIds.indexOf(id) !== index);
    if (duplicateGroupIds.length > 0) configurationErrors.push(`Approval group IDs must be unique. Duplicate IDs: ${[...new Set(duplicateGroupIds)].join(", ")}.`);

    const tierIds = tiers.map((tier) => tier.id);
    const duplicateTierIds = tierIds.filter((id, index) => tierIds.indexOf(id) !== index);
    if (duplicateTierIds.length > 0) configurationErrors.push(`Approval tier IDs must be unique. Duplicate IDs: ${[...new Set(duplicateTierIds)].join(", ")}.`);

    for (const tier of tiers) {
      if (tier.minAmount !== null && tier.minAmount < 0) configurationErrors.push(`Approval tier ${tier.name} has a negative minimum amount.`);
      if (tier.maxAmount !== null && tier.maxAmount < 0) configurationErrors.push(`Approval tier ${tier.name} has a negative maximum amount.`);
      if (tier.minAmount !== null && tier.maxAmount !== null && tier.minAmount > tier.maxAmount) configurationErrors.push(`Approval tier ${tier.name} has a minimum amount greater than its maximum amount.`);
    }
  }

  const referencedGroups = new Set(requiredGroups.map((item) => normalized(item.groupId)));
  emergencyGroupIds.forEach((id) => referencedGroups.add(normalized(id)));
  for (const group of groups) group.backupGroupIds.forEach((id) => referencedGroups.add(normalized(id)));
  for (const rule of escalationRules) {
    rule.addGroupIds.forEach((id) => referencedGroups.add(normalized(id)));
    rule.requiredGroups.forEach((item) => referencedGroups.add(normalized(item.groupId)));
  }
  for (const groupId of referencedGroups) {
    if (groupId && !groupById.has(groupId)) configurationErrors.push(`Approval group ${groupId} is referenced but not configured.`);
  }

  const backupsMayActivate = escalationRules.some((rule) => rule.activateBackups);
  for (const requirement of requiredGroups) {
    const group = groupById.get(normalized(requirement.groupId));
    if (!group) continue;
    const possibleRoleGroupIds = backupsMayActivate
      ? addBackups([group.id], groups).activeGroupIds
      : [group.id];
    const possibleRoleWallets = groupWallets(groups, possibleRoleGroupIds);
    if (possibleRoleWallets.length < requirement.approvals) configurationErrors.push(`Approval group ${group.name} and its configured backup groups provide ${possibleRoleWallets.length} distinct wallet${possibleRoleWallets.length === 1 ? "" : "s"} but require ${requirement.approvals}.`);
  }

  const allPossibleGroupIds = possibleGroupIds({ groups, initialGroupIds, escalationRules, emergencyGroupIds });
  const allPossibleWallets = stringList([
    ...directApproverWallets,
    ...groupWallets(groups, allPossibleGroupIds),
    ...escalationRules.flatMap((rule) => rule.addApproverWallets),
  ]);
  if (enabled && allPossibleWallets.length < requiredApprovals) configurationErrors.push(`Only ${allPossibleWallets.length} distinct eligible reviewer wallet${allPossibleWallets.length === 1 ? " is" : "s are"} available for a ${requiredApprovals}-approval quorum.`);

  return {
    enabled,
    groups,
    tiers,
    resolvedTier,
    requiredGroups,
    initialGroupIds,
    emergencyGroupIds,
    escalationRules,
    directApproverWallets,
    eligibleWallets,
    requiredApprovals,
    executionDelaySeconds,
    executionWindowSeconds,
    allPossibleWallets,
    configurationErrors: [...new Set(configurationErrors)],
  };
}

function addBackups(activeIds, groups, substitutions = {}) {
  const active = new Set(activeIds.map(normalized));
  const mapping = Object.fromEntries(Object.entries(substitutions || {}).map(([key, values]) => [normalized(key), stringList(values).map(normalized)]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      const groupId = normalized(group.id);
      if (!active.has(groupId)) continue;
      for (const backup of group.backupGroupIds) {
        const backupId = normalized(backup);
        if (!active.has(backupId)) {
          active.add(backupId);
          changed = true;
        }
        mapping[backupId] = [...new Set([...(mapping[backupId] || []), groupId])];
      }
    }
  }
  return { activeGroupIds: [...active], backupSubstitutions: mapping };
}

export function applyOrganizationalEscalations(review, now = new Date()) {
  const org = review?.reviewContext?.organizationalQuorum;
  if (!review || !org?.enabled || review.reviewStatus !== "Pending") return review;
  const current = now instanceof Date ? now : new Date(now);
  const created = new Date(review.createdAt || 0);
  if (Number.isNaN(current.getTime()) || Number.isNaN(created.getTime())) return review;
  const elapsedSeconds = Math.max(0, Math.floor((current.getTime() - created.getTime()) / 1000));
  const activated = new Set(Array.isArray(org.activatedEscalationIds) ? org.activatedEscalationIds : []);
  const newlyActivated = [];
  let activeGroupIds = [...(org.activeGroupIds || org.initialGroupIds || [])];
  let backupSubstitutions = { ...(org.backupSubstitutions || {}) };
  let directWallets = stringList(org.directApproverWallets || []);
  let requiredApprovals = Number(review.requiredApprovals || 1);
  let requiredGroups = mergeGroupRequirements(org.requiredGroups);

  for (const rule of Array.isArray(org.escalationRules) ? org.escalationRules : []) {
    if (elapsedSeconds < Number(rule.afterSeconds || 0) || activated.has(rule.id)) continue;
    activated.add(rule.id);
    newlyActivated.push({ id: rule.id, name: rule.name, activatedAt: current.toISOString(), afterSeconds: rule.afterSeconds });
    activeGroupIds = [...new Set([...activeGroupIds, ...(rule.addGroupIds || []), ...(rule.requiredGroups || []).map((item) => item.groupId)].map(normalized))];
    directWallets = stringList([...directWallets, ...(rule.addApproverWallets || [])]);
    requiredGroups = mergeGroupRequirements(requiredGroups, rule.requiredGroups);
    requiredApprovals = Math.max(requiredApprovals, Number(rule.requiredApprovals || 0), requiredDistinctApprovals(requiredGroups));
    if (rule.activateEmergencyGroups) activeGroupIds = [...new Set([...activeGroupIds, ...(org.emergencyGroupIds || [])].map(normalized))];
    if (rule.activateBackups) {
      const backupResult = addBackups(activeGroupIds, org.groups || [], backupSubstitutions);
      activeGroupIds = backupResult.activeGroupIds;
      backupSubstitutions = backupResult.backupSubstitutions;
    }
  }
  if (newlyActivated.length === 0) return review;
  const approverWallets = stringList([...directWallets, ...groupWallets(org.groups || [], activeGroupIds)]);
  return {
    ...review,
    approverWallets,
    requiredApprovals,
    reviewContext: {
      ...review.reviewContext,
      organizationalQuorum: {
        ...org,
        activeGroupIds,
        backupSubstitutions,
        directApproverWallets: directWallets,
        requiredGroups,
        activatedEscalationIds: [...activated],
        escalationHistory: [...(org.escalationHistory || []), ...newlyActivated],
        lastEscalatedAt: current.toISOString(),
      },
    },
    updatedAt: current.toISOString(),
  };
}

function approvedResponses(review) {
  const signatureRequired = review?.reviewContext?.requireCryptographicReviewerSignature === true;
  return (review?.responses || []).filter((response) => response.response === "Approved" && (!signatureRequired || response.signatureVerified === true));
}

export function responderGroupMembership(review, walletAddress) {
  const org = review?.reviewContext?.organizationalQuorum;
  if (!org?.enabled) return { memberGroupIds: [], satisfiedGroupIds: [] };
  const active = new Set((org.activeGroupIds || org.initialGroupIds || []).map(normalized));
  const wallet = normalized(walletAddress);
  const memberGroupIds = (org.groups || [])
    .filter((group) => active.has(normalized(group.id)) && (group.wallets || []).some((item) => normalized(item) === wallet))
    .map((group) => group.id);
  const satisfiedGroupIds = new Set(memberGroupIds.map(normalized));
  const substitutions = org.backupSubstitutions && typeof org.backupSubstitutions === "object" ? org.backupSubstitutions : {};
  for (const groupId of memberGroupIds) {
    for (const originalGroupId of Array.isArray(substitutions[normalized(groupId)]) ? substitutions[normalized(groupId)] : []) {
      satisfiedGroupIds.add(normalized(originalGroupId));
    }
  }
  return { memberGroupIds, satisfiedGroupIds: [...satisfiedGroupIds] };
}

export function responderGroupIds(review, walletAddress) {
  return responderGroupMembership(review, walletAddress).satisfiedGroupIds;
}

export function organizationalApprovalProgress(review) {
  const org = review?.reviewContext?.organizationalQuorum;
  if (!org?.enabled) return { enabled: false, satisfied: true, groups: [], resolvedTier: null };
  const responses = approvedResponses(review);
  const groups = (org.requiredGroups || []).map((requirement) => {
    const group = (org.groups || []).find((item) => normalized(item.id) === normalized(requirement.groupId));
    const wallets = new Set();
    for (const response of responses) {
      const responseGroups = Array.isArray(response.groupIds) && response.groupIds.length > 0
        ? response.groupIds
        : responderGroupIds(review, response.walletAddress);
      if (responseGroups.some((groupId) => normalized(groupId) === normalized(requirement.groupId))) wallets.add(normalized(response.walletAddress));
    }
    return {
      groupId: requirement.groupId,
      groupName: group?.name || requirement.groupId,
      role: group?.role || "",
      required: Number(requirement.approvals || 1),
      received: wallets.size,
      remaining: Math.max(0, Number(requirement.approvals || 1) - wallets.size),
      satisfied: wallets.size >= Number(requirement.approvals || 1),
    };
  });
  return {
    enabled: true,
    satisfied: groups.every((group) => group.satisfied),
    groups,
    resolvedTier: org.resolvedTier || null,
    activeGroupIds: org.activeGroupIds || org.initialGroupIds || [],
    backupSubstitutions: org.backupSubstitutions || {},
    escalationHistory: org.escalationHistory || [],
    nextEscalation: (org.escalationRules || []).find((rule) => !(org.activatedEscalationIds || []).includes(rule.id)) || null,
  };
}

export function buildApprovalExecutionTiming(review, resolvedAt) {
  const org = review?.reviewContext?.organizationalQuorum;
  const resolved = resolvedAt instanceof Date ? resolvedAt : new Date(resolvedAt);
  if (!org?.enabled || Number.isNaN(resolved.getTime())) return null;
  const delaySeconds = boundedInteger(org.executionDelaySeconds, 0, 0, 604_800);
  const windowSeconds = boundedInteger(org.executionWindowSeconds, 0, 0, 604_800);
  const notBefore = new Date(resolved.getTime() + delaySeconds * 1000);
  const approvalExpiry = new Date(review.expiresAt || 0);
  const desiredEnd = windowSeconds > 0 ? new Date(notBefore.getTime() + windowSeconds * 1000) : approvalExpiry;
  const windowEndsAt = Number.isNaN(approvalExpiry.getTime()) || desiredEnd.getTime() < approvalExpiry.getTime() ? desiredEnd : approvalExpiry;
  return {
    delaySeconds,
    windowSeconds,
    notBefore: notBefore.toISOString(),
    windowEndsAt: windowEndsAt.toISOString(),
  };
}

export function organizationalApprovalFinding(review) {
  if (!review) return null;
  const progress = organizationalApprovalProgress(review);
  if (!progress.enabled) {
    return {
      module: "Policy & Approval Controls",
      control: "Approval Escalation & Organizational Quorum",
      status: "skipped",
      severity: "info",
      rule: "Organizational approval rules",
      message: "The active policy uses the legacy flat approver quorum.",
      evidence: { approvalRequestId: review.id, enabled: false },
      remediation: "Enable organizational quorum to resolve approval tiers, named groups, escalation schedules, delays, and execution windows.",
    };
  }
  const configurationErrors = review.reviewContext?.organizationalQuorum?.configurationErrors || [];
  const terminalFailure = ["Rejected", "Expired", "Cancelled"].includes(review.reviewStatus);
  const status = configurationErrors.length > 0 ? "unavailable" : review.reviewStatus === "Approved" ? "pass" : terminalFailure ? "fail" : "warning";
  return {
    module: "Policy & Approval Controls",
    control: "Approval Escalation & Organizational Quorum",
    status,
    severity: configurationErrors.length > 0 || terminalFailure ? "high" : review.reviewStatus === "Approved" ? "low" : "medium",
    rule: "Organizational approval quorum",
    message: configurationErrors.length > 0
      ? "The organizational approval policy cannot resolve a valid reviewer quorum."
      : review.reviewStatus === "Approved"
        ? `The ${progress.resolvedTier?.name || "resolved"} approval tier satisfied all required group and total quorum rules.`
        : terminalFailure
          ? `The ${progress.resolvedTier?.name || "resolved"} organizational approval request ended as ${String(review.reviewStatus).toLowerCase()} before executable authorization was available.`
          : `The ${progress.resolvedTier?.name || "resolved"} approval tier is waiting for its required organizational quorum.`,
    evidence: {
      approvalRequestId: review.id,
      resolvedTier: progress.resolvedTier,
      groupProgress: progress.groups,
      requiredApprovals: Number(review.requiredApprovals || 1),
      receivedApprovals: approvedResponses(review).length,
      activeGroupIds: progress.activeGroupIds,
      escalationHistory: progress.escalationHistory,
      nextEscalation: progress.nextEscalation,
      executionTiming: review.reviewContext?.executionTiming || null,
      configurationErrors,
    },
    remediation: configurationErrors.length > 0
      ? "Correct the policy group membership, group IDs, or quorum requirements before retrying."
      : "Collect the remaining required group approvals. Wait for any configured execution delay and sign within the execution window.",
  };
}
