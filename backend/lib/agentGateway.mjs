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
  x402: "x402 Payment",
  "x402 payment": "x402 Payment",
  "http payment": "x402 Payment",
  "api payment": "x402 Payment",
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
  merchant: "x402 Merchant",
  "x402 merchant": "x402 Merchant",
  "paid resource": "x402 Merchant",
};

function cleanString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function boundedString(value, name, maxLength) {
  const normalized = cleanString(value);
  if (normalized.length > maxLength) {
    const err = new Error(`${name} exceeds the maximum supported length`);
    err.status = 400;
    throw err;
  }
  return normalized;
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
    "paymentsignature", "payment_signature", "paymentpayload", "payment_payload", "signedpayment", "signed_payment",
  ]);
  const signedPayloadFields = new Set([
    "seed", "approval", "approvals", "signature", "signatures", "sponsorsignature", "sponsor_signature", "paymastersignature", "paymaster_signature",
  ]);
  const insideRuntimeArgs = path.includes("runtimeargs") || path.includes("runtime_args");
  const insideDelegation = path.some((item) => ["delegation", "delegatedpermission", "delegated_permission", "sessionkey", "session_key"].includes(item));

  return Object.entries(value).some(([key, child]) => {
    const normalized = String(key).toLowerCase().replace(/[^a-z_]/g, "");
    if (alwaysForbidden.has(normalized)) return true;
    const transientDelegationSignature = insideDelegation && ["signature", "attestationsignature", "attestation_signature"].includes(normalized);
    if (!insideRuntimeArgs && !transientDelegationSignature && signedPayloadFields.has(normalized)) return true;
    return containsForbiddenSigningMaterial(child, depth + 1, [...path, normalized]);
  });
}


function containsForbiddenCompliancePii(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return false;
  const forbidden = new Set([
    "name", "fullname", "full_name", "firstname", "first_name", "lastname", "last_name",
    "dateofbirth", "date_of_birth", "dob", "passport", "passportnumber", "passport_number",
    "nationalid", "national_id", "ssn", "taxid", "tax_id", "email", "phone", "phonenumber",
    "phone_number", "residentialaddress", "residential_address", "document", "documentimage",
    "document_image", "selfie", "biometric", "biometrics"
  ]);
  return Object.entries(value).some(([key, child]) => {
    const normalized = String(key).toLowerCase().replace(/[^a-z_]/g, "");
    if (forbidden.has(normalized)) return true;
    return containsForbiddenCompliancePii(child, depth + 1);
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


function normalizeMetadataValue(value, depth = 0) {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return cleanString(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => normalizeMetadataValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, child]) => [cleanString(key).slice(0, 80), normalizeMetadataValue(child, depth + 1)]));
  }
  return cleanString(value);
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
  const executionQuality = action.executionQuality && typeof action.executionQuality === "object"
    ? action.executionQuality
    : action.execution_quality && typeof action.execution_quality === "object"
      ? action.execution_quality
      : body.executionQuality && typeof body.executionQuality === "object"
        ? body.executionQuality
        : {};
  const tradingRoute = action.tradingRoute && typeof action.tradingRoute === "object"
    ? action.tradingRoute
    : action.trading_route && typeof action.trading_route === "object"
      ? action.trading_route
      : action.route && typeof action.route === "object"
        ? action.route
        : body.tradingRoute && typeof body.tradingRoute === "object"
          ? body.tradingRoute
          : {};
  const marketRisk = action.marketRisk && typeof action.marketRisk === "object"
    ? action.marketRisk
    : action.market_risk && typeof action.market_risk === "object"
      ? action.market_risk
      : action.marketRiskSignals && typeof action.marketRiskSignals === "object"
        ? action.marketRiskSignals
        : body.marketRisk && typeof body.marketRisk === "object"
          ? body.marketRisk
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
  const compliance = action.compliance && typeof action.compliance === "object"
    ? action.compliance
    : action.complianceControls && typeof action.complianceControls === "object"
      ? action.complianceControls
      : body.compliance && typeof body.compliance === "object"
        ? body.compliance
        : {};
  const x402 = action.x402 && typeof action.x402 === "object"
    ? action.x402
    : action.x402Payment && typeof action.x402Payment === "object"
      ? action.x402Payment
      : body.x402 && typeof body.x402 === "object"
        ? body.x402
        : {};
  const tokenPermission = action.tokenPermission && typeof action.tokenPermission === "object"
    ? action.tokenPermission
    : action.token_permission && typeof action.token_permission === "object"
      ? action.token_permission
      : action.permission && typeof action.permission === "object"
        ? action.permission
        : body.tokenPermission && typeof body.tokenPermission === "object"
          ? body.tokenPermission
          : {};
  const privilegedAction = action.privilegedAction && typeof action.privilegedAction === "object"
    ? action.privilegedAction
    : action.privileged_action && typeof action.privileged_action === "object"
      ? action.privileged_action
      : action.administrativeAction && typeof action.administrativeAction === "object"
        ? action.administrativeAction
        : action.administrative_action && typeof action.administrative_action === "object"
          ? action.administrative_action
          : body.privilegedAction && typeof body.privilegedAction === "object"
            ? body.privilegedAction
            : {};
  const contractUpgrade = action.contractUpgrade && typeof action.contractUpgrade === "object"
    ? action.contractUpgrade
    : action.contract_upgrade && typeof action.contract_upgrade === "object"
      ? action.contract_upgrade
      : body.contractUpgrade && typeof body.contractUpgrade === "object"
        ? body.contractUpgrade
        : {};
  const lifecycle = action.lifecycle && typeof action.lifecycle === "object"
    ? action.lifecycle
    : action.executionLifecycle && typeof action.executionLifecycle === "object"
      ? action.executionLifecycle
      : body.lifecycle && typeof body.lifecycle === "object"
        ? body.lifecycle
        : {};
  const instructionIntegrity = action.instructionIntegrity && typeof action.instructionIntegrity === "object"
    ? action.instructionIntegrity
    : action.instruction_integrity && typeof action.instruction_integrity === "object"
      ? action.instruction_integrity
      : action.provenance && typeof action.provenance === "object"
        ? action.provenance
        : body.instructionIntegrity && typeof body.instructionIntegrity === "object"
          ? body.instructionIntegrity
          : body.provenance && typeof body.provenance === "object"
            ? body.provenance
            : {};
  const toolIntegrity = action.toolIntegrity && typeof action.toolIntegrity === "object"
    ? action.toolIntegrity
    : action.tool_integrity && typeof action.tool_integrity === "object"
      ? action.tool_integrity
      : action.mcpIntegrity && typeof action.mcpIntegrity === "object"
        ? action.mcpIntegrity
        : action.mcp_integrity && typeof action.mcp_integrity === "object"
          ? action.mcp_integrity
          : action.toolMcpIntegrity && typeof action.toolMcpIntegrity === "object"
            ? action.toolMcpIntegrity
            : body.toolIntegrity && typeof body.toolIntegrity === "object"
              ? body.toolIntegrity
              : body.mcpIntegrity && typeof body.mcpIntegrity === "object"
                ? body.mcpIntegrity
                : {};
  const delegation = action.delegation && typeof action.delegation === "object"
    ? action.delegation
    : action.delegatedPermission && typeof action.delegatedPermission === "object"
      ? action.delegatedPermission
      : action.delegated_permission && typeof action.delegated_permission === "object"
        ? action.delegated_permission
        : action.sessionKey && typeof action.sessionKey === "object"
          ? action.sessionKey
          : action.session_key && typeof action.session_key === "object"
            ? action.session_key
            : body.delegation && typeof body.delegation === "object"
              ? body.delegation
              : {};
  const rpcIntegrity = action.rpcIntegrity && typeof action.rpcIntegrity === "object"
    ? action.rpcIntegrity
    : action.rpc_integrity && typeof action.rpc_integrity === "object"
      ? action.rpc_integrity
      : action.chainIntegrity && typeof action.chainIntegrity === "object"
        ? action.chainIntegrity
        : action.chain_integrity && typeof action.chain_integrity === "object"
          ? action.chain_integrity
          : body.rpcIntegrity && typeof body.rpcIntegrity === "object"
            ? body.rpcIntegrity
            : body.chainIntegrity && typeof body.chainIntegrity === "object"
              ? body.chainIntegrity
              : {};
  const feeSafety = action.feeSafety && typeof action.feeSafety === "object"
    ? action.feeSafety
    : action.fee_safety && typeof action.fee_safety === "object"
      ? action.fee_safety
      : action.gasSponsorship && typeof action.gasSponsorship === "object"
        ? action.gasSponsorship
        : action.gas_sponsorship && typeof action.gas_sponsorship === "object"
          ? action.gas_sponsorship
          : action.sponsorship && typeof action.sponsorship === "object"
            ? action.sponsorship
            : body.feeSafety && typeof body.feeSafety === "object"
              ? body.feeSafety
              : body.gasSponsorship && typeof body.gasSponsorship === "object"
                ? body.gasSponsorship
                : {};

  if (containsForbiddenSigningMaterial(body)) {
    const err = new Error("Wallet signing material, transaction approvals or signatures, private keys, and raw signed transactions are not accepted by the pre-signing Agent Gateway");
    err.status = 400;
    throw err;
  }

  if (containsForbiddenCompliancePii(compliance)) {
    const err = new Error("Raw personal identity data is not accepted by Compliance Controls. Submit only non-sensitive statuses, jurisdiction codes, provider labels, opaque references, and hashes.");
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
    chainName: cleanString(contract.chainName || contract.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name || body.targetChain || body.target_chain, ""),
    paymentAmountMotes: cleanString(preflight.paymentAmountMotes ?? preflight.payment_amount_motes ?? action.paymentAmountMotes ?? action.payment_amount_motes ?? "", ""),
    gasPriceTolerance: optionalNumber(preflight.gasPriceTolerance ?? preflight.gas_price_tolerance ?? action.gasPriceTolerance ?? action.gas_price_tolerance, "gasPriceTolerance", { integer: true }),
    ttl: cleanString(preflight.ttl ?? action.ttl ?? "", ""),
    transactionTimestamp: cleanString(preflight.timestamp ?? preflight.transactionTimestamp ?? preflight.transaction_timestamp ?? action.transactionTimestamp ?? action.transaction_timestamp ?? "", ""),
    slippageBps: optionalNumber(preflight.slippageBps ?? preflight.slippage_bps ?? action.slippageBps ?? action.slippage_bps, "slippageBps", { integer: true }),
    expectedOutput: optionalNumber(preflight.expectedOutput ?? preflight.expected_output ?? action.expectedOutput ?? action.expected_output, "expectedOutput"),
    minimumReceived: optionalNumber(preflight.minimumReceived ?? preflight.minimum_received ?? action.minimumReceived ?? action.minimum_received, "minimumReceived"),
    executionQuoteProvider: cleanString(executionQuality.quoteProvider || executionQuality.quote_provider || action.quoteProvider || action.quote_provider || "", ""),
    executionQuoteId: cleanString(executionQuality.quoteId || executionQuality.quote_id || action.quoteId || action.quote_id || "", ""),
    executionQuoteTimestamp: cleanString(executionQuality.quoteTimestamp || executionQuality.quote_timestamp || action.executionQuoteTimestamp || action.execution_quote_timestamp || action.quoteTimestamp || action.quote_timestamp || "", ""),
    executionQuoteExpiresAt: cleanString(executionQuality.quoteExpiresAt || executionQuality.quote_expires_at || action.executionQuoteExpiresAt || action.execution_quote_expires_at || "", ""),
    executionDeadline: cleanString(executionQuality.deadline || executionQuality.executionDeadline || executionQuality.execution_deadline || action.deadline || action.executionDeadline || action.execution_deadline || "", ""),
    priceImpactBps: optionalNumber(executionQuality.priceImpactBps ?? executionQuality.price_impact_bps ?? action.priceImpactBps ?? action.price_impact_bps, "priceImpactBps", { min: 0, max: 10000 }),
    simulatedOutput: optionalNumber(executionQuality.simulatedOutput ?? executionQuality.simulated_output ?? action.simulatedOutput ?? action.simulated_output, "simulatedOutput", { min: 0 }),
    executionChannel: cleanString(executionQuality.executionChannel || executionQuality.execution_channel || action.executionChannel || action.execution_channel || "", ""),
    privateExecutionAvailable: Boolean(executionQuality.privateExecutionAvailable === true || executionQuality.private_execution_available === true || action.privateExecutionAvailable === true || action.private_execution_available === true),
    tradingRouteQuoteProvider: cleanString(tradingRoute.quoteProvider || tradingRoute.quote_provider || tradingRoute.provider || executionQuality.quoteProvider || executionQuality.quote_provider || "", ""),
    tradingRouteQuoteId: cleanString(tradingRoute.quoteId || tradingRoute.quote_id || tradingRoute.routeId || tradingRoute.route_id || executionQuality.quoteId || executionQuality.quote_id || "", ""),
    tradingRouteRouter: cleanString(tradingRoute.router || tradingRoute.routerAddress || tradingRoute.router_address || "", ""),
    tradingRouteAggregator: cleanString(tradingRoute.aggregator || tradingRoute.aggregatorId || tradingRoute.aggregator_id || "", ""),
    tradingRouteProtocol: cleanString(tradingRoute.protocol || tradingRoute.protocolId || tradingRoute.protocol_id || "", ""),
    tradingRoutePoolSequence: Array.isArray(tradingRoute.poolSequence || tradingRoute.pool_sequence || tradingRoute.pools) ? (tradingRoute.poolSequence || tradingRoute.pool_sequence || tradingRoute.pools).slice(0, 32).map((item) => cleanString(item)).filter(Boolean) : [],
    tradingRouteTokenPath: Array.isArray(tradingRoute.tokenPath || tradingRoute.token_path || tradingRoute.path) ? (tradingRoute.tokenPath || tradingRoute.token_path || tradingRoute.path).slice(0, 32).map((item) => cleanString(item)).filter(Boolean) : [],
    tradingRouteInputAsset: cleanString(tradingRoute.inputAsset || tradingRoute.input_asset || tradingRoute.fromAsset || tradingRoute.from_asset || action.asset || body.asset || "", ""),
    tradingRouteOutputAsset: cleanString(tradingRoute.outputAsset || tradingRoute.output_asset || tradingRoute.toAsset || tradingRoute.to_asset || action.outputAsset || action.output_asset || body.outputAsset || body.output_asset || "", ""),
    tradingRouteInputAmount: optionalNumber(tradingRoute.inputAmount ?? tradingRoute.input_amount ?? action.amount ?? body.amount, "tradingRouteInputAmount", { min: 0 }),
    tradingRouteExpectedOutput: optionalNumber(tradingRoute.expectedOutput ?? tradingRoute.expected_output ?? action.expectedOutput ?? action.expected_output, "tradingRouteExpectedOutput", { min: 0 }),
    tradingRouteMinimumOutput: optionalNumber(tradingRoute.minimumOutput ?? tradingRoute.minimum_output ?? tradingRoute.minimumReceived ?? tradingRoute.minimum_received ?? action.minimumReceived ?? action.minimum_received, "tradingRouteMinimumOutput", { min: 0 }),
    tradingRouteExecutionMode: cleanString(tradingRoute.executionMode || tradingRoute.execution_mode || tradingRoute.swapType || tradingRoute.swap_type || "exact_input", "exact_input"),
    tradingRouteFeeBps: optionalNumber(tradingRoute.routeFeeBps ?? tradingRoute.route_fee_bps ?? tradingRoute.feeBps ?? tradingRoute.fee_bps, "tradingRouteFeeBps", { min: 0, max: 10000 }),
    tradingRouteFeeAmount: optionalNumber(tradingRoute.routeFeeAmount ?? tradingRoute.route_fee_amount ?? tradingRoute.feeAmount ?? tradingRoute.fee_amount, "tradingRouteFeeAmount", { min: 0 }),
    tradingRouteFeeRecipients: Array.isArray(tradingRoute.feeRecipients || tradingRoute.fee_recipients) ? (tradingRoute.feeRecipients || tradingRoute.fee_recipients).slice(0, 32).map((item) => cleanString(item)).filter(Boolean) : [],
    tradingRouteIntermediaryContracts: Array.isArray(tradingRoute.intermediaryContracts || tradingRoute.intermediary_contracts || tradingRoute.contracts) ? (tradingRoute.intermediaryContracts || tradingRoute.intermediary_contracts || tradingRoute.contracts).slice(0, 32).map((item) => cleanString(item)).filter(Boolean) : [],
    tradingRouteCalldata: boundedString(tradingRoute.calldata || tradingRoute.callData || tradingRoute.call_data || "", "tradingRoute.calldata", 262144),
    tradingRouteCalldataHash: boundedString(tradingRoute.calldataHash || tradingRoute.calldata_hash || "", "tradingRoute.calldataHash", 128).toLowerCase(),
    tradingRoutePayloadHash: boundedString(tradingRoute.payloadHash || tradingRoute.payload_hash || "", "tradingRoute.payloadHash", 128).toLowerCase(),
    tradingRouteAuthorizedRouteHash: boundedString(tradingRoute.authorizedRouteHash || tradingRoute.authorized_route_hash || tradingRoute.routeFingerprint || tradingRoute.route_fingerprint || "", "tradingRoute.authorizedRouteHash", 128).toLowerCase(),
    tradingRouteExpiresAt: cleanString(tradingRoute.expiresAt || tradingRoute.expires_at || tradingRoute.quoteExpiresAt || tradingRoute.quote_expires_at || executionQuality.quoteExpiresAt || executionQuality.quote_expires_at || "", ""),
    marketRiskMetadataSupplied: Object.keys(marketRisk).length > 0,
    marketRiskBaseAsset: cleanString(marketRisk.baseAsset || marketRisk.base_asset || tradingRoute.inputAsset || tradingRoute.input_asset || action.asset || body.asset || "", ""),
    marketRiskQuoteAsset: cleanString(marketRisk.quoteAsset || marketRisk.quote_asset || tradingRoute.outputAsset || tradingRoute.output_asset || action.outputAsset || action.output_asset || body.outputAsset || body.output_asset || "", ""),
    marketRiskBaseCanonicalId: boundedString(marketRisk.baseCanonicalId || marketRisk.base_canonical_id || "", "marketRisk.baseCanonicalId", 256).toLowerCase(),
    marketRiskQuoteCanonicalId: boundedString(marketRisk.quoteCanonicalId || marketRisk.quote_canonical_id || "", "marketRisk.quoteCanonicalId", 256).toLowerCase(),
    marketRiskChainFamily: boundedString(marketRisk.chainFamily || marketRisk.chain_family || "", "marketRisk.chainFamily", 32).toUpperCase(),
    marketRiskNetwork: boundedString(marketRisk.network || marketRisk.chainName || marketRisk.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name || "", "marketRisk.network", 128).toLowerCase(),
    marketRiskVenue: boundedString(marketRisk.venue || marketRisk.protocol || marketRisk.aggregator || tradingRoute.protocol || tradingRoute.aggregator || "", "marketRisk.venue", 128).toLowerCase(),
    marketRiskPoolId: boundedString(marketRisk.poolId || marketRisk.pool_id || marketRisk.pool || (Array.isArray(tradingRoute.poolSequence || tradingRoute.pool_sequence || tradingRoute.pools) ? (tradingRoute.poolSequence || tradingRoute.pool_sequence || tradingRoute.pools)[0] : "") || "", "marketRisk.poolId", 256).toLowerCase(),
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
    bridgeProviderId: boundedString(bridge.providerId || bridge.provider_id || bridge.adapterId || bridge.adapter_id || "", "bridge.providerId", 64).toLowerCase(),
    bridgeOriginChainId: optionalNumber(bridge.sourceChainId ?? bridge.source_chain_id ?? bridge.originChainId ?? bridge.origin_chain_id, "bridge.sourceChainId", { integer: true, min: 1 }),
    bridgeSourceChainId: optionalNumber(bridge.sourceChainId ?? bridge.source_chain_id ?? bridge.originChainId ?? bridge.origin_chain_id, "bridge.sourceChainId", { integer: true, min: 1 }),
    bridgeDestinationChainId: optionalNumber(bridge.destinationChainId ?? bridge.destination_chain_id, "bridge.destinationChainId", { integer: true, min: 1 }),
    bridgeInputToken: boundedString(bridge.sourceToken || bridge.source_token || bridge.inputToken || bridge.input_token || "", "bridge.sourceToken", 256).toLowerCase(),
    bridgeOutputToken: boundedString(bridge.destinationToken || bridge.destination_token || bridge.outputToken || bridge.output_token || "", "bridge.destinationToken", 256).toLowerCase(),
    bridgeAmountAtomic: boundedString(bridge.amountAtomic || bridge.amount_atomic || action.amountAtomic || action.amount_atomic || "", "bridge.amountAtomic", 100),
    bridgeDepositor: boundedString(bridge.depositor || bridge.sender || "", "bridge.depositor", 128).toLowerCase(),
    bridgeRecipient: boundedString(bridge.recipient || bridge.destinationAddress || bridge.destination_address || "", "bridge.recipient", 128).toLowerCase(),
    bridgeTradeType: boundedString(bridge.tradeType || bridge.trade_type || "exactInput", "bridge.tradeType", 32),
    bridgeSlippage: optionalNumber(bridge.slippage, "bridge.slippage", { min: 0, max: 1 }),
    bridgeExpectedOutputAtomic: boundedString(bridge.expectedOutputAtomic || bridge.expected_output_atomic || "", "bridge.expectedOutputAtomic", 100),
    bridgeMinimumReceivedAtomic: boundedString(bridge.minimumReceivedAtomic || bridge.minimum_received_atomic || "", "bridge.minimumReceivedAtomic", 100),
    bridgeProviderQuoteId: boundedString(bridge.providerQuoteId || bridge.provider_quote_id || "", "bridge.providerQuoteId", 160),
    bridgeProviderQuoteHash: boundedString(bridge.providerQuoteHash || bridge.provider_quote_hash || "", "bridge.providerQuoteHash", 128).toLowerCase(),
    bridgeProviderRouteHash: boundedString(bridge.providerRouteHash || bridge.provider_route_hash || "", "bridge.providerRouteHash", 128).toLowerCase(),
    bridgeProviderPayloadHash: boundedString(bridge.providerPayloadHash || bridge.provider_payload_hash || "", "bridge.providerPayloadHash", 128).toLowerCase(),
    bridgeProviderEvidence: bridge.providerEvidence && typeof bridge.providerEvidence === "object" && !Array.isArray(bridge.providerEvidence) ? normalizeMetadataValue(bridge.providerEvidence) : bridge.provider_evidence && typeof bridge.provider_evidence === "object" && !Array.isArray(bridge.provider_evidence) ? normalizeMetadataValue(bridge.provider_evidence) : null,
    bridgeProviderAttestation: boundedString(bridge.providerAttestation || bridge.provider_attestation || "", "bridge.providerAttestation", 128).toLowerCase(),
    bridgeSourceTransactionTo: boundedString(bridge.sourceTransaction?.to || bridge.source_transaction?.to || "", "bridge.sourceTransaction.to", 256).toLowerCase(),
    bridgeSourceTransactionData: boundedString(bridge.sourceTransaction?.data || bridge.source_transaction?.data || "", "bridge.sourceTransaction.data", 262144).toLowerCase(),
    bridgeSourceTransactionDataHash: boundedString(bridge.sourceTransaction?.dataHash || bridge.source_transaction?.data_hash || "", "bridge.sourceTransaction.dataHash", 128).toLowerCase(),
    bridgeSourceTransactionValue: boundedString(bridge.sourceTransaction?.value || bridge.source_transaction?.value || "", "bridge.sourceTransaction.value", 100),
    bridgeSourceTransactionGas: boundedString(bridge.sourceTransaction?.gas || bridge.source_transaction?.gas || "", "bridge.sourceTransaction.gas", 100),
    bridgeApprovalTransactions: Array.isArray(bridge.approvalTransactions || bridge.approval_transactions) ? normalizeMetadataValue((bridge.approvalTransactions || bridge.approval_transactions).slice(0, 8)) : [],
    complianceOriginatorJurisdiction: cleanString(compliance.originatorJurisdiction || compliance.originator_jurisdiction || "", ""),
    complianceBeneficiaryJurisdiction: cleanString(compliance.beneficiaryJurisdiction || compliance.beneficiary_jurisdiction || "", ""),
    complianceCounterpartyType: cleanString(compliance.counterpartyType || compliance.counterparty_type || "", ""),
    complianceOriginatorAttestationStatus: cleanString(compliance.originatorAttestation?.status || compliance.originator_attestation?.status || compliance.originatorAttestationStatus || compliance.originator_attestation_status || "", ""),
    complianceOriginatorAttestationProvider: cleanString(compliance.originatorAttestation?.provider || compliance.originator_attestation?.provider || compliance.originatorAttestationProvider || compliance.originator_attestation_provider || "", ""),
    complianceOriginatorAttestationReference: cleanString(compliance.originatorAttestation?.reference || compliance.originator_attestation?.reference || compliance.originatorAttestationReference || compliance.originator_attestation_reference || "", ""),
    complianceOriginatorAttestationIssuedAt: cleanString(compliance.originatorAttestation?.issuedAt || compliance.originator_attestation?.issued_at || compliance.originatorAttestationIssuedAt || compliance.originator_attestation_issued_at || "", ""),
    complianceOriginatorAttestationExpiresAt: cleanString(compliance.originatorAttestation?.expiresAt || compliance.originator_attestation?.expires_at || compliance.originatorAttestationExpiresAt || compliance.originator_attestation_expires_at || "", ""),
    complianceBeneficiaryAttestationStatus: cleanString(compliance.beneficiaryAttestation?.status || compliance.beneficiary_attestation?.status || compliance.beneficiaryAttestationStatus || compliance.beneficiary_attestation_status || "", ""),
    complianceBeneficiaryAttestationProvider: cleanString(compliance.beneficiaryAttestation?.provider || compliance.beneficiary_attestation?.provider || compliance.beneficiaryAttestationProvider || compliance.beneficiary_attestation_provider || "", ""),
    complianceBeneficiaryAttestationReference: cleanString(compliance.beneficiaryAttestation?.reference || compliance.beneficiary_attestation?.reference || compliance.beneficiaryAttestationReference || compliance.beneficiary_attestation_reference || "", ""),
    complianceBeneficiaryAttestationIssuedAt: cleanString(compliance.beneficiaryAttestation?.issuedAt || compliance.beneficiary_attestation?.issued_at || compliance.beneficiaryAttestationIssuedAt || compliance.beneficiary_attestation_issued_at || "", ""),
    complianceBeneficiaryAttestationExpiresAt: cleanString(compliance.beneficiaryAttestation?.expiresAt || compliance.beneficiary_attestation?.expires_at || compliance.beneficiaryAttestationExpiresAt || compliance.beneficiary_attestation_expires_at || "", ""),
    complianceTravelRuleStatus: cleanString(compliance.travelRule?.status || compliance.travel_rule?.status || compliance.travelRuleStatus || compliance.travel_rule_status || "", ""),
    complianceTravelRuleReference: cleanString(compliance.travelRule?.reference || compliance.travel_rule?.reference || compliance.travelRuleReference || compliance.travel_rule_reference || "", ""),
    complianceTravelRuleDataHash: cleanString(compliance.travelRule?.dataHash || compliance.travel_rule?.data_hash || compliance.travelRuleDataHash || compliance.travel_rule_data_hash || "", ""),
    complianceScreeningStatus: cleanString(compliance.screening?.status || compliance.screeningStatus || compliance.screening_status || "", ""),
    complianceScreeningProvider: cleanString(compliance.screening?.provider || compliance.screeningProvider || compliance.screening_provider || "", ""),
    complianceScreeningReference: cleanString(compliance.screening?.reference || compliance.screeningReference || compliance.screening_reference || "", ""),
    complianceScreenedAt: cleanString(compliance.screening?.screenedAt || compliance.screening?.screened_at || compliance.screenedAt || compliance.screened_at || "", ""),
    complianceRiskRating: cleanString(compliance.riskRating || compliance.risk_rating || "", ""),
    complianceOriginatorVaspId: cleanString(compliance.originatorVaspId || compliance.originator_vasp_id || "", ""),
    complianceBeneficiaryVaspId: cleanString(compliance.beneficiaryVaspId || compliance.beneficiary_vasp_id || "", ""),
    x402Version: cleanString(x402.version ?? x402.x402Version ?? x402.x402_version ?? "", ""),
    x402Scheme: cleanString(x402.scheme || x402.mode || "", ""),
    x402Mode: cleanString(x402.mode || x402.scheme || "exact", "exact").toLowerCase(),
    x402MaximumAuthorizedAtomic: cleanString(x402.maximumAuthorizedAtomic || x402.maximum_authorized_atomic || x402.maxAmountAtomic || x402.max_amount_atomic || x402.amountAtomic || x402.amount_atomic || "", ""),
    x402UsageUnit: cleanString(x402.usageUnit || x402.usage_unit || "", ""),
    x402UnitPriceAtomic: cleanString(x402.unitPriceAtomic || x402.unit_price_atomic || "", ""),
    x402SessionId: cleanString(x402.sessionId || x402.session_id || "", ""),
    x402ProviderId: cleanString(x402.providerId || x402.provider_id || x402.merchantDomain || x402.merchant_domain || "", ""),
    x402ResourceUrl: cleanString(x402.resourceUrl || x402.resource_url || x402.resource?.url || x402.resource || action.resourceUrl || action.resource_url || "", ""),
    x402HttpMethod: cleanString(x402.method || x402.httpMethod || x402.http_method || action.httpMethod || action.http_method || "GET", "GET"),
    x402MerchantDomain: cleanString(x402.merchantDomain || x402.merchant_domain || x402.merchant || "", ""),
    x402PayTo: cleanString(x402.payTo || x402.pay_to || x402.recipient || x402.paymentRequirements?.payTo || x402.payment_requirements?.pay_to || "", ""),
    x402Asset: cleanString(x402.asset || x402.token || x402.paymentRequirements?.asset || x402.payment_requirements?.asset || action.asset || body.asset || "", ""),
    x402Network: cleanString(x402.network || x402.networkId || x402.network_id || x402.paymentRequirements?.network || x402.payment_requirements?.network || "", ""),
    x402Facilitator: cleanString(x402.facilitator || x402.facilitatorUrl || x402.facilitator_url || "", ""),
    x402AmountAtomic: cleanString(x402.amountAtomic || x402.amount_atomic || x402.amountInAtomicUnits || x402.amount_in_atomic_units || x402.paymentRequirements?.amount || x402.payment_requirements?.amount || "", ""),
    x402ValidUntil: cleanString(x402.validUntil || x402.valid_until || x402.expiresAt || x402.expires_at || "", ""),
    x402MaxTimeoutSeconds: optionalNumber(x402.maxTimeoutSeconds ?? x402.max_timeout_seconds ?? x402.paymentRequirements?.maxTimeoutSeconds ?? x402.payment_requirements?.max_timeout_seconds, "x402MaxTimeoutSeconds", { integer: true, min: 1 }),
    x402RequirementsReceivedAt: cleanString(x402.requirementsReceivedAt || x402.requirements_received_at || x402.paymentRequiredReceivedAt || x402.payment_required_received_at || "", ""),
    x402RequestId: cleanString(x402.requestId || x402.request_id || x402.nonce || x402.paymentId || x402.payment_id || "", ""),
    x402RequestBodyHash: cleanString(x402.requestBodyHash || x402.request_body_hash || "", ""),
    x402PaymentRequiredHash: cleanString(x402.paymentRequiredHash || x402.payment_required_hash || "", ""),
    x402RequestFingerprint: cleanString(x402.requestFingerprint || x402.request_fingerprint || "", ""),
    x402SettlementStatus: cleanString(x402.settlementStatus || x402.settlement_status || x402.settlement?.status || "not_submitted", "not_submitted"),
    x402SettlementAttempt: optionalNumber(x402.settlementAttempt ?? x402.settlement_attempt ?? x402.settlement?.attempt, "x402SettlementAttempt", { integer: true, min: 0 }),
    x402SettlementTxHash: cleanString(x402.settlementTxHash || x402.settlement_tx_hash || x402.settlement?.transactionHash || x402.settlement?.transaction_hash || "", ""),
    tokenPermissionMetadataSupplied: Object.keys(tokenPermission).length > 0,
    tokenPermissionType: cleanString(tokenPermission.permissionType || tokenPermission.permission_type || tokenPermission.type || "", ""),
    tokenPermissionOwner: cleanString(tokenPermission.owner || tokenPermission.ownerAddress || tokenPermission.owner_address || body.executionWalletAddress || body.execution_wallet_address || body.walletAddress || body.wallet_address || "", ""),
    tokenPermissionTokenContract: cleanString(tokenPermission.tokenContract || tokenPermission.token_contract || tokenPermission.contract || action.tokenContract || action.token_contract || target || "", ""),
    tokenPermissionTokenStandard: cleanString(tokenPermission.tokenStandard || tokenPermission.token_standard || "", ""),
    tokenPermissionSpender: cleanString(tokenPermission.spender || tokenPermission.operator || tokenPermission.delegate || "", ""),
    tokenPermissionApprovalAmount: optionalNumber(tokenPermission.approvalAmount ?? tokenPermission.approval_amount ?? tokenPermission.amount, "tokenPermissionApprovalAmount", { min: 0 }),
    tokenPermissionIntendedTransactionAmount: optionalNumber(tokenPermission.intendedTransactionAmount ?? tokenPermission.intended_transaction_amount ?? action.amount ?? body.amount, "tokenPermissionIntendedTransactionAmount", { min: 0 }),
    tokenPermissionUnlimited: Boolean(tokenPermission.unlimited === true || String(tokenPermission.unlimited || "").toLowerCase() === "true"),
    tokenPermissionNonce: cleanString(tokenPermission.nonce || "", ""),
    tokenPermissionPermitId: cleanString(tokenPermission.permitId || tokenPermission.permit_id || tokenPermission.authorizationId || tokenPermission.authorization_id || "", ""),
    tokenPermissionDeadline: cleanString(tokenPermission.deadline || tokenPermission.expiresAt || tokenPermission.expires_at || "", ""),
    tokenPermissionReusable: Boolean(tokenPermission.reusable === true || String(tokenPermission.reusable || "").toLowerCase() === "true"),
    tokenPermissionChainId: cleanString(tokenPermission.chainId || tokenPermission.chain_id || "", ""),
    tokenPermissionNetwork: cleanString(tokenPermission.network || tokenPermission.chainName || tokenPermission.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name || "", ""),
    tokenPermissionApprovedProtocol: cleanString(tokenPermission.approvedProtocol || tokenPermission.approved_protocol || tokenPermission.protocol || "", ""),
    tokenPermissionOperatorForAll: Boolean(tokenPermission.operatorForAll === true || tokenPermission.operator_for_all === true || String(tokenPermission.operatorForAll || tokenPermission.operator_for_all || "").toLowerCase() === "true"),
    tokenPermissionBatchItems: Array.isArray(tokenPermission.batchItems || tokenPermission.batch_items) ? (tokenPermission.batchItems || tokenPermission.batch_items).slice(0, 100) : [],
    tokenPermissionAllowanceResetExpected: Boolean(tokenPermission.allowanceResetExpected === true || tokenPermission.allowance_reset_expected === true || String(tokenPermission.allowanceResetExpected || tokenPermission.allowance_reset_expected || "").toLowerCase() === "true"),
    privilegedActionMetadataSupplied: Object.keys(privilegedAction).length > 0,
    privilegedActionClassifiedAction: cleanString(privilegedAction.classifiedAction || privilegedAction.classified_action || privilegedAction.action || privilegedAction.type || "", ""),
    privilegedActionContract: cleanString(privilegedAction.contract || privilegedAction.contractHash || privilegedAction.contract_hash || contract.identifier || contract.hash || target || "", ""),
    privilegedActionPackage: cleanString(privilegedAction.package || privilegedAction.packageHash || privilegedAction.package_hash || action.contractPackageHash || action.contract_package_hash || "", ""),
    privilegedActionEntryPoint: cleanString(privilegedAction.entryPoint || privilegedAction.entry_point || contract.entryPoint || contract.entry_point || action.entryPoint || action.entry_point || "", ""),
    privilegedActionMethodSignature: cleanString(privilegedAction.methodSignature || privilegedAction.method_signature || privilegedAction.method || "", ""),
    privilegedActionCurrentValue: normalizeMetadataValue(privilegedAction.currentValue ?? privilegedAction.current_value),
    privilegedActionRequestedValue: normalizeMetadataValue(privilegedAction.requestedValue ?? privilegedAction.requested_value ?? privilegedAction.newValue ?? privilegedAction.new_value),
    privilegedActionRole: cleanString(privilegedAction.role || privilegedAction.permission || "", ""),
    privilegedActionRecipient: cleanString(privilegedAction.recipient || privilegedAction.administrator || privilegedAction.admin || privilegedAction.beneficiary || "", ""),
    privilegedActionImplementation: cleanString(privilegedAction.implementation || privilegedAction.newImplementation || privilegedAction.new_implementation || "", ""),
    privilegedActionClassifierSource: cleanString(privilegedAction.classifierSource || privilegedAction.classifier_source || "", ""),
    privilegedActionClassifierVersion: cleanString(privilegedAction.classifierVersion || privilegedAction.classifier_version || "", ""),
    privilegedActionNetwork: cleanString(privilegedAction.network || privilegedAction.chainName || privilegedAction.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name || "", ""),
    contractUpgradeMetadataSupplied: Object.keys(contractUpgrade).length > 0,
    contractUpgradeContract: cleanString(contractUpgrade.contract || contractUpgrade.contractHash || contractUpgrade.contract_hash || privilegedAction.contract || target || "", ""),
    contractUpgradePackage: cleanString(contractUpgrade.package || contractUpgrade.packageHash || contractUpgrade.package_hash || privilegedAction.package || action.contractPackageHash || "", ""),
    contractUpgradeCurrentImplementation: cleanString(contractUpgrade.currentImplementation || contractUpgrade.current_implementation || contractUpgrade.oldImplementation || contractUpgrade.old_implementation || privilegedAction.currentValue || "", ""),
    contractUpgradeRequestedImplementation: cleanString(contractUpgrade.requestedImplementation || contractUpgrade.requested_implementation || contractUpgrade.newImplementation || contractUpgrade.new_implementation || privilegedAction.implementation || privilegedAction.requestedValue || "", ""),
    contractUpgradeCurrentCodeHash: cleanString(contractUpgrade.currentCodeHash || contractUpgrade.current_code_hash || "", ""),
    contractUpgradeRequestedCodeHash: cleanString(contractUpgrade.requestedCodeHash || contractUpgrade.requested_code_hash || contractUpgrade.codeHash || contractUpgrade.code_hash || "", ""),
    contractUpgradePackageVersion: cleanString(contractUpgrade.packageVersion || contractUpgrade.package_version || contractUpgrade.version || "", ""),
    contractUpgradeAdministrator: cleanString(contractUpgrade.upgradeAdministrator || contractUpgrade.upgrade_administrator || contractUpgrade.administrator || privilegedAction.recipient || "", ""),
    contractUpgradeRequestedAt: cleanString(contractUpgrade.requestedAt || contractUpgrade.requested_at || "", ""),
    contractUpgradeExecuteAfter: cleanString(contractUpgrade.executeAfter || contractUpgrade.execute_after || "", ""),
    contractUpgradeNetwork: cleanString(contractUpgrade.network || contractUpgrade.chainName || contractUpgrade.chain_name || action.chainName || body.chainName || "", ""),
    instructionIntegrityMetadataSupplied: Object.keys(instructionIntegrity).length > 0,
    instructionGoalId: cleanString(instructionIntegrity.goalId || instructionIntegrity.goal_id || body.goalId || body.goal_id || "", ""),
    instructionOriginalUserGoalHash: cleanString(instructionIntegrity.originalUserGoalHash || instructionIntegrity.original_user_goal_hash || instructionIntegrity.goalHash || instructionIntegrity.goal_hash || "", ""),
    instructionInitiatedBy: cleanString(instructionIntegrity.initiatedBy || instructionIntegrity.initiated_by || "", ""),
    instructionIntentSource: cleanString(instructionIntegrity.intentSource || instructionIntegrity.intent_source || instructionIntegrity.source || "", ""),
    instructionToolName: cleanString(instructionIntegrity.toolName || instructionIntegrity.tool_name || "", ""),
    instructionToolServer: cleanString(instructionIntegrity.toolServer || instructionIntegrity.tool_server || instructionIntegrity.mcpServer || instructionIntegrity.mcp_server || "", ""),
    instructionSourceDomains: Array.isArray(instructionIntegrity.sourceDomains || instructionIntegrity.source_domains) ? (instructionIntegrity.sourceDomains || instructionIntegrity.source_domains).slice(0, 50).map((item) => cleanString(item)).filter(Boolean) : [],
    instructionExternalContentUsed: Boolean(instructionIntegrity.externalContentUsed === true || instructionIntegrity.external_content_used === true || String(instructionIntegrity.externalContentUsed || instructionIntegrity.external_content_used || "").toLowerCase() === "true"),
    instructionUserConfirmed: Boolean(instructionIntegrity.userConfirmed === true || instructionIntegrity.user_confirmed === true || String(instructionIntegrity.userConfirmed || instructionIntegrity.user_confirmed || "").toLowerCase() === "true"),
    instructionSourceTrustLevel: cleanString(instructionIntegrity.sourceTrustLevel || instructionIntegrity.source_trust_level || "", ""),
    instructionParameterChangeReason: cleanString(instructionIntegrity.parameterChangeReason || instructionIntegrity.parameter_change_reason || "", ""),
    instructionOriginalParameterHash: cleanString(instructionIntegrity.originalParameterHash || instructionIntegrity.original_parameter_hash || "", ""),
    instructionCurrentParameterHash: cleanString(instructionIntegrity.currentParameterHash || instructionIntegrity.current_parameter_hash || "", ""),
    instructionOriginalProtectedParameters: instructionIntegrity.originalProtectedParameters && typeof instructionIntegrity.originalProtectedParameters === "object" && !Array.isArray(instructionIntegrity.originalProtectedParameters)
      ? normalizeMetadataValue(instructionIntegrity.originalProtectedParameters)
      : instructionIntegrity.original_protected_parameters && typeof instructionIntegrity.original_protected_parameters === "object" && !Array.isArray(instructionIntegrity.original_protected_parameters)
        ? normalizeMetadataValue(instructionIntegrity.original_protected_parameters)
        : null,
    instructionOriginalPermissionScopes: Array.isArray(instructionIntegrity.originalPermissionScopes || instructionIntegrity.original_permission_scopes) ? (instructionIntegrity.originalPermissionScopes || instructionIntegrity.original_permission_scopes).slice(0, 50).map((item) => cleanString(item)).filter(Boolean) : [],
    instructionCurrentPermissionScopes: Array.isArray(instructionIntegrity.currentPermissionScopes || instructionIntegrity.current_permission_scopes || instructionIntegrity.permissionScopes || instructionIntegrity.permission_scopes) ? (instructionIntegrity.currentPermissionScopes || instructionIntegrity.current_permission_scopes || instructionIntegrity.permissionScopes || instructionIntegrity.permission_scopes).slice(0, 50).map((item) => cleanString(item)).filter(Boolean) : [],
    toolIntegrityMetadataSupplied: Object.keys(toolIntegrity).length > 0,
    toolMcpServerId: cleanString(toolIntegrity.mcpServerId || toolIntegrity.mcp_server_id || toolIntegrity.serverId || toolIntegrity.server_id || "", ""),
    toolMcpServerUrl: cleanString(toolIntegrity.mcpServerUrl || toolIntegrity.mcp_server_url || toolIntegrity.serverUrl || toolIntegrity.server_url || "", ""),
    toolIntegrityToolName: cleanString(toolIntegrity.toolName || toolIntegrity.tool_name || toolIntegrity.name || instructionIntegrity.toolName || instructionIntegrity.tool_name || "", ""),
    toolIntegrityToolVersion: cleanString(toolIntegrity.toolVersion || toolIntegrity.tool_version || toolIntegrity.version || "", ""),
    toolIntegrityManifestHash: cleanString(toolIntegrity.manifestHash || toolIntegrity.manifest_hash || "", ""),
    toolIntegritySchemaHash: cleanString(toolIntegrity.schemaHash || toolIntegrity.schema_hash || "", ""),
    toolIntegrityDescriptionHash: cleanString(toolIntegrity.descriptionHash || toolIntegrity.description_hash || "", ""),
    toolIntegrityPermissionScopes: Array.isArray(toolIntegrity.permissionScopes || toolIntegrity.permission_scopes) ? (toolIntegrity.permissionScopes || toolIntegrity.permission_scopes).slice(0, 100).map((item) => cleanString(item)).filter(Boolean) : [],
    toolIntegrityCredentialScope: cleanString(toolIntegrity.credentialScope || toolIntegrity.credential_scope || "", ""),
    toolIntegrityTls: Boolean(toolIntegrity.tls === true || String(toolIntegrity.tls || "").toLowerCase() === "true"),
    toolIntegrityOrigin: cleanString(toolIntegrity.toolOrigin || toolIntegrity.tool_origin || toolIntegrity.origin || "", ""),
    toolIntegrityApprovedAt: cleanString(toolIntegrity.approvedAt || toolIntegrity.approved_at || "", ""),
    delegationMetadataSupplied: Object.keys(delegation).length > 0,
    delegationId: cleanString(delegation.delegationId || delegation.delegation_id || delegation.id || "", ""),
    delegationDelegatingWallet: cleanString(delegation.delegatingWallet || delegation.delegating_wallet || delegation.owner || "", ""),
    delegationDelegate: cleanString(delegation.delegate || delegation.delegateWallet || delegation.delegate_wallet || "", ""),
    delegationSessionKey: cleanString(delegation.sessionKey || delegation.session_key || "", ""),
    delegationAllowedNetworks: Array.isArray(delegation.allowedNetworks || delegation.allowed_networks) ? (delegation.allowedNetworks || delegation.allowed_networks).slice(0, 50).map((item) => cleanString(item)).filter(Boolean) : [],
    delegationAllowedContracts: Array.isArray(delegation.allowedContracts || delegation.allowed_contracts) ? (delegation.allowedContracts || delegation.allowed_contracts).slice(0, 100).map((item) => cleanString(item)).filter(Boolean) : [],
    delegationAllowedMethods: Array.isArray(delegation.allowedMethods || delegation.allowed_methods) ? (delegation.allowedMethods || delegation.allowed_methods).slice(0, 100).map((item) => cleanString(item)).filter(Boolean) : [],
    delegationAllowedAssets: Array.isArray(delegation.allowedAssets || delegation.allowed_assets) ? (delegation.allowedAssets || delegation.allowed_assets).slice(0, 100).map((item) => cleanString(item)).filter(Boolean) : [],
    delegationNativeAmountLimit: optionalNumber(delegation.nativeAmountLimit ?? delegation.native_amount_limit, "delegation.nativeAmountLimit", { min: 0 }),
    delegationTokenAmountLimits: delegation.tokenAmountLimits && typeof delegation.tokenAmountLimits === "object" && !Array.isArray(delegation.tokenAmountLimits) ? normalizeMetadataValue(delegation.tokenAmountLimits) : delegation.token_amount_limits && typeof delegation.token_amount_limits === "object" && !Array.isArray(delegation.token_amount_limits) ? normalizeMetadataValue(delegation.token_amount_limits) : {},
    delegationMaxTransactionAmount: optionalNumber(delegation.maxTransactionAmount ?? delegation.max_transaction_amount, "delegation.maxTransactionAmount", { min: 0 }),
    delegationMaxFrequency: optionalNumber(delegation.maxFrequency ?? delegation.max_frequency, "delegation.maxFrequency", { integer: true, min: 1 }),
    delegationValidFrom: cleanString(delegation.validFrom || delegation.valid_from || "", ""),
    delegationExpiresAt: cleanString(delegation.expiresAt || delegation.expires_at || "", ""),
    delegationRevocationStatus: cleanString(delegation.revocationStatus || delegation.revocation_status || "Active", "Active"),
    delegationDepth: optionalNumber(delegation.delegationDepth ?? delegation.delegation_depth ?? 0, "delegation.delegationDepth", { integer: true, min: 0 }),
    delegationRedelegationAllowed: Boolean(delegation.redelegationAllowed === true || delegation.redelegation_allowed === true || String(delegation.redelegationAllowed || delegation.redelegation_allowed || "").toLowerCase() === "true"),
    delegationNonce: cleanString(delegation.nonce || "", ""),
    delegationAttestationHash: cleanString(delegation.attestationHash || delegation.attestation_hash || "", ""),
    delegationAttestationSignature: cleanString(delegation.attestationSignature || delegation.attestation_signature || delegation.signature || "", ""),
    delegationChainName: cleanString(delegation.chainName || delegation.chain_name || delegation.network || action.chainName || action.chain_name || body.chainName || body.chain_name || "", ""),
    rpcIntegrityMetadataSupplied: Object.keys(rpcIntegrity).length > 0,
    rpcExpectedChainName: cleanString(rpcIntegrity.expectedChainName || rpcIntegrity.expected_chain_name || rpcIntegrity.chainName || rpcIntegrity.chain_name || action.chainName || action.chain_name || body.chainName || body.chain_name || "", ""),
    rpcExpectedNetworkIdentifier: cleanString(rpcIntegrity.expectedNetworkIdentifier || rpcIntegrity.expected_network_identifier || rpcIntegrity.networkIdentifier || rpcIntegrity.network_identifier || rpcIntegrity.networkId || rpcIntegrity.network_id || "", ""),
    rpcExpectedGenesisHash: cleanString(rpcIntegrity.expectedGenesisHash || rpcIntegrity.expected_genesis_hash || rpcIntegrity.genesisHash || rpcIntegrity.genesis_hash || rpcIntegrity.chainFingerprint || rpcIntegrity.chain_fingerprint || "", ""),
    rpcSelectedEndpoint: cleanString(rpcIntegrity.selectedEndpoint || rpcIntegrity.selected_endpoint || rpcIntegrity.rpcEndpoint || rpcIntegrity.rpc_endpoint || "", ""),
    rpcSelectedProviderId: cleanString(rpcIntegrity.selectedProviderId || rpcIntegrity.selected_provider_id || rpcIntegrity.providerId || rpcIntegrity.provider_id || "", ""),
    rpcProviderObservations: Array.isArray(rpcIntegrity.providerObservations || rpcIntegrity.provider_observations || rpcIntegrity.observations) ? normalizeMetadataValue((rpcIntegrity.providerObservations || rpcIntegrity.provider_observations || rpcIntegrity.observations).slice(0, 10)) : [],
    rpcAutomaticFailoverUsed: Boolean(rpcIntegrity.automaticFailoverUsed === true || rpcIntegrity.automatic_failover_used === true || String(rpcIntegrity.automaticFailoverUsed || rpcIntegrity.automatic_failover_used || "").toLowerCase() === "true"),
    rpcFailoverFrom: cleanString(rpcIntegrity.failoverFrom || rpcIntegrity.failover_from || "", ""),
    rpcFailoverReason: cleanString(rpcIntegrity.failoverReason || rpcIntegrity.failover_reason || "", ""),
    feeSafetyMetadataSupplied: Object.keys(feeSafety).length > 0,
    feeChainFamily: cleanString(feeSafety.chainFamily || feeSafety.chain_family || feeSafety.family || "", ""),
    feeChainName: cleanString(feeSafety.chainName || feeSafety.chain_name || feeSafety.network || action.chainName || action.chain_name || body.chainName || body.chain_name || "", ""),
    feeEstimatedGas: optionalNumber(feeSafety.estimatedGas ?? feeSafety.estimated_gas, "feeSafety.estimatedGas", { min: 0 }),
    feeGasLimit: optionalNumber(feeSafety.gasLimit ?? feeSafety.gas_limit, "feeSafety.gasLimit", { min: 0 }),
    feeGasPrice: optionalNumber(feeSafety.gasPrice ?? feeSafety.gas_price, "feeSafety.gasPrice", { min: 0 }),
    feePriorityFee: optionalNumber(feeSafety.priorityFee ?? feeSafety.priority_fee ?? feeSafety.maxPriorityFee ?? feeSafety.max_priority_fee, "feeSafety.priorityFee", { min: 0 }),
    feeMaximumFee: optionalNumber(feeSafety.maximumFee ?? feeSafety.maximum_fee ?? feeSafety.maxFee ?? feeSafety.max_fee, "feeSafety.maximumFee", { min: 0 }),
    feeNetworkFee: optionalNumber(feeSafety.networkFee ?? feeSafety.network_fee ?? feeSafety.feeAmount ?? feeSafety.fee_amount, "feeSafety.networkFee", { min: 0 }),
    feeUnit: cleanString(feeSafety.unit || feeSafety.feeUnit || feeSafety.fee_unit || "", ""),
    feeSponsor: cleanString(feeSafety.sponsor || feeSafety.sponsorId || feeSafety.sponsor_id || "", ""),
    feePaymaster: cleanString(feeSafety.paymaster || feeSafety.paymasterAddress || feeSafety.paymaster_address || "", ""),
    feeSponsorshipId: cleanString(feeSafety.sponsorshipId || feeSafety.sponsorship_id || "", ""),
    feeSponsorshipExpiry: cleanString(feeSafety.sponsorshipExpiry || feeSafety.sponsorship_expiry || feeSafety.expiresAt || feeSafety.expires_at || "", ""),
    feeSponsorshipScopes: Array.isArray(feeSafety.sponsorshipScopes || feeSafety.sponsorship_scopes || feeSafety.scope) ? (feeSafety.sponsorshipScopes || feeSafety.sponsorship_scopes || feeSafety.scope).slice(0, 100).map((item) => cleanString(item)).filter(Boolean) : cleanString(feeSafety.scope || "") ? [cleanString(feeSafety.scope)] : [],
    feeSponsorSignatureHash: cleanString(feeSafety.sponsorSignatureHash || feeSafety.sponsor_signature_hash || feeSafety.evidenceHash || feeSafety.evidence_hash || "", ""),
    feeExpectedPayer: cleanString(feeSafety.expectedPayer || feeSafety.expected_payer || "", ""),
    feeActualPayer: cleanString(feeSafety.actualPayer || feeSafety.actual_payer || feeSafety.payer || "", ""),
    feeSponsored: Boolean(feeSafety.sponsored === true || String(feeSafety.sponsored || "").toLowerCase() === "true"),
    feeSponsorshipAvailable: !(feeSafety.sponsorshipAvailable === false || feeSafety.sponsorship_available === false || String(feeSafety.sponsorshipAvailable ?? feeSafety.sponsorship_available ?? "true").toLowerCase() === "false"),
    lifecycleIntentId: cleanString(lifecycle.intentId || lifecycle.intent_id || body.intentId || body.intent_id || "", ""),
    lifecycleIdempotencyKey: cleanString(lifecycle.idempotencyKey || lifecycle.idempotency_key || body.idempotencyKey || body.idempotency_key || "", ""),
    lifecycleSequence: optionalNumber(lifecycle.sequence ?? body.sequence, "lifecycleSequence", { integer: true, min: 0 }),
    lifecycleCreatedAt: cleanString(lifecycle.createdAt || lifecycle.created_at || body.createdAt || body.created_at || "", ""),
    lifecycleExpiresAt: cleanString(lifecycle.expiresAt || lifecycle.expires_at || body.expiresAt || body.expires_at || "", ""),
    lifecycleRetryOf: cleanString(lifecycle.retryOf || lifecycle.retry_of || "", ""),
    lifecycleReplacementOf: cleanString(lifecycle.replacementOf || lifecycle.replacement_of || "", ""),
    lifecycleAttempt: optionalNumber(lifecycle.attempt, "lifecycleAttempt", { integer: true, min: 0 }),
    lifecycleIntentFingerprint: cleanString(lifecycle.intentFingerprint || lifecycle.intent_fingerprint || lifecycle.fingerprint || "", ""),
    goal: cleanString(body.goal || body.prompt || ""),
    reason: cleanString(body.reason || action.reason || ""),
    receivedAt: new Date().toISOString(),
  };
}

export function gatewayNextAction(decision, decisionExplanation = null) {
  if (decisionExplanation?.agentInstruction) return decisionExplanation.agentInstruction;
  if (decision === "Allowed") {
    return "Allowed by Magen3. The external agent may continue only with the exact evaluated parameters, then report the real execution result.";
  }
  if (decision === "Blocked") {
    return "Blocked by Magen3. Stop execution, show the returned reason to the user, and do not ask the wallet to sign this action.";
  }
  if (decisionExplanation?.humanActionRequired === true) {
    return "Review Required. Stop execution, show the exact reason, and wait for the bound approval workflow before signing.";
  }
  return "Review Required. Stop this attempt, show the exact reason, correct or supply the requested evidence, and resubmit. Human approval is not required unless the policy explicitly escalates it.";
}

export function gatewayStatusFromDecision(decision, decisionExplanation = null) {
  if (decision === "Allowed") return "allowed_pending_execution";
  if (decision === "Blocked") return "blocked_before_execution";
  return decisionExplanation?.humanActionRequired === true ? "waiting_for_human_review" : "waiting_for_agent_remediation";
}
