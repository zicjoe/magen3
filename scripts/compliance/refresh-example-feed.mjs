import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const feedPath = resolve("backend/data/compliance-controls.example.json");
const feed = JSON.parse(await readFile(feedPath, "utf8"));
feed.generatedAt = new Date().toISOString();
await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`);
console.log(`Refreshed ${feedPath} at ${feed.generatedAt}`);
