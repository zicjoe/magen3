import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../../src/app/lib/api.ts', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../../backend/server.mjs', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

assert.match(api, /const BROWSER_REQUEST_BASE_URL = import\.meta\.env\.PROD \? "" : API_BASE_URL;/);
assert.match(api, /return `\$\{BROWSER_REQUEST_BASE_URL\}\$\{normalizedPath\}`;/);
assert.match(api, /baseUrl: API_BASE_URL/);
assert.equal(vercel.rewrites[0].source, '/api/:path*');
assert.equal(vercel.rewrites[0].destination, 'https://magen3-production.up.railway.app/api/:path*');
assert.equal(vercel.rewrites[1].destination, '/index.html');
assert.match(server, /"Cache-Control": "no-store, no-cache, must-revalidate"/);
assert.match(server, /"X-Content-Type-Options": "nosniff"/);
assert.match(server, /"X-Magen3-API": "1"/);
console.log('production same-origin API proxy verification passed');
