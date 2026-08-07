import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import process from "node:process";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Match Vite's useful local convention while preserving process-level variables as highest priority.
const fileEnv = { ...loadEnvFile(".env"), ...loadEnvFile(".env.local") };
const backendEnv = { ...fileEnv, ...process.env };

if (!backendEnv.DATABASE_URL && backendEnv.ALLOW_MEMORY_STORE == null) {
  backendEnv.ALLOW_MEMORY_STORE = "true";
  console.warn("[dev] DATABASE_URL is not configured; backend will use the explicit local-only in-memory store.");
  console.warn("[dev] Set DATABASE_URL in .env/.env.local for persistent local data. Production startup remains strict.");
}
if (!backendEnv.CORS_ORIGIN) backendEnv.CORS_ORIGIN = "http://localhost:5173";
if (!backendEnv.PORT) backendEnv.PORT = "8787";

const children = new Set();
let stopping = false;

function start(label, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: options.env || process.env,
    shell: process.platform === "win32" && options.shell !== false,
  });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (stopping) return;
    stopping = true;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev] ${label} exited (${reason}); stopping the other dev service.`);
    for (const other of children) other.kill("SIGTERM");
    process.exitCode = code && code !== 0 ? code : 1;
  });
  child.on("error", (error) => {
    if (stopping) return;
    stopping = true;
    console.error(`[dev] Failed to start ${label}: ${error.message}`);
    for (const other of children) other.kill("SIGTERM");
    process.exitCode = 1;
  });
  return child;
}

start("backend", process.execPath, ["backend/server.mjs"], { env: backendEnv, shell: false });
start("frontend", "vite", [], { env: process.env });

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
