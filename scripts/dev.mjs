import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();
let shuttingDown = false;

function packageDirectory(packageName) {
  try {
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    let current = dirname(require.resolve(packageName));

    while (current !== dirname(current)) {
      const candidate = resolve(current, 'package.json');
      if (existsSync(candidate)) {
        const metadata = JSON.parse(readFileSync(candidate, 'utf8'));
        if (metadata.name === packageName) return current;
      }
      current = dirname(current);
    }

    throw new Error(`Could not resolve package ${packageName}.`);
  }
}

function packageBinary(packageName, fallbackRelativePath) {
  const directory = packageDirectory(packageName);
  const packageJson = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));

  const binEntry =
    typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.[packageName] ?? Object.values(packageJson.bin ?? {})[0];

  return resolve(directory, binEntry || fallbackRelativePath);
}

function start(label, executable, args) {
  const child = spawn(executable, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  children.add(child);

  child.on('error', (error) => {
    console.error(`[${label}] Failed to start: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (shuttingDown) {
      if (children.size === 0) process.exit(process.exitCode ?? 0);
      return;
    }

    if (signal) {
      console.error(`[${label}] stopped by signal ${signal}.`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      console.error(`[${label}] exited with code ${code ?? 1}.`);
      shutdown(code ?? 1);
      return;
    }

    shutdown(0);
  });
}

function stopChild(child) {
  if (child.killed) return;

  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      shell: false,
    });
    killer.unref();
    return;
  }

  child.kill('SIGTERM');
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const child of children) stopChild(child);

  if (children.size === 0) {
    process.exit(exitCode);
    return;
  }

  const forceTimer = setTimeout(() => process.exit(exitCode), 3000);
  forceTimer.unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

try {
  const tsxCli = packageBinary('tsx', 'dist/cli.mjs');
  const viteCli = packageBinary('vite', 'bin/vite.js');

  start('server', process.execPath, [tsxCli, 'watch', 'server/index.ts']);
  start('web', process.execPath, [viteCli]);
} catch (error) {
  console.error(
    `Unable to locate the local development tools. Run \"pnpm install\" first.\n${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
