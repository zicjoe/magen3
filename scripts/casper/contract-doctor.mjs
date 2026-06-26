import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const cargoTomlPath = join(root, "contracts", "magen3-audit-registry", "Cargo.toml");
const cargoLockPath = join(root, "contracts", "magen3-audit-registry", "Cargo.lock");

console.log("Magen3 Casper contract doctor");
console.log("Project:", root);

if (!existsSync(cargoTomlPath)) {
  console.error("Missing Cargo.toml at", cargoTomlPath);
  process.exit(1);
}

const cargoToml = readFileSync(cargoTomlPath, "utf8");
console.log("\nCargo.toml Casper dependency lines:");
for (const line of cargoToml.split(/\r?\n/)) {
  if (line.includes("casper-contract") || line.includes("casper-types")) {
    console.log("  " + line);
  }
}

if (cargoToml.includes('casper-contract = "4.0.0"')) {
  console.error("\nERROR: This project is still using casper-contract 4.0.0. Replace the project with v8 or update Cargo.toml.");
  process.exit(1);
}

if (existsSync(cargoLockPath)) {
  const lock = readFileSync(cargoLockPath, "utf8");
  const hasOld = lock.includes('name = "casper-contract"') && lock.includes('version = "4.0.0"');
  console.log("\nCargo.lock:", hasOld ? "contains old casper-contract 4.0.0" : "does not appear to pin casper-contract 4.0.0");
  if (hasOld) {
    console.log("Run: Remove-Item contracts\\magen3-audit-registry\\Cargo.lock -Force");
  }
} else {
  console.log("\nCargo.lock: not present");
}

console.log("\nExpected build command:");
console.log("  pnpm contract:build");
console.log("This version uses cargo +nightly automatically.");
