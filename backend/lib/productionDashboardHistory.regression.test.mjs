import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appPath = new URL('../../src/app/App.tsx', import.meta.url);
const storePath = new URL('../store/postgresStore.mjs', import.meta.url);

test('Dashboard and Settings preserve the Milestone 25 core rendering contract', async () => {
  const source = await readFile(appPath, 'utf8');
  const dashboardStart = source.indexOf('function DashboardPage(');
  const dashboardEnd = source.indexOf('function AgentShieldPage(', dashboardStart);
  const settingsStart = source.indexOf('function SettingsPage(');
  const settingsEnd = source.indexOf('// App Shell', settingsStart);
  const dashboard = source.slice(dashboardStart, dashboardEnd);
  const settings = source.slice(settingsStart, settingsEnd);
  assert.doesNotMatch(dashboard, /monitoringState|continuousRiskMonitoringStatus/);
  assert.match(settings, /const safeMonitoringState: MonitoringState =/);
  assert.match(settings, /Array\.isArray\(safeOracleValidationStatus\?\.providerCapabilities\)/);
  assert.match(settings, /Array\.isArray\(safeComplianceControlsStatus\?\.providerCapabilities\)/);
  assert.match(source, /class PageErrorBoundary extends Component/);
});

test('continuous monitoring loads separately from account bootstrap', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /const payload = await api\.bootstrap\(walletAddress\)/);
  assert.doesNotMatch(source.slice(source.indexOf('const payload = await api.bootstrap(walletAddress)'), source.indexOf('restoreCasperWalletConnection')), /payload\.monitoring/);
  assert.match(source, /const payload = await api\.monitoring\(walletAddress\)/);
  assert.match(source, /setMonitoringState\(\{\s*monitors: Array\.isArray\(payload\?\.monitors\)/s);
});

test('PostgreSQL ownership lookup preserves exact legacy path before tolerant fallback', async () => {
  const source = await readFile(storePath, 'utf8');
  assert.match(source, /where\(eq\(agentsTable\.ownerWalletAddress, normalizedWallet\)\)/);
  assert.match(source, /where\(eq\(auditLogsTable\.walletAddress, normalizedWallet\)\)/);
  assert.match(source, /lower\(trim\(\$\{column\}\)\) = lower\(trim\(\$\{normalizedWallet\}\)\)/);
});

test('bootstrap returns partial historical data instead of failing all account history', async () => {
  const source = await readFile(storePath, 'utf8');
  const bootstrapStart = source.indexOf('async bootstrap(walletAddress)');
  const bootstrapEnd = source.indexOf('async listMonitoring(walletAddress)', bootstrapStart);
  const bootstrap = source.slice(bootstrapStart, bootstrapEnd);
  assert.match(bootstrap, /Promise\.allSettled/);
  assert.match(bootstrap, /bootstrapWarnings/);
  assert.match(bootstrap, /agents, policies, auditLogs, approvals, emergencyPauses/);
});
