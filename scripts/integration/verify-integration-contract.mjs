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
const threatIntelligenceSource = read("backend/lib/threatIntelligence.mjs");
const threatProviderSource = read("backend/lib/threatIntelligenceProviders.mjs");
const oracleValidationSource = read("backend/lib/oracleValidation.mjs");
const oracleProviderSource = read("backend/lib/oracleProviders.mjs");
const oracleDecimalSource = read("backend/lib/oracleDecimal.mjs");
const complianceControlsSource = read("backend/lib/complianceControls.mjs");
const complianceProviderSource = read("backend/lib/complianceProviders.mjs");
const continuousRiskMonitoringSource = read("backend/lib/continuousRiskMonitoring.mjs");
const monitoringSchedulerSource = read("backend/lib/monitoringScheduler.mjs");
const dbSchemaSource = read("backend/db/schema.mjs");
const dbMigrationSource = read("backend/db/migrate.mjs");
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


const x402MeteredSource = read("backend/lib/x402MeteredPayments.mjs");
for (const required of ["createX402Authorization", "applyX402AuthorizationEvent", "maximumAuthorizedAtomic", "reservedAtomic", "capturedAtomic", "settledAtomic", "refundedAtomic", "remainingAuthorizationAtomic", "idempotencyKey", "usageQuantity", "BigInt"]) {
  if (!x402MeteredSource.includes(required)) fail(`Metered/upto x402 implementation is missing: ${required}`);
}
if (!serverSource.includes("POST /api/agent-gateway/x402/authorizations")) fail("x402 authorization route is missing");
if (!serverSource.includes("POST /api/agent-gateway/x402/authorization-events")) fail("x402 authorization event route is missing");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  if (!source.includes("createX402Authorization") || !source.includes("applyX402AuthorizationEvent")) fail(`${name} is missing metered/upto x402 authorization integration`);
}
if (!sdkSource.includes("createX402Authorization") || !sdkSource.includes("applyX402AuthorizationEvent")) fail("JavaScript SDK metered/upto x402 methods are missing");
if (!pythonSource.includes("create_x402_authorization") || !pythonSource.includes("apply_x402_authorization_event")) fail("Python SDK metered/upto x402 methods are missing");
if (!mcpServerSource.includes("magen3_create_x402_authorization") || !mcpServerSource.includes("magen3_apply_x402_authorization_event")) fail("MCP metered/upto x402 tools are missing");
if (!read("packages/mcp-server/dist/server.js").includes("magen3_create_x402_authorization")) fail("Generated MCP runtime is missing metered/upto x402 tools");
if (!read("packages/sdk-js/dist/index.js").includes("createX402Authorization")) fail("Generated JavaScript SDK runtime is missing metered/upto x402 methods");
if (!read("backend/lib/valueExposureLimits.mjs").includes("buildReservedExposureSnapshot")) fail("Milestone 14 exposure integration for reserved x402 exposure is missing");
if (!read("docs/METERED_UPTO_X402_PAYMENTS.md").includes("Roadmap boundary")) fail("Metered/upto x402 documentation is missing its roadmap boundary");
if (!read("METERED_UPTO_X402_PAYMENTS_IMPLEMENTATION_REPORT.md").includes("Milestones 25–28 were not implemented")) fail("Milestone 24 report is incomplete");



const threatReport = read("PRODUCTION_THREAT_INTELLIGENCE_IMPLEMENTATION_REPORT.md");
for (const required of ["https://api.gopluslabs.io", "/api/v1/address_security/", "screenThreatSubjectsWithProviders", "THREAT_INTELLIGENCE_PROVIDER_MAX_RESPONSE_BYTES", "circuit"]) {
  if (!threatProviderSource.includes(required)) fail(`Production Threat Intelligence provider layer is missing: ${required}`);
}
for (const required of ["collectThreatSubjects", "threatIntelligenceAllowedProviders", "threatIntelligenceProviderDisagreementAction", "threatIntelligenceMaxEvidenceAgeSeconds", "threatIntelligenceFalsePositiveOverrides"]) {
  if (!threatIntelligenceSource.includes(required)) fail(`Production Threat Intelligence deterministic policy support is missing: ${required}`);
}
if (!policySource.includes("evaluateThreatIntelligence")) fail("Threat Intelligence is disconnected from the Risk Assessment/policy pipeline");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  if (!source.includes("getThreatIntelligenceSnapshot({ request")) fail(`${name} does not collect request-scoped provider evidence`);
}
if (!serverSource.includes("GET /api/threat-intelligence/status")) fail("Threat Intelligence status route is missing");
if (!sdkSource.includes("getThreatIntelligenceStatus")) fail("JavaScript SDK Threat Intelligence status method is missing");
if (!pythonSource.includes("get_threat_intelligence_status")) fail("Python SDK Threat Intelligence status method is missing");
if (!mcpSource.includes("getThreatIntelligenceStatus") || !mcpServerSource.includes("magen3_get_threat_intelligence_status")) fail("MCP Threat Intelligence provider status support is missing");
if (!read("packages/mcp-server/dist/server.js").includes("magen3_get_threat_intelligence_status")) fail("Generated MCP runtime is missing the Threat Intelligence status tool");
if (!read("packages/sdk-js/dist/index.js").includes("getThreatIntelligenceStatus")) fail("Generated JavaScript SDK runtime is missing Threat Intelligence status support");
if (!app.includes("configuredProviderIds") || !app.includes('StatusBadge status="Preview"')) fail("Frontend Threat Intelligence provider status/capability model is missing");
if (!envExample.includes("THREAT_INTELLIGENCE_GOPLUS_ENABLED=false") || !envExample.includes("THREAT_INTELLIGENCE_PROVIDER_MAX_RESPONSE_BYTES=")) fail(".env.example is missing Milestone 25 provider controls");
if (!read("docs/PRODUCTION_THREAT_INTELLIGENCE.md").includes("Roadmap boundary")) fail("Production Threat Intelligence documentation is missing its roadmap boundary");
if (!threatReport.includes("Milestones 26–28 were not implemented")) fail("Milestone 25 report is incomplete");


const oracleReport = read("PRODUCTION_ORACLE_INTEGRATION_IMPLEMENTATION_REPORT.md");
for (const required of ["https://hermes.pyth.network", "/api/latest_price_feeds", "ORACLE_PYTH_FEED_MAP_JSON", "collectOracleProviderEvidence", "ORACLE_PROVIDER_MAX_RESPONSE_BYTES", "CIRCUIT_OPEN"]) {
  if (!oracleProviderSource.includes(required)) fail(`Production Oracle provider layer is missing: ${required}`);
}
for (const required of ["normalizeDecimal", "decimalToScaled", "deviationBps", "medianDecimal", "BigInt"]) {
  if (!oracleDecimalSource.includes(required)) fail(`Production Oracle decimal safety is missing: ${required}`);
}
for (const required of ["oracleValidationProviderRequired", "oracleValidationAllowedProviders", "oracleValidationProviderUnavailableAction", "oracleValidationRequiredReferenceCurrency", "oracleValidationStablecoinAssets", "providerEvidence"]) {
  if (!oracleValidationSource.includes(required)) fail(`Production Oracle deterministic policy support is missing: ${required}`);
}
if (!policySource.includes("evaluateOracleValidation")) fail("Oracle Validation is disconnected from the Risk Assessment/policy pipeline");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  if (!source.includes("getOracleValidationSnapshot({ request")) fail(`${name} does not collect request-scoped Oracle provider evidence`);
}
if (!serverSource.includes("GET /api/oracle-validation/status")) fail("Oracle Validation status route is missing");
if (!sdkSource.includes("getOracleValidationStatus")) fail("JavaScript SDK Oracle status method is missing");
if (!pythonSource.includes("get_oracle_validation_status")) fail("Python SDK Oracle status method is missing");
if (!mcpSource.includes("getOracleValidationStatus") || !mcpServerSource.includes("magen3_get_oracle_validation_status")) fail("MCP Oracle provider status support is missing");
if (!read("packages/mcp-server/dist/server.js").includes("magen3_get_oracle_validation_status")) fail("Generated MCP runtime is missing the Oracle status tool");
if (!read("packages/sdk-js/dist/index.js").includes("getOracleValidationStatus")) fail("Generated JavaScript SDK runtime is missing Oracle status support");
if (!app.includes("configuredProviderIds") || !app.includes("Pyth Hermes support is Preview")) fail("Frontend Oracle provider status/capability model is missing or dishonest");
if (!envExample.includes("ORACLE_PYTH_ENABLED=false") || !envExample.includes("ORACLE_PROVIDER_MAX_RESPONSE_BYTES=") || !envExample.includes("ORACLE_VALIDATION_ALLOWED_FEED_HOSTS=")) fail(".env.example is missing Milestone 26 provider controls");
if (!read("docs/PRODUCTION_ORACLE_INTEGRATION.md").includes("Roadmap boundary")) fail("Production Oracle Integration documentation is missing its roadmap boundary");
if (!oracleReport.includes("Milestones 27–28 were not implemented")) fail("Milestone 26 report is incomplete");


const complianceReport = read("PRODUCTION_COMPLIANCE_PROVIDER_IMPLEMENTATION_REPORT.md");
for (const required of ["https://api.ofac-api.com", "/v4/screen", "COMPLIANCE_OFAC_API_KEY", "screenComplianceSubjectsWithProviders", "COMPLIANCE_PROVIDER_MAX_RESPONSE_BYTES", "CIRCUIT_OPEN"]) {
  if (!complianceProviderSource.includes(required)) fail(`Production Compliance provider layer is missing: ${required}`);
}
for (const required of ["complianceProviderRequired", "complianceAllowedProviders", "complianceProviderUnavailableAction", "complianceProviderDisagreementAction", "complianceMinimumProviderConfidence", "complianceMaxProviderEvidenceAgeSeconds", "complianceFalsePositiveOverrides", "providerEvidence"]) {
  if (!complianceControlsSource.includes(required)) fail(`Production Compliance deterministic policy support is missing: ${required}`);
}
if (!policySource.includes("evaluateComplianceControls")) fail("Compliance Controls are disconnected from the Risk Assessment/policy pipeline");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  if (!source.includes("getComplianceControlsSnapshot({ request")) fail(`${name} does not collect request-scoped Compliance provider evidence`);
}
if (!serverSource.includes("GET /api/compliance-controls/status")) fail("Compliance provider status route is missing");
if (!sdkSource.includes("getComplianceControlsStatus")) fail("JavaScript SDK Compliance status method is missing");
if (!pythonSource.includes("get_compliance_controls_status")) fail("Python SDK Compliance status method is missing");
if (!mcpSource.includes("getComplianceControlsStatus") || !mcpServerSource.includes("magen3_get_compliance_controls_status")) fail("MCP Compliance provider status support is missing");
if (!read("packages/mcp-server/dist/server.js").includes("magen3_get_compliance_controls_status")) fail("Generated MCP runtime is missing the Compliance status tool");
if (!read("packages/sdk-js/dist/index.js").includes("getComplianceControlsStatus")) fail("Generated JavaScript SDK runtime is missing Compliance status support");
if (!app.includes("OFAC-API provider support is Preview") || !app.includes("providerDisagreement")) fail("Frontend Compliance provider status/capability model is missing or dishonest");
if (!envExample.includes("COMPLIANCE_OFAC_API_ENABLED=false") || !envExample.includes("COMPLIANCE_PROVIDER_MAX_RESPONSE_BYTES=")) fail(".env.example is missing Milestone 27 provider controls");
if (!read("docs/PRODUCTION_COMPLIANCE_PROVIDER.md").includes("Roadmap boundary")) fail("Production Compliance Provider documentation is missing its roadmap boundary");
if (!complianceReport.includes("Milestone 28 was not implemented")) fail("Milestone 27 report is incomplete");



// Milestone 28 — Continuous Risk Monitoring
for (const required of ["evaluateMonitor", "reconcileMonitoringAlerts", "acknowledgeMonitoringAlert", "selectAuthorizedMonitoringAction", "deduplicationKey", "Recovered", "configuration-drift", "x402-settlement", "bridge-delivery", "oracle", "compliance", "threat-intelligence"]) {
  if (!continuousRiskMonitoringSource.includes(required)) fail(`Continuous Risk Monitoring engine is missing: ${required}`);
}
for (const required of ["MONITORING_SCHEDULER_ENABLED", "MONITORING_SCHEDULER_INTERVAL_MS", "running", "unref"]) {
  if (!monitoringSchedulerSource.includes(required)) fail(`Continuous Risk Monitoring scheduler safety is missing: ${required}`);
}
if (!dbSchemaSource.includes("monitoringMonitorsTable") || !dbSchemaSource.includes("monitoringAlertsTable") || !dbSchemaSource.includes("deduplicationKey") || !dbSchemaSource.includes("history")) fail("Monitoring persistence schema is incomplete");
if (!dbMigrationSource.includes("monitoring_monitors") || !dbMigrationSource.includes("monitoring_alerts")) fail("Monitoring additive migration is missing");
for (const [name, source] of [["memory store", memoryStoreSource], ["PostgreSQL store", postgresStoreSource]]) {
  for (const required of ["runMonitoringCycle", "runScheduledMonitoringCycle", "getThreatIntelligenceSnapshot", "getOracleValidationSnapshot", "getComplianceControlsSnapshot", "createEmergencyPause"]) if (!source.includes(required)) fail(`${name} monitoring integration is missing: ${required}`);
}
for (const required of ["/api/continuous-risk-monitoring/status", "/api/agent-gateway/monitoring", "/api/monitoring/monitors", "/api/monitoring/run", "updateMonitoringAlertMatch", "startMonitoringScheduler"]) if (!serverSource.includes(required)) fail(`Monitoring server wiring is missing: ${required}`);
for (const required of ["getContinuousRiskMonitoringStatus", "getMonitoringStatus"]) if (!sdkSource.includes(required) || !read("packages/sdk-js/dist/index.js").includes(required)) fail(`JavaScript SDK monitoring support is missing: ${required}`);
for (const required of ["get_continuous_risk_monitoring_status", "get_monitoring_status"]) if (!pythonSource.includes(required)) fail(`Python SDK monitoring support is missing: ${required}`);
if (!mcpSource.includes("getContinuousRiskMonitoringStatus") || !mcpSource.includes("getMonitoringStatus") || !mcpServerSource.includes("magen3_get_continuous_risk_monitoring_status") || !mcpServerSource.includes("magen3_get_monitoring_alerts")) fail("MCP monitoring support is missing");
if (!read("packages/mcp-server/dist/server.js").includes("magen3_get_monitoring_alerts")) fail("Generated MCP runtime is missing monitoring alerts tool");
if (!frontendApiSource.includes("continuousRiskMonitoringStatus") || !frontendApiSource.includes("runMonitoring") || !app.includes("Continuous Monitoring Operations") || !securityModelSource.includes("continuousRiskMonitoringMilestone")) fail("Frontend monitoring capability/operations integration is incomplete");
if (!envExample.includes("MONITORING_SCHEDULER_ENABLED=false") || !envExample.includes("MONITORING_SCHEDULER_INTERVAL_MS=")) fail(".env.example is missing monitoring scheduler controls");
if (!read("docs/CONTINUOUS_RISK_MONITORING.md").includes("Security and privacy")) fail("Continuous Risk Monitoring documentation is incomplete");
if (!read("CONTINUOUS_RISK_MONITORING_IMPLEMENTATION_REPORT.md").includes("Milestone 28")) fail("Milestone 28 implementation report is missing or incomplete");

console.log("Magen3 integration contract verified.");
console.log("Canonical variables: MAGEN3_GATEWAY_URL, MAGEN3_AGENT_ID, MAGEN3_API_KEY");
console.log("Gateway URL semantics: API base URL only");
