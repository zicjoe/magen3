import { makeId } from "./ids.mjs";

const ACTION_ALIASES = {
  stake: "Stake",
  staking: "Stake",
  delegate: "Stake",
  transfer: "Transfer",
  send: "Transfer",
  swap: "Swap",
  trade: "Swap",
  claim: "Claim Rewards",
  "claim rewards": "Claim Rewards",
  deposit: "Deposit to Vault",
  vault: "Deposit to Vault",
  contract: "Contract Interaction",
  call: "Contract Interaction",
  "contract call": "Contract Interaction",
  "contract_call": "Contract Interaction",
  "contract interaction": "Contract Interaction",
  dao: "DAO Treasury Payment",
  "dao treasury payment": "DAO Treasury Payment",
  rwa: "RWA Proof Update",
  "rwa proof update": "RWA Proof Update",
  oracle: "Oracle Data Update",
  "oracle data update": "Oracle Data Update",
};

const TARGET_TYPE_ALIASES = {
  trusted: "Trusted Contract",
  "trusted contract": "Trusted Contract",
  unknown: "Unknown Contract",
  "unknown contract": "Unknown Contract",
  wallet: "Wallet Address",
  "wallet address": "Wallet Address",
  dao: "DAO Treasury",
  treasury: "DAO Treasury",
  "dao treasury": "DAO Treasury",
  rwa: "RWA Registry",
  registry: "RWA Registry",
  "rwa registry": "RWA Registry",
  oracle: "Oracle Feed",
  feed: "Oracle Feed",
  "oracle feed": "Oracle Feed",
};

function cleanString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeActionType(value) {
  const raw = cleanString(value, "Contract Interaction");
  return ACTION_ALIASES[raw.toLowerCase()] || raw;
}

function normalizeTargetType(value) {
  const raw = cleanString(value, "Unknown Contract");
  return TARGET_TYPE_ALIASES[raw.toLowerCase()] || raw;
}

function requireField(value, name) {
  if (!cleanString(value)) {
    const err = new Error(`${name} is required for Agent Gateway requests`);
    err.status = 400;
    throw err;
  }
  return cleanString(value);
}

export function normalizeAgentGatewayIntent(body = {}) {
  const action = body.action && typeof body.action === "object" ? body.action : body;
  const agentId = requireField(body.agentId || body.agent_id || action.agentId || action.agent_id, "agentId");
  const actionType = normalizeActionType(action.type || action.actionType || action.action_type || body.actionType || body.action_type);
  const target = cleanString(action.target || body.target, "");
  const amount = Number(action.amount ?? body.amount ?? 0);

  if (!Number.isFinite(amount) || amount < 0) {
    const err = new Error("amount must be a valid non-negative number");
    err.status = 400;
    throw err;
  }

  const contract = action.contract && typeof action.contract === "object" ? action.contract : {};
  const contractVersionRaw = contract.version ?? action.contractVersion ?? action.contract_version ?? body.contractVersion ?? body.contract_version;
  const contractVersion = contractVersionRaw === undefined || contractVersionRaw === null || contractVersionRaw === ""
    ? null
    : Number(contractVersionRaw);

  if (contractVersion !== null && (!Number.isFinite(contractVersion) || contractVersion < 0)) {
    const err = new Error("contractVersion must be a valid non-negative number when supplied");
    err.status = 400;
    throw err;
  }

  return {
    id: makeId("GW"),
    source: cleanString(body.source || body.client || body.agentName || body.agent_name, "external-agent"),
    agentId,
    executionWalletAddress: cleanString(
      body.executionWalletAddress || body.execution_wallet_address || body.walletAddress || body.wallet_address || body.wallet,
      ""
    ),
    actionType,
    amount,
    asset: cleanString(action.asset || body.asset, "CSPR"),
    target: cleanString(contract.identifier || contract.hash || action.contractHash || action.contract_hash || action.contractPackageHash || action.contract_package_hash || target, ""),
    targetType: normalizeTargetType(action.targetType || action.target_type || body.targetType || body.target_type),
    contractIdentifierType: cleanString(
      contract.identifierType || contract.identifier_type || contract.type || action.contractIdentifierType || action.contract_identifier_type || body.contractIdentifierType || body.contract_identifier_type,
      ""
    ),
    entryPoint: cleanString(contract.entryPoint || contract.entry_point || action.entryPoint || action.entry_point || body.entryPoint || body.entry_point, ""),
    contractVersion,
    chainName: cleanString(contract.chainName || contract.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name, ""),
    goal: cleanString(body.goal || body.prompt || ""),
    reason: cleanString(body.reason || action.reason || ""),
    receivedAt: new Date().toISOString(),
  };
}

export function gatewayNextAction(decision) {
  if (decision === "Allowed") {
    return "Allowed by Magen3. The external agent may continue only after the wallet owner or execution layer signs the actual transaction.";
  }
  if (decision === "Blocked") {
    return "Blocked by Magen3. The external agent must stop and must not ask the wallet to sign this action.";
  }
  return "Review Required. Pause the agent and send this action to a human/admin approval flow before execution.";
}

export function gatewayStatusFromDecision(decision) {
  if (decision === "Allowed") return "allowed_pending_execution";
  if (decision === "Blocked") return "blocked_before_execution";
  return "waiting_for_human_review";
}
