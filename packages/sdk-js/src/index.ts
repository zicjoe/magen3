export type Magen3Decision = "Allowed" | "Blocked" | "Review Required";
export type Magen3Risk = "Low" | "Medium" | "High" | "Critical";
export type Magen3ReviewResolutionStrategy = "Autonomous" | "Balanced" | "Human Governed" | string;

export interface Magen3Lifecycle {
  /** Unique 8-128 character identifier for one business intent. */
  intentId?: string;
  /** Stable retry key that must never be reused after protected parameters change. */
  idempotencyKey?: string;
  /** Optional monotonically increasing sequence for this agent. */
  sequence?: number;
  /** ISO-8601 creation time. */
  createdAt?: string;
  /** ISO-8601 authorization expiry. */
  expiresAt?: string;
  /** Prior Magen3 audit ID when this request is an explicit retry. */
  retryOf?: string;
  /** Prior Magen3 audit ID when this request deliberately replaces a pending transaction. */
  replacementOf?: string;
  /** Zero for the first attempt; increment only with retryOf or replacementOf. */
  attempt?: number;
  /** Optional SHA-256 canonical fingerprint computed by the adapter. Magen3 always computes its own. */
  intentFingerprint?: string;
}

export interface Magen3ExecutionPreflight {
  /** Positive integer string in motes for the proposed payment budget. */
  paymentAmountMotes?: string;
  /** Positive integer gas-price tolerance used during Casper 2.x transaction construction. */
  gasPriceTolerance?: number;
  /** Positive duration such as 30m, 1h, or milliseconds. */
  ttl?: string;
  /** ISO-8601 transaction timestamp. */
  timestamp?: string;
  /** Optional swap slippage in basis points. Structure is validated; policy maximum remains Preview. */
  slippageBps?: number;
  /** Optional quoted output for swap consistency checks. */
  expectedOutput?: number;
  /** Optional minimum received amount; must not exceed expectedOutput. */
  minimumReceived?: number;
  /** Runtime-argument summary. Never include signing material or private data. */
  runtimeArgs?: Record<string, unknown>;
  /** Optional 64-character transaction hash after construction. */
  transactionHash?: string;
}


export interface Magen3BridgeRoute {
  sourceChain: string;
  destinationChain: string;
  provider: string;
  routeId?: string;
  destinationAddress: string;
  asset?: string;
  feeAmount?: number;
  feeBps?: number;
  expectedOutput?: number;
  minimumReceived?: number;
  quoteTimestamp?: string;
  quoteExpiresAt?: string;
  sourceConfirmations?: number;
  destinationConfirmations?: number;
}

export interface Magen3OracleQuote {
  /** Asset sold or priced by the proposed action. */
  baseAsset: string;
  /** Asset used as the quote denomination. */
  quoteAsset: string;
  /** Proposed execution price expressed as quoteAsset per baseAsset. */
  executionPrice: number;
  /** ISO-8601 timestamp for the proposed execution quote. */
  quoteTimestamp?: string;
}


export interface Magen3ComplianceAttestation {
  status: "Verified" | "Pending" | "Rejected" | "Expired" | "Not Provided" | string;
  /** Approved provider label. Never place names, documents, or personal identity data here. */
  provider?: string;
  /** Opaque verification reference. */
  reference?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface Magen3ComplianceEvidence {
  originatorJurisdiction?: string;
  beneficiaryJurisdiction?: string;
  counterpartyType?: "VASP" | "Self-hosted Wallet" | "Organization" | "Individual" | "Unknown" | string;
  originatorAttestation?: Magen3ComplianceAttestation;
  beneficiaryAttestation?: Magen3ComplianceAttestation;
  travelRule?: {
    status: "Complete" | "Incomplete" | "Not Required" | "Not Provided" | string;
    /** Opaque evidence reference; never raw originator or beneficiary data. */
    reference?: string;
    /** Optional SHA-256-style hash of evidence held by an authorized provider. */
    dataHash?: string;
  };
  screening?: {
    status: "Clear" | "Match" | "Review" | "Unavailable" | "Not Provided" | string;
    provider?: string;
    reference?: string;
    screenedAt?: string;
  };
  riskRating?: "Low" | "Medium" | "High" | "Critical" | "Unknown" | string;
  originatorVaspId?: string;
  beneficiaryVaspId?: string;
}

export interface Magen3X402Payment {
  version: 2 | number;
  scheme: "exact" | string;
  resourceUrl: string;
  method: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | string;
  merchantDomain: string;
  payTo: string;
  asset: string;
  /** CAIP-2 network identifier such as eip155:84532. */
  network: string;
  facilitator: string;
  /** Atomic payment amount as a positive integer string. */
  amountAtomic: string;
  /** Optional explicit ISO-8601 or Unix expiration derived by the adapter. */
  validUntil?: string | number;
  /** x402 v2 payment-requirement timeout in seconds. */
  maxTimeoutSeconds?: number;
  /** ISO-8601 time when PAYMENT-REQUIRED was received; required when maxTimeoutSeconds supplies the expiry window. */
  requirementsReceivedAt?: string;
  requestId: string;
  /** SHA-256 hash of the decoded PAYMENT-REQUIRED object. */
  paymentRequiredHash: string;
  /** Required for unsafe HTTP methods when policy enables request-body binding. */
  requestBodyHash?: string;
  /** Optional client fingerprint; Magen3 always computes its own canonical fingerprint. */
  requestFingerprint?: string;
  settlementStatus?: "not_submitted" | "submitted" | "pending" | "confirmed" | "failed" | "uncertain" | string;
  settlementAttempt?: number;
  settlementTxHash?: string;
}


export interface Magen3ProtectedParameters {
  actionType: string;
  amount: number;
  asset: string;
  outputAsset: string;
  target: string;
  targetType: string;
  entryPoint: string;
  chainName: string;
  destination: string;
  contract: string;
  runtimeArgs: Record<string, unknown> | null;
}

export interface Magen3InstructionIntegrityMetadata {
  /** Stable identifier for the original human or application goal. */
  goalId?: string;
  /** SHA-256 hash of the original user goal text or canonical goal object. */
  originalUserGoalHash?: string;
  /** Originator category such as user, scheduler, service, or tool. */
  initiatedBy?: string;
  /** Source category such as user, webpage, email, document, tool_output, or scheduler. */
  intentSource?: string;
  toolName?: string;
  toolServer?: string;
  /** Normalized source domains that influenced the intent. */
  sourceDomains?: string[];
  externalContentUsed?: boolean;
  userConfirmed?: boolean;
  sourceTrustLevel?: "trusted" | "review" | "untrusted" | string;
  parameterChangeReason?: string;
  /** Optional adapter-computed SHA-256 fingerprint of original protected parameters. */
  originalParameterHash?: string;
  /** Optional adapter-computed SHA-256 fingerprint of current protected parameters. Magen3 computes its own. */
  currentParameterHash?: string;
  /**
   * Non-secret original protected values used only to identify the exact field
   * that changed. Generate this with createMagen3InstructionIntegrityBinding.
   */
  originalProtectedParameters?: Magen3ProtectedParameters;
  /** Permission scopes present when the goal was established. */
  originalPermissionScopes?: string[];
  /** Permission scopes requested by the current tool execution. */
  currentPermissionScopes?: string[];
}

export interface Magen3ToolMcpIntegrityMetadata {
  mcpServerId?: string;
  mcpServerUrl?: string;
  toolName: string;
  toolVersion?: string;
  /** SHA-256 hash of the approved server/tool manifest. */
  manifestHash?: string;
  /** SHA-256 hash of the approved tool input/output schema. */
  schemaHash?: string;
  /** SHA-256 hash of the approved human-readable tool description. */
  descriptionHash?: string;
  permissionScopes?: string[];
  credentialScope?: string;
  tls?: boolean;
  toolOrigin?: string;
  approvedAt?: string;
}

export interface Magen3Delegation {
  /** Stable unique identifier for one delegated authority. */
  delegationId: string;
  /** Casper Ed25519 or Secp256k1 public key granting authority. */
  delegatingWallet: string;
  /** Approved delegate identity. */
  delegate: string;
  /** Optional constrained Casper session public key. */
  sessionKey?: string;
  allowedNetworks?: string[];
  allowedContracts?: string[];
  allowedMethods?: string[];
  allowedAssets?: string[];
  nativeAmountLimit?: number;
  tokenAmountLimits?: Record<string, number>;
  maxTransactionAmount?: number;
  /** Rolling maximum executions per hour for this delegation ID. */
  maxFrequency?: number;
  validFrom?: string;
  expiresAt?: string;
  revocationStatus?: "Active" | "Revoked" | "Inactive" | string;
  delegationDepth?: number;
  redelegationAllowed?: boolean;
  nonce: string;
  chainName?: string;
  /** Optional adapter-computed SHA-256 hash of the canonical Magen3 delegation attestation. */
  attestationHash?: string;
  /** Transient Casper Wallet message signature. The Gateway verifies it and does not persist it raw. */
  attestationSignature?: string;
}


export interface Magen3RpcProviderObservation {
  providerId?: string;
  endpoint?: string;
  chainName?: string;
  networkIdentifier?: string;
  /** Optional 64-character genesis or chain fingerprint. */
  genesisHash?: string;
  tls?: boolean;
  synced?: boolean;
  latestBlockHeight?: number;
  latestBlockTimestamp?: string;
  responseTimestamp?: string;
  timedOut?: boolean;
  rateLimited?: boolean;
  /** True only for endpoints isolated for speculative execution rather than authorization. */
  speculative?: boolean;
  /** Optional 64-character canonical transaction-status evidence hash. */
  transactionStatusHash?: string;
  /** Optional 64-character canonical contract-state evidence hash. */
  contractStateHash?: string;
}

export interface Magen3RpcChainIntegrityMetadata {
  expectedChainName?: string;
  expectedNetworkIdentifier?: string;
  expectedGenesisHash?: string;
  selectedEndpoint?: string;
  selectedProviderId?: string;
  providerObservations: Magen3RpcProviderObservation[];
  automaticFailoverUsed?: boolean;
  failoverFrom?: string;
  failoverReason?: string;
}

export interface Magen3GasSponsorshipFeeSafetyMetadata {
  /** Casper, EVM, or another explicitly isolated chain family. */
  chainFamily?: "Casper" | "EVM" | "Other" | string;
  /** Exact network bound to the constructed transaction. */
  chainName?: string;
  estimatedGas?: number;
  gasLimit?: number;
  /** EVM-only gas-price evidence. */
  gasPrice?: number;
  /** EVM-only priority-fee evidence. */
  priorityFee?: number;
  maximumFee?: number;
  networkFee?: number;
  unit?: string;
  sponsor?: string;
  /** EVM-only approved Paymaster identifier/address. */
  paymaster?: string;
  sponsorshipId?: string;
  sponsorshipExpiry?: string;
  sponsorshipScopes?: string[];
  /** SHA-256 evidence hash only. Never send the raw sponsor signature. */
  sponsorSignatureHash?: string;
  expectedPayer?: string;
  actualPayer?: string;
  sponsored?: boolean;
  sponsorshipAvailable?: boolean;
}

export interface Magen3DelegationAttestationInput extends Omit<Magen3Delegation, "attestationHash" | "attestationSignature"> {
  /** Registered Magen3 Agent ID bound into the signed authority. */
  agentId: string;
  /** Domain-separated attestation namespace. Defaults to magen3.delegation.v1. */
  domain?: string;
}

/**
 * Build the exact canonical message that a delegating Casper wallet must sign.
 * This helper does not access a wallet, hold a private key, or submit an intent.
 */
export function buildMagen3DelegationAttestationMessage(input: Magen3DelegationAttestationInput): string {
  const clean = (value: unknown) => String(value ?? "").trim();
  const uniqueSorted = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))]
    .map((item) => item.toLowerCase())
    .sort();
  const numberText = (value: unknown) => value === null || value === undefined || value === "" ? "" : String(Number(value));
  const tokenLimits = input.tokenAmountLimits && typeof input.tokenAmountLimits === "object" && !Array.isArray(input.tokenAmountLimits)
    ? Object.entries(input.tokenAmountLimits)
      .map(([asset, limit]) => [clean(asset), Number(limit)] as const)
      .filter(([asset, limit]) => Boolean(asset) && Number.isFinite(limit) && limit >= 0)
      .sort(([left], [right]) => left.localeCompare(right))
    : [];
  return [
    "Magen3 Delegated Permission Attestation",
    "Version: 1",
    `Domain: ${clean(input.domain || "magen3.delegation.v1")}`,
    `Chain: ${clean(input.chainName || "casper-test")}`,
    `Delegation ID: ${clean(input.delegationId)}`,
    `Agent ID: ${clean(input.agentId)}`,
    `Delegating Wallet: ${clean(input.delegatingWallet)}`,
    `Delegate: ${clean(input.delegate)}`,
    `Session Key: ${clean(input.sessionKey)}`,
    `Allowed Networks: ${uniqueSorted(input.allowedNetworks).join(",")}`,
    `Allowed Contracts: ${uniqueSorted(input.allowedContracts).join(",")}`,
    `Allowed Methods: ${uniqueSorted(input.allowedMethods).join(",")}`,
    `Allowed Assets: ${uniqueSorted(input.allowedAssets).join(",")}`,
    `Native Amount Limit: ${numberText(input.nativeAmountLimit)}`,
    `Token Amount Limits: ${tokenLimits.map(([asset, limit]) => `${asset.toLowerCase()}=${limit}`).join(",")}`,
    `Max Transaction Amount: ${numberText(input.maxTransactionAmount)}`,
    `Max Frequency: ${numberText(input.maxFrequency)}`,
    `Valid From: ${clean(input.validFrom)}`,
    `Expires At: ${clean(input.expiresAt)}`,
    `Revocation Status: ${clean(input.revocationStatus || "Active")}`,
    `Delegation Depth: ${input.delegationDepth === null || input.delegationDepth === undefined ? "0" : String(Number(input.delegationDepth))}`,
    `Redelegation Allowed: ${input.redelegationAllowed === true ? "true" : "false"}`,
    `Nonce: ${clean(input.nonce)}`,
    "",
    "Signing this message authorizes only the bounded delegation above. It does not sign or submit a blockchain transaction.",
  ].join("\n");
}

export interface Magen3TokenPermissionBatchItem {
  tokenContract?: string;
  spender?: string;
  amount?: number;
  tokenId?: string;
}

export interface Magen3TokenPermission {
  /** Explicit supported authority classification. Generic contract calls must omit this object. */
  permissionType:
    | "Fungible Token Approval"
    | "Allowance Increase"
    | "Allowance Decrease"
    | "Allowance Reset"
    | "Permit Authorization"
    | "NFT Operator Approval"
    | "Batch Approval"
    | "Delegated Spender Permission"
    | string;
  /** Public wallet or account identifier that owns the authority. */
  owner: string;
  /** Exact token contract identifier on the intended network. */
  tokenContract: string;
  tokenStandard?: string;
  /** Exact spender, operator, router, vault, or delegate receiving authority. */
  spender: string;
  approvalAmount?: number;
  intendedTransactionAmount?: number;
  unlimited?: boolean;
  nonce?: string;
  permitId?: string;
  deadline?: string | number;
  reusable?: boolean;
  chainId?: string;
  network?: string;
  approvedProtocol?: string;
  operatorForAll?: boolean;
  batchItems?: Magen3TokenPermissionBatchItem[];
  allowanceResetExpected?: boolean;
}

export type Magen3PrivilegedActionName =
  | "Ownership Transfer"
  | "Administrator Change"
  | "Proxy Upgrade"
  | "Implementation Change"
  | "Role Grant"
  | "Role Revoke"
  | "Mint"
  | "Burn"
  | "Pause"
  | "Unpause"
  | "Freeze"
  | "Emergency Withdrawal"
  | "Treasury Withdrawal"
  | "Oracle Replacement"
  | "Fee Recipient Change"
  | "Bridge Validator Change"
  | "Permission Change";

export interface Magen3PrivilegedAction {
  /** Explicit supported action. Adapters may omit this only when entryPoint or methodSignature maps deterministically. */
  classifiedAction?: Magen3PrivilegedActionName | string;
  contract?: string;
  package?: string;
  entryPoint?: string;
  methodSignature?: string;
  /** Sanitized current protected value. Never include private state or secrets. */
  currentValue?: unknown;
  /** Exact requested protected value bound into the approval fingerprint. */
  requestedValue?: unknown;
  role?: string;
  recipient?: string;
  implementation?: string;
  classifierSource?: string;
  classifierVersion?: string;
  network?: string;
}

export interface Magen3ContractUpgrade {
  contract?: string;
  package?: string;
  currentImplementation: string;
  requestedImplementation: string;
  currentCodeHash?: string;
  requestedCodeHash?: string;
  packageVersion?: string;
  upgradeAdministrator?: string;
  requestedAt?: string;
  executeAfter?: string;
  network?: string;
}

export interface Magen3Action {
  type: string;
  amount?: number;
  asset?: string;
  /** Optional output or quote asset for price-sensitive actions. */
  outputAsset?: string;
  target: string;
  targetType?: string;
  /** Explicit Casper identifier semantics for ambiguous raw/hash-prefixed values. */
  contractIdentifierType?: "Contract Hash" | "Package Hash" | string;
  /** Contract entry point required for direct Contract Interaction/Contract Call actions. */
  entryPoint?: string;
  /** Optional package contract version. Must not be used with a Contract Hash. */
  contractVersion?: number;
  /** Optional Casper chain name. The Gateway validates it against its configured network. */
  chainName?: string;
  /** Optional provider-agnostic price context evaluated against the configured Oracle Validation feed. */
  oracle?: Magen3OracleQuote;
  /** Provider-supplied cross-chain route metadata evaluated by Bridge Controls before signing. */
  bridge?: Magen3BridgeRoute;
  /** Non-sensitive compliance status evidence and opaque references evaluated before signing. */
  compliance?: Magen3ComplianceEvidence;
  /** x402 payment requirements evaluated before PAYMENT-SIGNATURE creation. Never include signatures or signed payment payloads. */
  x402?: Magen3X402Payment;
  /** Deterministic goal, provenance, source-domain, parameter-binding, and tool-scope evidence. Never include private prompts, credentials, or unredacted document contents. */
  instructionIntegrity?: Magen3InstructionIntegrityMetadata;
  /** Verifiable MCP server and tool identity, hashes, version, origin, TLS, and least-privilege scopes. Never include credentials or secret tool output. */
  toolIntegrity?: Magen3ToolMcpIntegrityMetadata;
  /** Casper-signed, short-lived delegated authority. Raw signatures are verified transiently and never persisted in audit evidence. */
  delegation?: Magen3Delegation;
  /** RPC provider identity, freshness, synchronization, agreement, and failover evidence. Never include provider credentials. */
  rpcIntegrity?: Magen3RpcChainIntegrityMetadata;
  /** Public fee, sponsor, Paymaster, expiry, scope, payer, and budget evidence. Never include raw sponsor signatures or credentials. */
  feeSafety?: Magen3GasSponsorshipFeeSafetyMetadata;
  /** Explicit token authority metadata evaluated before signing. Never include permit signatures or raw signed payloads. */
  tokenPermission?: Magen3TokenPermission;
  /** Supported administrative action metadata evaluated before signing. Never include admin keys, signatures, or raw signed transactions. */
  privilegedAction?: Magen3PrivilegedAction;
  /** Exact contract-upgrade metadata evaluated before signing. Never include upgrade signatures or private keys. */
  contractUpgrade?: Magen3ContractUpgrade;
  /** Exact-once lifecycle metadata evaluated before wallet signing. */
  lifecycle?: Magen3Lifecycle;
  /** Optional deterministic transaction-construction metadata evaluated before wallet signing. */
  preflight?: Magen3ExecutionPreflight;
}

export interface Magen3Intent {
  source?: string;
  targetChain?: string;
  walletAddress?: string;
  executionWalletAddress: string;
  goal?: string;
  reason?: string;
  action: Magen3Action;
}

export interface Magen3Identity {
  ok?: boolean;
  agent?: Record<string, unknown>;
  policy?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type Magen3FindingStatus = "pass" | "warning" | "fail" | "unavailable" | "skipped";
export type Magen3FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Magen3ModuleFinding {
  module: string;
  status: Magen3FindingStatus;
  severity: Magen3FindingSeverity;
  rule: string;
  message: string;
  evidence?: Record<string, unknown>;
  remediation?: string;
}

export interface Magen3PipelineStage {
  id: string;
  label: string;
  status: string;
  timestamp?: string;
  detail?: string;
}

export interface Magen3ThreatIntelligenceMatch {
  entityRole?: string;
  kind?: string;
  indicatorId?: string;
  severity?: Magen3FindingSeverity;
  confidence?: number;
  categories?: string[];
  source?: string;
}

export interface Magen3ThreatIntelligenceContext {
  status: "available" | "stale" | "unavailable" | string;
  sourceType?: "inline" | "file" | "remote" | "none" | string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  indicatorCount?: number;
  activeIndicatorCount?: number;
  ageMs?: number | null;
  maxAgeMs?: number | null;
  error?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  minConfidence?: number;
  checkedEntities?: Array<{ role?: string; kind?: string; canonical?: string }>;
  matchedIndicators?: Magen3ThreatIntelligenceMatch[];
}


export interface Magen3OracleValidationContext {
  status: "available" | "stale" | "unavailable" | string;
  sourceType?: "inline" | "file" | "remote" | "none" | string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  observationCount?: number;
  pairCount?: number;
  error?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  maxAgeSeconds?: number;
  maxDeviationBps?: number;
  maxSourceSpreadBps?: number;
  minConfidence?: number;
  minSources?: number;
  requestedPair?: string;
  executionPrice?: number | null;
  referencePrice?: number | null;
  deviationBps?: number | null;
  sourceSpreadBps?: number | null;
  sourceCount?: number;
  confidence?: number | null;
  quoteTimestamp?: string;
}

export interface Magen3BridgeControlsContext {
  status?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  provider?: string;
  sourceChain?: string;
  destinationChain?: string;
  routeId?: string;
  asset?: string;
  amount?: number;
  destinationAddress?: string;
  destinationAddressFamily?: string;
  destinationAddressValid?: boolean;
  feeBps?: number | null;
  maxFeeBps?: number;
  quotedOutput?: number | null;
  minimumReceived?: number | null;
  quoteTimestamp?: string;
  quoteExpiresAt?: string;
  sourceConfirmations?: number;
  destinationConfirmations?: number;
}


export interface Magen3ComplianceControlsContext {
  status?: "available" | "stale" | "unavailable" | string;
  sourceType?: "inline" | "file" | "remote" | "none" | string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  indicatorCount?: number;
  activeIndicatorCount?: number;
  jurisdictionCount?: number;
  activeJurisdictionCount?: number;
  error?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  originatorJurisdiction?: string;
  beneficiaryJurisdiction?: string;
  counterpartyType?: string;
  originatorAttestationStatus?: string;
  beneficiaryAttestationStatus?: string;
  travelRuleStatus?: string;
  screeningStatus?: string;
  riskRating?: string;
  checkedEntities?: Array<Record<string, unknown>>;
  matchedIndicators?: Array<Record<string, unknown>>;
  matchedJurisdictions?: Array<Record<string, unknown>>;
}

export interface Magen3X402PaymentControlsContext {
  status?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  version?: number | string;
  scheme?: string;
  method?: string;
  resourceUrl?: string;
  merchantDomain?: string;
  payTo?: string;
  network?: string;
  asset?: string;
  facilitator?: string;
  amountAtomic?: string;
  amount?: number | null;
  submittedAmount?: number | null;
  assetDecimals?: number | null;
  maxTimeoutSeconds?: number;
  requirementsReceivedAt?: string;
  validUntil?: string;
  requestId?: string;
  requestBodyHash?: string;
  paymentRequiredHash?: string;
  requestFingerprint?: string;
  clientFingerprint?: string;
  recipientFamily?: string;
  settlementStatus?: string;
  settlementAttempt?: number;
  hourlyCount?: number;
  dailySpend?: number;
  monthlySpend?: number;
  previousFingerprintCount?: number;
}

export interface Magen3ExecutionIntegrityContext {
  status?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  enabled?: boolean;
  intentId?: string;
  idempotencyKey?: string;
  sequence?: number | null;
  createdAt?: string;
  expiresAt?: string;
  retryOf?: string;
  replacementOf?: string;
  attempt?: number;
  fingerprint?: string;
  clientFingerprint?: string;
  previousIntentIdCount?: number;
  previousIdempotencyCount?: number;
  previousFingerprintCount?: number;
  highestSequence?: number;
  replayWindowSeconds?: number;
  maxRetryAttempts?: number;
}


export interface Magen3RpcProviderObservationContext extends Magen3RpcProviderObservation {}

export interface Magen3RpcChainIntegrityContext {
  status?: "passed" | "warning" | "review" | "failed" | "skipped" | string;
  enabled?: boolean;
  mode?: "Observe" | "Review" | "Enforce" | string;
  metadataSupplied?: boolean;
  expectedChainName?: string;
  expectedNetworkIdentifier?: string;
  expectedGenesisHash?: string;
  selectedEndpoint?: string;
  selectedProviderId?: string;
  providerCount?: number;
  usableProviderCount?: number;
  approvedProviderCount?: number;
  automaticFailoverUsed?: boolean;
  failoverFrom?: string;
  failoverReason?: string;
  networkIdentityVerified?: boolean | null;
  networkAgreement?: boolean;
  transactionStatusAgreement?: boolean;
  contractStateAgreement?: boolean;
  providerObservations?: Magen3RpcProviderObservationContext[];
  violations?: Array<{ rule?: string; message?: string }>;
}


export interface Magen3GasSponsorshipFeeSafetyContext {
  status?: "passed" | "warning" | "review" | "blocked" | "skipped" | string;
  metadataSupplied?: boolean;
  chainFamily?: string;
  chainName?: string;
  feeUnit?: string;
  networkFee?: number | null;
  estimatedGas?: number | null;
  gasLimit?: number | null;
  gasPrice?: number | null;
  priorityFee?: number | null;
  maximumFee?: number | null;
  sponsored?: boolean;
  sponsor?: string;
  paymaster?: string;
  sponsorshipId?: string;
  sponsorshipExpiry?: string;
  sponsorshipScopes?: string[];
  sponsorApproved?: boolean;
  paymasterApproved?: boolean;
  sponsorEvidenceVerified?: boolean;
  expectedPayer?: string;
  actualPayer?: string;
  sponsorshipAvailable?: boolean;
  rollingBudgetUsed?: number;
  rollingSponsoredOperations?: number;
  recentFailedSponsoredOperations?: number;
  protectedFingerprint?: string;
  violations?: Array<{ rule?: string; message?: string }>;
}

export interface Magen3EmergencyPause {
  id?: string;
  ownerWalletAddress?: string;
  agentId?: string;
  policyId?: string;
  scopeType?: "Platform" | "Agent" | "Capability" | "Action" | "Policy" | "Trading" | "Contract" | "Bridge" | "x402" | "All Execution" | string;
  scopeValue?: string;
  enforcementAction?: "Blocked" | "Review Required" | string;
  triggerType?: "Manual" | "Automatic" | string;
  triggerRule?: string;
  reason?: string;
  status?: "Active" | "Resumed" | "Expired" | string;
  createdAt?: string;
  expiresAt?: string;
  resumeAuthorityWallets?: string[];
  resumeRequiresApproval?: boolean;
  resumeQuorum?: number;
  resumeApprovalRequestId?: string;
  resumedAt?: string;
  resumeReason?: string;
  active?: boolean;
}

export interface Magen3EmergencyControlsContext {
  active?: boolean;
  automaticPauseActivated?: boolean;
  effectiveDecision?: Magen3Decision | string;
  matchingPauses?: Magen3EmergencyPause[];
  pause?: Magen3EmergencyPause;
}

export interface Magen3InstructionIntegrityContext {
  metadataSupplied?: boolean;
  enabled?: boolean;
  mode?: "Observe" | "Review" | "Enforce" | string;
  goalId?: string;
  originalUserGoalHash?: string;
  initiatedBy?: string;
  intentSource?: string;
  toolName?: string;
  toolServer?: string;
  sourceDomains?: string[];
  externalContentUsed?: boolean;
  userConfirmed?: boolean;
  sourceTrustLevel?: string;
  parameterChangeReason?: string;
  originalParameterHash?: string;
  currentParameterHash?: string;
  computedCurrentParameterHash?: string;
  originalProtectedParameters?: Magen3ProtectedParameters | null;
  currentProtectedParameters?: Magen3ProtectedParameters;
  parameterDifferences?: Array<{ field: string; label?: string; expected?: unknown; received?: unknown }>;
  mismatchFields?: string[];
  parametersChanged?: boolean;
  originalPermissionScopes?: string[];
  currentPermissionScopes?: string[];
  addedPermissionScopes?: string[];
  selfAuthorizingPayment?: boolean;
  violations?: Array<{ rule?: string; message?: string }>;
  limitation?: string;
}

export interface Magen3ToolMcpIntegrityContext {
  enabled?: boolean;
  mode?: "Observe" | "Review" | "Enforce" | string;
  metadataSupplied?: boolean;
  applicable?: boolean;
  serverId?: string;
  serverUrl?: string;
  toolName?: string;
  toolVersion?: string;
  manifestHash?: string;
  schemaHash?: string;
  descriptionHash?: string;
  permissionScopes?: string[];
  credentialScope?: string;
  tls?: boolean;
  toolOrigin?: string;
  approvedAt?: string;
  approvedServer?: boolean;
  approvedTool?: boolean;
  materialChangeDetected?: boolean;
  violations?: Array<{ rule?: string; message?: string }>;
  limitation?: string;
}

export interface Magen3DelegationSafetyContext {
  enabled?: boolean;
  mode?: "Observe" | "Review" | "Enforce" | string;
  metadataSupplied?: boolean;
  applicable?: boolean;
  delegationId?: string;
  delegatingWallet?: string;
  delegate?: string;
  sessionKey?: string;
  chainName?: string;
  attestationHash?: string;
  signatureVerified?: boolean;
  signatureHash?: string;
  signatureAlgorithm?: "Ed25519" | "Secp256k1" | string;
  allowedNetworks?: string[];
  allowedContracts?: string[];
  allowedMethods?: string[];
  allowedAssets?: string[];
  nativeAmountLimit?: number | null;
  tokenAmountLimits?: Record<string, number>;
  maxTransactionAmount?: number | null;
  maxFrequency?: number | null;
  validFrom?: string;
  expiresAt?: string;
  revocationStatus?: string;
  delegationDepth?: number;
  redelegationAllowed?: boolean;
  usedLastHour?: number;
  violations?: Array<{ rule?: string; message?: string }>;
}

export interface Magen3TokenPermissionControlsContext {
  permissionType?: string;
  owner?: string;
  tokenContract?: string;
  tokenStandard?: string;
  spender?: string;
  approvalAmount?: number | null;
  intendedTransactionAmount?: number | null;
  unlimited?: boolean;
  nonce?: string;
  permitId?: string;
  deadline?: string;
  reusable?: boolean;
  chainId?: string;
  network?: string;
  approvedProtocol?: string;
  operatorForAll?: boolean;
  batchItems?: Magen3TokenPermissionBatchItem[];
  allowanceResetExpected?: boolean;
  fingerprint?: string;
  replayStatus?: "clear" | "replay" | "parameter_mutation" | "not_evaluated" | string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  policy?: {
    approvedSpenderCount?: number;
    blockedSpenderCount?: number;
    maxApprovalAmount?: number | null;
    maxApprovalToTransactionRatio?: number | null;
    maxLifetimeSeconds?: number | null;
    maximumBatchSize?: number;
  };
}

export interface Magen3PrivilegedActionControlsContext {
  metadataSupplied?: boolean;
  declaredAction?: string;
  classifiedAction?: string;
  methodClassifiedAction?: string;
  classificationContradiction?: boolean;
  contract?: string;
  package?: string;
  entryPoint?: string;
  methodSignature?: string;
  currentValue?: unknown;
  requestedValue?: unknown;
  role?: string;
  recipient?: string;
  implementation?: string;
  classifierSource?: string;
  classifierVersion?: string;
  network?: string;
  parameterFingerprint?: string;
  classificationStatus?: "supported" | "unknown" | "contradictory" | string;
  approvalRequired?: boolean;
  requiredApprovalCount?: number;
  config?: {
    mode?: "Observe" | "Review" | "Enforce" | string;
    unknownAction?: "Warn" | "Review" | "Block" | string;
  };
}

export interface Magen3ContractUpgradeSafetyContext {
  metadataSupplied?: boolean;
  privilegedUpgrade?: boolean;
  contract?: string;
  package?: string;
  currentImplementation?: string;
  requestedImplementation?: string;
  currentCodeHash?: string;
  requestedCodeHash?: string;
  packageVersion?: string;
  upgradeAdministrator?: string;
  requestedAt?: string;
  executeAfter?: string;
  network?: string;
  parameterFingerprint?: string;
  approvalRequired?: boolean;
  requiredApprovalCount?: number;
  config?: {
    mode?: "Observe" | "Review" | "Enforce" | string;
    requiresApproval?: boolean;
    quorum?: number;
    delaySeconds?: number;
    requireCodeHash?: boolean;
  };
}

export interface Magen3ContractArgumentPoliciesContext {
  target?: string;
  entryPoint?: string;
  ruleId?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  parameterFingerprint?: string;
  evaluatedArguments?: string[];
  requiredArguments?: string[];
  allowedArguments?: string[];
  violations?: Array<{ rule?: string; message?: string }>;
  approvalBindingNote?: string;
}

export interface Magen3X402SettlementUpdate {
  auditLogId: string;
  status: "submitted" | "pending" | "confirmed" | "failed" | "uncertain";
  requestFingerprint: string;
  transactionHash?: string;
  attempt?: number;
  facilitatorReference?: string;
  resourceDelivered?: boolean;
  note?: string;
}

export type Magen3ExecutionReconciliationState =
  | "not_submitted"
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed"
  | "uncertain"
  | "replaced"
  | "refunded"
  | "delivered";

export interface Magen3ExecutionReconciliationUpdate {
  auditLogId: string;
  status: Exclude<Magen3ExecutionReconciliationState, "not_submitted">;
  transactionHash?: string;
  replacementTransactionHash?: string;
  replacementAuditLogId?: string;
  refundTransactionHash?: string;
  attempt?: number;
  confirmations?: number;
  finalized?: boolean;
  blockHeight?: number;
  observedAt?: string;
  provider?: string;
  providerReference?: string;
  resourceDelivered?: boolean;
  deliveryReference?: string;
  failureReason?: string;
  chainName?: string;
  note?: string;
}

export interface Magen3ExecutionReconciliationPollOptions {
  auditLogId: string;
  /** Optional when the audit already has a bound transaction hash. */
  transactionHash?: string;
  /** Selects a backend-configured adapter. Request-provided RPC URLs are never accepted. */
  chainFamily?: "casper" | "evm" | string;
  chainName?: string;
  note?: string;
}

export interface Magen3ExecutionReconciliationRecord {
  status: Magen3ExecutionReconciliationState;
  transactionHash?: string;
  attempt?: number;
  confirmations?: number;
  requiredConfirmations?: number;
  finalized?: boolean;
  finalityDeadline?: string;
  finalizedAt?: string;
  replacementOf?: string;
  replacedBy?: string;
  failureReason?: string;
  resourceDeliveryStatus?: string;
  refundStatus?: string;
  provider?: string;
  lastCheckedAt?: string;
  history?: Array<Record<string, unknown>>;
}


export interface Magen3ApprovalResponseRecord {
  walletAddress: string;
  response: "Approved" | "Rejected" | string;
  comment?: string;
  timestamp: string;
  signatureRequired?: boolean;
  signatureVerified?: boolean;
  signatureVerifiedAt?: string;
  signatureChallengeId?: string;
  signatureChallengeHash?: string;
  signatureNonceHash?: string;
  signatureHash?: string;
  signatureAlgorithm?: "Ed25519" | "Secp256k1" | string;
  signatureDomain?: string;
  signatureChainName?: string;
  /** Groups in which the reviewer is directly configured. */
  memberGroupIds?: string[];
  /** Organizational roles satisfied by this response, including activated backup substitutions. */
  groupIds?: string[];
}

export interface Magen3ApprovalGroupProgress {
  groupId: string;
  groupName: string;
  role?: string;
  required: number;
  received: number;
  remaining: number;
  satisfied: boolean;
}

export interface Magen3ApprovalTierSummary {
  id: string;
  name: string;
  priority?: number;
  minAmount?: number | null;
  maxAmount?: number | null;
  actions?: string[];
  capabilities?: string[];
  contracts?: string[];
  requiredGroups?: Array<{ groupId: string; approvals: number }>;
  requiredApprovals?: number;
  executionDelaySeconds?: number | null;
  executionWindowSeconds?: number | null;
}

export interface Magen3ApprovalEscalationSummary {
  id: string;
  name?: string;
  afterSeconds?: number;
  activatedAt?: string;
}

export interface Magen3OrganizationalApprovalSummary {
  enabled?: boolean;
  satisfied?: boolean;
  groups?: Magen3ApprovalGroupProgress[];
  resolvedTier?: Magen3ApprovalTierSummary | null;
  activeGroupIds?: string[];
  backupSubstitutions?: Record<string, string[]>;
  escalationHistory?: Magen3ApprovalEscalationSummary[];
  nextEscalation?: Magen3ApprovalEscalationSummary | null;
}

export interface Magen3ApprovalRequest {
  id: string;
  auditLogId: string;
  agentId: string;
  actionType: string;
  amount: number;
  target: string;
  targetType?: string;
  decision: "Review Required" | string;
  risk?: Magen3Risk | string;
  riskScore?: number;
  reason?: string;
  policyId?: string;
  policyName?: string;
  reviewStatus: "Pending" | "Approved" | "Rejected" | "Expired" | "Configuration Required" | string;
  bindingHash: string;
  requiredApprovals: number;
  approvalsReceived: number;
  verifiedApprovalsReceived?: number;
  verifiedResponses?: number;
  signatureRequired?: boolean;
  signatureDomain?: string;
  signatureChainName?: string;
  remainingApprovals: number;
  /** Deterministically selected value/action/capability/contract approval tier. */
  resolvedTier?: Magen3ApprovalTierSummary | null;
  /** Required organizational role progress. */
  groupProgress?: Magen3ApprovalGroupProgress[];
  escalationHistory?: Magen3ApprovalEscalationSummary[];
  nextEscalation?: Magen3ApprovalEscalationSummary | null;
  executionNotBefore?: string;
  executionWindowEndsAt?: string;
  executionDelayRemainingSeconds?: number;
  executionWindowStatus?: "not_started" | "delay" | "open" | "expired" | string;
  organizationalQuorum?: Magen3OrganizationalApprovalSummary;
  approverWallets?: string[];
  responses?: Magen3ApprovalResponseRecord[];
  expiresAt: string;
  resolvedAt?: string;
  rejectionReason?: string;
  mayProceedToSigning: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Magen3ReviewResolution {
  strategy: Magen3ReviewResolutionStrategy;
  mode: "not_required" | "blocked" | "agent_remediation" | "human_approval" | string;
  state: string;
  humanActionRequired: boolean;
  agentActionRequired?: boolean;
  canAgentRetry: boolean;
  mayAutoResume?: boolean;
  requiredActions: string[];
  summary: string;
}

export interface Magen3DecisionExplanation {
  decision: Magen3Decision;
  strategy?: Magen3ReviewResolutionStrategy;
  summary: string;
  primaryReason: string;
  triggeredRule: string;
  suggestedResolution: string;
  /** Safe, concise text intended to be shown directly in the external agent UI or chat. */
  userMessage: string;
  /** Deterministic instruction for the external agent backend. */
  agentInstruction: string;
  humanActionRequired: boolean;
  reviewMode: string;
  reviewState: string;
  canAgentRetry: boolean;
  requiredActions: string[];
  /** Stable machine-readable explanation code. */
  code?: string;
  /** Protection module that produced the primary finding. */
  module?: string;
  /** Primary field responsible for the decision. */
  field?: string;
  expected?: unknown;
  received?: unknown;
  /** All protected fields known to have changed. */
  mismatchFields?: string[];
  details?: {
    differences?: Array<{ field: string; label?: string; expected?: unknown; received?: unknown }>;
    missingFields?: string[];
    addedPermissionScopes?: string[];
    originalSnapshotSupplied?: boolean;
    [key: string]: unknown;
  };
}

export interface Magen3DecisionResult {
  decision: Magen3Decision;
  risk: Magen3Risk;
  riskScore: number;
  reason: string;
  recommendedAction: string;
  policyChecksPassed?: string[];
  policyChecksFailed?: string[];
  primaryReason?: string;
  triggeredRule?: string;
  suggestedResolution?: string;
  decisionExplanation?: Magen3DecisionExplanation;
  reviewResolution?: Magen3ReviewResolution;
  moduleFindings?: Magen3ModuleFinding[];
  pipelineStages?: Magen3PipelineStage[];
  /** Deterministic goal binding, source provenance, protected-parameter binding, confirmation, and tool-scope evidence. */
  instructionIntegrityContext?: Magen3InstructionIntegrityContext;
  /** Deterministic MCP server/tool identity, hash, TLS, origin, credential, permission-scope, and capability-boundary evidence. */
  toolMcpIntegrityContext?: Magen3ToolMcpIntegrityContext;
  /** Casper signer verification plus exact delegated network, contract, method, asset, lifetime, revocation, amount, frequency, and depth evidence. */
  delegationSafetyContext?: Magen3DelegationSafetyContext;
  /** Approved RPC provider, network identity, freshness, height, state-consistency, and failover evidence. */
  rpcChainIntegrityContext?: Magen3RpcChainIntegrityContext;
  /** Deterministic network-fee, sponsor, Paymaster, expiry, payer, budget, and operation-limit evidence. */
  gasSponsorshipFeeSafetyContext?: Magen3GasSponsorshipFeeSafetyContext;
  /** Active scoped pause evidence, automatic-trigger state, expiry, and audited resume requirements. */
  emergencyControlsContext?: Magen3EmergencyControlsContext;
  /** Sanitized feed status and exact-match evidence. Never includes provider credentials. */
  threatIntelligenceContext?: Magen3ThreatIntelligenceContext;
  /** Sanitized oracle-feed state and deterministic price-integrity evidence. */
  oracleValidationContext?: Magen3OracleValidationContext;
  /** Deterministic route, chain, address, fee, freshness, and confirmation evidence. */
  bridgeControlsContext?: Magen3BridgeControlsContext;
  /** Sanitized compliance policy, evidence status, and configured exact-match context. */
  complianceControlsContext?: Magen3ComplianceControlsContext;
  /** Exact-once intent lifecycle, canonical fingerprint, replay, idempotency, expiry, sequence, and retry evidence. */
  executionIntegrityContext?: Magen3ExecutionIntegrityContext;
  /** Canonical x402 request binding, policy limits, replay state, and settlement context. */
  x402PaymentControlsContext?: Magen3X402PaymentControlsContext;
  /** Deterministic token-authority classification, policy limits, fingerprint, and permit replay state. */
  tokenPermissionControlsContext?: Magen3TokenPermissionControlsContext;
  /** Deterministic administrative-action classification, parameter fingerprint, policy, and Human Approval requirements. */
  privilegedActionControlsContext?: Magen3PrivilegedActionControlsContext;
  /** Current/proposed implementation, code-hash, administrator, delay, fingerprint, and exact approval evidence. */
  contractUpgradeSafetyContext?: Magen3ContractUpgradeSafetyContext;
  /** Exact contract/entry-point rule, runtime-argument checks, violations, and canonical argument fingerprint. */
  contractArgumentPoliciesContext?: Magen3ContractArgumentPoliciesContext;
}

export interface Magen3IntentResponse {
  ok: boolean;
  executionApproved: boolean;
  result: Magen3DecisionResult;
  gatewayRequest: Record<string, unknown>;
  auditLog: Record<string, unknown>;
  casperPayload?: Record<string, unknown>;
  nextAction: string;
  /** Newly activated automatic pause, when the current finding crossed a configured circuit-breaker threshold. */
  emergencyPause?: Magen3EmergencyPause | null;
  /** Exact-intent approval request only when the review strategy explicitly requires human or organizational approval. */
  approval?: Magen3ApprovalRequest | null;
  /** AI-native routing for Review Required decisions. */
  reviewResolution?: Magen3ReviewResolution;
  /** Structured reason and remediation that can be rendered without parsing module findings. */
  decisionExplanation?: Magen3DecisionExplanation;
  /** Safe concise message intended for the external agent's user-facing response. */
  agentMessage?: string;
}

/**
 * Returns the safe user-facing explanation produced by Magen3. Applications
 * should display this rather than inventing a generic Blocked/Review message.
 */
export function getMagen3AgentMessage(response: Magen3IntentResponse): string {
  return response.agentMessage
    || response.decisionExplanation?.userMessage
    || response.result.decisionExplanation?.userMessage
    || response.result.primaryReason
    || response.result.reason
    || response.nextAction;
}

/** True only when the exact evaluated action may reach signing/submission. */
export function isMagen3ExecutionApproved(response: Magen3IntentResponse): boolean {
  return response.executionApproved === true && response.result.decision === "Allowed";
}

function canonicalizeMagen3Value(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeMagen3Value);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalizeMagen3Value((value as Record<string, unknown>)[key]);
      return result;
    }, {});
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 support is required to create Magen3 instruction bindings");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the exact non-secret protected parameter object used by current Magen3
 * Instruction Integrity hashing. Keep this snapshot so Magen3 can name the
 * precise field that changed instead of returning a generic hash mismatch.
 */
export function buildMagen3ProtectedParameters(intent: Magen3Intent): Magen3ProtectedParameters {
  const action = intent.action;
  const chainName = action.chainName
    || action.tokenPermission?.network
    || action.bridge?.destinationChain
    || action.x402?.network
    || intent.targetChain
    || "";
  const destination = action.bridge?.destinationAddress
    || action.x402?.payTo
    || action.tokenPermission?.spender
    || action.target
    || "";
  const contract = action.contractUpgrade?.contract
    || action.privilegedAction?.contract
    || action.tokenPermission?.tokenContract
    || action.target
    || "";
  return {
    actionType: String(action.type || "").trim(),
    amount: Number(action.amount || 0),
    asset: String(action.asset || "").trim(),
    outputAsset: String(action.outputAsset || "").trim(),
    target: String(action.target || "").trim(),
    targetType: String(action.targetType || "").trim(),
    entryPoint: String(action.entryPoint || "").trim(),
    chainName: String(chainName).trim(),
    destination: String(destination).trim(),
    contract: String(contract).trim(),
    runtimeArgs: action.preflight?.runtimeArgs && typeof action.preflight.runtimeArgs === "object"
      ? action.preflight.runtimeArgs
      : null,
  };
}

/** Generate the backend-compatible SHA-256 fingerprint for protected fields. */
export async function hashMagen3ProtectedParameters(parameters: Magen3ProtectedParameters): Promise<string> {
  return sha256Hex(JSON.stringify(canonicalizeMagen3Value(parameters)));
}

export interface CreateMagen3InstructionBindingOptions {
  goalId: string;
  originalUserRequest: string;
  initiatedBy?: string;
  intentSource?: string;
  toolName?: string;
  toolServer?: string;
  sourceDomains?: string[];
  externalContentUsed?: boolean;
  userConfirmed?: boolean;
  sourceTrustLevel?: "trusted" | "review" | "untrusted" | string;
  parameterChangeReason?: string;
  originalProtectedParameters?: Magen3ProtectedParameters;
  originalPermissionScopes?: string[];
  currentPermissionScopes?: string[];
}

/**
 * Create consistent instruction provenance and hashes for one intent. Preserve
 * the returned goalId and original binding while retrying the same business
 * goal. Recreate it when protected parameters legitimately change.
 */
export async function createMagen3InstructionIntegrityBinding(
  intent: Magen3Intent,
  options: CreateMagen3InstructionBindingOptions,
): Promise<Magen3InstructionIntegrityMetadata> {
  const currentProtectedParameters = buildMagen3ProtectedParameters(intent);
  const originalProtectedParameters = options.originalProtectedParameters ?? currentProtectedParameters;
  const [originalUserGoalHash, originalParameterHash, currentParameterHash] = await Promise.all([
    sha256Hex(options.originalUserRequest),
    hashMagen3ProtectedParameters(originalProtectedParameters),
    hashMagen3ProtectedParameters(currentProtectedParameters),
  ]);
  return {
    goalId: options.goalId,
    originalUserGoalHash,
    initiatedBy: options.initiatedBy ?? "user",
    intentSource: options.intentSource ?? "user",
    toolName: options.toolName,
    toolServer: options.toolServer,
    sourceDomains: options.sourceDomains ?? [],
    externalContentUsed: options.externalContentUsed ?? false,
    userConfirmed: options.userConfirmed ?? true,
    sourceTrustLevel: options.sourceTrustLevel ?? "trusted",
    parameterChangeReason: options.parameterChangeReason,
    originalParameterHash,
    currentParameterHash,
    originalProtectedParameters,
    originalPermissionScopes: options.originalPermissionScopes,
    currentPermissionScopes: options.currentPermissionScopes,
  };
}

export const MAGEN3_ENVIRONMENT_VARIABLES = {
  gatewayUrl: "MAGEN3_GATEWAY_URL",
  agentId: "MAGEN3_AGENT_ID",
  apiKey: "MAGEN3_API_KEY",
} as const;

export type Magen3Environment = Record<string, string | undefined>;

/**
 * Converts the public Gateway configuration into the API base URL expected by
 * the SDK. The canonical value is the base URL only. Known legacy endpoint
 * URLs are accepted and reduced to the same base URL for compatibility.
 */
export function normalizeMagen3GatewayUrl(value: string): string {
  const raw = value?.trim();
  if (!raw) throw new TypeError("gatewayUrl is required");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError("gatewayUrl must be an absolute http(s) URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TypeError("gatewayUrl must use http or https");
  }

  parsed.search = "";
  parsed.hash = "";
  const marker = parsed.pathname.toLowerCase().indexOf("/api/agent-gateway");
  if (marker >= 0) parsed.pathname = parsed.pathname.slice(0, marker) || "/";

  return parsed.toString().replace(/\/+$/, "");
}

/**
 * Reads the canonical public environment contract. Legacy API-key aliases are
 * accepted so existing beta integrations continue working during migration.
 */
export function magen3ClientOptionsFromEnv(env: Magen3Environment): Magen3ClientOptions {
  const gatewayUrl = env.MAGEN3_GATEWAY_URL?.trim();
  const agentId = env.MAGEN3_AGENT_ID?.trim();
  const apiKey = (
    env.MAGEN3_API_KEY ??
    env.MAGEN3_AGENT_KEY ??
    env.MAGEN3_AGENT_API_KEY
  )?.trim();

  const missing = [
    !gatewayUrl && "MAGEN3_GATEWAY_URL",
    !agentId && "MAGEN3_AGENT_ID",
    !apiKey && "MAGEN3_API_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new TypeError(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const timeout = Number(env.MAGEN3_TIMEOUT_MS ?? "15000");
  return {
    gatewayUrl: normalizeMagen3GatewayUrl(gatewayUrl!),
    agentId: agentId!,
    apiKey: apiKey!,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000,
    authMode: env.MAGEN3_AUTH_MODE === "bearer" ? "bearer" : "header",
  };
}

export interface Magen3ClientOptions {
  gatewayUrl: string;
  agentId: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  authMode?: "header" | "bearer";
}

export class Magen3Error extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status = 0, body?: unknown) {
    super(message);
    this.name = "Magen3Error";
    this.status = status;
    this.body = body;
  }
}

export class Magen3Client {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly authMode: "header" | "bearer";

  static fromEnv(env: Magen3Environment): Magen3Client {
    return new Magen3Client(magen3ClientOptionsFromEnv(env));
  }

  constructor(options: Magen3ClientOptions) {
    if (!options.gatewayUrl?.trim()) throw new TypeError("gatewayUrl is required");
    if (!options.agentId?.trim()) throw new TypeError("agentId is required");
    if (!options.apiKey?.trim()) throw new TypeError("apiKey is required");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new TypeError("A Fetch API implementation is required");
    this.baseUrl = normalizeMagen3GatewayUrl(options.gatewayUrl);
    this.agentId = options.agentId.trim();
    this.apiKey = options.apiKey.trim();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = fetchImpl;
    this.authMode = options.authMode ?? "header";
  }

  async verifyAgent(): Promise<Magen3Identity> {
    return this.request<Magen3Identity>(`/api/agent-gateway/me?agentId=${encodeURIComponent(this.agentId)}`, { method: "GET" });
  }

  async checkIntent(intent: Magen3Intent): Promise<Magen3IntentResponse> {
    if (!intent?.executionWalletAddress?.trim()) throw new TypeError("executionWalletAddress is required");
    if (!intent?.action?.type?.trim()) throw new TypeError("action.type is required");
    if (!intent?.action?.target?.trim()) throw new TypeError("action.target is required");
    return this.request<Magen3IntentResponse>("/api/agent-gateway/intents", {
      method: "POST",
      body: JSON.stringify({
        ...intent,
        agentId: this.agentId,
        walletAddress: intent.walletAddress ?? intent.executionWalletAddress,
      }),
    });
  }


  async getApproval(approvalOrAuditId: string): Promise<{ ok: boolean; approval: Magen3ApprovalRequest }> {
    const id = approvalOrAuditId?.trim();
    if (!id) throw new TypeError("approvalOrAuditId is required");
    return this.request<{ ok: boolean; approval: Magen3ApprovalRequest }>(`/api/agent-gateway/approvals/${encodeURIComponent(id)}?agentId=${encodeURIComponent(this.agentId)}`, { method: "GET" });
  }

  async reportX402Settlement(update: Magen3X402SettlementUpdate): Promise<Record<string, unknown>> {
    if (!update?.auditLogId?.trim()) throw new TypeError("auditLogId is required");
    if (!update?.requestFingerprint?.trim()) throw new TypeError("requestFingerprint is required");
    return this.request<Record<string, unknown>>("/api/agent-gateway/x402/settlements", {
      method: "POST",
      body: JSON.stringify({ ...update, agentId: this.agentId }),
    });
  }

  async reportExecutionReconciliation(update: Magen3ExecutionReconciliationUpdate): Promise<{ ok: boolean; reconciliation: Magen3ExecutionReconciliationRecord; auditLog?: Record<string, unknown> }> {
    if (!update?.auditLogId?.trim()) throw new TypeError("auditLogId is required");
    return this.request<{ ok: boolean; reconciliation: Magen3ExecutionReconciliationRecord; auditLog?: Record<string, unknown> }>("/api/agent-gateway/executions/reconcile", {
      method: "POST",
      body: JSON.stringify({ ...update, agentId: this.agentId }),
    });
  }

  async pollExecutionReconciliation(options: Magen3ExecutionReconciliationPollOptions): Promise<{ ok: boolean; reconciliation: Magen3ExecutionReconciliationRecord; auditLog?: Record<string, unknown> }> {
    if (!options?.auditLogId?.trim()) throw new TypeError("auditLogId is required");
    const prohibitedProviderField = Object.keys(options).find((key) => /^(?:rpcUrl|rpcEndpoint|providerUrl|endpoint)$/i.test(key));
    if (prohibitedProviderField) throw new TypeError(`${prohibitedProviderField} is not accepted; RPC endpoints are configured on the Magen3 backend`);
    return this.request<{ ok: boolean; reconciliation: Magen3ExecutionReconciliationRecord; auditLog?: Record<string, unknown> }>("/api/agent-gateway/executions/poll", {
      method: "POST",
      body: JSON.stringify({ ...options, agentId: this.agentId }),
    });
  }

  async requireAllowed(intent: Magen3Intent): Promise<Magen3IntentResponse> {
    const response = await this.checkIntent(intent);
    if (!isMagen3ExecutionApproved(response)) {
      throw new Magen3Error(`Magen3 did not authorize execution: ${getMagen3AgentMessage(response)}`, 403, response);
    }
    return response;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const authHeaders = this.authMode === "bearer"
      ? { Authorization: `Bearer ${this.apiKey}` }
      : { "x-magen3-agent-key": this.apiKey };
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Content-Type", "application/json");
      for (const [name, value] of Object.entries(authHeaders)) {
        if (value) headers.set(name, value);
      }
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
      const text = await response.text();
      let body: unknown = undefined;
      if (text) {
        try { body = JSON.parse(text); } catch { body = text; }
      }
      if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `Magen3 request failed with HTTP ${response.status}`;
        throw new Magen3Error(message, response.status, body);
      }
      return body as T;
    } catch (error) {
      if (error instanceof Magen3Error) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new Magen3Error(`Magen3 request timed out after ${this.timeoutMs}ms`);
      throw new Magen3Error(error instanceof Error ? error.message : "Magen3 request failed", 0, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
