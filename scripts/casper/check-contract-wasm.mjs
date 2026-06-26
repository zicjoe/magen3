import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const wasmPath = resolve("contracts/magen3-audit-registry/target/wasm32-unknown-unknown/release/magen3_audit_registry.wasm");

if (!existsSync(wasmPath)) {
  console.error("Magen3 contract Wasm was not found.");
  console.error(`Expected: ${wasmPath}`);
  console.error("Run: pnpm contract:build");
  process.exit(1);
}

const size = statSync(wasmPath).size;
console.log("Magen3 contract Wasm is ready:");
console.log(wasmPath);
console.log(`Size: ${size} bytes`);
