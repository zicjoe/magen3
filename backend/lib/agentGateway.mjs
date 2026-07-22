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
  bridge: "Bridge",
  bridging: "Bridge",
  "cross-chain transfer": "Bridge",
  "cross chain transfer": "Bridge",
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
  bridge: "Bridge Contract",
  "bridge contract": "Bridge Contract",
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


function optionalNumber(value, name, { integer = false, min = null, max = null } = {}) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || (min !== null && parsed < min) || (max !== null && parsed > max)) {
    const err = new Error(`${name} must be a valid ${integer ? "integer" : "number"}`);
    err.status = 400;
    throw err;
  }
  return parsed;
}

function containsForbiddenSigningMaterial(value, depth = 0, path = []) {
  if (!value || typeof value !== "object" || depth > 5) return false;
  const alwaysForbidden = new Set([
    "privatekey", "private_key", "secretkey", "secret_key", "mnemonic",
    "signeddeploy", "signedtransaction", "rawsigneddeploy", "rawsignedtransaction",
  ]);
  const signedPayloadFields = new Set([
    "seed", "approval", "approvals", "signature", "signatures",
  ]);
  const insideRuntimeArgs = path.includes("runtimeargs") || path.includes("runtime_args");

  return Object.entries(value).some(([key, child]) => {
    const normalized = String(key).toLowerCase().replace(/[^a-z_]/g, "");
    if (alwaysForbidden.has(normalized)) return true;
    if (!insideRuntimeArgs && signedPayloadFields.has(normalized)) return true;
    return containsForbiddenSigningMaterial(child, depth + 1, [...path, normalized]);
  });
}

function normalizeRuntimeArgs(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    const err = new Error("action.preflight.runtimeArgs must be an object when supplied");
    err.status = 400;
    throw err;
  }
  return Object.fromEntries(Object.entries(value).slice(0, 100));
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
  const preflight = action.preflight && typeof action.preflight === "object"
    ? action.preflight
    : action.executionPreflight && typeof action.executionPreflight === "object"
      ? action.executionPreflight
      : body.preflight && typeof body.preflight === "object"
        ? body.preflight
        : {};
  const oracle = action.oracle && typeof action.oracle === "object"
    ? action.oracle
    : action.oracleValidation && typeof action.oracleValidation === "object"
      ? action.oracleValidation
      : body.oracle && typeof body.oracle === "object"
        ? body.oracle
        : {};
  const bridge = action.bridge && typeof action.bridge === "object"
    ? action.bridge
    : action.bridgeRoute && typeof action.bridgeRoute === "object"
      ? action.bridgeRoute
      : body.bridge && typeof body.bridge === "object"
        ? body.bridge
        : {};

  if (containsForbiddenSigningMaterial(body)) {
    const err = new Error("Wallet signing material, transaction approvals or signatures, private keys, and raw signed transactions are not accepted by the pre-signing Agent Gateway");
    err.status = 400;
    throw err;
  }

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
    outputAsset: cleanString(action.outputAsset || action.output_asset || body.outputAsset || body.output_asset || oracle.quoteAsset || oracle.quote_asset, ""),
    oracleBaseAsset: cleanString(oracle.baseAsset || oracle.base_asset || action.oracleBaseAsset || action.oracle_base_asset || action.asset || body.asset, ""),
    oracleQuoteAsset: cleanString(oracle.quoteAsset || oracle.quote_asset || action.oracleQuoteAsset || action.oracle_quote_asset || action.outputAsset || action.output_asset || body.outputAsset || body.output_asset, ""),
    executionPrice: optionalNumber(oracle.executionPrice ?? oracle.execution_price ?? oracle.price ?? action.executionPrice ?? action.execution_price, "executionPrice", { min: 0 }),
    quoteTimestamp: cleanString(oracle.quoteTimestamp || oracle.quote_timestamp || oracle.timestamp || action.quoteTimestamp || action.quote_timestamp || "", ""),
    target: cleanString(contract.identifier || contract.hash || action.contractHash || action.contract_hash || action.contractPackageHash || action.contract_package_hash || target, ""),
    targetType: normalizeTargetType(action.targetType || action.target_type || body.targetType || body.target_type),
    contractIdentifierType: cleanString(
      contract.identifierType || contract.identifier_type || contract.type || action.contractIdentifierType || action.contract_identifier_type || body.contractIdentifierType || body.contract_identifier_type,
      ""
    ),
    entryPoint: cleanString(contract.entryPoint || contract.entry_point || action.entryPoint || action.entry_point || body.entryPoint || body.entry_point, ""),
    contractVersion,
    chainName: cleanString(contract.chainName || contract.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name, ""),
    paymentAmountMotes: cleanString(preflight.paymentAmountMotes ?? preflight.payment_amount_motes ?? action.paymentAmountMotes ?? action.payment_amount_motes ?? "", ""),
    gasPriceTolerance: optionalNumber(preflight.gasPriceTolerance ?? preflight.gas_price_tolerance ?? action.gasPriceTolerance ?? action.gas_price_tolerance, "gasPriceTolerance", { integer: true }),
    ttl: cleanString(preflight.ttl ?? action.ttl ?? "", ""),
    transactionTimestamp: cleanString(preflight.timestamp ?? preflight.transactionTimestamp ?? preflight.transaction_timestamp ?? action.transactionTimestamp ?? action.transaction_timestamp ?? "", ""),
    slippageBps: optionalNumber(preflight.slippageBps ?? preflight.slippage_bps ?? action.slippageBps ?? action.slippage_bps, "slippageBps", { integer: true }),
    expectedOutput: optionalNumber(preflight.expectedOutput ?? preflight.expected_output ?? action.expectedOutput ?? action.expected_output, "expectedOutput"),
    minimumReceived: optionalNumber(preflight.minimumReceived ?? preflight.minimum_received ?? action.minimumReceived ?? action.minimum_received, "minimumReceived"),
    runtimeArgs: normalizeRuntimeArgs(preflight.runtimeArgs ?? preflight.runtime_args ?? action.runtimeArgs ?? action.runtime_args),
    transactionHash: cleanString(preflight.transactionHash ?? preflight.transaction_hash ?? action.transactionHash ?? action.transaction_hash ?? "", ""),
    bridgeSourceChain: cleanString(bridge.sourceChain || bridge.source_chain || action.bridgeSourceChain || action.bridge_source_chain || body.bridgeSourceChain || body.bridge_source_chain || "", ""),
    bridgeDestinationChain: cleanString(bridge.destinationChain || bridge.destination_chain || action.bridgeDestinationChain || action.bridge_destination_chain || body.bridgeDestinationChain || body.bridge_destination_chain || body.targetChain || "", ""),
    bridgeProvider: cleanString(bridge.provider || bridge.bridgeProvider || bridge.bridge_provider || action.bridgeProvider || action.bridge_provider || body.bridgeProvider || body.bridge_provider || "", ""),
    bridgeRouteId: cleanString(bridge.routeId || bridge.route_id || action.bridgeRouteId || action.bridge_route_id || body.bridgeRouteId || body.bridge_route_id || "", ""),
    bridgeDestinationAddress: cleanString(bridge.destinationAddress || bridge.destination_address || bridge.recipient || action.bridgeDestinationAddress || action.bridge_destination_address || body.bridgeDestinationAddress || body.bridge_destination_address || "", ""),
    bridgeAsset: cleanString(bridge.asset || bridge.token || action.bridgeAsset || action.bridge_asset || action.asset || body.asset || "", ""),
    bridgeFeeAmount: optionalNumber(bridge.feeAmount ?? bridge.fee_amount ?? action.bridgeFeeAmount ?? action.bridge_fee_amount, "bridgeFeeAmount", { min: 0 }),
    bridgeFeeBps: optionalNumber(bridge.feeBps ?? bridge.fee_bps ?? action.bridgeFeeBps ?? action.bridge_fee_bps, "bridgeFeeBps", { min: 0, max: 10000 }),
    bridgeExpectedOutput: optionalNumber(bridge.expectedOutput ?? bridge.expected_output ?? action.bridgeExpectedOutput ?? action.bridge_expected_output, "bridgeExpectedOutput", { min: 0 }),
    bridgeMinimumReceived: optionalNumber(bridge.minimumReceived ?? bridge.minimum_received ?? action.bridgeMinimumReceived ?? action.bridge_minimum_received, "bridgeMinimumReceived", { min: 0 }),
    bridgeQuoteTimestamp: cleanString(bridge.quoteTimestamp || bridge.quote_timestamp || action.bridgeQuoteTimestamp || action.bridge_quote_timestamp || "", ""),
    bridgeQuoteExpiresAt: cleanString(bridge.quoteExpiresAt || bridge.quote_expires_at || bridge.expiresAt || bridge.expires_at || action.bridgeQuoteExpiresAt || action.bridge_quote_expires_at || "", ""),
    bridgeSourceConfirmations: optionalNumber(bridge.sourceConfirmations ?? bridge.source_confirmations ?? action.bridgeSourceConfirmations ?? action.bridge_source_confirmations, "bridgeSourceConfirmations", { integer: true, min: 0 }),
    bridgeDestinationConfirmations: optionalNumber(bridge.destinationConfirmations ?? bridge.destination_confirmations ?? action.bridgeDestinationConfirmations ?? action.bridge_destination_confirmations, "bridgeDestinationConfirmations", { integer: true, min: 0 }),
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
