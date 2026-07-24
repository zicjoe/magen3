import { createHash } from "node:crypto";

const HASH_32 = /^(?:0x)?[0-9a-f]{64}$/i;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const CASPER_PUBLIC_KEY = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i;
const CASPER_ACCOUNT_HASH = /^account-hash-[0-9a-f]{64}$/i;
const CASPER_CONTRACT = /^(?:contract-hash-|contract-|contract-package-hash-|contract-package-|package-|hash-)?[0-9a-f]{64}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export const TOKEN_PERMISSION_TYPES = new Set([
  "Fungible Token Approval",
  "Allowance Increase",
  "Allowance Decrease",
  "Allowance Reset",
  "Permit Authorization",
  "NFT Operator Approval",
  "Batch Approval",
  "Delegated Spender Permission",
]);

const PERMIT_TYPES = new Set(["Permit Authorization", "Delegated Spender Permission"]);
const AMOUNT_TYPES = new Set([
  "Fungible Token Approval",
  "Allowance Increase",
  "Allowance Decrease",
  "Allowance Reset",
  "Permit Authorization",
  "Batch Approval",
  "Delegated Spender Permission",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function finiteNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function list(value, transform = clean, limit = 250) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  return [...new Set(source.map(transform).filter(Boolean))].slice(0, limit);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "yes", "1", "enabled"].includes(value.toLowerCase())) return true;
    if (["false", "no", "0", "disabled"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function normalizeMode(value) {
  const normalized = lower(value);
  if (normalized === "observe") return "Observe";
  if (normalized === "enforce") return "Enforce";
  return "Review";
}

function normalizeAction(value, fallback = "Review") {
  const normalized = lower(value);
  if (normalized === "allow" || normalized === "warn" || normalized === "observe") return "Warn";
  if (normalized === "block" || normalized === "enforce") return "Block";
  return fallback;
}

function normalizePermissionType(value) {
  const normalized = lower(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    approval: "Fungible Token Approval",
    approve: "Fungible Token Approval",
    "fungible token approval": "Fungible Token Approval",
    "allowance increase": "Allowance Increase",
    increaseallowance: "Allowance Increase",
    "increase allowance": "Allowance Increase",
    "allowance decrease": "Allowance Decrease",
    decreaseallowance: "Allowance Decrease",
    "decrease allowance": "Allowance Decrease",
    "allowance reset": "Allowance Reset",
    resetallowance: "Allowance Reset",
    permit: "Permit Authorization",
    "permit authorization": "Permit Authorization",
    "nft operator approval": "NFT Operator Approval",
    approvalforall: "NFT Operator Approval",
    setapprovalforall: "NFT Operator Approval",
    "batch approval": "Batch Approval",
    batchapprove: "Batch Approval",
    "delegated spender permission": "Delegated Spender Permission",
    delegation: "Delegated Spender Permission",
  };
  return aliases[normalized] || clean(value);
}

function validWallet(value) {
  const input = clean(value);
  return EVM_ADDRESS.test(input) || CASPER_PUBLIC_KEY.test(input) || CASPER_ACCOUNT_HASH.test(input);
}

function validToken(value) {
  const input = clean(value);
  return EVM_ADDRESS.test(input) || CASPER_CONTRACT.test(input);
}

function validSpender(value) {
  return validWallet(value) || validToken(value);
}

function canonicalIdentity(value) {
  return lower(value).replace(/^contract-hash-/, "contract-").replace(/^contract-package-hash-/, "contract-package-");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

export function buildTokenPermissionFingerprint(input = {}) {
  const protectedParameters = {
    permissionType: normalizePermissionType(input.permissionType),
    owner: canonicalIdentity(input.owner),
    tokenContract: canonicalIdentity(input.tokenContract),
    tokenStandard: clean(input.tokenStandard).toUpperCase(),
    spender: canonicalIdentity(input.spender),
    approvalAmount: finiteNumber(input.approvalAmount, null),
    intendedTransactionAmount: finiteNumber(input.intendedTransactionAmount, null),
    unlimited: bool(input.unlimited, false),
    nonce: clean(input.nonce),
    permitId: clean(input.permitId),
    deadline: clean(input.deadline),
    reusable: bool(input.reusable, false),
    chainId: clean(input.chainId),
    network: lower(input.network),
    approvedProtocol: lower(input.approvedProtocol),
    operatorForAll: bool(input.operatorForAll, false),
    batchItems: Array.isArray(input.batchItems)
      ? input.batchItems.slice(0, 100).map((item) => ({
          tokenContract: canonicalIdentity(item?.tokenContract || input.tokenContract),
          spender: canonicalIdentity(item?.spender || input.spender),
          amount: finiteNumber(item?.amount, null),
          tokenId: clean(item?.tokenId),
        }))
      : [],
    allowanceResetExpected: bool(input.allowanceResetExpected, false),
  };
  return createHash("sha256").update(JSON.stringify(canonicalize(protectedParameters))).digest("hex");
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Token Permission Controls", status, severity, rule, message, evidence, remediation };
}

function policySettings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.tokenPermissionControlsEnabled !== false,
    mode: normalizeMode(rules.tokenPermissionMode),
    unknownSpenderAction: normalizeAction(rules.tokenPermissionUnknownSpenderAction, "Review"),
    unlimitedApprovalAction: normalizeAction(rules.tokenPermissionUnlimitedApprovalAction, "Review"),
    maxApprovalAmount: Math.max(0, finiteNumber(rules.tokenPermissionMaxApprovalAmount, 0) || 0),
    maxApprovalToTransactionRatio: Math.max(0, finiteNumber(rules.tokenPermissionMaxApprovalToTransactionRatio, 2) || 0),
    maxLifetimeSeconds: Math.max(0, positiveInteger(rules.tokenPermissionMaxLifetimeSeconds, 3600)),
    requireExpiry: rules.tokenPermissionRequireExpiry !== false,
    requireAllowanceReset: rules.tokenPermissionRequireAllowanceReset === true,
    approvedSpenders: list(rules.tokenPermissionApprovedSpenders, canonicalIdentity),
    blockedSpenders: list(rules.tokenPermissionBlockedSpenders, canonicalIdentity),
    allowNftOperatorApproval: rules.tokenPermissionAllowNftOperatorApproval === true,
    allowBatchApproval: rules.tokenPermissionAllowBatchApproval === true,
    requireChainBinding: rules.tokenPermissionRequireChainBinding !== false,
    requireNonce: rules.tokenPermissionRequireNonce !== false,
    maximumBatchSize: Math.max(1, positiveInteger(rules.tokenPermissionMaximumBatchSize, 10, { min: 1, max: 100 })),
  };
}

function requestContext(request = {}) {
  return {
    permissionType: normalizePermissionType(request.tokenPermissionType),
    owner: clean(request.tokenPermissionOwner),
    tokenContract: clean(request.tokenPermissionTokenContract),
    tokenStandard: clean(request.tokenPermissionTokenStandard),
    spender: clean(request.tokenPermissionSpender),
    approvalAmount: finiteNumber(request.tokenPermissionApprovalAmount, null),
    intendedTransactionAmount: finiteNumber(request.tokenPermissionIntendedTransactionAmount, null),
    unlimited: bool(request.tokenPermissionUnlimited, false),
    nonce: clean(request.tokenPermissionNonce),
    permitId: clean(request.tokenPermissionPermitId),
    deadline: clean(request.tokenPermissionDeadline),
    reusable: bool(request.tokenPermissionReusable, false),
    chainId: clean(request.tokenPermissionChainId),
    network: clean(request.tokenPermissionNetwork || request.chainName),
    approvedProtocol: clean(request.tokenPermissionApprovedProtocol),
    operatorForAll: bool(request.tokenPermissionOperatorForAll, false),
    batchItems: Array.isArray(request.tokenPermissionBatchItems) ? request.tokenPermissionBatchItems.slice(0, 100) : [],
    allowanceResetExpected: bool(request.tokenPermissionAllowanceResetExpected, false),
    executionWalletAddress: clean(request.executionWalletAddress || request.walletAddress),
    requestNetwork: clean(request.chainName),
    metadataSupplied: Boolean(request.tokenPermissionMetadataSupplied),
  };
}

function previousPermissions(auditLogs = [], request = {}) {
  return auditLogs
    .filter((log) => log.agentId === request.agentId)
    .map((log) => ({ log, permission: log?.originalIntent?.action?.tokenPermission }))
    .filter((item) => item.permission && typeof item.permission === "object");
}

function applyPolicyAction(state, config, action, details, { hard = false } = {}) {
  const shouldBlock = hard || config.mode === "Enforce" || action === "Block";
  const shouldReview = !shouldBlock && config.mode !== "Observe" && action !== "Warn";
  state.scoreDelta += Number(details.score || (shouldBlock ? 45 : shouldReview ? 25 : 8));
  if (shouldBlock) state.hardBlock = true;
  else if (shouldReview) state.needsReview = true;
  const status = shouldBlock ? "fail" : "warning";
  state.findings.push(finding({
    status,
    severity: details.severity || (shouldBlock ? "critical" : shouldReview ? "high" : "medium"),
    rule: details.rule,
    message: details.message,
    evidence: details.evidence || {},
    remediation: details.remediation || "Correct the token-permission metadata or use an authorized policy configuration before retrying.",
  }));
  state.checksFailed.push(details.message);
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "pass", rule, message, evidence }));
  state.checksPassed.push(message);
}

function skipped(state, rule, message, evidence = {}) {
  state.findings.push(finding({ status: "skipped", rule, message, evidence }));
}

function parseDeadline(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateTokenPermissionControls({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const config = policySettings(policy);
  const context = requestContext(request);
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, context: null };

  if (!context.metadataSupplied) {
    skipped(state, "Token permission applicability", "No explicit token-permission metadata was supplied, so generic contract and wallet controls remained unchanged.", { actionType: request.actionType || "" });
    return state;
  }

  if (!config.enabled) {
    skipped(state, "Token permission controls enabled", "Token Permission Controls are disabled by the active policy.", { policyId: policy.id || "" });
    return state;
  }

  if (!TOKEN_PERMISSION_TYPES.has(context.permissionType)) {
    applyPolicyAction(state, config, "Review", {
      rule: "Supported permission classification",
      message: "The submitted token-permission metadata could not be classified safely.",
      evidence: { receivedPermissionType: context.permissionType || "", supportedPermissionTypes: [...TOKEN_PERMISSION_TYPES] },
      remediation: "Use a supported permissionType and provide complete token, owner, spender, amount, chain, nonce, and deadline metadata where applicable.",
    });
    state.context = { ...context, fingerprint: "", replayStatus: "not_evaluated" };
    return state;
  }
  pass(state, "Supported permission classification", `Token permission classified as ${context.permissionType}.`, { permissionType: context.permissionType });

  if (!validWallet(context.owner)) {
    applyPolicyAction(state, config, "Block", { rule: "Valid permission owner", message: "Token-permission owner is missing or structurally invalid.", evidence: { owner: context.owner }, remediation: "Provide the public wallet identifier that owns the token authority. Never provide a private key or signature." }, { hard: true });
  } else pass(state, "Valid permission owner", "Token-permission owner is structurally valid.", { owner: context.owner });

  if (context.executionWalletAddress) {
    if (canonicalIdentity(context.owner) !== canonicalIdentity(context.executionWalletAddress)) {
      applyPolicyAction(state, config, "Block", { rule: "Permission owner binding", message: "Token-permission owner does not match the execution wallet that must authorize the transaction.", evidence: { owner: context.owner, executionWalletAddress: context.executionWalletAddress }, remediation: "Bind the token permission to the exact execution wallet, or submit a separately verified delegation through the Delegated Permissions control when that feature is available." }, { hard: true });
    } else pass(state, "Permission owner binding", "Token-permission owner matches the execution wallet.", { owner: context.owner, executionWalletAddress: context.executionWalletAddress });
  } else skipped(state, "Permission owner binding", "Execution-wallet metadata was unavailable to Token Permission Controls; Wallet Validation remains authoritative for the request.", { owner: context.owner });

  if (context.requestNetwork && context.network && lower(context.requestNetwork) !== lower(context.network)) {
    applyPolicyAction(state, config, "Block", { rule: "Token permission network binding", message: "Token-permission network does not match the transaction network.", evidence: { permissionNetwork: context.network, transactionNetwork: context.requestNetwork }, remediation: "Bind the token permission to the exact transaction network and create a fresh authorization." }, { hard: true });
  } else if (context.network || context.requestNetwork) pass(state, "Token permission network binding", "Token permission is bound to the transaction network.", { permissionNetwork: context.network, transactionNetwork: context.requestNetwork });
  else skipped(state, "Token permission network binding", "No transaction network was available for comparison.", {});

  if (!validToken(context.tokenContract)) {
    applyPolicyAction(state, config, "Block", { rule: "Valid token contract", message: "Token contract is missing or structurally invalid.", evidence: { tokenContract: context.tokenContract }, remediation: "Provide the exact token contract identifier on the intended network." }, { hard: true });
  } else pass(state, "Valid token contract", "Token contract identifier is structurally valid.", { tokenContract: context.tokenContract, tokenStandard: context.tokenStandard });

  if (!validSpender(context.spender)) {
    applyPolicyAction(state, config, "Block", { rule: "Valid spender", message: "Token-permission spender is missing or structurally invalid.", evidence: { spender: context.spender }, remediation: "Provide the public wallet, contract, or package identifier that will receive authority." }, { hard: true });
  } else if (canonicalIdentity(context.owner) === canonicalIdentity(context.spender)) {
    applyPolicyAction(state, config, "Block", { rule: "Owner and spender separation", message: "The spender must not be the same identity as the token owner.", evidence: { owner: context.owner, spender: context.spender }, remediation: "Use the intended protocol, router, vault, or delegated spender address." }, { hard: true });
  } else pass(state, "Valid spender", "Spender identity is structurally valid and distinct from the owner.", { spender: context.spender });

  const canonicalSpender = canonicalIdentity(context.spender);
  if (config.blockedSpenders.includes(canonicalSpender)) {
    applyPolicyAction(state, config, "Block", { rule: "Blocked spender", message: "The spender is explicitly blocked by the active policy.", evidence: { spender: context.spender }, remediation: "Do not grant authority to this spender. An authorized policy owner must complete security review before changing the blocklist." });
  } else if (config.approvedSpenders.includes(canonicalSpender)) {
    pass(state, "Approved spender", "Spender is approved by policy.", { spender: context.spender, approvedSpenderCount: config.approvedSpenders.length });
  } else if (context.spender) {
    applyPolicyAction(state, config, config.unknownSpenderAction, { rule: "Approved spender", message: "The spender is not in the active policy's approved-spender list.", evidence: { spender: context.spender, approvedSpenderCount: config.approvedSpenders.length, allowlistConfigured: config.approvedSpenders.length > 0, approvedProtocol: context.approvedProtocol }, remediation: "Use an approved spender or add this exact spender only after authorized protocol review." });
  }

  const batchApplies = context.permissionType === "Batch Approval" || context.batchItems.length > 0;
  let batchAggregateAmount = null;
  if (batchApplies) {
    if (context.batchItems.length === 0) {
      applyPolicyAction(state, config, "Block", { rule: "Batch token approval", message: "Batch Approval requires non-empty batchItems metadata.", evidence: { batchSize: 0 }, remediation: "Provide each token, spender, positive amount, and optional token ID in batchItems." }, { hard: true });
    } else {
      const invalidItems = [];
      const blockedItems = [];
      const unknownItems = [];
      let aggregate = 0;
      context.batchItems.forEach((item, index) => {
        const tokenContract = clean(item?.tokenContract || context.tokenContract);
        const spender = clean(item?.spender || context.spender);
        const amount = finiteNumber(item?.amount, null);
        const canonicalItemSpender = canonicalIdentity(spender);
        if (!validToken(tokenContract) || !validSpender(spender) || amount === null || amount <= 0) {
          invalidItems.push({ index, tokenContract, spender, amount });
          return;
        }
        aggregate += amount;
        if (config.blockedSpenders.includes(canonicalItemSpender)) blockedItems.push({ index, spender });
        else if (!config.approvedSpenders.includes(canonicalItemSpender)) unknownItems.push({ index, spender });
      });
      batchAggregateAmount = aggregate;
      if (invalidItems.length > 0) {
        applyPolicyAction(state, config, "Block", { rule: "Batch item validity", message: "One or more batch approval entries contain an invalid token, spender, or non-positive amount.", evidence: { invalidItems, batchSize: context.batchItems.length }, remediation: "Correct every batch item before retrying. Each entry needs a valid token identifier, valid spender, and positive amount." }, { hard: true });
      } else pass(state, "Batch item validity", "Every batch approval entry has a valid token, spender, and positive amount.", { batchSize: context.batchItems.length, aggregateAmount: batchAggregateAmount });
      if (blockedItems.length > 0) {
        applyPolicyAction(state, config, "Block", { rule: "Blocked batch spender", message: "At least one batch approval entry grants authority to a blocked spender.", evidence: { blockedItems }, remediation: "Remove every blocked spender from the batch. Do not split or retry the blocked authority." }, { hard: true });
      } else if (unknownItems.length > 0) {
        applyPolicyAction(state, config, config.unknownSpenderAction, { rule: "Approved batch spenders", message: "At least one batch approval entry uses a spender that is not approved by policy.", evidence: { unknownItems, approvedSpenderCount: config.approvedSpenders.length }, remediation: "Use only approved spenders or review and approve each exact spender before retrying." });
      } else if (context.batchItems.length > 0) pass(state, "Approved batch spenders", "Every batch approval spender is approved by policy.", { batchSize: context.batchItems.length });
      if (context.approvalAmount !== null && Math.abs(context.approvalAmount - aggregate) > Number.EPSILON) {
        applyPolicyAction(state, config, "Block", { rule: "Batch aggregate binding", message: "Top-level approvalAmount does not equal the aggregate authority in batchItems.", evidence: { approvalAmount: context.approvalAmount, batchAggregateAmount: aggregate }, remediation: "Set approvalAmount to the exact sum of batch item amounts, or omit it so Magen3 derives the aggregate." }, { hard: true });
      } else pass(state, "Batch aggregate binding", "Batch approval amount is bound to the exact item aggregate.", { approvalAmount: context.approvalAmount, batchAggregateAmount: aggregate });
    }
  }

  const evaluatedApprovalAmount = batchAggregateAmount ?? context.approvalAmount;
  if (AMOUNT_TYPES.has(context.permissionType)) {
    const amountRequired = context.permissionType !== "Allowance Reset";
    if (amountRequired && (evaluatedApprovalAmount === null || evaluatedApprovalAmount <= 0) && !context.unlimited) {
      applyPolicyAction(state, config, "Block", { rule: "Positive approval amount", message: "Approval amount must be positive unless the permission is explicitly marked unlimited.", evidence: { approvalAmount: evaluatedApprovalAmount, unlimited: context.unlimited }, remediation: "Provide the exact positive authority amount required by the intended transaction." }, { hard: true });
    } else if (evaluatedApprovalAmount !== null && evaluatedApprovalAmount < 0) {
      applyPolicyAction(state, config, "Block", { rule: "Positive approval amount", message: "Approval amount cannot be negative.", evidence: { approvalAmount: evaluatedApprovalAmount }, remediation: "Use Allowance Decrease with a non-negative amount, or Allowance Reset with zero." }, { hard: true });
    } else pass(state, "Positive approval amount", "Approval amount semantics are valid for the classified permission.", { approvalAmount: evaluatedApprovalAmount, batchAggregateAmount, unlimited: context.unlimited });
  }

  if (context.unlimited) {
    applyPolicyAction(state, config, config.unlimitedApprovalAction, { rule: "Unlimited token authority", message: "The request grants unlimited token authority.", evidence: { spender: context.spender, permissionType: context.permissionType }, remediation: "Prefer a bounded approval equal to the intended transaction amount and revoke or reset unused authority." });
  } else skipped(state, "Unlimited token authority", "The permission is not marked unlimited.", { unlimited: false });

  if (config.maxApprovalAmount > 0 && evaluatedApprovalAmount !== null && evaluatedApprovalAmount > config.maxApprovalAmount) {
    applyPolicyAction(state, config, "Review", { rule: "Maximum approval amount", message: `Approval amount ${evaluatedApprovalAmount} exceeds the policy maximum of ${config.maxApprovalAmount}.`, evidence: { received: evaluatedApprovalAmount, batchAggregateAmount, expectedMaximum: config.maxApprovalAmount }, remediation: "Reduce the approval amount to the configured maximum or obtain an authorized policy change." });
  } else if (evaluatedApprovalAmount !== null) pass(state, "Maximum approval amount", "Approval amount is within the configured maximum.", { received: evaluatedApprovalAmount, batchAggregateAmount, expectedMaximum: config.maxApprovalAmount || null });

  if (evaluatedApprovalAmount !== null && context.intendedTransactionAmount !== null && context.intendedTransactionAmount > 0) {
    const ratio = evaluatedApprovalAmount / context.intendedTransactionAmount;
    if (config.maxApprovalToTransactionRatio > 0 && ratio > config.maxApprovalToTransactionRatio) {
      applyPolicyAction(state, config, "Review", { rule: "Approval-to-transaction ratio", message: `Approval authority is ${ratio.toFixed(2)}x the intended transaction amount, above the policy maximum of ${config.maxApprovalToTransactionRatio}x.`, evidence: { approvalAmount: evaluatedApprovalAmount, batchAggregateAmount, intendedTransactionAmount: context.intendedTransactionAmount, ratio, expectedMaximumRatio: config.maxApprovalToTransactionRatio }, remediation: "Set the approval close to the intended transaction amount." });
    } else pass(state, "Approval-to-transaction ratio", "Approval authority is proportionate to the intended transaction amount.", { ratio, batchAggregateAmount, expectedMaximumRatio: config.maxApprovalToTransactionRatio || null });
  } else skipped(state, "Approval-to-transaction ratio", "Ratio evaluation requires both approval authority and intendedTransactionAmount.", { approvalAmount: evaluatedApprovalAmount, batchAggregateAmount, intendedTransactionAmount: context.intendedTransactionAmount });

  if (context.permissionType === "NFT Operator Approval" || context.operatorForAll) {
    if (!config.allowNftOperatorApproval) applyPolicyAction(state, config, "Review", { rule: "NFT operator approval", message: "NFT operator-for-all authority is not allowed by the active policy.", evidence: { operatorForAll: context.operatorForAll, spender: context.spender }, remediation: "Use item-specific NFT authority or explicitly enable operator approval after authorized review." });
    else pass(state, "NFT operator approval", "NFT operator authority is enabled by policy.", { operatorForAll: context.operatorForAll });
  }

  if (batchApplies) {
    if (!config.allowBatchApproval) applyPolicyAction(state, config, "Review", { rule: "Batch token approval", message: "Batch token approvals are not allowed by the active policy.", evidence: { batchSize: context.batchItems.length }, remediation: "Submit individual bounded approvals or explicitly enable batch approvals after review." });
    if (context.batchItems.length > config.maximumBatchSize) applyPolicyAction(state, config, "Review", { rule: "Maximum approval batch size", message: `Approval batch size ${context.batchItems.length} exceeds the policy maximum of ${config.maximumBatchSize}.`, evidence: { received: context.batchItems.length, expectedMaximum: config.maximumBatchSize }, remediation: "Split the batch into smaller policy-compliant requests." });
    else if (context.batchItems.length > 0) pass(state, "Maximum approval batch size", "Approval batch size is within the configured maximum.", { batchSize: context.batchItems.length, maximumBatchSize: config.maximumBatchSize });
  }

  const permitLike = PERMIT_TYPES.has(context.permissionType) || Boolean(context.permitId || context.nonce || context.deadline || context.reusable);
  let deadline = null;
  if (permitLike) {
    if (config.requireChainBinding && !context.chainId && !context.network) applyPolicyAction(state, config, "Review", { rule: "Permit chain binding", message: "Permit authorization is missing chain or network binding.", evidence: { chainId: context.chainId, network: context.network }, remediation: "Bind the permit to the exact chain ID or canonical network identifier." });
    else pass(state, "Permit chain binding", "Permit authorization includes chain or network binding.", { chainId: context.chainId, network: context.network });

    if (config.requireNonce && !context.nonce) applyPolicyAction(state, config, "Review", { rule: "Permit nonce", message: "Permit authorization is missing a nonce.", evidence: { noncePresent: false }, remediation: "Provide the exact nonce from the token permit domain." });
    else if (context.nonce && !REFERENCE.test(context.nonce)) applyPolicyAction(state, config, "Block", { rule: "Permit nonce", message: "Permit nonce uses an unsupported format.", evidence: { nonce: context.nonce }, remediation: "Use a 1-128 character alphanumeric/reference nonce." }, { hard: true });
    else if (context.nonce) pass(state, "Permit nonce", "Permit nonce is present and structurally valid.", { nonce: context.nonce });

    deadline = parseDeadline(context.deadline);
    if (config.requireExpiry && !context.deadline) applyPolicyAction(state, config, "Review", { rule: "Permit expiration", message: "Permit authorization is missing a deadline.", evidence: { deadline: "" }, remediation: "Use a short explicit permit deadline." });
    else if (context.deadline && !deadline) applyPolicyAction(state, config, "Block", { rule: "Permit expiration", message: "Permit deadline is not a valid ISO-8601 or Unix timestamp.", evidence: { deadline: context.deadline }, remediation: "Provide a valid expiration timestamp." }, { hard: true });
    else if (deadline && deadline.getTime() <= now.getTime()) applyPolicyAction(state, config, "Block", { rule: "Permit expiration", message: "Permit authorization has expired.", evidence: { deadline: deadline.toISOString(), now: now.toISOString() }, remediation: "Create a new bounded permit with a fresh nonce and short deadline." }, { hard: true });
    else if (deadline) {
      const lifetimeSeconds = Math.ceil((deadline.getTime() - now.getTime()) / 1000);
      if (config.maxLifetimeSeconds > 0 && lifetimeSeconds > config.maxLifetimeSeconds) applyPolicyAction(state, config, "Review", { rule: "Maximum permit lifetime", message: `Permit lifetime ${lifetimeSeconds}s exceeds the policy maximum of ${config.maxLifetimeSeconds}s.`, evidence: { lifetimeSeconds, expectedMaximumSeconds: config.maxLifetimeSeconds }, remediation: "Use a shorter permit deadline." });
      else pass(state, "Permit expiration", "Permit deadline is valid and within the configured lifetime.", { deadline: deadline.toISOString(), lifetimeSeconds, maximumLifetimeSeconds: config.maxLifetimeSeconds || null });
    }

    if (context.reusable) applyPolicyAction(state, config, "Review", { rule: "Reusable delegated authority", message: "The permission is marked reusable and may outlive a single intended execution.", evidence: { reusable: true, permitId: context.permitId }, remediation: "Prefer single-use authority or require Human Approval for reusable delegated permission." });
  }

  if (config.requireAllowanceReset && AMOUNT_TYPES.has(context.permissionType) && context.permissionType !== "Allowance Reset" && !context.allowanceResetExpected) {
    applyPolicyAction(state, config, "Review", { rule: "Allowance reset requirement", message: "The policy requires an allowance-reset plan after token authority is used.", evidence: { allowanceResetExpected: context.allowanceResetExpected }, remediation: "Set allowanceResetExpected and reconcile the reset after execution." });
  } else if (config.requireAllowanceReset && AMOUNT_TYPES.has(context.permissionType)) pass(state, "Allowance reset requirement", "The intent includes the policy-required allowance-reset behavior.", { allowanceResetExpected: context.allowanceResetExpected, permissionType: context.permissionType });
  else skipped(state, "Allowance reset requirement", "Allowance reset is not applicable to this permission type or is not required by policy.", { permissionType: context.permissionType, required: config.requireAllowanceReset });

  const fingerprint = buildTokenPermissionFingerprint(context);
  let replayStatus = "clear";
  if (permitLike) {
    const previous = previousPermissions(auditLogs, request);
    const identityMatches = previous.filter(({ permission }) => {
      const priorPermitId = clean(permission.permitId);
      const priorNonce = clean(permission.nonce);
      return (context.permitId && priorPermitId === context.permitId) || (context.nonce && priorNonce === context.nonce && canonicalIdentity(permission.tokenContract) === canonicalIdentity(context.tokenContract));
    });
    const exact = identityMatches.find(({ permission }) => clean(permission.fingerprint) === fingerprint || buildTokenPermissionFingerprint(permission) === fingerprint);
    if (exact) {
      replayStatus = "replay";
      applyPolicyAction(state, config, "Block", { rule: "Permit replay protection", message: "This permit or delegated permission has already been evaluated and cannot be reused.", evidence: { permitId: context.permitId, nonce: context.nonce, priorAuditLogId: exact.log.id, fingerprint }, remediation: "Create a new permit with a new nonce and binding. Do not retry the same signed authorization." }, { hard: true });
    } else if (identityMatches.length > 0) {
      replayStatus = "parameter_mutation";
      applyPolicyAction(state, config, "Block", { rule: "Permit parameter binding", message: "A previously used permit ID or nonce was submitted with changed protected parameters.", evidence: { permitId: context.permitId, nonce: context.nonce, priorAuditLogIds: identityMatches.map((item) => item.log.id), fingerprint }, remediation: "Do not mutate spender, token, amount, chain, deadline, or authority under an existing permit identity. Create a fresh permit." }, { hard: true });
    } else pass(state, "Permit replay protection", "No prior permit with this identity or protected-parameter fingerprint was found.", { permitId: context.permitId, nonce: context.nonce, fingerprint });
  } else skipped(state, "Permit replay protection", "Replay evaluation is not applicable to this non-permit authority type.", { permissionType: context.permissionType });

  state.context = {
    ...context,
    fingerprint,
    deadline: deadline?.toISOString() || context.deadline,
    replayStatus,
    batchAggregateAmount,
    mode: config.mode,
    policy: {
      approvedSpenderCount: config.approvedSpenders.length,
      blockedSpenderCount: config.blockedSpenders.length,
      maxApprovalAmount: config.maxApprovalAmount || null,
      maxApprovalToTransactionRatio: config.maxApprovalToTransactionRatio || null,
      maxLifetimeSeconds: config.maxLifetimeSeconds || null,
      maximumBatchSize: config.maximumBatchSize,
    },
  };
  return state;
}
