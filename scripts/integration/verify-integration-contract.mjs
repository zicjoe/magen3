import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(file), "utf8");
const fail = (message) => { throw new Error(message); };

const app = read("src/app/App.tsx");
const securityModelSource = read("src/app/lib/securityModel.ts");
const envExample = read(".env.example");
const sdkPackage = JSON.parse(read("packages/sdk-js/package.json"));
const sdkSource = read("packages/sdk-js/src/index.ts");
const statefulSimulationSource = read("backend/lib/statefulSimulation.mjs");
const assetIdentitySource = read("backend/lib/assetIdentity.mjs");
const assetContractRiskSource = read("backend/lib/assetContractRisk.mjs");
const walletBehavioralControlsSource = read("backend/lib/walletBehavioralControls.mjs");
const mevExecutionQualitySource = read("backend/lib/mevExecutionQuality.mjs");
const tradingRouteIntegritySource = read("backend/lib/tradingRouteIntegrity.mjs");
const policySource = read("backend/lib/policyEngine.mjs");
const mcpSource = read("packages/mcp-server/src/core.ts");
const pythonSource = read("packages/sdk-python/src/magen3/client.py");
const archivedSkill = read("docs/archive/AI_AGENT_SKILL.md");
const publicDocs = [
  "README.md",
  "docs/OFFICIAL_SDKS.md",
  "docs/GATEWAY_INTEGRATION.md",
  "docs/INTEGRATION_CONFIGURATION.md",
  "docs/MCP_SERVER.md",
  "packages/sdk-js/README.md",
  "packages/sdk-python/README.md",
  "packages/mcp-server/README.md",
].map((file) => [file, read(file)]);

for (const legacy of ["MAGEN3_AGENT_KEY", "MAGEN3_AGENT_API_KEY"]) {
  if (app.includes(legacy)) fail(`Public app still generates legacy environment variable ${legacy}`);
}
if (!app.includes("MAGEN3_API_KEY")) fail("Public app does not expose canonical MAGEN3_API_KEY");
if (!app.includes("MAGEN3_GATEWAY_URL")) fail("Public app does not expose MAGEN3_GATEWAY_URL");
if (app.includes("MAGEN3_GATEWAY_URL=${api.baseUrl}/api/agent-gateway/intents")) fail("Downloaded environment still stores the intent endpoint as MAGEN3_GATEWAY_URL");
if (app.includes('baseUrl: "${api.baseUrl}"')) fail("JavaScript onboarding snippet still uses unsupported baseUrl constructor property");
if (app.includes('process.env.MAGEN3_API_KEY || "${apiKeyValue')) fail("Public snippets still embed a one-time API key as a source-code fallback");
if (app.includes("Current one-time key: ${apiKeyValue}")) fail("Agent Skills still embed the raw one-time API key");
if (!app.includes("Magen3Client.fromEnv(process.env)")) fail("TypeScript onboarding does not use the public SDK environment loader");
if (!app.includes("Magen3Client.from_env()")) fail("Python onboarding does not use the canonical environment loader");
if (!envExample.includes("MAGEN3_API_KEY=")) fail(".env.example is missing MAGEN3_API_KEY");
if (/MAGEN3_GATEWAY_URL=.*api\/agent-gateway/.test(envExample)) fail(".env.example uses an endpoint instead of the API base URL");
if (sdkPackage.version !== "0.4.0-beta.3") fail("SDK package version must be 0.4.0-beta.3");
if (!sdkSource.includes("magen3ClientOptionsFromEnv")) fail("SDK environment resolver is missing");
if (!sdkSource.includes("normalizeMagen3GatewayUrl")) fail("SDK Gateway URL normalization is missing");
if (!sdkSource.includes("getMagen3AgentMessage")) fail("SDK agent-message helper is missing");
if (!sdkSource.includes("isMagen3ExecutionApproved")) fail("SDK fail-closed execution helper is missing");
if (!sdkSource.includes("Magen3StatefulSimulationRequest")) fail("SDK stateful simulation request schema is missing");
if (!statefulSimulationSource.includes("eth_call") || !statefulSimulationSource.includes("eth_estimateGas")) fail("Real EVM stateful simulation path is missing");
if (!statefulSimulationSource.includes("payloadHash") || !statefulSimulationSource.includes("networkContextHash")) fail("Simulation payload/network binding is missing");
if (!policySource.includes("evaluateStatefulSimulationEvidence")) fail("Stateful simulation findings are not wired into Risk Assessment");
if (!assetIdentitySource.includes("canonicalAssetReference") || !assetIdentitySource.includes("evaluateAssetIdentity")) fail("Canonical asset identity implementation is missing");
if (!policySource.includes("evaluateAssetIdentity")) fail("Asset identity findings are not wired into Risk Assessment");
if (!sdkSource.includes("Magen3AssetIdentityReference") || !sdkSource.includes("assetIdentityContext")) fail("SDK asset identity schemas are missing");
if (!assetContractRiskSource.includes("eth_getCode") || !assetContractRiskSource.includes("EIP1967_IMPLEMENTATION_SLOT")) fail("Provider-backed asset contract structural inspection is missing");
if (!policySource.includes("evaluateAssetContractRisk")) fail("Asset contract risk findings are not wired into Risk Assessment");
if (!sdkSource.includes("Magen3AssetContractRiskEvidence") || !sdkSource.includes("assetContractRiskContext")) fail("SDK asset contract risk schemas are missing");
if (!read("docs/ASSET_CONTRACT_RISK.md").includes("Roadmap boundary")) fail("Asset contract risk documentation is missing its milestone boundary");
if (!walletBehavioralControlsSource.includes("evaluateWalletBehavioralControls") || !policySource.includes("evaluateWalletBehavioralControls")) fail("Wallet behavioral controls are not wired into Risk Assessment");
if (!mevExecutionQualitySource.includes("evaluateMevExecutionQuality") || !policySource.includes("evaluateMevExecutionQuality")) fail("MEV execution-quality controls are not wired into Risk Assessment");
if (!mevExecutionQualitySource.includes("Quote freshness") || !mevExecutionQualitySource.includes("Simulation-to-quote deviation")) fail("MEV execution-quality evidence checks are incomplete");
if (!sdkSource.includes("Magen3MevExecutionQualityContext") || !sdkSource.includes("mevExecutionQualityContext")) fail("SDK MEV execution-quality schemas are missing");
if (!read("docs/MEV_EXECUTION_QUALITY.md").includes("does not guarantee")) fail("MEV execution-quality documentation must state simulation limitations");
if (!tradingRouteIntegritySource.includes("evaluateTradingRouteIntegrity") || !policySource.includes("evaluateTradingRouteIntegrity")) fail("Trading Route Integrity is not wired into Risk Assessment");
if (!tradingRouteIntegritySource.includes("Router-to-payload binding") || !tradingRouteIntegritySource.includes("Quote-to-payload binding") || !tradingRouteIntegritySource.includes("Authorized route fingerprint")) fail("Trading Route Integrity binding checks are incomplete");
if (!sdkSource.includes("Magen3TradingRoute") || !sdkSource.includes("Magen3TradingRouteIntegrityContext") || !sdkSource.includes("tradingRouteIntegrityContext")) fail("SDK Trading Route Integrity schemas are missing");
if (!mcpSource.includes("tradingRouteIntegrity") || !mcpSource.includes("action.tradingRoute")) fail("MCP Trading Route Integrity guidance is missing");
if (!read("docs/TRADING_ROUTE_INTEGRITY.md").includes("Roadmap boundary")) fail("Trading Route Integrity documentation is missing its milestone boundary");
if (!securityModelSource.includes('name: "Trading route integrity"') || !securityModelSource.includes('status: "Foundation Available"')) fail("Frontend Trading Route Integrity capability status is missing or dishonest");
if (!read("backend/server.mjs").includes("GET /api/trading-route-integrity/status")) fail("Trading Route Integrity status endpoint is missing");
if (!app.includes("reviewResolutionMode")) fail("Policy and onboarding UI do not expose review-resolution strategy");
if (!app.includes("humanActionRequired")) fail("Public agent guidance does not distinguish autonomous remediation from human escalation");
if (!app.includes("agentMessage")) fail("Public agent integration guidance does not expose the user-ready decision explanation");
if (!mcpSource.includes("magen3ClientOptionsFromEnv")) fail("MCP server is not using the shared SDK environment contract");
if (!pythonSource.includes("MAGEN3_API_KEY") || !pythonSource.includes("from_env")) fail("Python SDK is not using the canonical environment contract");
if (archivedSkill.includes("MAGEN3_VERIFY_URL")) fail("Archived skill still introduces a second Gateway URL variable");
if (archivedSkill.includes("fetch(process.env.MAGEN3_GATEWAY_URL")) fail("Archived skill still sends an intent to the bare base URL");
for (const [file, contents] of publicDocs) {
  if (!contents.includes("MAGEN3_GATEWAY_URL") || !contents.includes("MAGEN3_API_KEY")) {
    fail(`${file} does not document the canonical environment contract`);
  }
  if (/MAGEN3_GATEWAY_URL=https?:\/\/[^\s]+\/api\/agent-gateway/.test(contents)) {
    fail(`${file} documents an endpoint instead of the API base URL`);
  }
}

console.log("Magen3 integration contract verified.");
console.log("Canonical variables: MAGEN3_GATEWAY_URL, MAGEN3_AGENT_ID, MAGEN3_API_KEY");
console.log("Gateway URL semantics: API base URL only");
