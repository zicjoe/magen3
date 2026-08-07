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
const marketRiskSignalsSource = read("backend/lib/marketRiskSignals.mjs");
const bridgeProviderIntegrationSource = read("backend/lib/bridgeProviderIntegration.mjs");
const serverSource = read("backend/server.mjs");
const frontendApiSource = read("src/app/lib/api.ts");
const mcpServerSource = read("packages/mcp-server/src/server.ts");
const memoryStoreSource = read("backend/store/memoryStore.mjs");
const postgresStoreSource = read("backend/store/postgresStore.mjs");
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
if (!marketRiskSignalsSource.includes("evaluateMarketRiskSignals") || !policySource.includes("evaluateMarketRiskSignals")) fail("Market Risk Signals are not wired into Risk Assessment");
if (!marketRiskSignalsSource.includes("MARKET_RISK_SIGNALS_FEED_URL") || !marketRiskSignalsSource.includes("liquidityCoverageBps") || !marketRiskSignalsSource.includes("stablecoinDepegBps")) fail("Market Risk Signals provider evidence is incomplete");
if (!marketRiskSignalsSource.includes("requested.inputAmount && item.inputAmount === requested.inputAmount")) fail("Market Risk Signals liquidity evidence is not bound to the protected amount");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  for (const field of ["executionQuoteTimestamp", "tradingRouteQuoteProvider", "marketRiskBaseAsset", "marketRiskPoolId"]) {
    if (!source.includes(field)) fail(`${name} does not forward ${field} into the protected-intent pipeline`);
  }
}
if (!sdkSource.includes("Magen3MarketRiskRequest") || !sdkSource.includes("Magen3MarketRiskSignalsContext") || !sdkSource.includes("marketRiskSignalsContext")) fail("SDK Market Risk Signals schemas are missing");
if (!mcpSource.includes("marketRiskSignals") || !mcpSource.includes("action.marketRisk")) fail("MCP Market Risk Signals guidance is missing");
if (!read("docs/MARKET_RISK_SIGNALS.md").includes("Roadmap boundary")) fail("Market Risk Signals documentation is missing its milestone boundary");
if (!securityModelSource.includes('name: "Asset market-risk signals"') || !securityModelSource.includes('status: "Foundation Available"')) fail("Frontend Market Risk Signals capability status is missing or dishonest");
if (!read("backend/server.mjs").includes("GET /api/market-risk-signals/status")) fail("Market Risk Signals status endpoint is missing");
if (!read("backend/server.mjs").includes("marketRiskSignals: summarizeMarketRiskSignalsSnapshot")) fail("Market Risk Signals are missing from service health");
if (!read("src/app/lib/api.ts").includes("marketRiskSignalsStatus")) fail("Frontend API client is missing Market Risk Signals status support");
if (!bridgeProviderIntegrationSource.includes('const ADAPTER_ID = "across-testnet"') || !bridgeProviderIntegrationSource.includes('DEFAULT_BASE_URL = "https://testnet.across.to/api"')) fail("Across testnet bridge adapter is missing or incorrectly configured");
for (const required of ["/swap/approval", "/swap/chains", "/swap/tokens", "/deposit/status", "exactInput", "requestBindingHash", "routeFingerprint", "payloadHash", "evidenceHash", "BRIDGE_PROVIDER_EVIDENCE_SECRET"]) {
  if (!bridgeProviderIntegrationSource.includes(required)) fail(`Bridge Provider Integration is missing ${required}`);
}
if (bridgeProviderIntegrationSource.includes("https://app.across.to/api")) fail("Milestone 22 must not enable Across mainnet");
const defaultBridgeChainMatch = bridgeProviderIntegrationSource.match(/DEFAULT_TESTNET_CHAIN_IDS\s*=\s*\[([^\]]+)\]/);
const defaultBridgeChainIds = new Set(defaultBridgeChainMatch?.[1]?.match(/\d+/g) || []);
const envBridgeChainMatch = envExample.match(/BRIDGE_PROVIDER_ALLOWED_TESTNET_CHAIN_IDS=([^\n]+)/);
const envBridgeChainIds = new Set(envBridgeChainMatch?.[1]?.match(/\d+/g) || []);
for (const currentAcrossEvmTestnetChainId of ["421614", "84532", "168587773", "808813", "37111", "4202", "919", "11155420", "80002", "11155111", "129399", "1301"]) {
  if (!defaultBridgeChainIds.has(currentAcrossEvmTestnetChainId) || !envBridgeChainIds.has(currentAcrossEvmTestnetChainId)) fail(`Milestone 22 is missing current Across EVM testnet chain ID: ${currentAcrossEvmTestnetChainId}`);
}
if (defaultBridgeChainIds.has("133268194659241")) fail("The EVM bridge adapter must not advertise Solana Devnet as an EVM chain");
if (!policySource.includes("evaluateBridgeProviderIntegration")) fail("Bridge Provider Integration findings are not wired into Risk Assessment");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  for (const required of ["prepareBridgeProviderIntegration", "applyBridgeProviderEvidenceToRequest", "bridgeProviderExecution", "pollBridgeProviderTransfer"]) {
    if (!source.includes(required)) fail(`${name} is missing real bridge-provider pipeline integration: ${required}`);
  }
}
for (const route of ["GET /api/bridge-provider-integration/status", "GET /api/bridge-providers/chains", "GET /api/bridge-providers/tokens", "POST /api/bridge-provider-integration/quotes", "POST /api/agent-gateway/bridge/poll"]) {
  if (!serverSource.includes(route)) fail(`Bridge Provider Integration route is missing: ${route}`);
}
if (!serverSource.includes("bridgeProviderIntegration: getBridgeProviderIntegrationStatus")) fail("Bridge Provider Integration is missing from service health");
for (const required of ["Magen3BridgeProviderEvidence", "Magen3BridgeProviderExecution", "requestBridgeProviderQuote", "pollBridgeProvider"]) {
  if (!sdkSource.includes(required)) fail(`JavaScript SDK Bridge Provider Integration support is missing: ${required}`);
}
for (const required of ["request_bridge_provider_quote", "poll_bridge_provider"]) {
  if (!pythonSource.includes(required)) fail(`Python SDK Bridge Provider Integration support is missing: ${required}`);
}
if (!mcpSource.includes("bridgeProviderIntegration") || !mcpSource.includes("getBridgeProviderStatus") || !mcpSource.includes("requestBridgeProviderQuote") || !mcpSource.includes("pollBridgeProvider")) fail("MCP Bridge Provider Integration guidance or handlers are missing");
for (const tool of ["magen3_get_bridge_provider_status", "magen3_request_bridge_provider_quote", "magen3_poll_bridge_provider"]) {
  if (!mcpServerSource.includes(tool)) fail(`MCP bridge-provider tool is missing: ${tool}`);
}
if (!read("docs/REAL_BRIDGE_PROVIDER_INTEGRATION.md").includes("Roadmap boundary")) fail("Real Bridge Provider Integration documentation is missing its roadmap boundary");
if (!read("REAL_BRIDGE_PROVIDER_INTEGRATION_IMPLEMENTATION_REPORT.md").includes("Milestones 23–28 were not prematurely implemented")) fail("Milestone 22 implementation report is incomplete");
if (!securityModelSource.includes('name: "Real bridge provider integration"') || !securityModelSource.includes('status: "Foundation Available"')) fail("Frontend Bridge Provider Integration status is missing or dishonest");
for (const required of ["bridgeProviderIntegrationStatus", "bridgeProviderChains", "bridgeProviderTokens", "requestBridgeProviderQuote", "pollBridgeProvider"]) {
  if (!frontendApiSource.includes(required)) fail(`Frontend API client is missing Bridge Provider Integration support: ${required}`);
}
if (!envExample.includes("BRIDGE_PROVIDER_EVIDENCE_SECRET=") || !envExample.includes("BRIDGE_PROVIDER_ACROSS_BASE_URL=https://testnet.across.to/api")) fail(".env.example is missing Milestone 22 bridge-provider configuration");
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


const x402LiveSource = read("backend/lib/x402LiveSettlement.mjs");
for (const required of ["executeLiveX402", "eip155:84532", "/verify", "/settle", "resource_delivered", "X402_TESTNET_FACILITATOR_URL"]) {
  if (!x402LiveSource.includes(required)) fail(`Live x402 implementation is missing: ${required}`);
}
if (!serverSource.includes("POST /api/agent-gateway/x402/execute")) fail("Live x402 execution route is missing");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  if (!source.includes("executeX402Lifecycle") || !source.includes("executeLiveX402")) fail(`${name} is missing live x402 lifecycle integration`);
}
if (!sdkSource.includes("executeX402Payment")) fail("JavaScript SDK live x402 method is missing");
if (!pythonSource.includes("execute_x402_payment")) fail("Python SDK live x402 method is missing");
if (!mcpServerSource.includes("magen3_execute_x402_payment")) fail("MCP live x402 tool is missing");
if (!read("docs/LIVE_X402_TESTNET_AUTHORIZATION_SETTLEMENT.md").includes("Roadmap boundary")) fail("Live x402 documentation is missing its roadmap boundary");
if (!read("LIVE_X402_TESTNET_AUTHORIZATION_SETTLEMENT_IMPLEMENTATION_REPORT.md").includes("Milestones 24–28 were not implemented")) fail("Milestone 23 report is incomplete");
if (!envExample.includes("X402_TESTNET_FACILITATOR_URL=https://x402.org/facilitator")) fail(".env.example is missing live x402 testnet configuration");

console.log("Magen3 integration contract verified.");
console.log("Canonical variables: MAGEN3_GATEWAY_URL, MAGEN3_AGENT_ID, MAGEN3_API_KEY");
console.log("Gateway URL semantics: API base URL only");
