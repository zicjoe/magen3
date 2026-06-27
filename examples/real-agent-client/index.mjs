#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_API_URL = process.env.MAGEN3_API_URL || process.env.VITE_API_URL || "http://localhost:8787";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;

    const withoutPrefix = item.slice(2);
    const [rawKey, inlineValue] = withoutPrefix.split("=", 2);
    const key = rawKey.trim();

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Magen3 Real Agent Client\n\nThis is an external agent test client. It does not use the Magen3 UI.\nIt sends a structured Web3 action intent to the Magen3 Agent Gateway API.\n\nUsage:\n  pnpm agent:test:safe\n  pnpm agent:test:risky\n  pnpm agent:test:review\n  pnpm agent:test -- --goal "Stake 15 CSPR to 0xStakingContract123"\n\nOptions:\n  --scenario safe|risky|review|oracle\n  --goal "Stake 15 CSPR to 0xStakingContract123"\n  --api http://localhost:8787\n  --agent-id MAG-AGENT-001\n  --wallet 01...\n  --source real-external-agent\n  --api-key your-agent-gateway-key\n  --no-save-payload\n`);
}

function numberFromGoal(goal, fallback) {
  const match = goal.match(/(?:amount\s*)?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : fallback;
}

function targetFromGoal(goal, fallback) {
  const match = goal.match(/\b(?:to|from|with|on)\s+([^,.]+)$/i) || goal.match(/\b(?:to|from|with|on)\s+([^,.]+)/i);
  return match ? match[1].trim() : fallback;
}

function inferActionType(goal) {
  const value = goal.toLowerCase();
  if (value.includes("stake") || value.includes("delegate")) return "Stake";
  if (value.includes("transfer") || value.includes("send")) return "Transfer";
  if (value.includes("swap") || value.includes("trade")) return "Swap";
  if (value.includes("claim")) return "Claim Rewards";
  if (value.includes("deposit") || value.includes("vault")) return "Deposit to Vault";
  if (value.includes("oracle")) return "Oracle Data Update";
  if (value.includes("rwa")) return "RWA Proof Update";
  if (value.includes("dao") || value.includes("treasury")) return "DAO Treasury Payment";
  if (value.includes("contract") || value.includes("call") || value.includes("mint")) return "Contract Interaction";
  return "Contract Interaction";
}

function inferTargetType(goal, target) {
  const value = `${goal} ${target}`.toLowerCase();
  if (value.includes("unknown")) return "Unknown Contract";
  if (value.includes("wallet")) return "Wallet Address";
  if (value.includes("dao") || value.includes("treasury")) return "DAO Treasury";
  if (value.includes("oracle")) return "Oracle Feed";
  if (value.includes("rwa") || value.includes("registry")) return "RWA Registry";
  if (value.includes("trusted") || target === "0xStakingContract123" || target === "0xYieldVault456") return "Trusted Contract";
  return "Unknown Contract";
}

function scenarioIntent(scenario, common) {
  const base = {
    source: common.source,
    agentId: common.agentId,
    walletAddress: common.wallet,
  };

  if (scenario === "risky") {
    return {
      ...base,
      goal: "Transfer 9000 CSPR to an unknown wallet",
      reason: "External agent believes it found a high-yield opportunity, but the target is unknown and amount is too high.",
      action: {
        type: "Transfer",
        amount: 9000,
        asset: "CSPR",
        target: "unknown-wallet-demo",
        targetType: "Unknown Contract",
      },
    };
  }

  if (scenario === "review") {
    return {
      ...base,
      goal: "Deposit 120 CSPR into the approved yield vault",
      reason: "External agent wants to use an approved vault, but the amount crosses the human-review threshold.",
      action: {
        type: "Deposit to Vault",
        amount: 120,
        asset: "CSPR",
        target: "0xYieldVault456",
        targetType: "Trusted Contract",
      },
    };
  }

  if (scenario === "oracle") {
    return {
      ...base,
      goal: "Update oracle data feed for a market price signal",
      reason: "External agent wants to update an oracle feed, which this policy blocks for YieldBot.",
      action: {
        type: "Oracle Data Update",
        amount: 0,
        asset: "CSPR",
        target: "oracle-feed-demo",
        targetType: "Oracle Feed",
      },
    };
  }

  return {
    ...base,
    goal: "Stake 15 CSPR to an approved validator contract",
    reason: "External agent found idle funds and selected a trusted staking contract within policy limit.",
    action: {
      type: "Stake",
      amount: 15,
      asset: "CSPR",
      target: "0xStakingContract123",
      targetType: "Trusted Contract",
    },
  };
}

function goalIntent(goal, common) {
  const target = targetFromGoal(goal, "unknown-target-demo");
  return {
    source: common.source,
    agentId: common.agentId,
    walletAddress: common.wallet,
    goal,
    reason: "External agent generated this structured intent from a plain-language goal before wallet signing.",
    action: {
      type: inferActionType(goal),
      amount: numberFromGoal(goal, 0),
      asset: goal.toUpperCase().includes("CSPR") ? "CSPR" : "CSPR",
      target,
      targetType: inferTargetType(goal, target),
    },
  };
}

async function postIntent({ apiUrl, apiKey, intent }) {
  const url = `${apiUrl.replace(/\/$/, "")}/api/agent-gateway/intents`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(intent),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message = body?.error || `Gateway request failed with HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return body;
}

function savePayload(response) {
  if (!response?.casperPayload) return null;
  const outputPath = path.join(__dirname, "last-casper-payload.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(response.casperPayload, null, 2)}\n`);
  return outputPath;
}

function printResult(response, savedPayloadPath) {
  const decision = response?.result?.decision || response?.auditLog?.decision || "Unknown";
  const risk = response?.result?.risk || response?.auditLog?.risk || "Unknown";
  const riskScore = response?.result?.riskScore ?? response?.auditLog?.riskScore ?? "Unknown";

  console.log("\nMagen3 Agent Gateway response");
  console.log("================================");
  console.log(`Decision: ${decision}`);
  console.log(`Risk: ${risk}`);
  console.log(`Risk score: ${riskScore}`);
  console.log(`Execution approved: ${Boolean(response.executionApproved)}`);
  console.log(`Gateway status: ${response?.gatewayRequest?.status || "unknown"}`);
  console.log(`Gateway request ID: ${response?.gatewayRequest?.id || "unknown"}`);
  console.log(`Audit log ID: ${response?.auditLog?.id || "unknown"}`);
  console.log(`Policy used: ${response?.auditLog?.policyUsed || "unknown"}`);
  console.log(`Next action: ${response?.nextAction || "No next action returned."}`);

  if (response?.casperPayload?.payloadHash) {
    console.log(`Casper payload hash: ${response.casperPayload.payloadHash}`);
  }

  if (savedPayloadPath) {
    console.log(`Saved Casper payload: ${savedPayloadPath}`);
  }

  console.log("\nFull JSON response:");
  console.log(JSON.stringify(response, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const common = {
    source: String(args.source || process.env.MAGEN3_AGENT_SOURCE || "real-external-agent"),
    agentId: String(args["agent-id"] || process.env.MAGEN3_AGENT_ID || ""),
    wallet: String(args.wallet || process.env.MAGEN3_WALLET || ""),
  };

  if (!common.agentId || !common.wallet) {
    throw new Error("Provide a real registered agent and wallet. Example: pnpm agent:test:safe -- --agent-id MAG-AGENT-... --wallet 01...");
  }

  const scenario = String(args.scenario || process.env.MAGEN3_AGENT_SCENARIO || "safe").toLowerCase();
  const goal = args.goal ? String(args.goal) : "";
  const intent = goal ? goalIntent(goal, common) : scenarioIntent(scenario, common);
  const apiUrl = String(args.api || DEFAULT_API_URL);
  const apiKey = args["api-key"] || process.env.MAGEN3_AGENT_GATEWAY_API_KEY || process.env.AGENT_GATEWAY_API_KEY || "";

  console.log("Magen3 Real Agent Client");
  console.log("=========================");
  console.log(`Gateway API: ${apiUrl}`);
  console.log(`Source: ${intent.source}`);
  console.log(`Agent ID: ${intent.agentId}`);
  console.log(`Wallet: ${intent.walletAddress}`);
  console.log("\nStructured intent sent by external agent:");
  console.log(JSON.stringify(intent, null, 2));

  const response = await postIntent({ apiUrl, apiKey, intent });
  const savedPayloadPath = args["no-save-payload"] ? null : savePayload(response);
  printResult(response, savedPayloadPath);
}

main().catch((error) => {
  console.error("\nAgent Gateway test failed");
  console.error("==========================");
  console.error(error.message);
  if (error.body) console.error(JSON.stringify(error.body, null, 2));
  console.error("\nMake sure the backend is running:");
  console.error("  pnpm dev:backend");
  process.exit(1);
});
