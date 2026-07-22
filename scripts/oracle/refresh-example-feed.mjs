import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const feedPath = resolve(process.argv[2] || "backend/data/oracle-validation.example.json");
const raw = JSON.parse(await readFile(feedPath, "utf8"));
const now = new Date().toISOString();
raw.generatedAt = now;
raw.observations = (Array.isArray(raw.observations) ? raw.observations : []).map((item) => ({ ...item, observedAt: now }));
await writeFile(feedPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
console.log(`Refreshed synthetic oracle timestamps in ${feedPath} to ${now}`);
