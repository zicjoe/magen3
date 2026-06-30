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
  if (!signedDeploy || typeof signedDeploy !== "object") {
    const err = new Error("Signed Casper deploy JSON is required");
    err.status = 400;
    throw err;
  }

  if (signedDeploy.deploy) return signedDeploy.deploy;
  if (signedDeploy.hash && signedDeploy.header && signedDeploy.payment && signedDeploy.session && signedDeploy.approvals) return signedDeploy;

  const err = new Error("Invalid signed Casper deploy shape. Expected deploy JSON returned by Casper Wallet signing.");
  err.status = 400;
  throw err;
}

async function submitSignedDeployToCasper(body) {
  const deploy = extractSignedDeploy(body);
  const rpcUrl = normalizeRpcUrl(process.env.CASPER_RPC_URL);
  const rpcPayload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "account_put_deploy",
    params: { deploy },
  };

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcPayload),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.error) {
    const err = new Error(result?.error?.message || `Casper node rejected deploy: HTTP ${response.status}`);
    err.status = 502;
    err.details = result.error;
    throw err;
  }

  const deployHash = result?.result?.deploy_hash || result?.result?.transaction_hash || deploy.hash;
  if (!deployHash) {
    const err = new Error("Casper node accepted the request but did not return a deploy hash");
    err.status = 502;
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

function requireAgentGatewayAuth(req) {
  const expected = process.env.AGENT_GATEWAY_API_KEY;
  if (!expected) return;
  const authorization = req.headers.authorization || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerKey = req.headers["x-magen3-agent-key"] || "";
  if (bearer === expected || headerKey === expected) return;
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
        version: "0.9.0",
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
        gateway: {
          endpoint: "/api/agent-gateway/intents",
          authRequired: Boolean(process.env.AGENT_GATEWAY_API_KEY),
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
        purpose: "External agents submit structured Web3 action intents to Magen3 before wallet signing or contract execution.",
        authRequired: Boolean(process.env.AGENT_GATEWAY_API_KEY),
        endpoint: "POST /api/agent-gateway/intents",
        requestShape: {
          source: "external-agent-name",
          agentId: "MAG-AGENT-001",
          walletAddress: "casper-public-key-or-wallet",
          goal: "Stake idle funds safely",
          reason: "User strategy asks for low-risk staking",
          action: {
            type: "Stake",
            amount: 15,
            asset: "CSPR",
            target: "trusted-validator-demo",
            targetType: "Trusted Contract"
          }
        },
        responseShape: {
          decision: "Allowed | Blocked | Review Required",
          executionApproved: "boolean",
          nextAction: "Allowed actions should request user wallet signature before execution",
          auditLog: "Stored Magen3 audit record",
          casperPayload: "Payload to anchor the Magen3 decision with record_decision on Casper",
          execution: "Approved actions can later attach the real execution deploy hash"
        }
      });
    }

    if (route === "POST /api/agent-gateway/intents") {
      requireAgentGatewayAuth(req);
      const body = await readJson(req);
      return send(res, 201, await store.submitAgentGatewayIntent(body));
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

    if (route === "POST /api/policies") {
      const body = await readJson(req);
      return send(res, 201, await store.createPolicy(body));
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
    });
  }
});

server.listen(PORT, () => {
  console.log(`Magen3 API running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Storage mode: ${store.mode}`);
});
