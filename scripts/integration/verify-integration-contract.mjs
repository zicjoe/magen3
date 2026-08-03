import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(file), "utf8");
const fail = (message) => { throw new Error(message); };

const app = read("src/app/App.tsx");
const envExample = read(".env.example");
const sdkPackage = JSON.parse(read("packages/sdk-js/package.json"));
const sdkSource = read("packages/sdk-js/src/index.ts");
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
if (sdkPackage.version !== "0.4.0-beta.1") fail("SDK package version must be 0.4.0-beta.1");
if (!sdkSource.includes("magen3ClientOptionsFromEnv")) fail("SDK environment resolver is missing");
if (!sdkSource.includes("normalizeMagen3GatewayUrl")) fail("SDK Gateway URL normalization is missing");
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
