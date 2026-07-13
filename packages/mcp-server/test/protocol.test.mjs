import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP server starts and exposes the expected tools", async () => {
  const client = new Client({ name: "magen3-mcp-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/server.js"],
    cwd: new URL("..", import.meta.url).pathname,
    env: {
      ...process.env,
      MAGEN3_GATEWAY_URL: "https://example.invalid",
      MAGEN3_AGENT_ID: "MAG-AGENT-TEST",
      MAGEN3_AGENT_KEY: "test-key-not-a-real-secret",
    },
  });
  try {
    await client.connect(transport);
    const response = await client.listTools();
    const names = response.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "magen3_check_intent",
      "magen3_get_intent_schema",
      "magen3_require_allowed",
      "magen3_verify_agent",
    ]);
  } finally {
    await client.close();
  }
});
