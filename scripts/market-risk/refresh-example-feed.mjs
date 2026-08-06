import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const filePath = resolve("backend/data/market-risk-signals.example.json");
const raw = JSON.parse(await readFile(filePath, "utf8"));
const timestamp = new Date().toISOString();
raw.generatedAt = timestamp;
raw.observations = (Array.isArray(raw.observations) ? raw.observations : []).map((item) => ({ ...item, observedAt: timestamp }));
await writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
console.log(`Refreshed synthetic market-risk demonstration feed at ${timestamp}`);
