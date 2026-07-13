import { readFileSync } from "node:fs";

function escapeCasperString(value) {
  const text = String(value ?? "");
  if (/[\u0000\r\n]/.test(text)) {
    throw new Error("Casper runtime string arguments cannot contain NUL or newline characters.");
  }
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function argFlag(name, type, value) {
  return ["--session-arg", shellQuote(`${name}:${type}='${escapeCasperString(value)}'`)].join(" ");
}

function getFlag(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function normalizeCasperHash(value) {
  return String(value || "").trim().replace(/^hash-/i, "");
}

const payloadFile = getFlag("payload") || process.env.AUDIT_PAYLOAD_FILE;
if (!payloadFile) {
  console.error("Missing payload file.");
  console.error("Usage: pnpm casper:record:cmd -- --payload=./payload.json");
  console.error("Tip: In the app, Audit Log → Prepare Payload → Copy JSON, then save it as payload.json.");
  process.exit(1);
}

const prepared = JSON.parse(readFileSync(payloadFile, "utf8"));
const runtimeArgs = prepared.runtimeArgs || prepared;
const contractHash = normalizeCasperHash(process.env.MAGEN3_CONTRACT_HASH || prepared?.casper?.contractHash || "PASTE_CONTRACT_HASH");
const nodeAddress = process.env.CASPER_RPC_URL || prepared?.casper?.rpcUrl || "https://node.testnet.casper.network";
const chainName = process.env.CASPER_CHAIN_NAME || "casper-test";
const secretKey = process.env.CASPER_SECRET_KEY_PATH || "~/magen3-keys/secret_key.pem";
const paymentAmount = process.env.CASPER_CALL_PAYMENT_MOTES || "5000000000";

const flags = [
  argFlag("decision_id", "string", runtimeArgs.decision_id),
  argFlag("wallet_address", "string", runtimeArgs.wallet_address),
  argFlag("agent_id", "string", runtimeArgs.agent_id),
  argFlag("shield", "string", runtimeArgs.shield),
  argFlag("action_type", "string", runtimeArgs.action_type),
  argFlag("decision", "string", runtimeArgs.decision),
  argFlag("risk", "string", runtimeArgs.risk),
  argFlag("risk_score", "u32", runtimeArgs.risk_score),
  argFlag("amount", "string", runtimeArgs.amount),
  argFlag("target", "string", runtimeArgs.target),
  argFlag("policy_used", "string", runtimeArgs.policy_used),
  argFlag("reason_hash", "string", runtimeArgs.reason_hash),
  argFlag("payload_hash", "string", runtimeArgs.payload_hash),
];

console.log("Magen3 Casper record_decision command");
console.log("======================================");
console.log(`casper-client put-deploy \\\n  --node-address ${shellQuote(nodeAddress)} \\\n  --chain-name ${shellQuote(chainName)} \\\n  --secret-key ${shellQuote(secretKey)} \\\n  --payment-amount ${shellQuote(paymentAmount)} \\\n  --session-hash ${shellQuote(contractHash)} \\\n  --session-entry-point record_decision \\\n  ${flags.join(" \\\n  ")}`);

console.log("\nAfter the deploy succeeds, copy the deploy hash into the Magen3 Audit Log drawer and click Confirm Real Deploy Hash.");
