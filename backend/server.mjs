import { createServer } from "node:http";
import { createStore } from "./store/index.mjs";
import { getCasperStatus } from "./casper/auditPayload.mjs";
import { getThreatIntelligenceSnapshot, summarizeThreatIntelligenceSnapshot } from "./lib/threatIntelligence.mjs";
import { getOracleValidationSnapshot, summarizeOracleValidationSnapshot } from "./lib/oracleValidation.mjs";
import { getComplianceControlsSnapshot, summarizeComplianceControlsSnapshot } from "./lib/complianceControls.mjs";
import { getRpcChainIntegrityStatus } from "./lib/rpcChainIntegrity.mjs";
import { getGasSponsorshipFeeSafetyStatus } from "./lib/gasSponsorshipFeeSafety.mjs";

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 8787);
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "*";

function send(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-magen3-agent-key",
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: "Route not found" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body");
    err.status = 400;
    throw err;
  }
}

function normalizeRpcUrl(value = "") {
  const rpcUrl = String(value || "https://node.testnet.casper.network/rpc").trim();
  return rpcUrl.endsWith("/rpc") ? rpcUrl : `${rpcUrl.replace(/\/$/, "")}/rpc`;
}

function extractSignedDeploy(candidate) {
  const signedDeploy = candidate?.signedDeploy ?? candidate;
  const deploy = signedDeploy?.deploy ?? signedDeploy;
  if (!deploy || typeof deploy !== "object") {
    const err = new Error("Signed Casper deploy JSON is required");
    err.status = 400;
    throw err;
  }

  const requiredFields = ["hash", "header", "payment", "session", "approvals"];
  const missingFields = requiredFields.filter((field) => !deploy[field]);
  if (missingFields.length > 0) {
    const err = new Error(`Invalid signed Casper deploy shape. Missing: ${missingFields.join(", ")}.`);
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(deploy.approvals) || deploy.approvals.length === 0) {
    const err = new Error("Signed Casper deploy must include approvals.");
    err.status = 400;
    throw err;
  }

  const invalidApproval = deploy.approvals.find((approval) =>
    !approval ||
    typeof approval !== "object" ||
    !String(approval.signer || "").trim() ||
    !String(approval.signature || "").trim()
  );
  if (invalidApproval) {
    const err = new Error("Signed Casper deploy approvals must use { signer, signature } entries.");
    err.status = 400;
    throw err;
  }

  return deploy;
}

function readCasperResultHash(result, deploy) {
  const rpcResult = result?.result || result;
  return (
    rpcResult?.deploy_hash ||
    rpcResult?.value?.deploy_hash ||
    rpcResult?.transaction_hash ||
    rpcResult?.value?.transaction_hash ||
    deploy.hash
  );
}

async function submitSignedDeployToCasper(body) {
  const deploy = extractSignedDeploy(body);
  const rpcUrl = normalizeRpcUrl(process.env.CASPER_RPC_URL);
  const submittedDeployHadApprovals = Array.isArray(deploy.approvals) && deploy.approvals.length > 0;
  const rpcPayload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "account_put_deploy",
    params: [deploy],
  };

  let response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcPayload),
    });
  } catch (cause) {
    const err = new Error(`Could not reach Casper RPC: ${cause?.message || "network request failed"}`);
    err.status = 502;
    err.casperRpcUrl = rpcUrl;
    err.submittedDeployHadApprovals = submittedDeployHadApprovals;
    throw err;
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.error) {
    const casperError = result?.error || {};
    const err = new Error(casperError.message || `Casper node rejected deploy: HTTP ${response.status}`);
    err.status = 502;
    err.details = casperError.data ?? casperError;
    err.casperRpcErrorCode = casperError.code;
    err.casperRpcErrorData = casperError.data;
    err.casperRpcUrl = rpcUrl;
    err.submittedDeployHadApprovals = submittedDeployHadApprovals;
    throw err;
  }

  const deployHash = readCasperResultHash(result, deploy);
  if (!deployHash) {
    const err = new Error("Casper node accepted the request but did not return a deploy hash");
    err.status = 502;
    err.casperRpcUrl = rpcUrl;
    err.submittedDeployHadApprovals = submittedDeployHadApprovals;
    throw err;
  }

  return {
    ok: true,
    deployHash,
    casper: {
      rpcUrl,
      network: process.env.CASPER_NETWORK || "casper-testnet",
      chainName: process.env.CASPER_CHAIN_NAME || "casper-test",
    },
    raw: result.result,
  };
}

function readAgentGatewayKey(req) {
  const authorization = req.headers.authorization || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerKey = req.headers["x-magen3-agent-key"] || "";
  const apiKey = bearer || headerKey;
  if (apiKey) return apiKey;
  const err = new Error("Agent Gateway API key is required");
  err.status = 401;
  throw err;
}

const store = await createStore();

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return send(res, 204, {});
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === "GET /api/health") {
      return send(res, 200, {
        ok: true,
        service: "magen3-api",
        network: "casper-testnet",
        version: "2.4.0",
        storage: store.mode,
        casper: getCasperStatus(),
        threatIntelligence: summarizeThreatIntelligenceSnapshot(await getThreatIntelligenceSnapshot()),
        oracleValidation: summarizeOracleValidationSnapshot(await getOracleValidationSnapshot()),
        complianceControls: summarizeComplianceControlsSnapshot(await getComplianceControlsSnapshot()),
        executionIntegrity: { status: "live", lifecycleReplay: true, canonicalFingerprinting: true, idempotency: true, retrySafety: true },
        approvalWorkflow: { status: "foundation-available", exactIntentBinding: true, quorum: true, organizationalQuorum: true, tierResolution: true, timedEscalation: true, executionDelays: true, executionWindows: true, expiry: true, rejection: true },
        emergencyControls: { status: "live", scopedEnforcement: true, automaticTriggers: true, expiry: true, authorizedResume: true, approvalGatedResume: true },
        tokenPermissionControls: { status: "live", classification: true, spenderPolicy: true, boundedAuthority: true, permitReplayProtection: true },
        privilegedActionControls: { status: "live", deterministicClassification: true, administratorPolicy: true, implementationPolicy: true, approvalBinding: true },
        instructionIntegrity: { status: "live", goalBinding: true, sourceProvenance: true, parameterBinding: true, externalContentConfirmation: true, permissionScopeContainment: true },
        toolMcpIntegrity: { status: "live", approvedServers: true, approvedTools: true, manifestAndSchemaBinding: true, tls: true, permissionScopeContainment: true, agentCapabilityBoundary: true },
        delegationSafety: { status: "foundation_available", casperAttestationVerification: true, scopeBinding: true, expiry: true, revocation: true, depth: true, amountAndFrequencyLimits: true },
        rpcChainIntegrity: getRpcChainIntegrityStatus(),
        gasSponsorshipFeeSafety: getGasSponsorshipFeeSafetyStatus(),

        contractUpgradeControls: {
          status: "Live",
          statusEndpoint: "GET /api/contract-upgrade-controls/status",
          purpose: "Prevent unauthorized, unexpected, or insufficiently reviewed contract implementation changes before wallet signing.",
          metadataPath: "action.contractUpgrade",
          deterministicChecks: [
            "Target contract, package, and network binding",
            "Current and requested implementation validation",
            "Approved and blocked implementation policy",
            "Optional implementation code-hash requirement",
            "Authorized upgrade administrator validation",
            "Configurable upgrade delay and execute-after enforcement",
            "Canonical protected-parameter fingerprint",
            "Exact Human Approval binding and configurable quorum"
          ],
          policyFields: {
            enabled: "structuredRules.contractUpgradeControlsEnabled",
            mode: "structuredRules.contractUpgradeMode: Observe | Review | Enforce",
            approvedImplementations: "structuredRules.contractUpgradeApprovedImplementations",
            blockedImplementations: "structuredRules.contractUpgradeBlockedImplementations",
            approval: "structuredRules.contractUpgradeRequiresApproval",
            quorum: "structuredRules.contractUpgradeQuorum",
            delay: "structuredRules.contractUpgradeDelaySeconds",
            codeHash: "structuredRules.contractUpgradeRequireCodeHash",
            administrators: "structuredRules.contractUpgradeApprovedAdministrators",
            unknownImplementation: "structuredRules.contractUpgradeUnknownImplementationAction: Warn | Review | Block"
          },
          securityBoundary: "Only unsigned metadata is evaluated. Existing Privileged Action Controls, Human Approval, and organizational quorum are reused rather than duplicated."
        },
        rpcChainIntegrityPolicy: {
          enabled: "structuredRules.rpcIntegrityEnabled",
          mode: "structuredRules.rpcIntegrityMode: Observe | Review | Enforce",
          approvedEndpoints: "structuredRules.approvedRpcEndpoints",
          tls: "structuredRules.rpcIntegrityRequireTls",
          freshness: "structuredRules.rpcIntegrityMaximumBlockAgeSeconds",
          providerQuorum: "structuredRules.rpcIntegrityMinimumProviders",
          heightTolerance: "structuredRules.rpcIntegrityMaximumHeightDifference",
          disagreement: "structuredRules.rpcIntegrityDisagreementAction: Warn | Review | Block",
          unavailable: "structuredRules.rpcIntegrityUnavailableAction: Warn | Review | Block",
          networkIdentity: "structuredRules.rpcIntegrityRequireNetworkIdentity",
          failover: "structuredRules.rpcIntegrityAllowAutomaticFailover"
        },
        contractArgumentControls: {
          status: "live",
          statusEndpoint: "GET /api/contract-argument-controls/status",
          exactContractAndEntryPointBinding: true,
          requiredAndAllowedArguments: true,
          typeAndNumericRules: true,
          addressBooleanAndEnumRules: true,
          exactParameterFingerprinting: true,
          approvalBinding: true
        },
        x402PaymentControls: { status: "foundation-available", supportedVersions: [2], supportedSchemes: ["exact"], settlementReporting: true },
        timestamp: new Date().toISOString(),
      });
    }


    if (route === "GET /api/casper/status") {
      return send(res, 200, { ok: true, casper: getCasperStatus() });
    }

    if (route === "GET /api/threat-intelligence/status") {
      const snapshot = await getThreatIntelligenceSnapshot();
      return send(res, 200, { ok: true, threatIntelligence: summarizeThreatIntelligenceSnapshot(snapshot) });
    }


    if (route === "GET /api/oracle-validation/status") {
      const snapshot = await getOracleValidationSnapshot();
      return send(res, 200, { ok: true, oracleValidation: summarizeOracleValidationSnapshot(snapshot) });
    }

    if (route === "GET /api/compliance-controls/status") {
      const snapshot = await getComplianceControlsSnapshot();
      return send(res, 200, { ok: true, complianceControls: summarizeComplianceControlsSnapshot(snapshot) });
    }

    if (route === "GET /api/execution-integrity/status") {
      return send(res, 200, {
        ok: true,
        executionIntegrity: {
          status: "live",
          protectionArea: "Execution Integrity",
          controls: {
            transactionPreflight: "live",
            lifecycleAndReplay: "live",
            settlementReconciliation: "foundation-available",
            statefulSimulation: "foundation-available",
            rpcIntegrity: "foundation-available",
            gasSponsorship: "foundation-available"
          },
          lifecycle: {
            canonicalFingerprinting: true,
            intentIds: true,
            idempotencyKeys: true,
            expiry: true,
            monotonicSequence: true,
            duplicateDetection: true,
            transactionHashReplay: true,
            retryAndReplacementReferences: true
          },
          securityBoundary: "Magen3 evaluates unsigned intent metadata before wallet signing and never receives private keys, mnemonics, wallet approvals, or transaction signatures."
        }
      });
    }

    if (route === "GET /api/rpc-chain-integrity/status") {
      return send(res, 200, { ok: true, rpcChainIntegrity: getRpcChainIntegrityStatus() });
    }

    if (route === "GET /api/gas-sponsorship-fee-safety/status") {
      return send(res, 200, { ok: true, gasSponsorshipFeeSafety: getGasSponsorshipFeeSafetyStatus() });
    }

    if (route === "GET /api/approval-workflow/status") {
      const walletAddress = String(url.searchParams.get("walletAddress") || "").trim();
      if (!walletAddress) {
        return send(res, 200, {
          ok: true,
          approvalWorkflow: {
            status: "foundation-available",
            protectionArea: "Policy & Approval Controls",
            exactIntentBinding: true,
            quorum: true,
            expiry: true,
            rejection: true,
            agentPolling: true,
            cryptographicApproverSignatures: "foundation-available",
            approvalEscalationAndOrganizationalQuorum: "live",
            namedApproverGroups: true,
            deterministicTierResolution: true,
            timedEscalation: true,
            executionDelayEnforcement: true,
            executionWindowEnforcement: true,
            challengeEndpoint: "POST /api/approvals/:approvalId/challenge",
            signatureAlgorithms: ["Ed25519", "Secp256k1"],
            challengeReplayProtection: true,
            exactResponseBinding: true,
            domainSeparation: "magen3.approval-response.v1",
            securityBoundary: "When enabled by policy, Magen3 verifies a one-time Casper Wallet message signature bound to the exact approval, reviewer, response, chain, nonce, and expiry. Magen3 stores a signature hash and verification evidence, not private keys or transaction signatures.",
            organizationalBoundary: "Organizational policies resolve immutable approval tiers, named role quotas, timed backup escalation, execution delays, and bounded signing windows. Agents may poll this state but cannot change it or submit reviewer responses."
          }
        });
      }
      return send(res, 200, { ok: true, approvalWorkflow: await store.approvalStatus(walletAddress) });
    }

    if (route === "GET /api/emergency-controls/status") {
      const walletAddress = String(url.searchParams.get("walletAddress") || "").trim();
      return send(res, 200, { ok: true, emergencyControls: await store.emergencyControlsStatus(walletAddress) });
    }

    if (route === "GET /api/instruction-integrity/status") {
      return send(res, 200, {
        ok: true,
        instructionIntegrity: {
          status: "live",
          protectionArea: "Agent Trust & Access",
          control: "Instruction Integrity",
          stableGoalBinding: true,
          originalUserGoalHash: true,
          deterministicProtectedParameterFingerprint: true,
          sourceDomainPolicy: true,
          externalContentConfirmation: true,
          blockedSourceEnforcement: true,
          x402SelfAuthorizationPrevention: true,
          toolPermissionScopeContainment: true,
          policyFields: {
            enabled: "structuredRules.instructionIntegrityEnabled",
            mode: "structuredRules.instructionIntegrityMode: Observe | Review | Enforce",
            goalActions: "structuredRules.requireGoalBindingForActions",
            externalConfirmation: "structuredRules.requireUserConfirmationForExternalContent",
            allowedDomains: "structuredRules.allowedSourceDomains",
            blockedDomains: "structuredRules.blockedSourceDomains",
            highRiskAction: "structuredRules.externalContentHighRiskAction: Warn | Review | Block",
            parameterChanges: "structuredRules.allowParameterChangesAfterGoal",
            changeReason: "structuredRules.requireParameterChangeReason"
          },
          limitation: "Magen3 verifies supplied provenance and exact deterministic bindings. It does not claim to detect every prompt-injection, social-engineering, or semantic-manipulation attack.",
          securityBoundary: "Only unsigned provenance metadata and hashes are accepted. Private keys, wallet signatures, raw signed transactions, and secret prompt contents are not required."
        }
      });
    }

    if (route === "GET /api/tool-mcp-integrity/status") {
      return send(res, 200, {
        ok: true,
        toolMcpIntegrity: {
          status: "live",
          protectionArea: "Agent Trust & Access",
          control: "Tool & MCP Integrity",
          approvedMcpServerAllowlist: true,
          approvedToolAllowlist: true,
          manifestHashBinding: true,
          schemaHashBinding: true,
          descriptionHashChangeDetection: true,
          versionChangeDetection: true,
          permissionScopeContainment: true,
          credentialScopeValidation: true,
          tlsRequirement: true,
          toolOriginBinding: true,
          agentCapabilityBoundary: true,
          policyFields: {
            enabled: "structuredRules.toolIntegrityEnabled",
            mode: "structuredRules.toolIntegrityMode: Observe | Review | Enforce",
            servers: "structuredRules.approvedMcpServers",
            tools: "structuredRules.approvedTools",
            manifest: "structuredRules.requireManifestHash",
            schema: "structuredRules.requireSchemaHash",
            tls: "structuredRules.requireTls",
            versionChanges: "structuredRules.allowToolVersionChanges",
            unknownTool: "structuredRules.unknownToolAction: Warn | Review | Block",
            permissionExpansion: "structuredRules.permissionExpansionAction: Warn | Review | Block"
          },
          limitation: "Magen3 verifies adapter-supplied identity, hashes, TLS, origin, version, and scopes. It does not certify arbitrary tool code or eliminate supply-chain risk.",
          securityBoundary: "Only unsigned tool metadata and hashes are accepted. Magen3 never receives MCP credentials, private keys, wallet signatures, raw signed transactions, or secret tool outputs."
        }
      });
    }

    if (route === "GET /api/delegation-safety/status") {
      return send(res, 200, {
        ok: true,
        delegationSafety: {
          status: "foundation_available",
          protectionArea: "Agent Trust & Access",
          control: "Delegation & Session Key Safety",
          casperAttestationVerification: true,
          supportedSignatureAlgorithms: ["Ed25519", "Secp256k1"],
          exactDelegationBinding: true,
          expirationAndLifetime: true,
          revocationPolicy: true,
          networkContractMethodAssetScopes: true,
          amountAndFrequencyLimits: true,
          delegationDepthAndRedelegation: true,
          sanitizedAuditEvidence: true,
          policyFields: {
            enabled: "structuredRules.delegationControlsEnabled",
            mode: "structuredRules.delegationMode: Observe | Review | Enforce",
            expiry: "structuredRules.requireExpiringDelegation",
            maximumLifetime: "structuredRules.maximumDelegationLifetime",
            maximumDepth: "structuredRules.maximumDelegationDepth",
            redelegation: "structuredRules.allowRedelegation",
            approvedDelegates: "structuredRules.approvedDelegates",
            blockedDelegates: "structuredRules.blockedDelegates",
            revokedDelegations: "structuredRules.revokedDelegationIds",
            unknownDelegate: "structuredRules.unknownDelegateAction: Warn | Review | Block",
            scopeBinding: "structuredRules.requireScopeBinding",
            attestation: "structuredRules.requireCryptographicDelegationAttestation",
            unavailable: "structuredRules.delegationUnavailableAction: Warn | Review | Block"
          },
          securityBoundary: "The Gateway accepts a Casper Wallet delegation signature only transiently for verification. Audit records retain the canonical attestation hash, signature hash, signer algorithm, and deterministic scope evidence—not private keys or raw signatures.",
          limitation: "Policy revocation and request-supplied revocation evidence are enforced immediately. Revocation performed only in an external wallet or smart-account system requires a trusted adapter or provider to update Magen3 policy/evidence before it can be detected."
        }
      });
    }

    if (route === "GET /api/token-permission-controls/status") {
      return send(res, 200, {
        ok: true,
        tokenPermissionControls: {
          status: "live",
          protectionArea: "Contract & Permission Safety",
          control: "Token Permissions",
          classification: true,
          ownerAndNetworkBinding: true,
          approvedAndBlockedSpenders: true,
          approvalAmountAndRatioLimits: true,
          unlimitedApprovalHandling: true,
          permitDeadlineAndNonce: true,
          exactParameterFingerprinting: true,
          replayProtection: true,
          nftOperatorAndBatchControls: true,
          batchItemAndAggregateBinding: true,
          approvalBinding: true,
          securityBoundary: "Magen3 accepts metadata and fingerprints only. It rejects permit signatures, wallet approvals, private keys, mnemonics, and raw signed transactions."
        }
      });
    }


    if (route === "GET /api/contract-upgrade-controls/status") {
      return send(res, 200, {
        ok: true,
        contractUpgradeControls: {
          status: "live",
          protectionArea: "Contract & Permission Safety",
          control: "Contract Upgrades",
          targetAndNetworkBinding: true,
          currentAndRequestedImplementationChecks: true,
          approvedAndBlockedImplementations: true,
          codeHashVerification: true,
          administratorAuthorization: true,
          upgradeDelayEnforcement: true,
          exactParameterFingerprinting: true,
          humanApprovalAndQuorum: true,
          securityBoundary: "Magen3 evaluates unsigned upgrade metadata before wallet signing. It never accepts private keys, administrator signatures, or raw signed upgrade transactions through the Agent Gateway."
        }
      });
    }


    if (route === "GET /api/contract-argument-controls/status") {
      return send(res, 200, {
        ok: true,
        contractArgumentControls: {
          status: "live",
          protectionArea: "Contract & Permission Safety",
          control: "Contract Arguments",
          exactContractAndEntryPointBinding: true,
          requiredArguments: true,
          allowedArguments: true,
          argumentTypeValidation: true,
          numericRanges: true,
          addressAllowlistsAndBlocklists: true,
          booleanRestrictions: true,
          enumRestrictions: true,
          unknownArgumentPolicy: true,
          exactParameterFingerprinting: true,
          humanApprovalBinding: true,
          policyFields: {
            enabled: "structuredRules.contractArgumentControlsEnabled",
            mode: "structuredRules.contractArgumentMode: Observe | Review | Enforce",
            unknownRule: "structuredRules.contractArgumentUnknownRuleAction: Warn | Review | Block",
            unknownArgument: "structuredRules.contractArgumentUnknownArgumentAction: Warn | Review | Block",
            rules: "structuredRules.contractArgumentRules"
          },
          securityBoundary: "Magen3 evaluates public unsigned runtime arguments before wallet signing. It never accepts private keys, signatures, wallet approvals, or raw signed transactions through this control."
        }
      });
    }

    if (route === "GET /api/privileged-action-controls/status") {
      return send(res, 200, {
        ok: true,
        privilegedActionControls: {
          status: "live",
          protectionArea: "Contract & Permission Safety",
          control: "Privileged Actions",
          supportedClassifications: ["Ownership Transfer", "Administrator Change", "Proxy Upgrade", "Implementation Change", "Role Grant", "Role Revoke", "Mint", "Burn", "Pause", "Unpause", "Freeze", "Emergency Withdrawal", "Treasury Withdrawal", "Oracle Replacement", "Fee Recipient Change", "Bridge Validator Change", "Permission Change"],
          explicitAdapterMetadata: true,
          deterministicMethodMap: true,
          contradictionDetection: true,
          approvedAdministrators: true,
          approvedImplementations: true,
          blockedAndReviewActions: true,
          actionSpecificQuorum: true,
          protectedParameterFingerprinting: true,
          exactApprovalBinding: true,
          securityBoundary: "Magen3 classifies only supported methods or explicit unsigned metadata. It never accepts private keys, wallet approvals, raw signed transactions, or administrator signatures through the pre-signing Gateway."
        }
      });
    }

    if (route === "GET /api/x402-payment-controls/status") {
      return send(res, 200, {
        ok: true,

        contractUpgradeControls: {
          status: "Live",
          statusEndpoint: "GET /api/contract-upgrade-controls/status",
          purpose: "Prevent unauthorized, unexpected, or insufficiently reviewed contract implementation changes before wallet signing.",
          metadataPath: "action.contractUpgrade",
          deterministicChecks: [
            "Target contract, package, and network binding",
            "Current and requested implementation validation",
            "Approved and blocked implementation policy",
            "Optional implementation code-hash requirement",
            "Authorized upgrade administrator validation",
            "Configurable upgrade delay and execute-after enforcement",
            "Canonical protected-parameter fingerprint",
            "Exact Human Approval binding and configurable quorum"
          ],
          policyFields: {
            enabled: "structuredRules.contractUpgradeControlsEnabled",
            mode: "structuredRules.contractUpgradeMode: Observe | Review | Enforce",
            approvedImplementations: "structuredRules.contractUpgradeApprovedImplementations",
            blockedImplementations: "structuredRules.contractUpgradeBlockedImplementations",
            approval: "structuredRules.contractUpgradeRequiresApproval",
            quorum: "structuredRules.contractUpgradeQuorum",
            delay: "structuredRules.contractUpgradeDelaySeconds",
            codeHash: "structuredRules.contractUpgradeRequireCodeHash",
            administrators: "structuredRules.contractUpgradeApprovedAdministrators",
            unknownImplementation: "structuredRules.contractUpgradeUnknownImplementationAction: Warn | Review | Block"
          },
          securityBoundary: "Only unsigned metadata is evaluated. Existing Privileged Action Controls, Human Approval, and organizational quorum are reused rather than duplicated."
        },
        x402PaymentControls: {
          status: "foundation-available",
          protocolVersion: 2,
          supportedVersions: [2],
          supportedSchemes: ["exact"],
          supportedRecipientFamilies: ["EVM", "Solana"],
          requestBinding: true,
          atomicAmountValidation: true,
          timeoutBinding: true,
          replayProtection: true,
          settlementReporting: true,
          settlementEndpoint: "/api/agent-gateway/x402/settlements",
          note: "Magen3 authorizes x402 payments and reconciles reported settlement state. It does not hold signing keys or operate a facilitator."
        }
      });
    }


    if (route === "GET /api/public-config") {
      const casper = getCasperStatus();
      const [threatIntelligence, oracleValidation, complianceControls] = await Promise.all([
        getThreatIntelligenceSnapshot().then(summarizeThreatIntelligenceSnapshot),
        getOracleValidationSnapshot().then(summarizeOracleValidationSnapshot),
        getComplianceControlsSnapshot().then(summarizeComplianceControlsSnapshot),
      ]);
      return send(res, 200, {
        ok: true,
        service: "magen3-api",
        apiBaseUrl: process.env.PUBLIC_API_BASE_URL || "",
        casper,
        product: {
          name: "Magen3 Platform",
          liveProtectionSystem: "Agent Shield",
          positioning: "A modular execution firewall for autonomous blockchain agents",
          decisionModel: ["Allowed", "Blocked", "Review Required"],
          liveProtectionModules: ["Identity and Authentication", "Agent Instruction Integrity", "Tool & MCP Integrity", "Delegation & Session Key Safety", "Policy Enforcement", "Emergency Circuit Breaker", "Approval Escalation & Organizational Quorum", "Wallet Validation", "Contract Validation", "Risk Assessment", "Execution Integrity"],
          foundationProtectionModules: ["Human Approval & Quorum", "RPC & Chain Integrity", "Gas Sponsorship & Fee Safety", "Execution Simulation", "Threat Intelligence", "Oracle Validation", "Bridge Controls", "Compliance Controls", "x402 Payment Controls"],
        },
        threatIntelligence,
        oracleValidation,
        complianceControls,
        gateway: {
          endpoint: "/api/agent-gateway/intents",
          verifyEndpoint: "/api/agent-gateway/me",
          emergencyControlsStatusEndpoint: "/api/emergency-controls/status",
          rpcChainIntegrityStatusEndpoint: "/api/rpc-chain-integrity/status",
          gasSponsorshipFeeSafetyStatusEndpoint: "/api/gas-sponsorship-fee-safety/status",
          emergencyPauseManagementEndpoints: ["/api/emergency-pauses", "/api/emergency-pauses/:id/resume"],
          authRequired: true,
          decisionModel: "Allowed | Blocked | Review Required",
          executionRule: "External agents may request wallet signing only after Magen3 returns Allowed, or after an exact-bound Review Required approval reaches Approved before expiry."
        }
      });
    }

    if (route === "POST /api/casper/send-deploy") {
      const body = await readJson(req);
      return send(res, 200, await submitSignedDeployToCasper(body));
    }



    if (route === "GET /api/agent-gateway/spec") {
      return send(res, 200, {
        ok: true,
        name: "Magen3 Agent Gateway API",
        purpose: "External agents submit structured blockchain execution intents to Agent Shield before wallet signing or contract execution.",
        platform: "Magen3 Platform",
        protectionSystem: "Agent Shield",
        authRequired: true,
        verifyEndpoint: "GET /api/agent-gateway/me?agentId=YOUR_AGENT_ID",
        endpoint: "POST /api/agent-gateway/intents",
        identityModel: "External agents identify with agentId plus x-magen3-agent-key or Authorization Bearer. The request wallet is the execution wallet and does not need to match the Magen3 owner wallet.",
        requestShape: {
          source: "external-agent-name",
          agentId: "YOUR_AGENT_ID",
          walletAddress: "Casper Ed25519 or Secp256k1 public key",
          executionWalletAddress: "Casper Ed25519 or Secp256k1 public key",
          goal: "Transfer funds to an approved wallet safely",
          reason: "User strategy asks for a policy-checked transfer",
          action: {
            type: "Transfer | Swap | Deposit to Vault | Contract Interaction | Bridge | x402 Payment",
            amount: 5,
            asset: "CSPR",
            target: "Casper wallet identifier, Contract Hash, or Package Hash",
            targetType: "Wallet Address | Trusted Contract | Unknown Contract | Bridge Contract",
            contractIdentifierType: "Contract Hash | Package Hash (required for ambiguous hash- identifiers)",
            entryPoint: "Required for contract-call actions",
            contractVersion: "Optional positive integer for Package Hash calls",
            chainName: process.env.CASPER_CHAIN_NAME || "casper-test",
            instructionIntegrity: {
              goalId: "Stable identifier for the originating user goal",
              originalUserGoalHash: "SHA-256 hash of the original user goal; do not send private prompt contents",
              initiatedBy: "user | agent | tool | external-content | system",
              intentSource: "user | webpage | email | document | tool-output | system",
              toolName: "Optional approved tool name",
              toolServer: "Optional tool or MCP server identifier",
              sourceDomains: ["trusted.example"],
              externalContentUsed: false,
              userConfirmed: true,
              sourceTrustLevel: "trusted | verified | untrusted | unknown",
              parameterChangeReason: "Required when protected parameters changed and policy permits changes",
              originalParameterHash: "SHA-256 fingerprint captured at original goal binding",
              currentParameterHash: "Optional client-computed SHA-256 fingerprint; server recomputes and verifies it",
              originalPermissionScopes: ["read"],
              currentPermissionScopes: ["read"]
            },
            delegation: {
              delegationId: "Stable unique delegation identifier",
              delegatingWallet: "Casper Ed25519 or Secp256k1 public key that grants authority",
              delegate: "Approved delegate identity",
              sessionKey: "Optional Casper session public key",
              allowedNetworks: ["casper-test"],
              allowedContracts: ["contract-package-hash-..."],
              allowedMethods: ["Transfer"],
              allowedAssets: ["CSPR"],
              nativeAmountLimit: 25,
              tokenAmountLimits: { "CSPR": 25 },
              maxTransactionAmount: 25,
              maxFrequency: 10,
              validFrom: "ISO-8601 timestamp",
              expiresAt: "ISO-8601 timestamp",
              revocationStatus: "Active | Revoked",
              delegationDepth: 0,
              redelegationAllowed: false,
              nonce: "Unique attestation nonce",
              chainName: "casper-test",
              attestationHash: "SHA-256 of the canonical Magen3 delegation message",
              attestationSignature: "Transient Casper Wallet message signature; verified and not persisted raw"
            },
            rpcIntegrity: {
              expectedChainName: "casper-test",
              expectedNetworkIdentifier: "casper-testnet",
              expectedGenesisHash: "Optional 64-character chain fingerprint",
              selectedEndpoint: "https://approved-rpc.example/rpc",
              selectedProviderId: "provider-primary",
              providerObservations: [{
                providerId: "provider-primary",
                endpoint: "https://approved-rpc.example/rpc",
                chainName: "casper-test",
                networkIdentifier: "casper-testnet",
                genesisHash: "64-character chain fingerprint",
                tls: true,
                synced: true,
                latestBlockHeight: 123456,
                latestBlockTimestamp: "ISO-8601 timestamp",
                responseTimestamp: "ISO-8601 timestamp",
                timedOut: false,
                rateLimited: false,
                speculative: false,
                transactionStatusHash: "Optional 64-character status hash",
                contractStateHash: "Optional 64-character state hash"
              }],
              automaticFailoverUsed: false,
              failoverFrom: "Optional prior approved endpoint",
              failoverReason: "Required when automatic failover was used"
            },
            feeSafety: {
              chainFamily: "Casper | EVM | Other",
              chainName: "Exact action network",
              estimatedGas: "Optional trusted estimate",
              gasLimit: "Optional proposed gas limit",
              gasPrice: "EVM-only gas price",
              priorityFee: "EVM-only priority fee",
              maximumFee: "Maximum fee charged by the constructed transaction",
              networkFee: "Normalized fee amount in the declared unit",
              unit: "CSPR | motes | wei | gwei | native",
              sponsor: "Approved sponsor or relayer identifier",
              paymaster: "EVM-only approved Paymaster address",
              sponsorshipId: "Bounded sponsorship identifier",
              sponsorshipExpiry: "ISO-8601 expiry",
              sponsorshipScopes: ["Transfer"],
              sponsorSignatureHash: "SHA-256 evidence hash only; never the raw signature",
              expectedPayer: "Expected payer identity",
              actualPayer: "Payer encoded by the constructed transaction",
              sponsored: true,
              sponsorshipAvailable: true
            },
            preflight: {
              paymentAmountMotes: "Optional positive integer string for the proposed payment budget",
              gasPriceTolerance: "Optional positive integer for Casper 2.x transaction construction",
              ttl: "Optional duration such as 30m, 1h, or milliseconds",
              timestamp: "Optional ISO-8601 transaction timestamp",
              slippageBps: "Optional swap slippage in basis points; structure is validated but no policy maximum is enforced yet",
              expectedOutput: "Optional quoted swap output",
              minimumReceived: "Optional minimum swap output; must not exceed expectedOutput",
              runtimeArgs: "Optional JSON object summarizing contract runtime arguments",
              transactionHash: "Optional 64-character transaction hash after construction"
            }
,
            oracle: {
              baseAsset: "Required for price-sensitive validation, for example CSPR",
              quoteAsset: "Required quote asset, for example USD or USDC",
              executionPrice: "Proposed execution price in quote units per base unit; can be derived from expectedOutput / amount",
              quoteTimestamp: "ISO-8601 time when the execution quote was produced"
            },
            bridge: {
              sourceChain: "Source chain identifier, normally casper-test for the current Magen3 deployment",
              destinationChain: "Destination chain identifier, for example ethereum-sepolia",
              provider: "Canonical bridge provider or adapter name",
              routeId: "Provider-issued route or quote identifier",
              destinationAddress: "Recipient address on the destination chain",
              asset: "Asset being bridged",
              feeAmount: "Optional bridge fee in asset units",
              feeBps: "Optional bridge fee in basis points",
              expectedOutput: "Quoted destination output",
              minimumReceived: "Minimum acceptable destination output",
              quoteTimestamp: "ISO-8601 quote creation time",
              quoteExpiresAt: "ISO-8601 route expiry time",
              sourceConfirmations: "Source-chain confirmation requirement declared by the route",
              destinationConfirmations: "Destination-chain confirmation requirement declared by the route"
            },
            compliance: {
              originatorJurisdiction: "Two-letter jurisdiction code; do not submit names or identity documents",
              beneficiaryJurisdiction: "Two-letter jurisdiction code",
              counterpartyType: "VASP | Self-hosted Wallet | Organization | Individual",
              originatorAttestation: {
                status: "Verified | Pending | Rejected | Expired",
                provider: "Approved provider label",
                reference: "Opaque verification reference",
                issuedAt: "ISO-8601",
                expiresAt: "ISO-8601"
              },
              beneficiaryAttestation: {
                status: "Verified | Pending | Rejected | Expired",
                provider: "Approved provider label",
                reference: "Opaque verification reference",
                issuedAt: "ISO-8601",
                expiresAt: "ISO-8601"
              },
              travelRule: {
                status: "Complete | Incomplete | Not Required",
                reference: "Opaque workflow reference",
                dataHash: "Optional 32-byte hash"
              },
              screening: {
                status: "Clear | Match | Review | Unavailable",
                provider: "Approved screening provider",
                reference: "Opaque screening reference",
                screenedAt: "ISO-8601"
              },
              riskRating: "Low | Medium | High | Critical",
              originatorVaspId: "Optional opaque VASP identifier",
              beneficiaryVaspId: "Optional opaque VASP identifier"
            }

          }
        },
        walletValidation: {
          status: "Live",
          executionWallet: "Required signing public key; account hashes are not accepted as signing wallets",
          transferTargetType: "Wallet Address",
          destinationFormats: ["Ed25519 public key", "Secp256k1 public key", "account-hash"],
          checks: [
            "Execution wallet format",
            "Destination format and classification",
            "Exact self-transfer prevention",
            "Approved wallet destination",
            "Maximum transaction amount",
            "Daily wallet spending limit",
            "Human-review threshold"
          ]
        },
        contractValidation: {
          status: "Live",
          checks: [
            "Contract target classification",
            "Contract Hash or Package Hash structure",
            "Contract/package type consistency",
            "Contract entry-point structure",
            "Package-version semantics",
            "Casper chain-name consistency when supplied",
            "Blocked-contract enforcement",
            "Approved-contract enforcement",
            "Optional policy entry-point allowlist"
          ],
          trustRule: "targetType labels never grant trust; the exact contract identifier must be approved by policy",
          policyFields: {
            approvedContracts: "Existing trustedContracts list",
            blockedContracts: "structuredRules.blockedContracts",
            allowedEntryPoints: "structuredRules.allowedEntryPoints"
          }
        },
        executionSimulation: {
          status: "Foundation Available",
          preSigningBoundary: "The Gateway accepts high-level intent metadata only. It rejects wallet signing material, transaction approvals or signatures, private keys, and raw signed transactions. Public contract arguments remain allowed inside runtimeArgs.",
          deterministicChecks: [
            "Positive amounts for value-bearing actions",
            "Payment budget and gas-price tolerance structure",
            "Transaction TTL and timestamp structure",
            "Transaction freshness when timestamp and TTL are supplied",
            "Transaction-hash structure when supplied",
            "Swap slippage and quote-bound consistency",
            "Contract runtime-argument object structure"
          ],
          statefulSimulation: "Unavailable in the current pre-signing Gateway. Casper speculative execution requires a constructed transaction or deploy and is disabled by default on nodes.",
          decisionRule: "Malformed supplied preflight data can block or require review; omitted legacy metadata remains backward compatible and does not silently count as full simulation."
        },
        threatIntelligence: {
          status: "Foundation Available",
          statusEndpoint: "GET /api/threat-intelligence/status",
          matching: "Exact normalized matching for Casper execution wallets, wallet destinations, account hashes, Contract Hashes, and Package Hashes.",
          feedSources: ["THREAT_INTELLIGENCE_FEED_JSON", "THREAT_INTELLIGENCE_FEED_PATH", "THREAT_INTELLIGENCE_FEED_URL"],
          policyFields: {
            mode: "structuredRules.threatIntelligenceMode: Observe | Review | Enforce",
            minimumConfidence: "structuredRules.threatIntelligenceMinConfidence: 0-100",
            unavailableAction: "structuredRules.threatIntelligenceUnavailableAction: Warn | Review | Block"
          },
          decisionRule: "A configured feed produces deterministic exact-match findings. Feed absence or staleness is reported as unavailable and never counted as a pass. No third-party reputation provider is bundled or falsely claimed."
        },
        executionIntegrity: {
          status: "Live with Foundation controls",
          statusEndpoint: "GET /api/execution-integrity/status",
          purpose: "Protect the complete unsigned transaction lifecycle from stale authorization, duplicate submission, replay, parameter mutation, and unsafe retries before wallet signing.",
          deterministicChecks: [
            "Canonical SHA-256 fingerprint of protected intent parameters",
            "Unique per-agent intent ID",
            "Idempotency key reuse and parameter mutation",
            "Creation time, expiry, maximum age, and maximum lifetime",
            "Optional monotonic agent sequence",
            "Duplicate fingerprint detection inside a policy replay window",
            "Transaction-hash replay",
            "Retry and replacement references bound to prior Magen3 audits",
            "Retry prevention while prior execution is pending, uncertain, or confirmed",
            "Maximum retry attempts"
          ],
          requestFields: "action.lifecycle: intentId, idempotencyKey, sequence, createdAt, expiresAt, retryOf, replacementOf, attempt, intentFingerprint",
          decisionRule: "New policies can require lifecycle metadata and enforce exact-once authorization. Legacy policies remain non-breaking until operators explicitly enable strict duplicate-fingerprint enforcement."
        },
        humanApproval: {
          status: "Foundation Available",
          statusEndpoint: "GET /api/approval-workflow/status",
          agentPollingEndpoint: "GET /api/agent-gateway/approvals/:approvalOrAuditId?agentId=YOUR_AGENT_ID",
          reviewerQueueEndpoint: "GET /api/approvals?walletAddress=CASPER_PUBLIC_KEY",
          reviewerChallengeEndpoint: "POST /api/approvals/:approvalId/challenge",
          reviewerResponseEndpoint: "POST /api/approvals/:approvalId/respond",
          purpose: "Turn configured Review Required decisions into exact-intent single or quorum approval workflows before wallet signing.",
          deterministicChecks: [
            "SHA-256 binding over agent, action, amount, target, execution wallet, policy, and original intent",
            "Distinct eligible approver wallets",
            "Single or quorum requirement",
            "Approval expiry",
            "Duplicate response prevention",
            "Optional separation of requester and approver",
            "Required rejection comments",
            "Execution confirmation rejection before completed unexpired approval",
            "Optional one-time Casper Wallet reviewer signature verification with nonce, expiry, exact-response binding, chain binding, and domain separation"
          ],
          policyFields: {
            enabled: "structuredRules.approvalWorkflowEnabled",
            mode: "structuredRules.approvalWorkflowMode: Single | Quorum",
            requiredCount: "structuredRules.approvalRequiredCount: 1-10",
            approvers: "structuredRules.approvalApproverWallets",
            expiry: "structuredRules.approvalExpiryMinutes",
            ownerFallback: "structuredRules.approvalAllowOwnerFallback",
            separationOfDuties: "structuredRules.approvalSeparationOfDuties",
            rejectionComment: "structuredRules.approvalRequireRejectComment",
            requireSignature: "structuredRules.requireCryptographicReviewerSignature",
            signatureLifetimeSeconds: "structuredRules.approvalSignatureLifetimeSeconds: 30-1800",
            reviewerChainBinding: "structuredRules.requireReviewerChainBinding",
            approvalDomainSeparation: "structuredRules.requireApprovalDomainSeparation",
            signatureChainName: "structuredRules.approvalSignatureChainName"
          },
          securityBoundary: "Signature-enabled policies require an authorized Casper Wallet account to sign a one-time message bound to the exact approval, reviewer, response, nonce, chain, domain, and expiry. Magen3 verifies Ed25519 or Secp256k1 and stores only signature hashes plus verification evidence. Approval permits progression only to the existing human-controlled wallet signing boundary and remains Foundation Available until deployed browser verification is completed."
        },
        oracleValidation: {
          status: "Foundation Available",
          statusEndpoint: "GET /api/oracle-validation/status",
          purpose: "Compare price-sensitive intents with a configured freshness-checked multi-source oracle feed before wallet signing.",
          feedSources: ["ORACLE_VALIDATION_FEED_JSON", "ORACLE_VALIDATION_FEED_PATH", "ORACLE_VALIDATION_FEED_URL"],
          deterministicChecks: [
            "Asset-pair and execution-price metadata",
            "Feed freshness and pair availability",
            "Minimum independent source quorum",
            "Minimum confidence",
            "Maximum source spread",
            "Execution quote freshness",
            "Maximum deviation from the median reference price"
          ],
          policyFields: {
            mode: "structuredRules.oracleValidationMode: Observe | Review | Enforce",
            maximumAge: "structuredRules.oracleValidationMaxAgeSeconds",
            maximumDeviation: "structuredRules.oracleValidationMaxDeviationBps",
            maximumSourceSpread: "structuredRules.oracleValidationMaxSourceSpreadBps",
            minimumConfidence: "structuredRules.oracleValidationMinConfidence",
            minimumSources: "structuredRules.oracleValidationMinSources",
            unavailableAction: "structuredRules.oracleValidationUnavailableAction: Warn | Review | Block"
          },
          decisionRule: "A configured feed can produce deterministic pass, review, or block findings. No oracle provider is bundled, and an unavailable feed never counts as a pass."
        },
        bridgeControls: {
          status: "Foundation Available",
          purpose: "Evaluate bridge-route metadata, approved providers, source and destination chains, assets, route freshness, fees, destination-address structure, and finality requirements before wallet signing.",
          supportedDestinationFormats: ["Casper signing public key", "Casper account-hash", "EVM 20-byte address"],
          deterministicChecks: [
            "Required bridge route metadata",
            "Route identifier and provider structure",
            "Approved provider and source/destination chain lists",
            "Explicitly blocked destination chains",
            "Approved bridge assets and maximum amount",
            "Maximum bridge fee",
            "Expected-output and minimum-received consistency",
            "Quote freshness and expiry",
            "Destination-chain address format for Casper and EVM chains",
            "Source and destination confirmation requirements"
          ],
          policyFields: {
            mode: "structuredRules.bridgeControlMode: Observe | Review | Enforce",
            unavailableAction: "structuredRules.bridgeControlUnavailableAction: Warn | Review | Block",
            allowedProviders: "structuredRules.bridgeAllowedProviders",
            allowedSourceChains: "structuredRules.bridgeAllowedSourceChains",
            allowedDestinationChains: "structuredRules.bridgeAllowedDestinationChains",
            blockedDestinationChains: "structuredRules.bridgeBlockedDestinationChains",
            allowedAssets: "structuredRules.bridgeAllowedAssets",
            maximumAmount: "structuredRules.bridgeMaxAmount",
            maximumFee: "structuredRules.bridgeMaxFeeBps",
            maximumQuoteAge: "structuredRules.bridgeMaxQuoteAgeSeconds",
            requireExpiry: "structuredRules.bridgeRequireQuoteExpiry",
            sourceConfirmations: "structuredRules.bridgeMinSourceConfirmations",
            destinationConfirmations: "structuredRules.bridgeMinDestinationConfirmations"
          },
          decisionRule: "Bridge Controls can deterministically pass, require review, or block when a bridge adapter supplies complete route metadata. It does not certify provider solvency, destination-chain liveness, or cross-chain message delivery."
        },
        complianceControls: {
          status: "Foundation Available",
          statusEndpoint: "GET /api/compliance-controls/status",
          purpose: "Evaluate non-sensitive compliance attestations, jurisdiction policy, counterparty classification, Travel Rule evidence, sanctions-screening evidence, and exact configured-feed matches before wallet signing.",
          privacyBoundary: "The Gateway rejects raw personal identity data. Submit only statuses, two-letter jurisdiction codes, provider labels, opaque references, VASP identifiers, and hashes.",
          feedSources: ["COMPLIANCE_CONTROLS_FEED_JSON", "COMPLIANCE_CONTROLS_FEED_PATH", "COMPLIANCE_CONTROLS_FEED_URL"],
          deterministicChecks: [
            "Originator and beneficiary attestation status, provider, reference, freshness, and expiry",
            "Allowed, review, and blocked jurisdiction policy",
            "Allowed counterparty types",
            "Travel Rule completion evidence above a policy threshold",
            "Maximum compliance risk rating",
            "Current sanctions-screening attestation",
            "Exact wallet, account-hash, contract, package, bridge-destination, and VASP identifier matches",
            "Warn, Review, or Block behavior when required screening is unavailable"
          ],
          policyFields: {
            enabled: "structuredRules.complianceControlsEnabled",
            mode: "structuredRules.complianceControlMode: Observe | Review | Enforce",
            unavailableAction: "structuredRules.complianceUnavailableAction: Warn | Review | Block",
            requiredActions: "structuredRules.complianceRequiredActions",
            requireOriginator: "structuredRules.complianceRequireOriginatorAttestation",
            requireBeneficiary: "structuredRules.complianceRequireBeneficiaryAttestation",
            requireTravelRule: "structuredRules.complianceRequireTravelRule",
            travelRuleThreshold: "structuredRules.complianceTravelRuleThreshold",
            requireSanctionsScreening: "structuredRules.complianceRequireSanctionsScreening",
            allowedJurisdictions: "structuredRules.complianceAllowedJurisdictions",
            blockedJurisdictions: "structuredRules.complianceBlockedJurisdictions",
            reviewJurisdictions: "structuredRules.complianceReviewJurisdictions",
            allowedCounterpartyTypes: "structuredRules.complianceAllowedCounterpartyTypes",
            acceptedProviders: "structuredRules.complianceAcceptedProviders",
            maximumRiskRating: "structuredRules.complianceMaximumRiskRating"
          },
          decisionRule: "Configured exact matches and rejected attestations can block; missing required evidence can warn, require review, or block according to policy. This module provides technical controls and evidence handling, not legal advice or a guarantee of regulatory compliance."
        },
        emergencyCircuitBreaker: {
          status: "Live",
          statusEndpoint: "GET /api/emergency-controls/status?walletAddress=PUBLIC_OWNER_WALLET",
          listEndpoint: "GET /api/emergency-pauses?walletAddress=PUBLIC_OWNER_WALLET",
          activateEndpoint: "POST /api/emergency-pauses",
          resumeEndpoint: "POST /api/emergency-pauses/:id/resume",
          purpose: "Persist and enforce scoped emergency pauses before authorization and before execution confirmation.",
          scopes: ["Platform", "All Execution", "Agent", "Capability", "Action", "Policy", "Trading", "Contract", "Bridge", "x402"],
          enforcementActions: ["Blocked", "Review Required"],
          deterministicChecks: [
            "Owner, agent, policy, capability, and exact scope validation",
            "Persistent active-state and expiry evaluation",
            "Blocked precedence when multiple pauses match",
            "Manual and policy-configured automatic activation",
            "Authorized direct resume or exact-bound Human Approval quorum",
            "Execution-confirmation recheck after prior authorization",
            "Audit event and Casper decision-proof state for activation, resume request, and resume"
          ],
          automaticTriggers: ["Replay attempts", "Threat-intelligence hard matches", "Oracle disagreement", "Privileged-action failures", "Repeated blocks", "Request frequency", "Spending spikes", "Unresolved execution", "Unresolved x402 settlement", "Bridge failures", "Casper proof or configured provider failures"],
          policyFields: {
            enabled: "structuredRules.emergencyControlsEnabled",
            automatic: "structuredRules.automaticPauseEnabled",
            action: "structuredRules.emergencyAutomaticPauseAction: Blocked | Review Required",
            repeatedBlocks: "structuredRules.emergencyRepeatedBlockThreshold",
            replayAttempts: "structuredRules.emergencyReplayAttemptThreshold",
            requestFrequency: "structuredRules.emergencyRequestFrequencyThreshold",
            lookback: "structuredRules.emergencyLookbackSeconds",
            spendingSpike: "structuredRules.emergencySpendingSpikeMultiplier",
            providerFailures: "structuredRules.emergencyProviderFailureThreshold",
            unresolvedExecutions: "structuredRules.emergencyUnresolvedExecutionThreshold",
            unresolvedX402: "structuredRules.emergencyUnresolvedX402Threshold",
            bridgeFailures: "structuredRules.emergencyBridgeFailureThreshold",
            duration: "structuredRules.emergencyPauseDurationSeconds",
            approvalGatedResume: "structuredRules.emergencyResumeRequiresApproval",
            resumeQuorum: "structuredRules.emergencyResumeQuorum"
          },
          securityBoundary: "Agent SDK and MCP clients cannot bypass or administratively resume pauses. Pause management follows the existing wallet-scoped owner application boundary; cryptographic administrative challenges are not claimed in this release."
        },
        tokenPermissionControls: {
          status: "Live",
          statusEndpoint: "GET /api/token-permission-controls/status",
          purpose: "Prevent excessive, incorrect, long-lived, replayable, or unauthorized token authority before wallet signing.",
          metadataPath: "action.tokenPermission",
          supportedClassifications: ["Fungible Token Approval", "Allowance Increase", "Allowance Decrease", "Allowance Reset", "Permit Authorization", "NFT Operator Approval", "Batch Approval", "Delegated Spender Permission"],
          deterministicChecks: [
            "Owner, token contract, wallet/contract spender, execution-wallet binding, network, and token binding",
            "Approved and blocked spender policy with safe review defaults",
            "Positive and maximum approval amount",
            "Approval-to-intended-transaction ratio",
            "Unlimited authority policy",
            "Permit deadline, maximum lifetime, nonce, chain binding, and reusable authority",
            "Persisted permit fingerprint replay and parameter-mutation prevention",
            "NFT operator approval, batch item validity, exact aggregate binding, and batch-size policy",
            "Allowance-reset expectation and exact Human Approval binding"
          ],
          policyFields: {
            enabled: "structuredRules.tokenPermissionControlsEnabled",
            mode: "structuredRules.tokenPermissionMode: Observe | Review | Enforce",
            unknownSpender: "structuredRules.tokenPermissionUnknownSpenderAction: Warn | Review | Block",
            unlimitedApproval: "structuredRules.tokenPermissionUnlimitedApprovalAction: Warn | Review | Block",
            maximumAmount: "structuredRules.tokenPermissionMaxApprovalAmount",
            maximumRatio: "structuredRules.tokenPermissionMaxApprovalToTransactionRatio",
            maximumLifetime: "structuredRules.tokenPermissionMaxLifetimeSeconds",
            requireExpiry: "structuredRules.tokenPermissionRequireExpiry",
            requireAllowanceReset: "structuredRules.tokenPermissionRequireAllowanceReset",
            approvedSpenders: "structuredRules.tokenPermissionApprovedSpenders",
            blockedSpenders: "structuredRules.tokenPermissionBlockedSpenders",
            allowNftOperator: "structuredRules.tokenPermissionAllowNftOperatorApproval",
            allowBatch: "structuredRules.tokenPermissionAllowBatchApproval",
            requireChainBinding: "structuredRules.tokenPermissionRequireChainBinding",
            requireNonce: "structuredRules.tokenPermissionRequireNonce",
            maximumBatchSize: "structuredRules.tokenPermissionMaximumBatchSize"
          },
          securityBoundary: "Generic contract calls are not classified as approvals without explicit metadata. No permit signature or signed transaction is accepted or stored."
        },
        privilegedActionControls: {
          status: "Live",
          statusEndpoint: "GET /api/privileged-action-controls/status",
          purpose: "Classify and govern supported administrative or irreversible contract calls before wallet signing.",
          metadataPath: "action.privilegedAction",
          supportedClassifications: ["Ownership Transfer", "Administrator Change", "Proxy Upgrade", "Implementation Change", "Role Grant", "Role Revoke", "Mint", "Burn", "Pause", "Unpause", "Freeze", "Emergency Withdrawal", "Treasury Withdrawal", "Oracle Replacement", "Fee Recipient Change", "Bridge Validator Change", "Permission Change"],
          deterministicChecks: [
            "Explicit classification or supported entry-point/method classification",
            "Declared and deterministic classification contradiction detection",
            "Target contract, package, and network binding",
            "Blocked and review-required action policy",
            "Approved administrator and implementation allowlists",
            "Required recipient, role, implementation, and amount metadata",
            "Current/requested protected-value consistency",
            "Canonical protected-parameter fingerprint",
            "Action-specific Human Approval quorum requirement",
            "Exact approval binding and execution gating"
          ],
          policyFields: {
            enabled: "structuredRules.privilegedActionControlsEnabled",
            mode: "structuredRules.privilegedActionMode: Observe | Review | Enforce",
            reviewActions: "structuredRules.privilegedActionsRequiringReview",
            blockedActions: "structuredRules.privilegedActionsBlocked",
            administrators: "structuredRules.approvedAdministrators",
            implementations: "structuredRules.approvedImplementations",
            quorum: "structuredRules.privilegedActionQuorumRules",
            unknownAction: "structuredRules.unknownPrivilegedAction: Warn | Review | Block"
          },
          securityBoundary: "Generic calls are skipped unless a supported entry point or explicit privileged-action object is present. Classification is deterministic for supported methods and unknown calls follow explicit policy."
        },

        contractUpgradeControls: {
          status: "Live",
          statusEndpoint: "GET /api/contract-upgrade-controls/status",
          purpose: "Prevent unauthorized, unexpected, or insufficiently reviewed contract implementation changes before wallet signing.",
          metadataPath: "action.contractUpgrade",
          deterministicChecks: [
            "Target contract, package, and network binding",
            "Current and requested implementation validation",
            "Approved and blocked implementation policy",
            "Optional implementation code-hash requirement",
            "Authorized upgrade administrator validation",
            "Configurable upgrade delay and execute-after enforcement",
            "Canonical protected-parameter fingerprint",
            "Exact Human Approval binding and configurable quorum"
          ],
          policyFields: {
            enabled: "structuredRules.contractUpgradeControlsEnabled",
            mode: "structuredRules.contractUpgradeMode: Observe | Review | Enforce",
            approvedImplementations: "structuredRules.contractUpgradeApprovedImplementations",
            blockedImplementations: "structuredRules.contractUpgradeBlockedImplementations",
            approval: "structuredRules.contractUpgradeRequiresApproval",
            quorum: "structuredRules.contractUpgradeQuorum",
            delay: "structuredRules.contractUpgradeDelaySeconds",
            codeHash: "structuredRules.contractUpgradeRequireCodeHash",
            administrators: "structuredRules.contractUpgradeApprovedAdministrators",
            unknownImplementation: "structuredRules.contractUpgradeUnknownImplementationAction: Warn | Review | Block"
          },
          securityBoundary: "Only unsigned metadata is evaluated. Existing Privileged Action Controls, Human Approval, and organizational quorum are reused rather than duplicated."
        },
        x402PaymentControls: {
          status: "Foundation Available",
          statusEndpoint: "GET /api/x402-payment-controls/status",
          settlementEndpoint: "POST /api/agent-gateway/x402/settlements",
          purpose: "Authorize x402 payment requirements before PAYMENT-SIGNATURE creation and reconcile settlement afterward without receiving wallet secrets or signed payment payloads.",
          supportedFoundation: ["x402 v2", "exact scheme", "EVM recipient structure", "Solana recipient structure"],
          deterministicChecks: [
            "Protocol version, scheme, and HTTP method",
            "Canonical resource URL and merchant-host binding",
            "CAIP-2 payment network and recipient structure",
            "Approved merchants, recipients, assets, facilitators, and networks",
            "Atomic/display amount consistency using configured asset decimals",
            "Per-payment, daily, monthly, review, and hourly frequency limits",
            "Explicit expiry or maxTimeoutSeconds plus stable requirements-received time",
            "PAYMENT-REQUIRED hash and request-body hash binding",
            "Canonical request fingerprint and replay prevention",
            "Ambiguous settlement retry prevention",
            "Authenticated post-payment settlement and resource-delivery reporting"
          ],
          policyFields: {
            enabled: "structuredRules.x402ControlsEnabled",
            mode: "structuredRules.x402ControlMode: Observe | Review | Enforce",
            unavailableAction: "structuredRules.x402UnavailableAction: Warn | Review | Block",
            versions: "structuredRules.x402AllowedVersions",
            schemes: "structuredRules.x402AllowedSchemes",
            methods: "structuredRules.x402AllowedMethods",
            networks: "structuredRules.x402AllowedNetworks",
            assets: "structuredRules.x402AllowedAssets",
            assetDecimals: "structuredRules.x402AssetDecimals",
            facilitators: "structuredRules.x402AllowedFacilitators",
            merchants: "structuredRules.x402AllowedMerchants",
            blockedMerchants: "structuredRules.x402BlockedMerchants",
            recipients: "structuredRules.x402AllowedRecipients",
            maximumPayment: "structuredRules.x402MaxPayment",
            dailyLimit: "structuredRules.x402DailyLimit",
            monthlyLimit: "structuredRules.x402MonthlyLimit",
            paymentFrequency: "structuredRules.x402MaxPaymentsPerHour",
            reviewThreshold: "structuredRules.x402ReviewThreshold",
            authorizationLifetime: "structuredRules.x402MaxAuthorizationLifetimeSeconds",
            settlementAttempts: "structuredRules.x402MaxSettlementAttempts"
          },
          securityBoundary: "The Gateway rejects PAYMENT-SIGNATURE values, signed payment payloads, wallet approvals, private keys, and mnemonics. The x402 adapter signs only after an Allowed decision.",
          decisionRule: "Exact-scheme payment requirements can pass, require review, or block deterministically. upto and batch-settlement remain outside the supported foundation unless explicitly authorized and tested."
        },
        responseShape: {
          decision: "Allowed | Blocked | Review Required",
          executionApproved: "boolean",
          primaryReason: "Deterministic explanation when available",
          triggeredRule: "Policy rule responsible for the decision when applicable",
          suggestedResolution: "Safe remediation derived from policy evidence",
          moduleFindings: "Structured pass, warning, fail, unavailable, or skipped findings",
          pipelineStages: "Actual security-pipeline state",
          threatIntelligenceContext: "Sanitized feed status, policy behavior, checked identities, and exact-match indicator summaries",
          oracleValidationContext: "Sanitized oracle-feed state, policy limits, pair, reference price, deviation, source quorum, and confidence",
          bridgeControlsContext: "Sanitized route, provider, chain, asset, fee, quote-expiry, destination-format, and finality evidence",
          complianceControlsContext: "Sanitized feed state, jurisdictions, attestation statuses, Travel Rule evidence status, screening status, risk rating, and exact-match summaries",
          executionIntegrityContext: "Canonical intent fingerprint, lifecycle IDs, idempotency, timestamps, sequence, prior-match counts, retry references, and replay-window evidence",
          tokenPermissionControlsContext: "Classification, owner, token, spender, bounded amount, ratio, deadline, nonce, chain, fingerprint, replay state, batch, NFT operator, and policy-limit evidence",
          privilegedActionControlsContext: "Classification source, target, protected parameters, administrator or implementation policy, fingerprint, review requirement, and action-specific quorum evidence",
          contractUpgradeSafetyContext: "Current/proposed implementation, code hashes, administrator authorization, upgrade delay, exact fingerprint, and approval quorum evidence",
          contractArgumentPoliciesContext: "Exact contract and entry point, matching rule, evaluated arguments, deterministic violations, and canonical runtime-argument fingerprint",
          instructionIntegrityContext: "Goal binding, source provenance, protected-parameter fingerprints, external-content confirmation, permission scopes, deterministic violations, and explicit control limitations",
          delegationSafetyContext: "Delegation identity, signer verification, exact attestation hash, scoped networks/contracts/methods/assets, expiry, revocation, depth, limits, frequency, and deterministic violations",
          emergencyControlsContext: "Active pause scope, enforcement action, trigger, expiry, resume authority, and approval-gated resume evidence",
          emergencyControlsStatusEndpoint: "GET /api/emergency-controls/status",
          emergencyPauseManagement: ["GET /api/emergency-pauses", "POST /api/emergency-pauses", "POST /api/emergency-pauses/:id/resume"],
          approval: "For Review Required decisions, the exact bound intent can expose a wallet-scoped approval request, quorum, expiry, responses, and whether signing may proceed",
          x402PaymentControlsContext: "Canonical paid-resource, merchant, network, recipient, amount, expiry, request-binding, replay, spending, and settlement evidence",
          nextAction: "Allowed actions should request user wallet signature before execution",
          auditLog: "Stored Magen3 audit record with capability context and proof state",
          casperPayload: "Payload to anchor the Magen3 decision with record_decision on Casper",
          execution: "Approved actions can later attach the real execution deploy hash"
        }
      });
    }

    if (route === "GET /api/agent-gateway/me") {
      const agentId = String(url.searchParams.get("agentId") || "").trim();
      if (!agentId) {
        return send(res, 400, { error: "agentId query parameter is required" });
      }
      const apiKey = readAgentGatewayKey(req);
      return send(res, 200, await store.getAgentGatewayIdentity(agentId, { apiKey }));
    }

    if (route === "POST /api/agent-gateway/intents") {
      const apiKey = readAgentGatewayKey(req);
      const body = await readJson(req);
      return send(res, 201, await store.submitAgentGatewayIntent(body, { apiKey }));
    }

    const gatewayApprovalMatch = url.pathname.match(/^\/api\/agent-gateway\/approvals\/([^/]+)$/);
    if (req.method === "GET" && gatewayApprovalMatch) {
      const apiKey = readAgentGatewayKey(req);
      const agentId = String(url.searchParams.get("agentId") || "").trim();
      return send(res, 200, await store.getAgentApproval(gatewayApprovalMatch[1], { agentId }, { apiKey }));
    }

    if (route === "POST /api/agent-gateway/x402/settlements") {
      const apiKey = readAgentGatewayKey(req);
      const body = await readJson(req);
      const auditLogId = String(body.auditLogId || body.audit_log_id || "").trim();
      if (!auditLogId) return send(res, 400, { error: "auditLogId is required" });
      return send(res, 200, await store.updateX402Settlement(auditLogId, body, { apiKey }));
    }

    if (route === "GET /api/bootstrap") {
      return send(res, 200, await store.bootstrap(url.searchParams.get("walletAddress")));
    }

    if (route === "POST /api/wallet/session") {
      const body = await readJson(req);
      return send(res, 200, await store.connectWallet(body));
    }

    if (route === "POST /api/agents") {
      const body = await readJson(req);
      return send(res, 201, { agent: await store.createAgent(body) });
    }

    const rotateAgentKeyMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/rotate-key$/);
    if (req.method === "POST" && rotateAgentKeyMatch) {
      const body = await readJson(req);
      return send(res, 200, { agent: await store.rotateAgentApiKey(rotateAgentKeyMatch[1], body) });
    }

    const revokeAgentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/revoke$/);
    if (req.method === "POST" && revokeAgentMatch) {
      const body = await readJson(req);
      return send(res, 200, { agent: await store.revokeAgent(revokeAgentMatch[1], body) });
    }

    if (route === "GET /api/emergency-pauses") {
      const walletAddress = String(url.searchParams.get("walletAddress") || "").trim();
      return send(res, 200, await store.listEmergencyPauses(walletAddress));
    }

    if (route === "POST /api/emergency-pauses") {
      const body = await readJson(req);
      return send(res, 201, await store.createEmergencyPause(body));
    }

    const resumeEmergencyPauseMatch = url.pathname.match(/^\/api\/emergency-pauses\/([^/]+)\/resume$/);
    if (req.method === "POST" && resumeEmergencyPauseMatch) {
      const body = await readJson(req);
      return send(res, 200, await store.resumeEmergencyPause(resumeEmergencyPauseMatch[1], body));
    }

    if (route === "GET /api/approvals") {
      const walletAddress = String(url.searchParams.get("walletAddress") || "").trim();
      return send(res, 200, await store.listApprovals(walletAddress));
    }


    const approvalChallengeMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/challenge$/);
    if (req.method === "POST" && approvalChallengeMatch) {
      const body = await readJson(req);
      return send(res, 201, await store.createApprovalChallenge(approvalChallengeMatch[1], body));
    }

    const approvalResponseMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/respond$/);
    if (req.method === "POST" && approvalResponseMatch) {
      const body = await readJson(req);
      return send(res, 200, await store.respondApproval(approvalResponseMatch[1], body));
    }

    if (route === "POST /api/policies") {
      const body = await readJson(req);
      return send(res, 201, await store.createPolicy(body));
    }

    const updatePolicyMatch = url.pathname.match(/^\/api\/policies\/([^/]+)\/update$/);
    if (req.method === "POST" && updatePolicyMatch) {
      const body = await readJson(req);
      return send(res, 200, await store.updatePolicy(updatePolicyMatch[1], body));
    }

    if (route === "POST /api/actions/analyze") {
      const body = await readJson(req);
      return send(res, 200, await store.analyzeAction(body));
    }

    if (route === "POST /api/audit-logs") {
      const body = await readJson(req);
      return send(res, 201, { auditLog: await store.createAuditLog(body) });
    }


    const payloadMatch = url.pathname.match(/^\/api\/audit-logs\/([^/]+)\/casper-payload$/);
    if (req.method === "POST" && payloadMatch) {
      return send(res, 200, await store.prepareCasperPayload(payloadMatch[1]));
    }

    const confirmMatch = url.pathname.match(/^\/api\/audit-logs\/([^/]+)\/casper-confirm$/);
    if (req.method === "POST" && confirmMatch) {
      const body = await readJson(req);
      return send(res, 200, await store.confirmCasperDeploy(confirmMatch[1], body));
    }



    const executionConfirmMatch = url.pathname.match(/^\/api\/audit-logs\/([^/]+)\/execution-confirm$/);
    if (req.method === "POST" && executionConfirmMatch) {
      const body = await readJson(req);
      return send(res, 200, await store.confirmExecutionDeploy(executionConfirmMatch[1], body));
    }

    const recordMatch = url.pathname.match(/^\/api\/audit-logs\/([^/]+)\/record$/);
    if (req.method === "POST" && recordMatch) {
      return send(res, 200, await store.recordAuditLog(recordMatch[1]));
    }

    return notFound(res);
  } catch (error) {
    return send(res, error.status || 500, {
      error: error.message || "Internal server error",
      details: error.details,
      casperRpcErrorCode: error.casperRpcErrorCode,
      casperRpcErrorData: error.casperRpcErrorData,
      casperRpcUrl: error.casperRpcUrl,
      submittedDeployHadApprovals: error.submittedDeployHadApprovals,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Magen3 API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Storage mode: ${store.mode}`);
});
