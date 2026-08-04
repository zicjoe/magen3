const SHA256 = /^[0-9a-f]{64}$/i;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,255}$/;

const TRUSTED_OFFICIAL_MCP_UPGRADES = [
  {
    serverId: "magen3-official-mcp",
    origin: "@magen3/mcp-server",
    fromManifestHash: "a16fb32421835bcd9a7dc035a4f3ba26a5e7a227d29375929f7bff57ac2d8f0c",
    toManifestHash: "13fa36697e6a8fc245951012bcceb80af11e3fd58bb0ea641eaf5cb9ac27924b",
    tools: {
      magen3_check_intent: {
        fromVersion: "0.5.0",
        toVersion: "0.5.1",
        fromSchemaHash: "29b728aaa61bced4a3f533d23e52045f1f00d593f995634d83063c44fa0e18f2",
        toSchemaHash: "bd690b9c71ac86c8b48afda761c558744437ec1e956a5b3b451df96500023eeb",
        fromDescriptionHash: "f77a077dad755bb5fae5dc408dc2902541649c98c427cc9c961b835d352b25c2",
        toDescriptionHash: "3a415223b22674c46c16636b28afae9e4ce21e95f1c69fff80a27785d51d6b1c",
      },
      magen3_require_allowed: {
        fromVersion: "0.5.0",
        toVersion: "0.5.1",
        fromSchemaHash: "bfce0408d41a7656c7792bbd36d318a41f41cee2ea8bbee8e4c0b81f4a1e5359",
        toSchemaHash: "8eccadfdf3eef9ed2b927a81e8b8b598d153bcefbb150c4bc8a2aad7f960fb9e",
        fromDescriptionHash: "f77a077dad755bb5fae5dc408dc2902541649c98c427cc9c961b835d352b25c2",
        toDescriptionHash: "3a415223b22674c46c16636b28afae9e4ce21e95f1c69fff80a27785d51d6b1c",
      },
    },
  },
];

function clean(value) { return String(value ?? "").trim(); }
function lower(value) { return clean(value).toLowerCase(); }
function array(value) { return Array.isArray(value) ? value : []; }
function unique(value) { return [...new Set(array(value).map(clean).filter(Boolean))]; }
function bool(value) { return value === true || lower(value) === "true"; }
function normalizeMode(value) {
  const normalized = lower(value);
  if (normalized === "observe") return "Observe";
  if (["enforce", "block"].includes(normalized)) return "Enforce";
  return "Review";
}
function normalizeAction(value, fallback = "Review") {
  const normalized = lower(value);
  if (["warn", "observe", "allow"].includes(normalized)) return "Warn";
  if (["block", "enforce"].includes(normalized)) return "Block";
  if (normalized === "review") return "Review";
  return fallback;
}
function normalizeUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/$/, "");
  }
}
function validUrl(value) {
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
function parseServerEntry(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return {
      id: clean(entry.id || entry.serverId || entry.mcpServerId),
      url: normalizeUrl(entry.url || entry.serverUrl || entry.mcpServerUrl),
      manifestHash: lower(entry.manifestHash),
    };
  }
  const [id = "", url = "", manifestHash = ""] = clean(entry).split("|").map((item) => item.trim());
  return { id, url: normalizeUrl(url), manifestHash: lower(manifestHash) };
}
function parseToolEntry(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return {
      serverId: clean(entry.serverId || entry.mcpServerId),
      name: clean(entry.name || entry.toolName),
      version: clean(entry.version || entry.toolVersion),
      manifestHash: lower(entry.manifestHash),
      schemaHash: lower(entry.schemaHash),
      descriptionHash: lower(entry.descriptionHash),
      permissionScopes: unique(entry.permissionScopes),
      credentialScopes: unique(entry.credentialScopes || (entry.credentialScope ? [entry.credentialScope] : [])),
      origin: clean(entry.origin || entry.toolOrigin),
    };
  }
  const parts = clean(entry).split("|").map((item) => item.trim());
  return {
    serverId: parts[0] || "",
    name: parts[1] || "",
    version: parts[2] || "",
    manifestHash: lower(parts[3]),
    schemaHash: lower(parts[4]),
    descriptionHash: lower(parts[5]),
    permissionScopes: unique((parts[6] || "").split(",")),
    credentialScopes: unique((parts[7] || "").split(",")),
    origin: parts[8] || "",
  };
}
function expandTrustedOfficialMcpUpgrades(approvedMcpServers, approvedTools) {
  const servers = [...approvedMcpServers];
  const tools = [...approvedTools];
  for (const upgrade of TRUSTED_OFFICIAL_MCP_UPGRADES) {
    const oldServerApproved = servers.some((entry) => same(entry.id, upgrade.serverId) && entry.manifestHash === upgrade.fromManifestHash);
    if (oldServerApproved && !servers.some((entry) => same(entry.id, upgrade.serverId) && entry.manifestHash === upgrade.toManifestHash)) {
      servers.push({ id: upgrade.serverId, url: "", manifestHash: upgrade.toManifestHash });
    }
    for (const [name, toolUpgrade] of Object.entries(upgrade.tools)) {
      const oldTool = tools.find((entry) => same(entry.serverId, upgrade.serverId)
        && same(entry.name, name)
        && entry.version === toolUpgrade.fromVersion
        && entry.manifestHash === upgrade.fromManifestHash
        && entry.schemaHash === toolUpgrade.fromSchemaHash
        && entry.descriptionHash === toolUpgrade.fromDescriptionHash
        && same(entry.origin, upgrade.origin));
      if (!oldTool) continue;
      const newExists = tools.some((entry) => same(entry.serverId, upgrade.serverId)
        && same(entry.name, name)
        && entry.version === toolUpgrade.toVersion
        && entry.manifestHash === upgrade.toManifestHash
        && entry.schemaHash === toolUpgrade.toSchemaHash
        && entry.descriptionHash === toolUpgrade.toDescriptionHash
        && same(entry.origin, upgrade.origin));
      if (!newExists) {
        tools.push({
          ...oldTool,
          version: toolUpgrade.toVersion,
          manifestHash: upgrade.toManifestHash,
          schemaHash: toolUpgrade.toSchemaHash,
          descriptionHash: toolUpgrade.toDescriptionHash,
        });
      }
    }
  }
  return { servers, tools };
}

function settings(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const configuredServers = array(rules.approvedMcpServers).map(parseServerEntry).filter((item) => item.id || item.url);
  const configuredTools = array(rules.approvedTools).map(parseToolEntry).filter((item) => item.name);
  const expanded = expandTrustedOfficialMcpUpgrades(configuredServers, configuredTools);
  return {
    enabled: rules.toolIntegrityEnabled === true,
    mode: normalizeMode(rules.toolIntegrityMode),
    approvedMcpServers: expanded.servers,
    approvedTools: expanded.tools,
    requireManifestHash: rules.requireManifestHash !== false,
    requireSchemaHash: rules.requireSchemaHash !== false,
    requireTls: rules.requireTls !== false,
    allowToolVersionChanges: rules.allowToolVersionChanges === true,
    unknownToolAction: normalizeAction(rules.unknownToolAction, "Review"),
    permissionExpansionAction: normalizeAction(rules.permissionExpansionAction, "Block"),
  };
}
function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module: "Tool & MCP Integrity", status, severity, rule, message, evidence, remediation };
}
function add(state, status, rule, message, evidence = {}, remediation = "", severity = "info") {
  state.findings.push(finding({ status, severity, rule, message, evidence, remediation }));
  if (status === "pass") state.checksPassed.push(message);
  if (["fail", "warning", "unavailable"].includes(status)) state.checksFailed.push(message);
}
function hardFail(state, rule, message, evidence, remediation, severity = "high") {
  add(state, "fail", rule, message, evidence, remediation, severity);
  state.scoreDelta += severity === "critical" ? 35 : 24;
  state.hardBlock = true;
  state.violations.push({ rule, message });
}
function policyViolation(state, config, action, rule, message, evidence, remediation, severity = "medium") {
  const effective = action || (config.mode === "Enforce" ? "Block" : config.mode === "Observe" ? "Warn" : "Review");
  if (effective === "Block") return hardFail(state, rule, message, evidence, remediation, severity === "medium" ? "high" : severity);
  add(state, "warning", rule, message, evidence, remediation, severity);
  state.scoreDelta += 12;
  state.violations.push({ rule, message });
  if (effective !== "Warn") state.needsReview = true;
}
function unavailable(state, config, rule, message, evidence, remediation) {
  if (config.mode === "Enforce") return hardFail(state, rule, message, evidence, remediation, "high");
  add(state, "unavailable", rule, message, evidence, remediation, "medium");
  state.scoreDelta += 12;
  state.violations.push({ rule, message });
  state.needsReview = config.mode !== "Observe";
}
function same(left, right) { return lower(left) === lower(right); }
function serverMatches(entry, id, url) {
  const idMatch = entry.id && id && same(entry.id, id);
  const urlMatch = entry.url && url && normalizeUrl(entry.url) === normalizeUrl(url);
  return Boolean(idMatch || urlMatch);
}
function toolMatches(entry, serverId, name) {
  if (!same(entry.name, name)) return false;
  return !entry.serverId || !serverId || same(entry.serverId, serverId);
}
function capabilityFromScope(scope) {
  const normalized = lower(scope).replace(/^capability[:/]/, "").replace(/[_-]+/g, " ");
  const map = {
    trading: "Trading",
    wallet: "Wallet Management",
    "wallet management": "Wallet Management",
    treasury: "Treasury Operations",
    "treasury operations": "Treasury Operations",
    dapp: "dApp Interactions",
    contract: "dApp Interactions",
    "dapp interactions": "dApp Interactions",
    enterprise: "Enterprise Automation",
    "enterprise automation": "Enterprise Automation",
    custom: "Custom",
  };
  return scope.toLowerCase().startsWith("capability:") || scope.toLowerCase().startsWith("capability/") ? map[normalized] || "" : "";
}

export function evaluateToolMcpIntegrity({ request = {}, policy = {}, agent = {} } = {}) {
  const config = settings(policy);
  const state = { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, violations: [], context: null };
  const metadataSupplied = request.toolIntegrityMetadataSupplied === true;
  const toolIndicated = metadataSupplied || Boolean(clean(request.instructionToolName) || clean(request.instructionToolServer));

  if (!config.enabled) {
    add(state, "skipped", "Tool integrity configuration", "Tool & MCP Integrity is disabled for the active policy.");
    return state;
  }
  if (!toolIndicated) {
    add(state, "skipped", "Tool integrity applicability", "No MCP or tool execution metadata was supplied for this request.");
    state.context = { enabled: true, mode: config.mode, metadataSupplied: false, applicable: false };
    return state;
  }
  if (!metadataSupplied) {
    unavailable(state, config, "Verifiable tool metadata", "The request indicates tool use but does not supply verifiable Tool & MCP Integrity metadata.", {}, "Submit the MCP server identity, tool name/version, hashes, TLS state, origin, and permission scopes before retrying.");
    state.context = { enabled: true, mode: config.mode, metadataSupplied: false, applicable: true };
    return state;
  }

  const serverId = clean(request.toolMcpServerId);
  const serverUrl = normalizeUrl(request.toolMcpServerUrl);
  const toolName = clean(request.toolIntegrityToolName);
  const toolVersion = clean(request.toolIntegrityToolVersion);
  const manifestHash = lower(request.toolIntegrityManifestHash);
  const schemaHash = lower(request.toolIntegritySchemaHash);
  const descriptionHash = lower(request.toolIntegrityDescriptionHash);
  const permissionScopes = unique(request.toolIntegrityPermissionScopes);
  const credentialScope = clean(request.toolIntegrityCredentialScope);
  const tls = bool(request.toolIntegrityTls) || serverUrl.startsWith("https://");
  const toolOrigin = clean(request.toolIntegrityOrigin);
  const approvedAt = clean(request.toolIntegrityApprovedAt);
  const malformed = [];

  if (!serverId && !serverUrl) malformed.push("mcpServerId or mcpServerUrl");
  if (serverId && !IDENTIFIER.test(serverId)) malformed.push("mcpServerId");
  if (serverUrl && !validUrl(serverUrl)) malformed.push("mcpServerUrl");
  if (!toolName || !IDENTIFIER.test(toolName)) malformed.push("toolName");
  if (toolVersion && toolVersion.length > 128) malformed.push("toolVersion");
  if (manifestHash && !SHA256.test(manifestHash)) malformed.push("manifestHash");
  if (schemaHash && !SHA256.test(schemaHash)) malformed.push("schemaHash");
  if (descriptionHash && !SHA256.test(descriptionHash)) malformed.push("descriptionHash");
  if (permissionScopes.some((scope) => !IDENTIFIER.test(scope))) malformed.push("permissionScopes");
  if (credentialScope && !IDENTIFIER.test(credentialScope)) malformed.push("credentialScope");
  if (approvedAt && Number.isNaN(Date.parse(approvedAt))) malformed.push("approvedAt");
  if (malformed.length > 0) {
    hardFail(state, "Valid tool metadata", "Tool or MCP metadata is malformed.", { malformed }, "Correct the malformed fields and regenerate trusted adapter metadata before retrying.", "critical");
  }

  if (config.requireTls && !tls) {
    hardFail(state, "TLS required", "The MCP transport does not have a verified secure-transport assertion.", { serverUrl, tls }, "Use an approved HTTPS endpoint or a trusted local stdio adapter before retrying.", "critical");
  } else if (config.requireTls) {
    add(state, "pass", "TLS required", "The adapter reports an approved secure HTTPS or local stdio transport.", { serverUrl, tls });
  }

  const serverCandidates = config.approvedMcpServers.filter((entry) => serverMatches(entry, serverId, serverUrl));
  const approvedServer = serverCandidates.find((entry) => !entry.manifestHash || !manifestHash || entry.manifestHash === manifestHash) || serverCandidates[0];
  if (!approvedServer) {
    policyViolation(state, config, config.unknownToolAction, "Approved MCP server", "The MCP server is not on the active policy allowlist.", { serverId, serverUrl }, "Approve the exact MCP server ID or URL in the policy, then retry.", "high");
  } else {
    add(state, "pass", "Approved MCP server", "The MCP server matches the active policy allowlist.", { serverId, serverUrl });
    if (approvedServer.manifestHash && manifestHash && approvedServer.manifestHash !== manifestHash) {
      hardFail(state, "Server manifest binding", "The MCP server manifest hash changed from the approved value.", { expected: approvedServer.manifestHash, received: manifestHash }, "Review the server change and explicitly reapprove the new manifest hash.", "critical");
    }
  }

  const toolCandidates = config.approvedTools.filter((entry) => toolMatches(entry, serverId, toolName));
  const approvedTool = toolCandidates.find((entry) =>
    (!entry.version || !toolVersion || entry.version === toolVersion)
    && (!entry.manifestHash || !manifestHash || entry.manifestHash === manifestHash)
    && (!entry.schemaHash || !schemaHash || entry.schemaHash === schemaHash)
    && (!entry.descriptionHash || !descriptionHash || entry.descriptionHash === descriptionHash)
  ) || toolCandidates[0];
  if (!approvedTool) {
    policyViolation(state, config, config.unknownToolAction, "Approved tool", "The requested tool is not on the active policy allowlist.", { serverId, toolName, toolVersion }, "Approve the exact server/tool pair and its trusted metadata before retrying.", "high");
  } else {
    add(state, "pass", "Approved tool", "The requested tool matches the active policy allowlist.", { serverId, toolName });
  }

  if (config.requireManifestHash && !manifestHash) unavailable(state, config, "Manifest hash required", "A manifest hash is required but was not supplied.", { toolName }, "Submit the SHA-256 manifest hash from the approved tool adapter.");
  else if (manifestHash) add(state, "pass", "Manifest hash required", "A structurally valid tool manifest hash was supplied.", { manifestHash });
  if (config.requireSchemaHash && !schemaHash) unavailable(state, config, "Schema hash required", "A tool schema hash is required but was not supplied.", { toolName }, "Submit the SHA-256 input/output schema hash from the approved tool adapter.");
  else if (schemaHash) add(state, "pass", "Schema hash required", "A structurally valid tool schema hash was supplied.", { schemaHash });

  if (approvedTool) {
    for (const [field, expected, received] of [
      ["manifest", approvedTool.manifestHash, manifestHash],
      ["schema", approvedTool.schemaHash, schemaHash],
      ["description", approvedTool.descriptionHash, descriptionHash],
    ]) {
      if (expected && received && expected !== received) {
        hardFail(state, `${field} hash binding`, `The approved tool ${field} hash changed.`, { toolName, expected, received }, `Review the material ${field} change and explicitly reapprove the tool.`, "critical");
      }
      if (expected && !received) unavailable(state, config, `${field} hash binding`, `The approved ${field} hash cannot be verified because it was not supplied.`, { toolName, expected }, `Submit the approved ${field} hash before retrying.`);
    }
    if (approvedTool.version && toolVersion && approvedTool.version !== toolVersion) {
      if (config.allowToolVersionChanges) {
        add(state, "warning", "Tool version binding", "The tool version changed, but policy permits version changes when all required hashes remain approved.", { expected: approvedTool.version, received: toolVersion }, "Review and update the approved version when practical.", "medium");
        state.scoreDelta += 6;
      } else {
        policyViolation(state, config, "Review", "Tool version binding", "The tool version changed from the approved version.", { expected: approvedTool.version, received: toolVersion }, "Review the version change and reapprove the exact tool version.", "high");
      }
    }
    if (approvedTool.origin && toolOrigin && !same(approvedTool.origin, toolOrigin)) {
      hardFail(state, "Tool origin binding", "The tool origin does not match the approved origin.", { expected: approvedTool.origin, received: toolOrigin }, "Use the approved tool origin or explicitly reapprove the new origin.", "critical");
    }
    const expandedScopes = permissionScopes.filter((scope) => !approvedTool.permissionScopes.some((approved) => same(approved, scope)));
    if (expandedScopes.length > 0) {
      policyViolation(state, config, config.permissionExpansionAction, "Permission scope containment", "The tool requested permission scopes beyond its approved scope.", { approved: approvedTool.permissionScopes, received: permissionScopes, expandedScopes }, "Reduce the tool permissions to the approved scope or explicitly reapprove the expanded permissions.", "critical");
    } else {
      add(state, "pass", "Permission scope containment", "The requested permission scopes are contained within the approved tool scope.", { approved: approvedTool.permissionScopes, received: permissionScopes });
    }
    if (credentialScope && approvedTool.credentialScopes.length > 0 && !approvedTool.credentialScopes.some((scope) => same(scope, credentialScope))) {
      hardFail(state, "Credential scope validation", "The credential scope is not approved for this tool.", { approved: approvedTool.credentialScopes, received: credentialScope }, "Use a least-privilege credential with an approved scope.", "critical");
    } else if (credentialScope) {
      add(state, "pass", "Credential scope validation", "The credential scope is approved for this tool.", { credentialScope });
    }
  }

  const capabilities = unique(agent?.executionCapabilities);
  const capabilityScopes = permissionScopes.map((scope) => ({ scope, capability: capabilityFromScope(scope) })).filter((item) => item.capability);
  const capabilityViolations = capabilityScopes.filter((item) => !capabilities.includes(item.capability));
  if (capabilityViolations.length > 0) {
    hardFail(state, "Agent capability boundary", "The tool permission scope exceeds the registered agent execution capabilities.", { agentCapabilities: capabilities, capabilityViolations }, "Remove the out-of-capability scopes or update the agent capabilities through an authorized configuration change.", "critical");
  } else if (capabilityScopes.length > 0) {
    add(state, "pass", "Agent capability boundary", "Tool capability scopes are contained within the registered agent capabilities.", { agentCapabilities: capabilities, capabilityScopes });
  }

  state.context = {
    enabled: true,
    mode: config.mode,
    metadataSupplied: true,
    applicable: true,
    serverId,
    serverUrl,
    toolName,
    toolVersion,
    manifestHash,
    schemaHash,
    descriptionHash,
    permissionScopes,
    credentialScope,
    tls,
    toolOrigin,
    approvedAt,
    approvedServer: Boolean(approvedServer),
    approvedTool: Boolean(approvedTool),
    materialChangeDetected: state.findings.some((item) => item.rule.includes("hash binding") || item.rule === "Tool version binding" || item.rule === "Tool origin binding"),
    violations: state.violations,
    limitation: "Tool & MCP Integrity verifies adapter-supplied identity, hashes, TLS, origin, version, and scopes. It does not certify arbitrary tool code or eliminate supply-chain risk.",
  };
  return state;
}
