import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootUrl = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

test("dependency security overrides pin patched advisory families", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.deepEqual(pkg.pnpm?.overrides, {
    postcss: "8.5.23",
    "fast-uri": "3.1.5",
    "@hono/node-server": "2.0.12",
    hono: "4.12.32",
    "ip-address": "10.3.1",
  });
});

test("MCP SDK is upgraded with the Node floor required by the hardened Hono adapter", async () => {
  const pkg = JSON.parse(await read("packages/mcp-server/package.json"));
  assert.equal(pkg.dependencies?.["@modelcontextprotocol/sdk"], "1.30.0");
  assert.equal(pkg.engines?.node, ">=20");
});

test("MCP remains stdio-only and does not expose Hono HTTP server surfaces", async () => {
  const server = await read("packages/mcp-server/src/server.ts");
  const core = await read("packages/mcp-server/src/core.ts");
  assert.match(server, /StdioServerTransport/);
  for (const forbidden of ['from "hono"', 'from "@hono/node-server"', "StreamableHTTPServerTransport", "SSEServerTransport"]) {
    assert.equal(server.includes(forbidden) || core.includes(forbidden), false, forbidden);
  }
});

test("lockfile contains patched resolutions and excludes superseded vulnerable versions", async () => {
  const lock = await read("pnpm-lock.yaml");
  for (const safe of [
    "postcss@8.5.23",
    "fast-uri@3.1.5",
    "@hono/node-server@2.0.12",
    "hono@4.12.32",
    "ip-address@10.3.1",
    "@modelcontextprotocol/sdk@1.30.0",
    "nanoid@3.3.16",
  ]) assert.equal(lock.includes(safe), true, safe);

  for (const old of [
    "postcss@8.5.18",
    "fast-uri@3.1.4",
    "@hono/node-server@1.19.14",
    "hono@4.12.30",
    "ip-address@10.2.0",
    "@modelcontextprotocol/sdk@1.29.0",
    "nanoid@3.3.15",
  ]) assert.equal(lock.includes(old), false, old);

  assert.match(lock, /express-rate-limit: 8\.5\.2\(express@5\.2\.1\)[\s\S]*?ip-address: 10\.3\.1/);
});
