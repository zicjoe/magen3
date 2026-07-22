import { createServer } from "node:http";
import { createStore } from "./store/index.mjs";
import { getCasperStatus } from "./casper/auditPayload.mjs";

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
        version: "1.1.0",
        storage: store.mode,
        casper: getCasperStatus(),
        timestamp: new Date().toISOString(),
      });
    }


    if (route === "GET /api/casper/status") {
      return send(res, 200, { ok: true, casper: getCasperStatus() });
    }


    if (route === "GET /api/public-config") {
      const casper = getCasperStatus();
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
          liveProtectionModules: ["Identity and Authentication", "Policy Enforcement", "Wallet Validation", "Risk Assessment"],
        },
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
            type: "Transfer",
            amount: 5,
            asset: "CSPR",
            target: "Casper public key or account-hash identifier",
            targetType: "Wallet Address"
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
        responseShape: {
          decision: "Allowed | Blocked | Review Required",
          executionApproved: "boolean",
          primaryReason: "Deterministic explanation when available",
          triggeredRule: "Policy rule responsible for the decision when applicable",
          suggestedResolution: "Safe remediation derived from policy evidence",
          moduleFindings: "Structured pass, warning, fail, unavailable, or skipped findings",
          pipelineStages: "Actual security-pipeline state",
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
