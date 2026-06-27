import { existsSync } from "node:fs";
import { resolve } from "node:path";

const env = process.env;
const nodeAddress = env.CASPER_RPC_URL || "https://node.testnet.casper.network";
const chainName = env.CASPER_CHAIN_NAME || "casper-test";
const secretKey = env.CASPER_SECRET_KEY_PATH || "~/magen3-keys/secret_key.pem";
const paymentAmount = env.CASPER_INSTALL_PAYMENT_MOTES || "150000000000";
const wasmPath = resolve(env.MAGEN3_WASM_PATH || "contracts/magen3-audit-registry/target/wasm32-unknown-unknown/release/magen3_audit_registry.wasm");

console.log("Magen3 Casper audit registry install command");
console.log("================================================");

if (!existsSync(wasmPath)) {
  console.log("Warning: compiled Wasm not found yet.");
  console.log("Build it first with: pnpm contract:build");
  console.log("");
}

console.log(`casper-client put-deploy \\\n  --node-address ${nodeAddress} \\\n  --chain-name ${chainName} \\\n  --secret-key ${secretKey} \\\n  --payment-amount ${paymentAmount} \\\n  --session-path ${wasmPath}`);

console.log("\nAfter install finalizes, query your account named keys and copy the value for:");
console.log("magen3_audit_registry_contract");
console.log("Then set Railway variable:");
console.log("MAGEN3_CONTRACT_HASH=hash-...");
console.log("CASPER_RECORDING_MODE=manual");
