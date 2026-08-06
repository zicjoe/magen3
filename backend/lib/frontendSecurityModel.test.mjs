import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/app/lib/securityModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const securityModel = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("security coverage reaches 100 only when every configured protection check passes", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    {
      status: "Active",
      type: "Trading Agent",
      executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"],
      apiKeyPreview: "mg3_live_…f91a",
      onboardingStatus: "complete",
      lastIntentAt: timestamp,
    },
    {
      status: "Active",
      maxTransaction: 25,
      dailyLimit: 100,
      approvalThreshold: 15,
      trustedContracts: ["contract-package-hash-example"],
      structuredRules: {
        lifecycleControlsEnabled: true,
        lifecycleControlMode: "Enforce",
        lifecycleRequireIntentId: true,
        lifecycleRequireIdempotencyKey: true,
        lifecycleRequireCreatedAt: true,
        lifecycleRequireExpiry: true,
        lifecyclePreventDuplicateFingerprint: true,
        instructionIntegrityEnabled: true,
        instructionIntegrityMode: "Review",
        requireGoalBindingForActions: ["Transfer", "Swap", "Contract Interaction"],
        requireUserConfirmationForExternalContent: true,
        allowedSourceDomains: ["trusted.example"],
        blockedSourceDomains: ["blocked.example"],
        externalContentHighRiskAction: "Review",
        allowParameterChangesAfterGoal: false,
        requireParameterChangeReason: true,
        toolIntegrityEnabled: true,
        toolIntegrityMode: "Review",
        approvedMcpServers: [{ id: "mcp-main", url: "https://mcp.example", manifestHash: "a".repeat(64) }],
        approvedTools: [{ serverId: "mcp-main", name: "wallet.transfer", manifestHash: "a".repeat(64), schemaHash: "b".repeat(64), permissionScopes: ["wallet:read"] }],
        requireTls: true,
        delegationControlsEnabled: true,
        delegationMode: "Review",
        requireExpiringDelegation: true,
        maximumDelegationLifetime: 3600,
        maximumDelegationDepth: 1,
        allowRedelegation: false,
        approvedDelegates: ["01" + "4".repeat(64)],
        blockedDelegates: [],
        revokedDelegationIds: [],
        unknownDelegateAction: "Review",
        requireScopeBinding: true,
        requireCryptographicDelegationAttestation: true,
        delegationUnavailableAction: "Review",
        rpcIntegrityEnabled: true,
        rpcIntegrityMode: "Review",
        approvedRpcEndpoints: ["https://node.testnet.casper.network/rpc|casper-testnet-primary|casper-test|casper-testnet|" + "a".repeat(64)],
        rpcIntegrityRequireTls: true,
        rpcIntegrityMaximumBlockAgeSeconds: 120,
        rpcIntegrityMinimumProviders: 1,
        rpcIntegrityMaximumHeightDifference: 5,
        rpcIntegrityDisagreementAction: "Block",
        rpcIntegrityUnavailableAction: "Review",
        rpcIntegrityRequireNetworkIdentity: true,
        rpcIntegrityAllowAutomaticFailover: false,
        feeSafetyEnabled: true,
        feeSafetyMode: "Review",
        feeSafetyMaximumNetworkFee: 5,
        feeSafetyMaximumGasPrice: 100,
        feeSafetyMaximumPriorityFee: 10,
        feeSafetyApprovedSponsors: ["magen3-relayer"],
        feeSafetyApprovedPaymasters: [],
        feeSafetySponsorshipUnavailableAction: "Review",
        feeSafetySponsoredBudget: 100,
        feeSafetyMaximumSponsoredOperations: 100,
        feeSafetyMaximumFailedSponsoredOperations: 3,
        feeSafetyLookbackSeconds: 86400,
        feeSafetyRequireSponsorshipExpiry: true,
        feeSafetyRequireSponsorEvidence: true,
        approvalWorkflowEnabled: true,
        approvalRequiredCount: 1,
        approvalAllowOwnerFallback: true,
        approvalApproverWallets: [],
        threatIntelligenceMode: "Review",
        oracleValidationMode: "Review",
        bridgeControlMode: "Review",
        bridgeAllowedProviders: ["Test Bridge"],
        bridgeAllowedSourceChains: ["casper-test"],
        bridgeAllowedDestinationChains: ["ethereum-sepolia"],
        bridgeAllowedAssets: ["CSPR"],
        tokenPermissionControlsEnabled: true,
        tokenPermissionMode: "Review",
        tokenPermissionUnknownSpenderAction: "Review",
        tokenPermissionUnlimitedApprovalAction: "Block",
        tokenPermissionMaxApprovalToTransactionRatio: 2,
        tokenPermissionMaxLifetimeSeconds: 3600,
        tokenPermissionApprovedSpenders: ["01" + "2".repeat(64)],
        tokenPermissionBlockedSpenders: [],
        tokenPermissionMaximumBatchSize: 10,
        privilegedActionControlsEnabled: true,
        privilegedActionMode: "Review",
        privilegedActionsRequiringReview: ["Mint", "Ownership Transfer", "Proxy Upgrade"],
        privilegedActionsBlocked: [],
        approvedAdministrators: ["01" + "3".repeat(64)],
        approvedImplementations: ["contract-package-hash-approved-implementation"],
        privilegedActionQuorumRules: { "Ownership Transfer": 2 },
        unknownPrivilegedAction: "Review",
        contractUpgradeControlsEnabled: true,
        contractUpgradeMode: "Review",
        contractUpgradeApprovedImplementations: ["contract-package-hash-approved-implementation"],
        contractUpgradeBlockedImplementations: [],
        contractUpgradeRequiresApproval: true,
        contractUpgradeQuorum: 2,
        contractUpgradeRequireCodeHash: true,
        contractUpgradeApprovedAdministrators: ["01" + "3".repeat(64)],
        contractUpgradeUnknownImplementationAction: "Review",
        contractArgumentControlsEnabled: true,
        contractArgumentMode: "Review",
        contractArgumentUnknownRuleAction: "Review",
        contractArgumentUnknownArgumentAction: "Block",
        contractArgumentRules: [{
          contract: "contract-package-hash-example",
          entryPoint: "transfer",
          requiredArgs: ["recipient"],
          allowedArgs: ["recipient"],
          argumentTypes: { recipient: "address" },
        }],
        emergencyControlsEnabled: true,
        automaticPauseEnabled: false,
        emergencyAutomaticPauseAction: "Blocked",
        emergencyPauseDurationSeconds: 3600,
        emergencyResumeRequiresApproval: false,
        emergencyResumeQuorum: 1,
      },
    },
    [{
      timestamp,
      decisionProofStatus: "recorded",
      moduleFindings: [
        { module: "Agent Instruction Integrity", status: "pass", severity: "info", rule: "Stable goal binding", message: "Goal-bound provenance passed." },
        { module: "Tool & MCP Integrity", status: "pass", severity: "info", rule: "Approved MCP server", message: "Approved server." },
        { module: "Delegation & Session Key Safety", status: "pass", severity: "info", rule: "Cryptographic delegation attestation", message: "Casper-signed delegation verified." },
        { module: "RPC & Chain Integrity", status: "pass", severity: "info", rule: "Network identity binding", message: "Approved provider matches the expected chain." },
        { module: "Gas Sponsorship & Fee Safety", status: "pass", severity: "info", rule: "Approved sponsor", message: "Sponsor and payer evidence match policy." },
        { module: "Wallet Validation", status: "pass", severity: "info", rule: "Valid execution wallet format", message: "Valid wallet." },
        { module: "Contract Validation", status: "pass", severity: "info", rule: "Approved contract", message: "Approved contract." },
        { module: "Execution Simulation", status: "pass", severity: "info", rule: "Payment budget format", message: "Payment preflight evaluated." },
        { module: "Execution Simulation", status: "unavailable", severity: "info", rule: "Stateful speculative execution", message: "Stateful simulation unavailable." },
        { module: "Execution Integrity", status: "pass", severity: "info", rule: "Intent ID replay prevention", message: "Fresh lifecycle intent." },
        { module: "Policy & Approval Controls", status: "warning", severity: "medium", rule: "Human approval quorum", message: "Exact-bound approval request created." },
        { module: "Threat Intelligence", status: "pass", severity: "info", rule: "Threat feed availability", message: "Fresh feed available." },
        { module: "Threat Intelligence", status: "pass", severity: "info", rule: "Known threat indicator match", message: "No exact match." },
        { module: "Oracle Validation", status: "pass", severity: "info", rule: "Oracle feed availability", message: "Fresh oracle feed available." },
        { module: "Oracle Validation", status: "pass", severity: "info", rule: "Oracle price deviation", message: "Price within policy." },
        { module: "Bridge Controls", status: "pass", severity: "info", rule: "Bridge route metadata", message: "Required bridge route metadata is present." },
        { module: "Token Permission Controls", status: "pass", severity: "info", rule: "Supported permission classification", message: "Supported token permission classification." },
        { module: "Privileged Action Controls", status: "pass", severity: "info", rule: "Supported privileged-action classification", message: "Supported privileged action classification." },
        { module: "Contract Upgrade Safety", status: "pass", severity: "info", rule: "Upgrade target binding", message: "Upgrade target is bound." },
        { module: "Contract Argument Policies", status: "pass", severity: "info", rule: "Configured contract argument rule", message: "Matched exact contract argument rule." },
        { module: "Emergency Circuit Breaker", status: "pass", severity: "info", rule: "Active emergency pause", message: "No active emergency pause applies." },
      ],
    }],
  );

  assert.equal(result.score, 100);
  assert.equal(result.label, "Strong foundation");
  assert.equal(result.recommendations.length, 0);
  assert.ok(result.checks.every((check) => check.passed));
});

test("execution-preflight applicability alone does not count as configured construction preflight", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    {
      status: "Active",
      type: "Trading Agent",
      executionCapabilities: ["Trading"],
      apiKeyPreview: "mg3_live_…f91a",
      onboardingStatus: "complete",
      lastIntentAt: timestamp,
    },
    {
      status: "Active",
      maxTransaction: 25,
      dailyLimit: 100,
      approvalThreshold: 15,
      trustedContracts: ["contract-package-hash-example"],
    },
    [{
      timestamp,
      decisionProofStatus: "recorded",
      moduleFindings: [
        { module: "Contract Validation", status: "pass", severity: "info", rule: "Approved contract", message: "Approved contract." },
        { module: "Execution Simulation", status: "pass", severity: "info", rule: "Execution preflight applicability", message: "Applicable only." },
        { module: "Execution Simulation", status: "unavailable", severity: "info", rule: "Stateful speculative execution", message: "Unavailable." },
      ],
    }],
  );

  const preflight = result.checks.find((check) => check.id === "execution-preflight");
  assert.equal(preflight.passed, false);
  assert.ok(result.recommendations.some((check) => check.id === "execution-preflight"));
});

test("security coverage is deterministic and explains missing controls", () => {
  const agent = {
    status: "Active",
    type: "Trading Agent",
    executionCapabilities: ["Trading", "dApp Interactions"],
    onboardingStatus: "complete",
  };

  const first = securityModel.calculateSecurityCoverage(agent, undefined, []);
  const second = securityModel.calculateSecurityCoverage(agent, undefined, []);

  assert.deepEqual(first, second);
  assert.ok(first.score < 40);
  assert.equal(first.label, "Limited coverage");
  assert.ok(first.recommendations.some((check) => check.id === "active-policy"));
  assert.ok(first.recommendations.some((check) => check.id === "contract-controls"));
  assert.ok(first.recommendations.some((check) => check.page === "intent-playground"));
});

test("stale or unavailable Threat Intelligence never counts toward coverage", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    { status: "Active", executionCapabilities: ["Wallet Management"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active", maxTransaction: 10, dailyLimit: 20, trustedContracts: ["target"], structuredRules: { threatIntelligenceMode: "Review" } },
    [{ timestamp, moduleFindings: [{ module: "Threat Intelligence", status: "unavailable", severity: "low", rule: "Threat feed availability", message: "Feed stale." }] }],
  );
  const check = result.checks.find((item) => item.id === "threat-intelligence");
  assert.equal(check.passed, false);
  assert.ok(result.recommendations.some((item) => item.id === "threat-intelligence"));
});


test("stale or unavailable Oracle Validation never counts toward coverage", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    { status: "Active", executionCapabilities: ["Trading"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active", maxTransaction: 10, dailyLimit: 20, approvalThreshold: 5, trustedContracts: ["target"], structuredRules: { oracleValidationMode: "Review" } },
    [{ timestamp, moduleFindings: [{ module: "Oracle Validation", status: "unavailable", severity: "low", rule: "Oracle feed availability", message: "Feed stale." }] }],
  );
  const check = result.checks.find((item) => item.id === "oracle-validation");
  assert.equal(check.passed, false);
  assert.ok(result.recommendations.some((item) => item.id === "oracle-validation"));
});


test("missing or incomplete Bridge Controls never count toward coverage", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    { status: "Active", executionCapabilities: ["dApp Interactions"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active", maxTransaction: 10, dailyLimit: 20, trustedContracts: ["target"], structuredRules: { bridgeControlMode: "Review" } },
    [{ timestamp, moduleFindings: [{ module: "Bridge Controls", status: "unavailable", severity: "medium", rule: "Bridge route metadata", message: "Route metadata missing." }] }],
  );
  const check = result.checks.find((item) => item.id === "bridge-controls");
  assert.equal(check.passed, false);
  assert.ok(result.recommendations.some((item) => item.id === "bridge-controls"));
});

test("Token Permission coverage requires deterministic configuration and an observed pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", executionCapabilities: ["Trading"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp };
  const policy = {
    status: "Active", maxTransaction: 10, dailyLimit: 20, approvalThreshold: 5, trustedContracts: ["target"],
    structuredRules: {
      tokenPermissionControlsEnabled: true,
      tokenPermissionMode: "Review",
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Block",
      tokenPermissionMaxApprovalToTransactionRatio: 2,
      tokenPermissionMaxLifetimeSeconds: 3600,
      tokenPermissionMaximumBatchSize: 10,
      tokenPermissionApprovedSpenders: ["01" + "2".repeat(64)],
      tokenPermissionBlockedSpenders: [],
    },
  };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "token-permission-controls").passed, false);

  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp,
    moduleFindings: [{ module: "Token Permission Controls", status: "pass", severity: "info", rule: "Supported permission classification", message: "Supported token permission classification." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "token-permission-controls").passed, true);
});

test("Privileged Action coverage requires deterministic configuration and an observed supported classification", () => {
  const timestamp = new Date().toISOString();
  const agent = {
    status: "Active",
    type: "Treasury Manager",
    executionCapabilities: ["Treasury Operations"],
    apiKeyPreview: "mg3_live_…f91a",
    onboardingStatus: "complete",
    lastIntentAt: timestamp,
  };
  const policy = {
    status: "Active",
    structuredRules: {
      privilegedActionControlsEnabled: true,
      privilegedActionMode: "Review",
      privilegedActionsRequiringReview: ["Ownership Transfer", "Proxy Upgrade"],
      privilegedActionsBlocked: [],
      approvedAdministrators: ["01" + "3".repeat(64)],
      approvedImplementations: ["contract-package-hash-approved"],
      privilegedActionQuorumRules: { "Ownership Transfer": 2 },
      unknownPrivilegedAction: "Review",
    },
  };

  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "privileged-action-controls").passed, false);

  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp,
    moduleFindings: [{ module: "Privileged Action Controls", status: "pass", severity: "info", rule: "Supported privileged-action classification", message: "Supported privileged action classification." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "privileged-action-controls").passed, true);
});

test("Contract Upgrade Safety coverage requires deterministic configuration and an observed target-bound pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", executionCapabilities: ["dApp Interactions"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp };
  const policy = {
    status: "Active",
    structuredRules: {
      contractUpgradeControlsEnabled: true,
      contractUpgradeMode: "Review",
      contractUpgradeApprovedImplementations: ["contract-package-hash-approved"],
      contractUpgradeBlockedImplementations: [],
      contractUpgradeQuorum: 2,
      contractUpgradeUnknownImplementationAction: "Review",
    },
  };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "contract-upgrade-safety").passed, false);
  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{ timestamp, moduleFindings: [{ module: "Contract Upgrade Safety", status: "pass", severity: "info", rule: "Upgrade target binding", message: "Bound upgrade." }] }]);
  assert.equal(observed.checks.find((item) => item.id === "contract-upgrade-safety").passed, true);
});



test("Contract Argument Policies coverage requires an exact configured rule and an observed pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", executionCapabilities: ["dApp Interactions"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp };
  const policy = {
    status: "Active",
    structuredRules: {
      contractArgumentControlsEnabled: true,
      contractArgumentMode: "Review",
      contractArgumentUnknownRuleAction: "Review",
      contractArgumentUnknownArgumentAction: "Block",
      contractArgumentRules: [{
        contract: "contract-package-hash-example",
        entryPoint: "transfer",
        requiredArgs: ["recipient"],
        allowedArgs: ["recipient", "amount"],
        argumentTypes: { recipient: "address", amount: "integer" },
      }],
    },
  };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "contract-argument-policies").passed, false);

  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp,
    moduleFindings: [{ module: "Contract Argument Policies", status: "pass", severity: "info", rule: "Configured contract argument rule", message: "Matched exact rule." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "contract-argument-policies").passed, true);
});

test("Integration Health surfaces Contract Argument Policy violations", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Contract Argument Policies", status: "fail", severity: "high", rule: "Blocked address argument", message: "Recipient is blocked." }] }],
    true,
  );
  assert.ok(health.checks.some((check) => check.label === "Contract Argument Policies" && check.status === "attention"));
  assert.notEqual(health.overall, "Healthy");
});

test("Emergency Controls coverage requires configuration and a Gateway pause-state evaluation", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", executionCapabilities: ["Treasury Operations"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp };
  const policy = { status: "Active", structuredRules: { emergencyControlsEnabled: true, emergencyAutomaticPauseAction: "Blocked", emergencyPauseDurationSeconds: 3600, emergencyResumeQuorum: 1 } };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "emergency-controls").passed, false);
  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{ timestamp, moduleFindings: [{ module: "Emergency Circuit Breaker", status: "pass", severity: "info", rule: "Active emergency pause", message: "No active pause." }] }]);
  assert.equal(observed.checks.find((item) => item.id === "emergency-controls").passed, true);
});

test("Integration Health surfaces active emergency pauses", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Emergency Circuit Breaker", status: "fail", severity: "critical", rule: "Active emergency pause", message: "Agent paused." }] }],
    true,
    [{ active: true, status: "Active", scopeType: "Agent", reason: "Incident response" }],
  );
  assert.ok(health.checks.some((check) => check.label === "Emergency Circuit Breaker" && check.status === "attention"));
  assert.notEqual(health.overall, "Healthy");
});

test("integration health never reports healthy when core services or configuration are missing", () => {
  const degraded = securityModel.deriveIntegrationHealth(
    { status: "Active" },
    undefined,
    [],
    false,
  );
  assert.equal(degraded.overall, "Degraded");
  assert.ok(degraded.checks.some((check) => check.label === "Gateway connectivity" && check.status === "unavailable"));

  const timestamp = new Date().toISOString();
  const healthy = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{
      timestamp,
      decision: "Allowed",
      decisionProofStatus: "recorded",
      moduleFindings: [{ module: "Wallet Validation", status: "pass", severity: "info", rule: "Valid execution wallet format", message: "Valid wallet." }],
    }],
    true,
  );
  assert.equal(healthy.overall, "Healthy");

  const tokenAttention = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Token Permission Controls", status: "fail", severity: "high", rule: "Blocked spender", message: "Blocked spender." }] }],
    true,
  );
  assert.ok(tokenAttention.checks.some((check) => check.label === "Token Permission Controls" && check.status === "attention"));

  const privilegedAttention = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Privileged Action Controls", status: "fail", severity: "critical", rule: "Consistent privileged-action classification", message: "Contradictory classification." }] }],
    true,
  );
  assert.ok(privilegedAttention.checks.some((check) => check.label === "Privileged Action Controls" && check.status === "attention"));
});

test("Organizational approval coverage requires named groups, deterministic rules, and an observed pass", () => {
  const timestamp = new Date().toISOString();
  const agent = {
    status: "Active",
    type: "Treasury Manager",
    executionCapabilities: ["Treasury Operations"],
    apiKeyPreview: "mg3_live_…f91a",
    onboardingStatus: "complete",
    lastIntentAt: timestamp,
  };
  const policy = {
    status: "Active",
    maxTransaction: 250,
    dailyLimit: 1000,
    approvalThreshold: 100,
    structuredRules: {
      reviewResolutionMode: "Human Governed",
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 3,
      approvalAllowOwnerFallback: false,
      approvalApproverWallets: [],
      approvalOrganizationalQuorumEnabled: true,
      approvalGroups: [
        { id: "treasury", role: "Treasury Approver", wallets: ["01" + "1".repeat(64), "01" + "2".repeat(64)] },
        { id: "security", role: "Security Approver", wallets: ["01" + "3".repeat(64)] },
      ],
      approvalTiers: [{ id: "high-value", minAmount: 1000, requiredGroups: [{ groupId: "treasury", approvals: 2 }, { groupId: "security", approvals: 1 }], requiredApprovals: 3 }],
      approvalOrganizationDefaults: {},
    },
  };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "organizational-approval").passed, false);

  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp,
    moduleFindings: [{ module: "Policy & Approval Controls", status: "pass", severity: "low", rule: "Organizational approval quorum", message: "Role quorum satisfied." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "organizational-approval").passed, true);
});

test("Integration Health separates autonomous remediation from human approval", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Review Required", decisionProofStatus: "recorded", moduleFindings: [{ module: "Policy & Approval Controls", status: "warning", severity: "medium", rule: "Autonomous review resolution", message: "Agent remediation required." }] }],
    true,
  );
  assert.ok(health.checks.some((check) => check.label === "Autonomous review resolution" && check.status === "pending"));
  assert.ok(health.checks.some((check) => check.label === "Human approval workflow" && check.status === "unknown"));
});

test("Integration Health exposes pending and failed organizational approval state", () => {
  const timestamp = new Date().toISOString();
  const pending = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Review Required", decisionProofStatus: "recorded", moduleFindings: [{ module: "Policy & Approval Controls", status: "warning", severity: "medium", rule: "Organizational approval quorum", message: "Security role pending." }] }],
    true,
  );
  assert.ok(pending.checks.some((check) => check.label === "Organizational approval quorum" && check.status === "pending"));

  const failed = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Review Required", decisionProofStatus: "recorded", moduleFindings: [{ module: "Policy & Approval Controls", status: "fail", severity: "high", rule: "Organizational approval quorum", message: "Approval expired." }] }],
    true,
  );
  assert.ok(failed.checks.some((check) => check.label === "Organizational approval quorum" && check.status === "attention"));
  assert.notEqual(failed.overall, "Healthy");
});


test("Instruction Integrity coverage requires deterministic configuration and an observed goal-bound pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", executionCapabilities: ["Wallet Management"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp };
  const policy = {
    status: "Active",
    structuredRules: {
      instructionIntegrityEnabled: true, instructionIntegrityMode: "Review",
      requireGoalBindingForActions: ["Transfer"], requireUserConfirmationForExternalContent: true,
      allowedSourceDomains: ["trusted.example"], blockedSourceDomains: ["blocked.example"],
      externalContentHighRiskAction: "Review", allowParameterChangesAfterGoal: false, requireParameterChangeReason: true,
    },
  };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "instruction-integrity").passed, false);
  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp, moduleFindings: [{ module: "Agent Instruction Integrity", status: "pass", severity: "info", rule: "Stable goal binding", message: "Goal binding passed." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "instruction-integrity").passed, true);
});

test("Integration Health surfaces Instruction Integrity violations", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Agent Instruction Integrity", status: "fail", severity: "critical", rule: "Blocked instruction source", message: "Blocked source." }] }],
    true,
  );
  assert.ok(health.checks.some((check) => check.label === "Instruction Integrity" && check.status === "attention"));
  assert.notEqual(health.overall, "Healthy");
});


test("Tool & MCP Integrity coverage requires approved configuration and an observed pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", type: "Custom Agent", executionCapabilities: ["Custom"], apiKeyPreview: "mg3…", onboardingStatus: "complete", lastIntentAt: timestamp };
  const base = { status: "Active", maxTransaction: 10, dailyLimit: 50, approvalThreshold: 5, trustedContracts: [], structuredRules: { toolIntegrityEnabled: true, toolIntegrityMode: "Review", approvedMcpServers: [{ id: "mcp-main" }], approvedTools: [{ serverId: "mcp-main", name: "custom.run" }], requireTls: true } };
  const missing = securityModel.calculateSecurityCoverage(agent, base, []);
  assert.ok(missing.checks.some((check) => check.id === "tool-mcp-integrity" && check.passed === false));
  const observed = securityModel.calculateSecurityCoverage(agent, base, [{ timestamp, moduleFindings: [{ module: "Tool & MCP Integrity", status: "pass", severity: "info", rule: "Approved tool", message: "Approved tool." }] }]);
  assert.ok(observed.checks.some((check) => check.id === "tool-mcp-integrity" && check.passed === true));
});

test("Integration Health surfaces Tool & MCP Integrity violations", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { id: "MAG-1", status: "Active", type: "Custom Agent", executionCapabilities: ["Custom"], apiKeyPreview: "mg3…", lastIntentAt: timestamp },
    { status: "Active", structuredRules: { toolIntegrityEnabled: true } },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Tool & MCP Integrity", status: "fail", severity: "critical", rule: "schema hash binding", message: "Schema changed." }] }],
    true,
  );
  assert.ok(health.checks.some((check) => check.label === "Tool & MCP Integrity" && check.status === "attention"));
});


test("Delegation Safety coverage requires bounded configuration and an observed cryptographic pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", type: "Wallet Assistant", executionCapabilities: ["Wallet Management"], apiKeyPreview: "mg3…", onboardingStatus: "complete", lastIntentAt: timestamp };
  const policy = {
    status: "Active",
    structuredRules: {
      delegationControlsEnabled: true,
      delegationMode: "Review",
      requireExpiringDelegation: true,
      maximumDelegationLifetime: 3600,
      maximumDelegationDepth: 1,
      allowRedelegation: false,
      approvedDelegates: ["01" + "4".repeat(64)],
      blockedDelegates: [],
      revokedDelegationIds: [],
      requireScopeBinding: true,
      requireCryptographicDelegationAttestation: true,
    },
  };

  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "delegation-session-keys").passed, false);

  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp,
    moduleFindings: [{ module: "Delegation & Session Key Safety", status: "pass", severity: "info", rule: "Cryptographic delegation attestation", message: "Signed delegation passed." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "delegation-session-keys").passed, true);
});

test("Integration Health surfaces Delegation & Session Key Safety violations", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { id: "MAG-1", status: "Active", type: "Wallet Assistant", executionCapabilities: ["Wallet Management"], apiKeyPreview: "mg3…", lastIntentAt: timestamp },
    { status: "Active", structuredRules: { delegationControlsEnabled: true } },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Delegation & Session Key Safety", status: "fail", severity: "critical", rule: "Delegation revocation status", message: "Delegation revoked." }] }],
    true,
  );
  assert.ok(health.checks.some((check) => check.label === "Delegation & Session Key Safety" && check.status === "attention"));
  assert.notEqual(health.overall, "Healthy");
});


test("RPC & Chain Integrity coverage requires approved configuration and an observed network-bound pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", type: "Wallet Assistant", executionCapabilities: ["Wallet Management"], apiKeyPreview: "mg3_live_…rpc", onboardingStatus: "complete", lastIntentAt: timestamp };
  const policy = { status: "Active", maxTransaction: 10, dailyLimit: 50, approvalThreshold: 5, trustedContracts: ["01" + "2".repeat(64)], structuredRules: {
    rpcIntegrityEnabled: true, rpcIntegrityMode: "Review", approvedRpcEndpoints: ["https://node.testnet.casper.network/rpc|primary|casper-test|casper-testnet|" + "a".repeat(64)],
    rpcIntegrityRequireTls: true, rpcIntegrityMaximumBlockAgeSeconds: 120, rpcIntegrityMinimumProviders: 1, rpcIntegrityMaximumHeightDifference: 5,
    rpcIntegrityDisagreementAction: "Block", rpcIntegrityUnavailableAction: "Review", rpcIntegrityRequireNetworkIdentity: true, rpcIntegrityAllowAutomaticFailover: false,
  } };
  const unobserved = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(unobserved.checks.find((check) => check.id === "rpc-chain-integrity")?.passed, false);
  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{ timestamp, moduleFindings: [{ module: "RPC & Chain Integrity", status: "pass", severity: "info", rule: "Network identity binding", message: "Network matched." }] }]);
  assert.equal(observed.checks.find((check) => check.id === "rpc-chain-integrity")?.passed, true);
});

test("Integration Health surfaces RPC & Chain Integrity disagreement", () => {
  const timestamp = new Date().toISOString();
  const health = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…rpc", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "RPC & Chain Integrity", status: "fail", severity: "critical", rule: "RPC network disagreement", message: "Providers disagree." }] }],
    true,
  );
  assert.ok(health.checks.some((check) => check.label === "RPC & Chain Integrity" && check.status === "attention"));
});

test("Market Risk Signals is presented honestly as Foundation Available", () => {
  assert.equal(securityModel.marketRiskSignalsMilestone.status, "Foundation Available");
  assert.match(securityModel.marketRiskSignalsMilestone.description, /no bundled production provider/i);
  const control = securityModel.PROTECTION_MODULE_CATALOG
    .flatMap((area) => area.controls || [])
    .find((item) => item.id === "asset-market-risk");
  assert.equal(control?.status, "Foundation Available");
});


test("Real Bridge Provider Integration is presented honestly as Foundation Available", () => {
  assert.equal(securityModel.realBridgeProviderIntegrationMilestone.status, "Foundation Available");
  assert.match(securityModel.realBridgeProviderIntegrationMilestone.description, /no mainnet, signing, or submission/i);
  const control = securityModel.PROTECTION_MODULE_CATALOG
    .flatMap((area) => area.controls || [])
    .find((item) => item.id === "bridge-provider-integration");
  assert.equal(control?.status, "Foundation Available");
  assert.match(control?.description || "", /Across testnet/i);
});
