import { readFile } from "node:fs/promises";

const rootUrl = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

const packageJson = JSON.parse(await read("package.json"));
const mcpPackageJson = JSON.parse(await read("packages/mcp-server/package.json"));
const lockfile = await read("pnpm-lock.yaml");
const mcpServerSource = await read("packages/mcp-server/src/server.ts");
const mcpCoreSource = await read("packages/mcp-server/src/core.ts");

const requiredOverrides = {
  postcss: "8.5.23",
  "fast-uri": "3.1.4",
  "@hono/node-server": "2.0.12",
  hono: "4.12.32",
  "ip-address": "10.3.1",
};

const lockHasKey = (key) =>
  lockfile.includes(`${key}:`) ||
  lockfile.includes(`'${key}':`) ||
  lockfile.includes(`"${key}":`);

for (const [name, version] of Object.entries(requiredOverrides)) {
  if (packageJson.pnpm?.overrides?.[name] !== version) {
    throw new Error(`Missing hardened pnpm override ${name}@${version}`);
  }
  if (!lockHasKey(`${name}@${version}`)) {
    throw new Error(`pnpm-lock.yaml does not contain hardened resolution ${name}@${version}`);
  }
}

if (mcpPackageJson.dependencies?.["@modelcontextprotocol/sdk"] !== "1.30.0") {
  throw new Error("MCP server must use @modelcontextprotocol/sdk 1.30.0");
}
if (mcpPackageJson.engines?.node !== ">=20") {
  throw new Error("MCP server must require Node >=20 for the hardened @hono/node-server 2.x dependency");
}
if (!lockfile.includes("@modelcontextprotocol/sdk@1.30.0")) {
  throw new Error("pnpm-lock.yaml is not synchronized to MCP SDK 1.30.0");
}
if (!lockfile.includes("'@hono/node-server': 2.0.12(hono@4.12.32)")) {
  throw new Error("MCP SDK snapshot is not bound to hardened @hono/node-server/Hono versions");
}
if (!lockfile.includes("express-rate-limit: 8.5.2(express@5.2.1)")) {
  throw new Error("Expected MCP SDK rate-limit dependency is missing from the lockfile");
}
if (!lockfile.includes("ip-address: 10.3.1")) {
  throw new Error("express-rate-limit is not resolving the hardened ip-address version");
}
if (!lockfile.includes("postcss@8.5.23") || !lockfile.includes("nanoid: 3.3.16")) {
  throw new Error("PostCSS hardened resolution and its compatible nanoid dependency are not synchronized");
}

const forbiddenLockResolutions = [
  "postcss@8.5.18",
  "postcss: 8.5.18",
  "fast-uri@3.1.3",
  "fast-uri: 3.1.3",
  "@hono/node-server@1.19.14",
  "hono@4.12.30",
  "ip-address@10.2.0",
  "@modelcontextprotocol/sdk@1.29.0",
  "nanoid@3.3.15",
];
for (const resolution of forbiddenLockResolutions) {
  if (lockfile.includes(resolution)) {
    throw new Error(`Vulnerable or superseded dependency resolution remains in lockfile: ${resolution}`);
  }
}

if (!mcpServerSource.includes("StdioServerTransport")) {
  throw new Error("MCP server must retain the local stdio transport");
}
for (const forbidden of [
  'from "hono"',
  'from "@hono/node-server"',
  "StreamableHTTPServerTransport",
  "SSEServerTransport",
]) {
  if (mcpServerSource.includes(forbidden) || mcpCoreSource.includes(forbidden)) {
    throw new Error(`MCP runtime unexpectedly exposes an HTTP/Hono transport: ${forbidden}`);
  }
}

console.log("Dependency security verification passed.");
