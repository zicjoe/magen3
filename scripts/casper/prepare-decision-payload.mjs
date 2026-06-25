const API_URL = process.env.API_URL || "http://localhost:8787";
const auditId = process.argv[2];

if (!auditId) {
  console.error("Usage: node scripts/casper/prepare-decision-payload.mjs <AUDIT_ID>");
  process.exit(1);
}

const response = await fetch(`${API_URL}/api/audit-logs/${auditId}/casper-payload`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});

const payload = await response.json();
console.log(JSON.stringify(payload, null, 2));
