import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appPath = new URL('../../src/app/App.tsx', import.meta.url);
const storePath = new URL('../store/postgresStore.mjs', import.meta.url);

test('Dashboard and Settings defensively normalize optional monitoring state', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /const safeMonitoringState: MonitoringState = \{/);
  assert.match(source, /Array\.isArray\(monitoringState\?\.monitors\) \? monitoringState\.monitors : \[\]/);
  assert.match(source, /Array\.isArray\(monitoringState\?\.alerts\) \? monitoringState\.alerts : \[\]/);
  assert.match(source, /safeContinuousRiskMonitoringStatus/);
});

test('PostgreSQL legacy wallet ownership lookup is case-insensitive', async () => {
  const source = await readFile(storePath, 'utf8');
  assert.match(source, /function walletAddressMatches\(column, value\)/);
  assert.match(source, /lower\(\$\{column\}\) = lower\(\$\{normalizedWallet\}\)/);
  assert.match(source, /where\(walletAddressMatches\(agentsTable\.ownerWalletAddress, normalizedWallet\)\)/);
  assert.match(source, /where\(walletAddressMatches\(auditLogsTable\.walletAddress, normalizedWallet\)\)/);
});
