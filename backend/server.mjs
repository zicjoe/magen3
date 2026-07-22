import { createServer } from "node:http";
import { createStore } from "./store/index.mjs";
import { getCasperStatus } from "./casper/auditPayload.mjs";
import { getThreatIntelligenceSnapshot, summarizeThreatIntelligenceSnapshot } from "./lib/threatIntelligence.mjs";
import { getOracleValidationSnapshot, summarizeOracleValidationSnapshot } from "./lib/oracleValidation.mjs";
import { getComplianceControlsSnapshot, summarizeComplianceControlsSnapshot } from "./lib/complianceControls.mjs";

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
        version: "1.2.0",
        storage: store.mode,
        casper: getCasperStatus(),
        threatIntelligence: summarizeThreatIntelligenceSnapshot(await getThreatIntelligenceSnapshot()),
        oracleValidation: summarizeOracleValidationSnapshot(await getOracleValidationSnapshot()),
        complianceControls: summarizeComplianceControlsSnapshot(await getComplianceControlsSnapshot()),
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
          liveProtectionModules: ["Identity and Authentication", "Policy Enforcement", "Wallet Validation", "Contract Validation", "Risk Assessment"],
          foundationProtectionModules: ["Execution Simulation", "Threat Intelligence", "Oracle Validation", "Bridge Controls", "Compliance Controls"],
        },
        threatIntelligence,
        oracleValidation,
        complianceControls,
        gateway: {
          endpoint: "/api/agent-gateway/intents",
          verifyEndpoint: "/api/agent-gateway/me",
          authRequired: true,
          decisionModel: "Allowed | Blocked | Review Required",
          executionRule: "External agents may request wallet signing only after Magen3 returns Allowed."
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
            type: "Transfer | Swap | Deposit to Vault | Contract Interaction | Bridge",
            amount: 5,
            asset: "CSPR",
            target: "Casper wallet identifier, Contract Hash, or Package Hash",
            targetType: "Wallet Address | Trusted Contract | Unknown Contract | Bridge Contract",
            contractIdentifierType: "Contract Hash | Package Hash (required for ambiguous hash- identifiers)",
            entryPoint: "Required for contract-call actions",
            contractVersion: "Optional positive integer for Package Hash calls",
            chainName: process.env.CASPER_CHAIN_NAME || "casper-test",
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
