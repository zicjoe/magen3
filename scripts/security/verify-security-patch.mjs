import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const lockfile = await readFile(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");

const expectedOverrides = {
  postcss: "8.5.23",
  "fast-uri": "3.1.5",
  "@hono/node-server": "2.0.12",
  hono: "4.12.32",
  "ip-address": "10.3.1",
};

const lockHasKey = (key) =>
  lockfile.includes(`${key}:`) ||
  lockfile.includes(`'${key}':`) ||
  lockfile.includes(`"${key}":`);
const lockHasOverride = (name, version) =>
  lockfile.includes(`${name}: ${version}`) ||
  lockfile.includes(`'${name}': ${version}`) ||
  lockfile.includes(`"${name}": ${version}`);

for (const [name, version] of Object.entries(expectedOverrides)) {
  if (packageJson.pnpm?.overrides?.[name] !== version) {
    throw new Error(`package.json must override ${name} to ${version}`);
  }
  if (!lockHasOverride(name, version) || !lockHasKey(`${name}@${version}`)) {
    throw new Error(`pnpm-lock.yaml is not pinned to ${name} ${version}`);
  }
}

for (const vulnerable of [
  "postcss@8.5.15", "postcss: 8.5.15",
  "postcss@8.5.18", "postcss: 8.5.18",
  "fast-uri@3.1.3", "fast-uri: 3.1.3",
  "fast-uri@3.1.4", "fast-uri: 3.1.4",
  "@hono/node-server@1.19.14",
  "hono@4.12.30",
  "ip-address@10.2.0",
  "@modelcontextprotocol/sdk@1.29.0",
]) {
  if (lockfile.includes(vulnerable)) {
    throw new Error(`pnpm-lock.yaml still contains vulnerable resolution ${vulnerable}`);
  }
}

const providerPaths = [
  "backend/lib/complianceControls.mjs",
  "backend/lib/oracleValidation.mjs",
  "backend/lib/threatIntelligence.mjs",
];

for (const path of providerPaths) {
  const source = await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  if (source.includes("credentialFingerprint") || source.includes('from "node:crypto"')) {
    throw new Error(`${path} still derives cache identity from provider credentials`);
  }
  if (!source.includes("readUtf8FileLimited")) {
    throw new Error(`${path} does not use the single-handle feed reader`);
  }
}

const marketRiskSource = await readFile(new URL("../../backend/lib/marketRiskSignals.mjs", import.meta.url), "utf8");
for (const required of ["readUtf8FileLimited", 'redirect: "error"', "MARKET_RISK_SIGNALS_FEED_URL must use HTTPS in production", "MARKET_RISK_SIGNALS_FEED_URL must not contain credentials", "MAX_FEED_BYTES", "MAX_OBSERVATIONS", "safePublicError"]) {
  if (!marketRiskSource.includes(required)) throw new Error(`Market Risk Signals is missing security control: ${required}`);
}
if (marketRiskSource.includes("request.marketRiskFeedUrl") || marketRiskSource.includes("request.providerUrl")) {
  throw new Error("Market Risk Signals accepts a request-controlled provider URL");
}

const bridgeProviderSource = await readFile(new URL("../../backend/lib/bridgeProviderIntegration.mjs", import.meta.url), "utf8");
for (const required of [
  "BRIDGE_PROVIDER_ALLOWED_TESTNET_CHAIN_IDS",
  "BRIDGE_PROVIDER_EVIDENCE_SECRET",
  "createHmac",
  "timingSafeEqual",
  "MAX_RESPONSE_BYTES",
  "AbortController",
  "BRIDGE_MAINNET_OR_UNSUPPORTED_CHAIN",
  'environment: "testnet"',
]) {
  if (!bridgeProviderSource.includes(required)) throw new Error(`Bridge Provider Integration is missing security control: ${required}`);
}
const bridgeBaseUrlMatch = bridgeProviderSource.match(/DEFAULT_BASE_URL\s*=\s*["']([^"']+)["']/);
let bridgeBaseUrl = null;
try {
  bridgeBaseUrl = bridgeBaseUrlMatch?.[1] ? new URL(bridgeBaseUrlMatch[1]) : null;
} catch {
  bridgeBaseUrl = null;
}
if (
  bridgeBaseUrl?.protocol !== "https:" ||
  bridgeBaseUrl?.hostname !== "testnet.across.to" ||
  bridgeBaseUrl?.port !== "" ||
  bridgeBaseUrl?.pathname !== "/api" ||
  bridgeBaseUrl?.search !== "" ||
  bridgeBaseUrl?.hash !== ""
) {
  throw new Error("Bridge Provider Integration must use the exact Across testnet API base URL");
}
for (const forbidden of ["request.providerUrl", "request.rpcUrl", "request.apiKey", "request.authorization"]) {
  if (bridgeProviderSource.includes(forbidden)) throw new Error(`Bridge Provider Integration accepts request-controlled provider configuration: ${forbidden}`);
}
if (bridgeProviderSource.includes("sendTransaction(") || bridgeProviderSource.includes("signTransaction(") || bridgeProviderSource.includes("privateKey")) {
  throw new Error("Bridge Provider Integration must not sign or submit bridge transactions");
}
const defaultBridgeChainMatch = bridgeProviderSource.match(/DEFAULT_TESTNET_CHAIN_IDS\s*=\s*\[([^\]]+)\]/);
const defaultBridgeChainIds = new Set(defaultBridgeChainMatch?.[1]?.match(/\d+/g) || []);
for (const currentAcrossEvmTestnetChainId of ["421614", "84532", "168587773", "808813", "37111", "4202", "919", "11155420", "80002", "11155111", "129399", "1301"]) {
  if (!defaultBridgeChainIds.has(currentAcrossEvmTestnetChainId)) throw new Error(`Bridge Provider Integration defaults are missing current Across EVM testnet chain ID ${currentAcrossEvmTestnetChainId}`);
}
if (defaultBridgeChainIds.has("133268194659241")) throw new Error("The EVM bridge adapter must not advertise Solana Devnet as an EVM chain");

try {
  await access(new URL("../../examples/real-agent-client/index.mjs", import.meta.url), constants.F_OK);
  throw new Error("Obsolete examples/real-agent-client/index.mjs must be removed before commit");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Security patch verification passed.");
